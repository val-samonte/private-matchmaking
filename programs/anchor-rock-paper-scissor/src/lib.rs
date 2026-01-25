use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::access_control::instructions::{
    CreatePermissionCpiBuilder, UpdatePermissionCpiBuilder,
};
use ephemeral_rollups_sdk::access_control::structs::{Member, MembersArgs};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("2GTfaH7ZeZ29SubUzbUyKqQAucNLeNhkRhXUZA8bUyLs");

pub const PLAYER_CHOICE_SEED: &[u8] = b"player_choice";
pub const GAME_SEED: &[u8] = b"game";
pub const PLAYER_PROFILE_SEED: &[u8] = b"player_profile";

#[ephemeral]
#[program]
pub mod anchor_rock_paper_scissor {

    use super::*;

    // 0️⃣ Initialize Player Profile (L1)
    pub fn initialize_player(ctx: Context<InitializePlayer>) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.player = ctx.accounts.payer.key();
        profile.elo = 1000;
        profile.games_played = 0;
        profile.games_won = 0;
        msg!("Initialized profile for {}", profile.player);
        Ok(())
    }

    // 1️⃣ Create and auto-join as Player 1
    pub fn create_game(ctx: Context<CreateGame>, game_id: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let player1 = ctx.accounts.player1.key();

        game.game_id = game_id;
        game.player1 = Some(player1);
        game.player2 = None;
        game.result = GameResult::None;

        msg!("Game ID: {}", game_id);
        msg!("Player 1 PDA: {}", player1);

        // initialize PlayerChoice for player 1
        let player_choice = &mut ctx.accounts.player_choice;
        player_choice.game_id = game_id;
        player_choice.player = player1;
        player_choice.choice = None;

        msg!("Game {} created and joined by {}", game_id, player1);

        Ok(())
    }

    // 2️⃣ Player 2 joins the game
    pub fn join_game(ctx: Context<JoinGame>, game_id: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let player = ctx.accounts.player.key();

        require!(game.player1 != Some(player), GameError::CannotJoinOwnGame);
        require!(game.player2.is_none(), GameError::GameFull);

        game.player2 = Some(player);

        // Create PlayerChoice PDA for player 2
        let player_choice = &mut ctx.accounts.player_choice;
        player_choice.game_id = game_id;
        player_choice.player = player;
        player_choice.choice = None;

        msg!("{} joined Game {} as player 2", player, game_id);
        Ok(())
    }

    // 3️⃣ Player makes a choice
    pub fn make_choice(ctx: Context<MakeChoice>, _game_id: u64, choice: Choice) -> Result<()> {
        let player_choice = &mut ctx.accounts.player_choice;
        require!(player_choice.choice.is_none(), GameError::AlreadyChose);

        player_choice.choice = choice.into();
        msg!(
            "Player {:?} made choice {:?}",
            player_choice.player,
            player_choice.choice
        );

        Ok(())
    }

    // 4️⃣ Reveal and record the winner
    pub fn reveal_winner(ctx: Context<RevealWinner>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let player1_choice = &ctx.accounts.player1_choice;
        let player2_choice = &ctx.accounts.player2_choice;
        let permission_program = &ctx.accounts.permission_program.to_account_info();
        let permission_game = &ctx.accounts.permission_game.to_account_info();
        let permission1 = &ctx.accounts.permission1.to_account_info();
        let permission2 = &ctx.accounts.permission2.to_account_info();
        let magic_program = &ctx.accounts.magic_program.to_account_info();
        let _magic_program = &ctx.accounts.magic_program.to_account_info();
        let magic_context = &ctx.accounts.magic_context.to_account_info();
        let mut player1_profile =
            PlayerProfile::try_deserialize(&mut &**ctx.accounts.player1_profile.data.borrow())?;
        let mut player2_profile =
            PlayerProfile::try_deserialize(&mut &**ctx.accounts.player2_profile.data.borrow())?;

        // 1️⃣ Clone choices into game
        game.player1_choice = player1_choice.choice.clone().into();
        game.player2_choice = player2_choice.choice.clone().into();

        // 2️⃣ Ensure both players exist
        let player1 = game.player1.ok_or(GameError::MissingOpponent)?;
        let player2 = game.player2.ok_or(GameError::MissingOpponent)?;

        // 3️⃣ Ensure both players made a choice
        let choice1 = game
            .player1_choice
            .clone()
            .ok_or(GameError::MissingChoice)?;
        let choice2 = game
            .player2_choice
            .clone()
            .ok_or(GameError::MissingChoice)?;

        // 4️⃣ Determine winner based on choices
        game.result = match (choice1, choice2) {
            (Choice::Rock, Choice::Scissors)
            | (Choice::Paper, Choice::Rock)
            | (Choice::Scissors, Choice::Paper) => GameResult::Winner(player1),

            (Choice::Rock, Choice::Paper)
            | (Choice::Paper, Choice::Scissors)
            | (Choice::Scissors, Choice::Rock) => GameResult::Winner(player2),

            _ => GameResult::Tie,
        };

        // 5️⃣ Update ELO and Stats
        match &game.result {
            GameResult::Winner(winner) => {
                if *winner == player1 {
                    player1_profile.elo = player1_profile.elo.checked_add(32).unwrap_or(u64::MAX);
                    player1_profile.games_won =
                        player1_profile.games_won.checked_add(1).unwrap_or(u64::MAX);
                    player2_profile.elo = player2_profile.elo.saturating_sub(32);
                } else {
                    player2_profile.elo = player2_profile.elo.checked_add(32).unwrap_or(u64::MAX);
                    player2_profile.games_won =
                        player2_profile.games_won.checked_add(1).unwrap_or(u64::MAX);
                    player1_profile.elo = player1_profile.elo.saturating_sub(32);
                }
                player1_profile.games_played = player1_profile
                    .games_played
                    .checked_add(1)
                    .unwrap_or(u64::MAX);
                player2_profile.games_played = player2_profile
                    .games_played
                    .checked_add(1)
                    .unwrap_or(u64::MAX);
            }
            GameResult::Tie => {
                player1_profile.games_played = player1_profile
                    .games_played
                    .checked_add(1)
                    .unwrap_or(u64::MAX);
                player2_profile.games_played = player2_profile
                    .games_played
                    .checked_add(1)
                    .unwrap_or(u64::MAX);
            }
            _ => {}
        }

        // Write Data (skip first 8 bytes to preserve discriminator)

        UpdatePermissionCpiBuilder::new(&permission_program)
            .permissioned_account(&game.to_account_info(), true)
            .authority(&game.to_account_info(), false)
            .permission(&permission_game.to_account_info())
            .args(MembersArgs { members: None })
            .invoke_signed(&[&[GAME_SEED, &game.game_id.to_le_bytes(), &[ctx.bumps.game]]])?;

        msg!("TEE_LOG: Player 1 ELO Calculated: {}", player1_profile.elo);
        msg!("TEE_LOG: Player 2 ELO Calculated: {}", player2_profile.elo);

        msg!("TEE_LOG: Player 1 ELO Calculated: {}", player1_profile.elo);
        msg!("TEE_LOG: Player 2 ELO Calculated: {}", player2_profile.elo);

        UpdatePermissionCpiBuilder::new(&permission_program)
            .permissioned_account(&player1_choice.to_account_info(), true)
            .authority(&player1_choice.to_account_info(), false)
            .permission(&permission1.to_account_info())
            .args(MembersArgs { members: None })
            .invoke_signed(&[&[
                PLAYER_CHOICE_SEED,
                &player1_choice.game_id.to_le_bytes(),
                &player1_choice.player.as_ref(),
                &[ctx.bumps.player1_choice],
            ]])?;

        UpdatePermissionCpiBuilder::new(&permission_program)
            .permissioned_account(&player2_choice.to_account_info(), true)
            .authority(&player2_choice.to_account_info(), false)
            .permission(&permission2.to_account_info())
            .args(MembersArgs { members: None })
            .invoke_signed(&[&[
                PLAYER_CHOICE_SEED,
                &player2_choice.game_id.to_le_bytes(),
                &player2_choice.player.as_ref(),
                &[ctx.bumps.player2_choice],
            ]])?;

        // Write Data (overwrite entire buffer including discriminator)
        {
            let mut data = ctx.accounts.player1_profile.data.borrow_mut();
            let mut cursor = &mut data[..];
            player1_profile.try_serialize(&mut cursor)?;
            // Debug: Modify lamports to verify write access
            **ctx.accounts.player1_profile.lamports.borrow_mut() -= 1000;
        }
        {
            let mut data = ctx.accounts.player2_profile.data.borrow_mut();
            let mut cursor = &mut data[..];
            player2_profile.try_serialize(&mut cursor)?;
        }

        msg!("Result: {:?}", &game.result);

        game.exit(&crate::ID)?;

        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![
                &game.to_account_info(),
                // Profiles excluded to verify local TEE persistence and write access
            ],
            magic_context,
            magic_program,
        )?;

        Ok(())
    }

    /// Delegate account to the delegation program based on account type
    /// Set specific validator based on ER, see https://docs.magicblock.gg/pages/get-started/how-integrate-your-program/local-setup
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
    /// Derives the bump from the account type and seeds, then calls the permission program.
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
        seeds = [PLAYER_PROFILE_SEED, payer.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, PlayerProfile>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateGame<'info> {
    #[account(
        init_if_needed,
        payer = player1,
        space = 8 + Game::LEN,
        seeds = [GAME_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(
        init_if_needed,
        payer = player1,
        space = 8 + PlayerChoice::LEN,
        seeds = [PLAYER_CHOICE_SEED, &game_id.to_le_bytes(), player1.key().as_ref()],
        bump
    )]
    pub player_choice: Account<'info, PlayerChoice>,

    #[account(mut)]
    pub player1: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct JoinGame<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(
        init_if_needed,
        payer = player,
        space = 8 + PlayerChoice::LEN,
        seeds = [PLAYER_CHOICE_SEED, &game_id.to_le_bytes(), player.key().as_ref()],
        bump
    )]
    pub player_choice: Account<'info, PlayerChoice>,

    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct MakeChoice<'info> {
    #[account(
        mut,
        seeds = [PLAYER_CHOICE_SEED, &game_id.to_le_bytes(), player.key().as_ref()],
        bump
    )]
    pub player_choice: Account<'info, PlayerChoice>,

    #[account(mut)]
    pub player: Signer<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct RevealWinner<'info> {
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,

    /// Player1's choice PDA (derived automatically)
    #[account(
        mut,
        seeds = [PLAYER_CHOICE_SEED, &game.game_id.to_le_bytes(), game.player1.unwrap().as_ref()],
        bump
    )]
    pub player1_choice: Account<'info, PlayerChoice>,

    /// Player2's choice PDA (derived automatically)
    #[account(
        mut,
        seeds = [PLAYER_CHOICE_SEED, &game.game_id.to_le_bytes(), game.player2.unwrap().as_ref()],
        bump
    )]
    pub player2_choice: Account<'info, PlayerChoice>,

    /// CHECK: Manual serialization to avoid Anchor double-write conflict with TEE commit
    #[account(
        mut,
        seeds = [PLAYER_PROFILE_SEED, game.player1.unwrap().as_ref()],
        bump
    )]
    pub player1_profile: UncheckedAccount<'info>,

    /// CHECK: Manual serialization to avoid Anchor double-write conflict with TEE commit
    #[account(
        mut,
        seeds = [PLAYER_PROFILE_SEED, game.player2.unwrap().as_ref()],
        bump
    )]
    pub player2_profile: UncheckedAccount<'info>,

    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission_game: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission1: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission2: UncheckedAccount<'info>,
    /// Anyone can trigger this
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PERMISSION PROGRAM
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
}

/// Unified delegate PDA context
#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: The PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
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
pub struct Game {
    pub game_id: u64,
    pub player1: Option<Pubkey>,
    pub player2: Option<Pubkey>,
    pub player1_choice: Option<Choice>,
    pub player2_choice: Option<Choice>,
    pub result: GameResult,
}
impl Game {
    pub const LEN: usize = 8                // game_id
        + (32 + 1) * 2                       // player1, player2
        + (1 + 1) * 2                        // player1_choice, player2_choice
        + (1 + 32); // result (1 byte tag + 32 bytes pubkey for Winner variant)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum GameResult {
    Winner(Pubkey),
    Tie,
    None,
}

#[account]
pub struct PlayerChoice {
    pub game_id: u64,
    pub player: Pubkey,
    pub choice: Option<Choice>,
}
impl PlayerChoice {
    pub const LEN: usize = 8 + 8 + 32 + 2;
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum Choice {
    Rock,
    Paper,
    Scissors,
}

#[error_code]
pub enum GameError {
    #[msg("You already made your choice.")]
    AlreadyChose,
    #[msg("You cannot join your own game.")]
    CannotJoinOwnGame,
    #[msg("Both players must make a choice first.")]
    MissingChoice,
    #[msg("Opponent not found.")]
    MissingOpponent,
    #[msg("Game is already full.")]
    GameFull,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Game { game_id: u64 },
    PlayerChoice { game_id: u64, player: Pubkey },
    PlayerProfile { player: Pubkey },
}

fn derive_seeds_from_account_type(account_type: &AccountType) -> Vec<Vec<u8>> {
    match account_type {
        AccountType::Game { game_id } => {
            vec![GAME_SEED.to_vec(), game_id.to_le_bytes().to_vec()]
        }
        AccountType::PlayerChoice { game_id, player } => {
            vec![
                PLAYER_CHOICE_SEED.to_vec(),
                game_id.to_le_bytes().to_vec(),
                player.to_bytes().to_vec(),
            ]
        }
        AccountType::PlayerProfile { player } => {
            vec![PLAYER_PROFILE_SEED.to_vec(), player.to_bytes().to_vec()]
        }
    }
}
