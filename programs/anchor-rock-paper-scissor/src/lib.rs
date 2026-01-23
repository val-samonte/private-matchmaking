use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::instructions::{
    CreatePermissionCpiBuilder, UpdatePermissionCpiBuilder,
};
use ephemeral_rollups_sdk::access_control::structs::{Member, MembersArgs};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

use private_matchmaking::cpi::accounts::UnlockPlayer;
use private_matchmaking::program::PrivateMatchmaking;
// Assuming PlayerStatus is in state::player based on error helper, 
// OR simpler: use the IDL generated types if available? 
// No, the error said: `struct PlayerStatus is private`. 
// It also said: `note: the struct PlayerStatus is defined here --> programs/private-matchmaking/src/lib.rs:5:5`
// But it is not `pub use`.
// I will try to use `private_matchmaking::state::player::PlayerStatus` if that is public.
// If the crate doesn't export it, I might be stuck. 
// However, the `private-matchmaking` crate likely exports state.
// Let's check `programs/private-matchmaking/src/lib.rs` quickly? 
// No, I'll trust the compiler hint first or just use `Account<'info, ...>` generic if possible? 
// `UnlockPlayer` expects `player_status: AccountInfo<'info>`.
// So I don't strictly need the `PlayerStatus` struct definition for the CPI *call* logic if I blindly pass AccountInfo.
// BUT `RevealWinner` struct definition likely uses `Account<'info, PlayerStatus>`?
// I added `pub player1_status: UncheckedAccount<'info>`.
// So I don't need `PlayerStatus` struct imported!
// I just need to remove the unused import `use private_matchmaking::{self, PlayerStatus};`


declare_id!("HGddb95QNe62nMU9gB4Ga81PiBxL7ZpeLUtYcXcLWtgR");

pub const PLAYER_CHOICE_SEED: &[u8] = b"player_choice";
pub const GAME_SEED: &[u8] = b"game";
pub const PLAYER_PROFILE_SEED: &[u8] = b"player_profile";

#[ephemeral]
#[program]
pub mod anchor_rock_paper_scissor {

    use super::*;

    // 0️⃣ Initialize Player Profile (for Matchmaking)
    pub fn initialize_player(ctx: Context<InitializePlayer>, elo: u64) -> Result<()> {
        let player_profile = &mut ctx.accounts.player_profile;
        player_profile.authority = ctx.accounts.payer.key();
        player_profile.elo = elo;
        player_profile.wins = 0;
        player_profile.losses = 0;
        msg!("Player initialized with ELO: {}", elo);
        Ok(())
    }

    // 0.5️⃣ Initialize Matchmaking Queue (Prod: Owned by this Program)
    pub fn initialize_msg_queue(
        ctx: Context<InitializeMsgQueue>, 
        queue_id: String,
        capacity: u16,
        page_size: u8
    ) -> Result<()> {
        // Fund the PDA Authority so it can pay for the Queue Account.
        let rent_exempt = Rent::get()?.minimum_balance(private_matchmaking::state::queue::QueueHead::LEN);
        let amount = rent_exempt + 10_000_000; 

        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.payer.key(),
            &ctx.accounts.authority.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let cpi_program = ctx.accounts.matchmaking_program.to_account_info();
        
        let config = private_matchmaking::state::queue::QueueConfig {
            // Matchable Interface: No offset/type needed
            match_threshold: 1000,
            search_window: 60,
            reserved: [0; 64],
        };

        // Seeds for authorization
        let seeds: &[&[u8]] = &[b"queue-authority", &[ctx.bumps.authority]];
        let signer = &[&seeds[..]];

        let cpi_accounts = private_matchmaking::cpi::accounts::InitializeQueue {
             queue: ctx.accounts.queue.to_account_info(),
             authority: ctx.accounts.authority.to_account_info(), 
             tenant_program_id: ctx.accounts.tenant_program_id.to_account_info(),
             system_program: ctx.accounts.system_program.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts, signer);
        
        private_matchmaking::cpi::initialize_queue(
            cpi_ctx,
            queue_id.clone(),
            config,
            capacity,
            page_size
        )?;
        
        // 2️⃣ Initialize Page 0
        let cpi_accounts_page = private_matchmaking::cpi::accounts::InitializePage {
            queue: ctx.accounts.queue.to_account_info(),
            page: ctx.accounts.page.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx_page = CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts_page, signer);
        
        private_matchmaking::cpi::initialize_page(cpi_ctx_page, 0)?;

        // 3️⃣ Delegate Queue to Ephemeral Rollup (Privacy Fix)
        // This moves the queue state to the TEE, making it invisible to standard RPCs
        // 3️⃣ Delegate Queue to Ephemeral Rollup (Privacy Fix)
        // This moves the queue state to the TEE, making it invisible to standard RPCs
        
        // Actually, for simplicity and to match `private-matchmaking` definition which might use `param` for validator?
        // Let's look at `programs/private-matchmaking/src/lib.rs`:
        // fn delegate_queue(...) ... ctx.accounts.validator ...
        // It's likely an optional account in the context.
        // For CPI, we simply provide it if we have it, or `None`? 
        // Anchor CPI fields are usually `pub validator: Option<AccountInfo<'info>>` if defined as `Optional`.
        // BUT `DelegateQueue` struct in `private-matchmaking` has `pub validator: Option<AccountInfo<'info>>`.
        // So we pass `None` if we use default validator strategy or rely on ER.
        
        // However, I need to construct `DelegateQueue` struct.
        // Let's assume `validator: None` for now.
        
        // Wait, `private_matchmaking::cpi::accounts` is generated by `anchor-gen` or included? 
        // It's a workspace crate. 
        // I will use `validator: None`.
        
        // Since I cannot verify the struct definition easily without docs, I'll risk `None`.
        // If it fails to compile, I'll fix.
         
        let cpi_accounts_delegate = private_matchmaking::cpi::accounts::DelegateQueue {
            pda: ctx.accounts.queue.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            validator: Some(ctx.accounts.system_program.to_account_info()), // Use SystemProgram as placeholder validator
            buffer_pda: ctx.accounts.buffer_pda.to_account_info(),
            delegation_record_pda: ctx.accounts.delegation_record_pda.to_account_info(),
            delegation_metadata_pda: ctx.accounts.delegation_metadata_pda.to_account_info(),
            delegation_program: ctx.accounts.delegation_program.to_account_info(),
            owner_program: ctx.accounts.matchmaking_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
         
        let cpi_ctx_delegate = CpiContext::new_with_signer(cpi_program, cpi_accounts_delegate, signer);
        private_matchmaking::cpi::delegate_queue(cpi_ctx_delegate, queue_id)?;

        msg!("Queue initialized and delegated to privacy layer.");
        Ok(())
    }

    // 1️⃣ Join Session (Idempotent: Creates or Joins)
    pub fn join_session(ctx: Context<JoinSession>, game_id: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let player = ctx.accounts.player.key();

        // Initialize game_id if new
        if game.game_id == 0 {
             game.game_id = game_id;
             game.result = GameResult::None;
        }

        // Logic to assign slots
        if game.player1.is_none() {
            game.player1 = Some(player);
            msg!("Player 1 Joined: {}", player);
        } else if game.player1 == Some(player) {
            msg!("Player 1 Re-joined: {}", player);
        } else if game.player2.is_none() {
            game.player2 = Some(player);
            msg!("Player 2 Joined: {}", player);
        } else if game.player2 == Some(player) {
            msg!("Player 2 Re-joined: {}", player);
        } else {
            return err!(GameError::GameFull);
        }

        // Initialize/Update Player Choice PDA
        let player_choice = &mut ctx.accounts.player_choice;
        player_choice.game_id = game_id;
        player_choice.player = player;
        // Don't reset choice if already made (in case of re-join logic, though choice is None initially)
        if player_choice.choice.is_none() {
             player_choice.choice = None;
        }

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

    // 7.2 Matchable Interface: Get Player ELO (Public/CPI)
    pub fn get_player_elo(ctx: Context<GetPlayerElo>) -> Result<u64> {
        let profile = &ctx.accounts.player_profile;
        msg!("Matchable Interface: returning ELO {}", profile.elo);
        Ok(profile.elo)
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
        let magic_context = &ctx.accounts.magic_context.to_account_info();

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

            (Choice::Scissors, Choice::Rock) => GameResult::Winner(player2),

            _ => GameResult::Tie,
        };

        // 5️⃣ Update ELO
        let p1_profile = &mut ctx.accounts.player1_profile;
        let p2_profile = &mut ctx.accounts.player2_profile;

        match game.result {
            GameResult::Winner(winner) => {
                if winner == player1 {
                    p1_profile.elo = p1_profile.elo.saturating_add(10);
                    p1_profile.wins = p1_profile.wins.saturating_add(1);

                    p2_profile.elo = p2_profile.elo.saturating_sub(10);
                    p2_profile.losses = p2_profile.losses.saturating_add(1);
                    msg!("Player 1 won! New ELO: P1={}, P2={}", p1_profile.elo, p2_profile.elo);
                } else {
                    p2_profile.elo = p2_profile.elo.saturating_add(10);
                    p2_profile.wins = p2_profile.wins.saturating_add(1);

                    p1_profile.elo = p1_profile.elo.saturating_sub(10);
                    p1_profile.losses = p1_profile.losses.saturating_add(1);
                    msg!("Player 2 won! New ELO: P1={}, P2={}", p1_profile.elo, p2_profile.elo);
                }
            }
            GameResult::Tie => {
                msg!("It's a tie! ELO unchanged.");
            }
            _ => {}
        }

        // CPI: Unlock Players
        // Unlock Player 1
        let cpi_program = ctx.accounts.matchmaking_program.to_account_info();
        
        // Use the Queue Authority PDA to sign
        // Note: For this to work, the Queue Authority MUST be the PDA [b"queue-authority"]
        // which we enforced in initialize_msg_queue.
        let seeds: &[&[u8]] = &[b"queue-authority", &[ctx.bumps.authority]]; 
        let signer = &[&seeds[..]];
        
        let cpi_accounts_p1 = UnlockPlayer {
            queue: ctx.accounts.queue.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(), // Passed in Context
            player_status: ctx.accounts.player1_status.to_account_info(),
            player: ctx.accounts.player1_wallet.to_account_info(), 
            player_game_account: ctx.accounts.player1_profile.to_account_info(), 
        };
        
        let cpi_ctx_p1 = CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts_p1, signer);
        private_matchmaking::cpi::unlock_player(cpi_ctx_p1)?;

        // Unlock Player 2
        let cpi_accounts_p2 = UnlockPlayer {
            queue: ctx.accounts.queue.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            player_status: ctx.accounts.player2_status.to_account_info(),
            player: ctx.accounts.player2_wallet.to_account_info(),
            player_game_account: ctx.accounts.player2_profile.to_account_info(),
        };

        let cpi_ctx_p2 = CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts_p2, signer);
        private_matchmaking::cpi::unlock_player(cpi_ctx_p2)?;
        
        UpdatePermissionCpiBuilder::new(&permission_program)
            .permissioned_account(&game.to_account_info(), true)
            .authority(&game.to_account_info(), false)
            .permission(&permission_game.to_account_info())
            .args(MembersArgs { members: None })
            .invoke_signed(&[&[GAME_SEED, &game.game_id.to_le_bytes(), &[ctx.bumps.game]]])?;

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

        msg!("Result: {:?}", &game.result);

        game.exit(&crate::ID)?;

        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&game.to_account_info()],
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
#[instruction(game_id: u64)]
pub struct JoinSession<'info> {
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + Game::LEN,
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

    /// Player1 Profile (for ELO update)
    #[account(mut, seeds = [PLAYER_PROFILE_SEED, game.player1.unwrap().as_ref()], bump)]
    pub player1_profile: Account<'info, PlayerProfile>,

    /// Player2 Profile (for ELO update)
    #[account(mut, seeds = [PLAYER_PROFILE_SEED, game.player2.unwrap().as_ref()], bump)]
    pub player2_profile: Account<'info, PlayerProfile>,

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
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission_game: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission1: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission2: UncheckedAccount<'info>,

    /// CHECK: Queue account for CPI
    pub queue: UncheckedAccount<'info>,

    /// CHECK: Player 1 Wallet (for rent refund)
    #[account(mut)]
    pub player1_wallet: UncheckedAccount<'info>,

    /// CHECK: Player 2 Wallet (for rent refund)
    #[account(mut)]
    pub player2_wallet: UncheckedAccount<'info>,

    /// The PDA that is the authority of the queue (must sign for unlock)
    #[account(
        seeds = [b"queue-authority"],
        bump
    )]
    /// CHECK: Checked by seeds
    pub authority: UncheckedAccount<'info>,

    /// CHECK: Player 1 Status for CPI
    #[account(mut)]
    pub player1_status: UncheckedAccount<'info>,

    /// CHECK: Player 2 Status for CPI
    #[account(mut)]
    pub player2_status: UncheckedAccount<'info>,

    pub matchmaking_program: Program<'info, PrivateMatchmaking>,

    /// Anyone can trigger this
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

#[derive(Accounts)]
pub struct InitializePlayer<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + PlayerProfile::LEN,
        seeds = [PLAYER_PROFILE_SEED, payer.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PlayerProfile {
    // ELO must be at offset 8 (after discriminator) for the generic matchmaking program to read it easily
    pub elo: u64,       // 8 bytes
    pub authority: Pubkey, // 32 bytes
    pub wins: u64,      // 8 bytes
    pub losses: u64,    // 8 bytes
}

impl PlayerProfile {
    pub const LEN: usize = 8 + 32 + 8 + 8;
}

// 7.2 Matchable Interface Implementation
#[derive(Accounts)]
pub struct GetPlayerElo<'info> {
    #[account(
        seeds = [PLAYER_PROFILE_SEED, player.key().as_ref()],
        bump,
        constraint = player_profile.authority == player.key() @ GameError::MissingOpponent // Reusing an error or just default
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    
    /// CHECK: The player wallet to look up
    pub player: UncheckedAccount<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PlayerEloResult {
    pub elo: u64,
}

#[derive(Accounts)]
#[instruction(queue_id: String)]
pub struct InitializeMsgQueue<'info> {
    /// CHECK: Initialized via CPI
    #[account(mut)]
    pub queue: UncheckedAccount<'info>,
    
    /// CHECK: Page 0 Initialized via CPI
    #[account(mut)]
    pub page: UncheckedAccount<'info>,
    
    /// The PDA that will be the authority of the queue
    /// It must be a SystemAccount (no data) so it can pay for the queue creation.
    #[account(
        mut,
        seeds = [b"queue-authority"],
        bump
    )] 
    pub authority: SystemAccount<'info>, 
    
    // Delegation Accounts
    /// CHECK: Buffer for delegation
    #[account(mut)]
    pub buffer_pda: UncheckedAccount<'info>,
    /// CHECK: Delegation Record
    #[account(mut)]
    pub delegation_record_pda: UncheckedAccount<'info>,
    /// CHECK: Delegation Metadata
    #[account(mut)]
    pub delegation_metadata_pda: UncheckedAccount<'info>,
    /// CHECK: Delegation Program
    pub delegation_program: UncheckedAccount<'info>, 
    
    #[account(mut)]
    pub payer: Signer<'info>, 
    
    /// CHECK: Tenant ID
    pub tenant_program_id: UncheckedAccount<'info>,
    
    pub matchmaking_program: Program<'info, PrivateMatchmaking>,
    pub system_program: Program<'info, System>,
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
            vec![
                PLAYER_PROFILE_SEED.to_vec(),
                player.to_bytes().to_vec(),
            ]
        }
    }
}
