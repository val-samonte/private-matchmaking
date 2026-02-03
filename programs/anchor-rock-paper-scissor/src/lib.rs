use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::access_control::instructions::CreatePermissionCpiBuilder;
use ephemeral_rollups_sdk::access_control::structs::{Member, MembersArgs};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};

declare_id!("ENUPVoY1BtRBkdY5TwNqbQmpeU2nrUdJvRkPRDRqUuMU");

pub const MATCHMAKING_STATE_SEED: &[u8] = b"matchmaking_state_v22";
pub const PLAYER_PROFILE_SEED: &[u8] = b"player_profile_v22";

#[ephemeral]
#[program]
pub mod anchor_rock_paper_scissor {

    use super::*;

    // 0️⃣ Initialize Player Profile (L1)
    pub fn initialize_player(ctx: Context<InitializePlayer>) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.player = ctx.accounts.player.key();
        profile.elo = 1000;
        profile.games_played = 0;
        profile.games_won = 0;
        msg!("Initialized profile for {}", profile.player);
        Ok(())
    }

    // 0.5️⃣ Initialize Matchmaking State (L1 - Admin/One-time)
    pub fn initialize_matchmaking(ctx: Context<InitializeMatchmaking>) -> Result<()> {
        let state = &mut ctx.accounts.matchmaking_state;
        state.bump = ctx.bumps.matchmaking_state;
        state.next_game_id = 1;
        state.queue = Vec::new();
        state.games = Vec::new();
        msg!("Matchmaking State Initialized");
        Ok(())
    }

    // 1️⃣ Ready / Auto-Match (TEE)
    // - If queue empty: Join queue.
    // - If queue has someone: Match immediately, create internal game.
    pub fn ready(ctx: Context<Ready>) -> Result<()> {
        let state = &mut ctx.accounts.matchmaking_state;
        let player = ctx.accounts.player.key();

        // 1. Check if already in a game
        if state
            .games
            .iter()
            .any(|g| g.player1 == player || g.player2 == player)
        {
            return err!(GameError::AlreadyInGame);
        }

        // 2. Check if already in queue
        if state.queue.contains(&player) {
            msg!("Player {} already in queue", player);
            return Ok(());
        }

        // 3. Matchmaking Logic
        if let Some(opponent) = state.queue.pop() {
            // Found a match!
            let game_id = state.next_game_id;
            state.next_game_id += 1;

            let new_game = InternalGame {
                game_id,
                player1: opponent,
                player2: player,
                player1_choice: None,
                player2_choice: None,
                result: GameResult::None,
            };
            state.games.push(new_game);
            msg!("Matched! Game ID: {} ({} vs {})", game_id, opponent, player);
        } else {
            // No match, enqueue
            state.queue.push(player);
            msg!("Player {} added to queue", player);
        }

        Ok(())
    }

    // 2️⃣ Make Choice (TEE)
    // Finds the player's active game in MatchmakingState and records choice.
    pub fn make_choice(ctx: Context<MakeChoice>, choice: Choice) -> Result<()> {
        let state = &mut ctx.accounts.matchmaking_state;
        let player = ctx.accounts.player.key();

        // Find game
        let game_idx = state
            .games
            .iter()
            .position(|g| g.player1 == player || g.player2 == player)
            .ok_or(GameError::GameNotFound)?;

        let game = &mut state.games[game_idx];

        // Record choice
        if game.player1 == player {
            require!(game.player1_choice.is_none(), GameError::AlreadyChose);
            game.player1_choice = Some(choice.clone().into());
        } else {
            require!(game.player2_choice.is_none(), GameError::AlreadyChose);
            game.player2_choice = Some(choice.clone().into());
        }

        msg!("Player {} chose {:?}", player, choice);

        // Check if game is complete (both decided)
        if game.player1_choice.is_some() && game.player2_choice.is_some() {
            // 4️⃣ Determine winner logic (Internal)
            let c1 = game.player1_choice.clone().unwrap();
            let c2 = game.player2_choice.clone().unwrap();

            game.result = match (c1, c2) {
                (Choice::Rock, Choice::Scissors)
                | (Choice::Paper, Choice::Rock)
                | (Choice::Scissors, Choice::Paper) => GameResult::Winner(game.player1),

                (Choice::Rock, Choice::Paper)
                | (Choice::Paper, Choice::Scissors)
                | (Choice::Scissors, Choice::Rock) => GameResult::Winner(game.player2),

                _ => GameResult::Tie,
            };
            msg!("Game {} Finished! Result: {:?}", game.game_id, game.result);
        }

        Ok(())
    }

    // 3️⃣ Reveal Winner (TEE -> L1)
    // Resolves ELO and removes game from internal state.
    // Note: This instruction runs in the TEE to update the state.
    // The COMMIT to L1 is deferred to the `persist_results` instruction called by the Relayer (Provider).
    pub fn reveal_winner(ctx: Context<RevealWinner>) -> Result<()> {
        let state = &mut ctx.accounts.matchmaking_state;

        // Deserialize profiles first to get keys
        let mut p1_data = ctx.accounts.player1_profile.try_borrow_mut_data()?;
        let mut p1_state = PlayerProfile::try_deserialize(&mut &p1_data[..])?;
        let player1 = p1_state.player;

        let mut p2_data = ctx.accounts.player2_profile.try_borrow_mut_data()?;
        let mut p2_state = PlayerProfile::try_deserialize(&mut &p2_data[..])?;
        let player2 = p2_state.player;

        // Find completed game between these two
        let game_idx = state
            .games
            .iter()
            .position(|g| {
                (g.player1 == player1 && g.player2 == player2)
                    || (g.player1 == player2 && g.player2 == player1)
            })
            .ok_or(GameError::GameNotFound)?;

        let game = state.games[game_idx];

        // Ensure game has a result
        match game.result {
            GameResult::None => return err!(GameError::GameNotFinished),
            _ => {}
        }

        // 5️⃣ Update ELO and Stats
        // Logic uses p1_state and p2_state which we already have mutable access to via deserialization
        // But to write back, we need to re-serialize at the end.

        // Double check IDs (Redundant but safe)
        require!(p1_state.player == game.player1, GameError::InvalidOpponent);
        require!(p2_state.player == game.player2, GameError::InvalidOpponent);

        match game.result {
            GameResult::Winner(winner) => {
                if winner == p1_state.player {
                    p1_state.elo = p1_state.elo.checked_add(32).unwrap_or(u64::MAX);
                    p1_state.games_won = p1_state.games_won.checked_add(1).unwrap_or(u64::MAX);
                    p2_state.elo = p2_state.elo.saturating_sub(32);
                } else {
                    p2_state.elo = p2_state.elo.checked_add(32).unwrap_or(u64::MAX);
                    p2_state.games_won = p2_state.games_won.checked_add(1).unwrap_or(u64::MAX);
                    p1_state.elo = p1_state.elo.saturating_sub(32);
                }
            }
            _ => { /* Tie logic constraint: just add games played */ }
        }

        p1_state.games_played += 1;
        p2_state.games_played += 1;

        // Serialize back
        p1_state.try_serialize(&mut &mut p1_data[..])?;
        p2_state.try_serialize(&mut &mut p2_data[..])?;

        // Drop mutable borrows to avoid RefCell error during commit
        drop(p1_data);
        drop(p2_data);

        // Remove game from state
        state.games.remove(game_idx);

        // COMMIT IS SPLIT: `reveal_winner` updates TEE state. `persist_results` commits to L1.
        // This avoids "Unauthorized Signer" error when players try to commit accounts they don't delegate.

        Ok(())
    }

    // 4️⃣ Persist Results (L1 - Relayer Only)
    // Commits the state changes from TEE to L1.
    // This transaction must be signed by the Delegation Authority (Provider).
    pub fn persist_results(ctx: Context<PersistResults>) -> Result<()> {
        // Commit everything
        commit_accounts(
            &ctx.accounts.payer, // Authority/Payer (Provider)
            vec![
                &ctx.accounts.matchmaking_state.to_account_info(),
                &ctx.accounts.player1_profile.to_account_info(),
                &ctx.accounts.player2_profile.to_account_info(),
            ],
            &ctx.accounts.magic_context.to_account_info(),
            &ctx.accounts.magic_program.to_account_info(),
        )?;
        Ok(())
    }

    /// Delegate account to the delegation program based on account type
    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
        let seed_data = derive_seeds_from_account_type(&account_type);
        let seeds_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();

        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());

        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &seeds_refs,
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// Creates a permission based on account type input.
    pub fn create_permission(
        ctx: Context<CreatePermission>,
        account_type: AccountType,
        members: Option<Vec<Member>>,
    ) -> Result<()> {
        let CreatePermission {
            permissioned_account,
            permission,
            payer,
            permission_program,
            system_program,
        } = ctx.accounts;

        let seed_data = derive_seeds_from_account_type(&account_type);

        let (_, bump) = Pubkey::find_program_address(
            &seed_data.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
            &crate::ID,
        );

        let mut seeds = seed_data.clone();
        seeds.push(vec![bump]);
        let seed_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();

        CreatePermissionCpiBuilder::new(&permission_program)
            .permissioned_account(&permissioned_account.to_account_info())
            .permission(&permission)
            .payer(&payer)
            .system_program(&system_program)
            .args(MembersArgs { members })
            .invoke_signed(&[seed_refs.as_slice()])?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePlayer<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + PlayerProfile::LEN,
        seeds = [PLAYER_PROFILE_SEED, player.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, PlayerProfile>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeMatchmaking<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + MatchmakingState::LEN,
        seeds = [MATCHMAKING_STATE_SEED],
        bump
    )]
    pub matchmaking_state: Account<'info, MatchmakingState>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Ready<'info> {
    #[account(mut)]
    pub matchmaking_state: Account<'info, MatchmakingState>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct MakeChoice<'info> {
    #[account(
        mut,
        seeds = [MATCHMAKING_STATE_SEED],
        bump
    )]
    pub matchmaking_state: Account<'info, MatchmakingState>,
    pub player: Signer<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct RevealWinner<'info> {
    #[account(mut, seeds = [MATCHMAKING_STATE_SEED], bump)]
    pub matchmaking_state: Account<'info, MatchmakingState>,

    /// CHECK: Manual serialization and verification
    #[account(mut)]
    pub player1_profile: AccountInfo<'info>,

    /// CHECK: Manual serialization and verification
    #[account(mut)]
    pub player2_profile: AccountInfo<'info>,

    /// Anyone can trigger this if game is done
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct PersistResults<'info> {
    /// CHECK: Delegated account owner is the Delegation Program, skipping Anchor owner check
    #[account(mut, seeds = [MATCHMAKING_STATE_SEED], bump)]
    pub matchmaking_state: UncheckedAccount<'info>,

    /// CHECK: Manual serialization and verification
    #[account(mut)]
    pub player1_profile: AccountInfo<'info>,

    /// CHECK: Manual serialization and verification
    #[account(mut)]
    pub player2_profile: AccountInfo<'info>,

    /// Use Provider/Relayer as payer
    #[account(mut)]
    pub payer: Signer<'info>,
}

/// Unified delegate PDA context
#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: The PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Checked by the delegate program
    pub validator: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
pub struct CreatePermission<'info> {
    /// CHECK: Validated via permission program CPI
    pub permissioned_account: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PERMISSION PROGRAM
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct MatchmakingState {
    pub bump: u8,
    pub next_game_id: u64,
    pub queue: Vec<Pubkey>,
    pub games: Vec<InternalGame>,
}

impl MatchmakingState {
    // 50KB space buffer
    pub const LEN: usize = 8 + 1 + 8 + (4 + 32 * 5) + (4 + InternalGame::LEN * 5);
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct InternalGame {
    pub game_id: u64,
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub player1_choice: Option<Choice>,
    pub player2_choice: Option<Choice>,
    pub result: GameResult,
}

impl InternalGame {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 2 + (1 + 32); // ~107 bytes
}

#[account]
pub struct PlayerProfile {
    pub player: Pubkey,
    pub elo: u64,
    pub games_played: u64,
    pub games_won: u64,
}

impl PlayerProfile {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum GameResult {
    Winner(Pubkey),
    Tie,
    None,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Choice {
    Rock,
    Paper,
    Scissors,
}

#[error_code]
pub enum GameError {
    #[msg("You already made your choice.")]
    AlreadyChose,
    #[msg("You are already in a game or queue.")]
    AlreadyInGame,
    #[msg("Game not found.")]
    GameNotFound,
    #[msg("Game not finished.")]
    GameNotFinished,
    #[msg("Invalid opponent provided for ELO update.")]
    InvalidOpponent,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    MatchmakingState,
    PlayerProfile { player: Pubkey },
}

fn derive_seeds_from_account_type(account_type: &AccountType) -> Vec<Vec<u8>> {
    match account_type {
        AccountType::MatchmakingState => {
            vec![MATCHMAKING_STATE_SEED.to_vec()]
        }
        AccountType::PlayerProfile { player } => {
            vec![PLAYER_PROFILE_SEED.to_vec(), player.to_bytes().to_vec()]
        }
    }
}
