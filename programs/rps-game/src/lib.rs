use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::anchor::{delegate, ephemeral, commit};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_accounts;
use ephemeral_rollups_sdk::access_control::instructions::{
    CreatePermissionCpi, CreatePermissionCpiAccounts, CreatePermissionInstructionArgs,
};
use ephemeral_rollups_sdk::access_control::structs::{Member, MembersArgs, AUTHORITY_FLAG};

declare_id!("8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos");

pub const PLAYER_PROFILE_SEED: &[u8] = b"player_profile_v35";
pub const GAME_SESSION_SEED: &[u8] = b"game_session_v1";

// Gum Session Keys — enables gasless game moves via ephemeral session signers.
// SessionToken layout (owner: KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5):
//   [0..8]   discriminator
//   [8..40]  authority: Pubkey   (the real player's wallet)
//   [40..72] target_program: Pubkey
//   [72..104] session_signer: Pubkey  (the ephemeral keypair)
//   [104..112] valid_until: i64 (unix timestamp)
struct ParsedSessionToken {
    authority: Pubkey,
    target_program: Pubkey,
    session_signer: Pubkey,
    valid_until: i64,
}

fn parse_session_token(account: &AccountInfo, allowed_program: &Pubkey) -> Result<ParsedSessionToken> {
    require!(account.owner == allowed_program, GameError::InvalidSession);
    let data = account.try_borrow_data()?;
    require!(data.len() >= 112, GameError::InvalidSession);
    let authority = Pubkey::new_from_array(data[8..40].try_into().unwrap());
    let target_program = Pubkey::new_from_array(data[40..72].try_into().unwrap());
    let session_signer = Pubkey::new_from_array(data[72..104].try_into().unwrap());
    let valid_until = i64::from_le_bytes(data[104..112].try_into().unwrap());
    Ok(ParsedSessionToken { authority, target_program, session_signer, valid_until })
}

/// Resolves the "real" player pubkey from either a session token or a direct signer.
/// - No token: player == signer (direct wallet TX).
/// - Token present: validates owner (against session_program), target_program, expiry, and session_signer; returns authority.
/// - Token present but session_program is None: error (caller must configure a session program).
fn resolve_player<'a>(
    signer_key: &Pubkey,
    session_token: Option<&UncheckedAccount<'a>>,
    session_program: Option<&Pubkey>,
) -> Result<Pubkey> {
    if let Some(token_account) = session_token {
        let allowed = session_program.ok_or(error!(GameError::InvalidSession))?;
        let token = parse_session_token(token_account.as_ref(), allowed)?;
        let clock = Clock::get()?;
        require!(token.session_signer == *signer_key, GameError::InvalidSession);
        require!(token.target_program == crate::ID, GameError::InvalidSession);
        require!(token.valid_until > clock.unix_timestamp, GameError::SessionExpired);
        Ok(token.authority)
    } else {
        Ok(*signer_key)
    }
}

#[ephemeral]
#[program]
pub mod rps_game {
    use super::*;

    pub fn initialize_player(ctx: Context<InitializePlayer>) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.player = ctx.accounts.player.key();
        profile.elo = 1000;
        profile.games_played = 0;
        profile.games_won = 0;
        msg!("Initialized profile for {}", profile.player);
        Ok(())
    }



    // 2️⃣ Start Game (Triggered by Client after MatchFound)
    pub fn start_game(ctx: Context<StartGame>, game_id: u64, opponent: Pubkey) -> Result<()> {
        // In a real implementation, we would verify this match against the Matchmaker
        // For Proof of Concept, we allow starting the game if logic matches.
        
        let session = &mut ctx.accounts.game_session;
        session.game_id = game_id;
        session.player1 = ctx.accounts.player.key();
        session.player2 = opponent;
        session.result = GameResult::None;
        
        msg!("Game Session Started: {} vs {}", session.player1, session.player2);
        Ok(())
    }

    // 3️⃣ Make Choice
    pub fn make_choice(ctx: Context<MakeChoice>, choice: Choice) -> Result<()> {
        let player = resolve_player(
            &ctx.accounts.signer.key(),
            ctx.accounts.session_token.as_ref(),
            ctx.accounts.game_session.session_program.as_ref(),
        )?;
        let session = &mut ctx.accounts.game_session;

        if session.player1 == player {
             require!(session.player1_choice.is_none(), GameError::AlreadyChose);
             session.player1_choice = Some(choice);
        } else if session.player2 == player {
             require!(session.player2_choice.is_none(), GameError::AlreadyChose);
             session.player2_choice = Some(choice);
        } else {
             return err!(GameError::InvalidPlayer);
        }
        
        msg!("Player {} chose {:?}", player, choice);
        
        // Resolve if both chose
        if session.player1_choice.is_some() && session.player2_choice.is_some() {
             let c1 = session.player1_choice.unwrap();
             let c2 = session.player2_choice.unwrap();
             
             session.result = match (c1, c2) {
                (Choice::Rock, Choice::Scissors) | (Choice::Paper, Choice::Rock) | (Choice::Scissors, Choice::Paper) => GameResult::Winner(session.player1),
                (Choice::Rock, Choice::Paper) | (Choice::Paper, Choice::Scissors) | (Choice::Scissors, Choice::Rock) => GameResult::Winner(session.player2),
                _ => GameResult::Tie,
             };
             msg!("Game Result: {:?}", session.result);

             // Update ELO
             if let GameResult::Winner(winner) = session.result {
                 let p1_profile = &mut ctx.accounts.player1_profile;
                 let p2_profile = &mut ctx.accounts.player2_profile;
                 
                 // Simple ELO: Winner +10, Loser -10
                 if winner == session.player1 {
                     p1_profile.elo = p1_profile.elo.saturating_add(10);
                     p2_profile.elo = p2_profile.elo.saturating_sub(10);
                     p1_profile.games_won += 1;
                 } else {
                     p1_profile.elo = p1_profile.elo.saturating_sub(10);
                     p2_profile.elo = p2_profile.elo.saturating_add(10);
                     p2_profile.games_won += 1;
                 }
                 p1_profile.games_played += 1;
                 p2_profile.games_played += 1;
                 
                 msg!("ELO Updated: P1 ({}), P2 ({})", p1_profile.elo, p2_profile.elo);
             } else if let GameResult::Tie = session.result {
                 let p1_profile = &mut ctx.accounts.player1_profile;
                 let p2_profile = &mut ctx.accounts.player2_profile;
                 p1_profile.games_played += 1;
                 p2_profile.games_played += 1;
                 msg!("Game Tied - No ELO Change");
             }
        }
        Ok(())
    }
    
    // 4️⃣ Persist Results (L1) -> Commit Game Session + Profiles
    pub fn persist_results(ctx: Context<PersistResults>) -> Result<()> {
        // Logic to commit changes to L1
         commit_accounts(
            &ctx.accounts.payer,
            vec![
                &ctx.accounts.game_session.to_account_info(),
                &ctx.accounts.player1_profile.to_account_info(), // Assuming we update profiles too
                &ctx.accounts.player2_profile.to_account_info(),
            ],
             &ctx.accounts.magic_context.to_account_info(),
            &ctx.accounts.magic_program.to_account_info(),
        )?;
        Ok(())
    }
    
    // Delegate Logic
    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
         // Same delegate logic
         let seed_data = derive_seeds_from_account_type(&account_type);
         let seeds_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();
         let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
         
         ctx.accounts.delegate_pda(
            &ctx.accounts.payer, 
            &seeds_refs, 
            DelegateConfig { validator, ..Default::default() }
         )?;
         Ok(())
    }
    
    /// Set up permission for player profile PDA so a co-authority can write it on TEE.
    /// `bump` is the PDA bump from `find_program_address`.
    /// Must be called BEFORE delegate_pda while the program still owns the PDA.
    pub fn setup_profile_permission(
        ctx: Context<SetupProfilePermission>,
        bump: u8,
        co_authority: Pubkey,
    ) -> Result<()> {
        let player = ctx.accounts.player.key();

        CreatePermissionCpi::new(
            &ctx.accounts.permission_program,
            CreatePermissionCpiAccounts {
                permissioned_account: &ctx.accounts.profile.to_account_info(),
                permission: &ctx.accounts.permission,
                payer: &ctx.accounts.player.to_account_info(),
                system_program: &ctx.accounts.system_program.to_account_info(),
            },
            CreatePermissionInstructionArgs {
                args: MembersArgs {
                    members: Some(vec![
                        Member { flags: AUTHORITY_FLAG, pubkey: player },
                        Member { flags: AUTHORITY_FLAG, pubkey: co_authority },
                    ]),
                },
            },
        ).invoke_signed(&[&[
            PLAYER_PROFILE_SEED,
            player.as_ref(),
            &[bump],
        ]])?;

        Ok(())
    }

    /// Set up permission for a game session PDA so co-authorities can write it on TEE.
    /// `player1`, `player2`, `game_id`, and `bump` identify the exact session PDA.
    /// Must be called BEFORE delegate_pda while the program still owns the PDA.
    pub fn setup_game_session_permission(
        ctx: Context<SetupGameSessionPermission>,
        player1: Pubkey,
        player2: Pubkey,
        game_id: u64,
        bump: u8,
        co_authority: Pubkey,
    ) -> Result<()> {
        let p1 = player1;
        let p2 = player2;

        CreatePermissionCpi::new(
            &ctx.accounts.permission_program,
            CreatePermissionCpiAccounts {
                permissioned_account: &ctx.accounts.game_session.to_account_info(),
                permission: &ctx.accounts.permission,
                payer: &ctx.accounts.payer.to_account_info(),
                system_program: &ctx.accounts.system_program.to_account_info(),
            },
            CreatePermissionInstructionArgs {
                args: MembersArgs {
                    members: Some(vec![
                        Member { flags: AUTHORITY_FLAG, pubkey: p1 },
                        Member { flags: AUTHORITY_FLAG, pubkey: p2 },
                        Member { flags: AUTHORITY_FLAG, pubkey: co_authority },
                    ]),
                },
            },
        ).invoke_signed(&[&[
            GAME_SESSION_SEED,
            p1.as_ref(),
            p2.as_ref(),
            &game_id.to_le_bytes(),
            &[bump],
        ]])?;

        Ok(())
    }

    // Close functions for cleanup
    pub fn close_player(_ctx: Context<ClosePlayer>) -> Result<()> { Ok(()) }

    /// Callback handler invoked by the duel program after a match is committed.
    /// Demonstrates the CPI callback pattern for permissionless integration.
    pub fn on_match_found(
        ctx: Context<OnMatchFound>,
        player1: Pubkey,
        player2: Pubkey,
        match_id: u64,
    ) -> Result<()> {
        msg!(
            "Match callback received: {} vs {} (match_id: {})",
            player1,
            player2,
            match_id
        );
        msg!("Callback authority (Duel Tenant PDA): {}", ctx.accounts.signer.key());
        Ok(())
    }

    /// Start game with MatchTicket verification - proves the match was legitimately found
    pub fn start_game_with_ticket(
        ctx: Context<StartGameWithTicket>,
        game_id: u64,
        opponent: Pubkey,
        session_program: Option<Pubkey>,
    ) -> Result<()> {
        let real_player = resolve_player(
            &ctx.accounts.signer.key(),
            ctx.accounts.session_token.as_ref(),
            session_program.as_ref(),
        )?;
        require!(real_player == ctx.accounts.player.key(), GameError::InvalidPlayer);

        // Verify the match ticket shows this player was matched with the opponent
        let ticket_data = ctx.accounts.match_ticket.try_borrow_data()?;
        // Skip 8-byte discriminator, then read: player(32) + tenant(32) + status(1+...)
        // status offset = 8 + 32 + 32 = 72
        // status discriminator at byte 72: 0=Searching, 1=Matched, 2=Expired, 3=Cancelled
        require!(ticket_data.len() > 72, GameError::InvalidMatchTicket);
        require!(ticket_data[72] == 1, GameError::InvalidMatchTicket); // Must be Matched

        // Read opponent from matched status: bytes 73..105
        let mut opponent_bytes = [0u8; 32];
        opponent_bytes.copy_from_slice(&ticket_data[73..105]);
        let ticket_opponent = Pubkey::from(opponent_bytes);
        require!(ticket_opponent == opponent, GameError::InvalidMatchTicket);
        drop(ticket_data);

        let session = &mut ctx.accounts.game_session;
        session.game_id = game_id;
        session.player1 = ctx.accounts.player.key(); // real player, not session signer
        session.player2 = opponent;
        session.result = GameResult::None;
        session.session_program = session_program;

        msg!(
            "Game Session Started (verified via ticket): {} vs {}",
            session.player1,
            session.player2
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePlayer<'info> {
    #[account(init, payer = payer, space = 8 + PlayerProfile::LEN, seeds = [PLAYER_PROFILE_SEED, player.key().as_ref()], bump)]
    pub profile: Account<'info, PlayerProfile>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}



#[derive(Accounts)]
#[instruction(game_id: u64, opponent: Pubkey)]
pub struct StartGame<'info> {
    #[account(
        init, 
        payer = player, 
        space = 8 + GameSession::LEN,
        // Seeds must be unique per pairing + ID? Or just random? 
        // For simplicity: [seed, p1, p2, id]
        seeds = [GAME_SESSION_SEED, player.key().as_ref(), opponent.as_ref(), &game_id.to_le_bytes()],
        bump
    )]
    pub game_session: Account<'info, GameSession>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MakeChoice<'info> {
    #[account(mut)]
    pub game_session: Account<'info, GameSession>,
    #[account(mut, seeds = [PLAYER_PROFILE_SEED, game_session.player1.as_ref()], bump)]
    pub player1_profile: Account<'info, PlayerProfile>,
    #[account(mut, seeds = [PLAYER_PROFILE_SEED, game_session.player2.as_ref()], bump)]
    pub player2_profile: Account<'info, PlayerProfile>,
    pub signer: Signer<'info>,
    /// CHECK: Optional Gum session token — owner and fields validated in resolve_player
    pub session_token: Option<UncheckedAccount<'info>>,
}

#[commit]
#[derive(Accounts)]
pub struct PersistResults<'info> {
    #[account(mut)]
    pub game_session: Account<'info, GameSession>,
    /// CHECK: Manual verify
    #[account(mut)]
    pub player1_profile: AccountInfo<'info>,
    /// CHECK: Manual verify
    #[account(mut)]
    pub player2_profile: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetupProfilePermission<'info> {
    /// CHECK: Profile PDA — seeds verified by invoke_signed in handler
    pub profile: AccountInfo<'info>,
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: Permission PDA for the profile account
    #[account(mut)]
    pub permission: AccountInfo<'info>,
    /// CHECK: Permission program
    pub permission_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetupGameSessionPermission<'info> {
    /// CHECK: Game session PDA — seeds verified by invoke_signed in handler
    pub game_session: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Permission PDA for the game session account
    #[account(mut)]
    pub permission: AccountInfo<'info>,
    /// CHECK: Permission program
    pub permission_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

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
pub struct ClosePlayer<'info> {
    #[account(mut, close = payer, seeds = [PLAYER_PROFILE_SEED, player.key().as_ref()], bump)]
    pub profile: Account<'info, PlayerProfile>,
    pub player: Signer<'info>,
    /// CHECK: Payer
    #[account(mut)]
    pub payer: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct OnMatchFound<'info> {
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(game_id: u64, opponent: Pubkey)]
pub struct StartGameWithTicket<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + GameSession::LEN,
        seeds = [GAME_SESSION_SEED, player.key().as_ref(), opponent.as_ref(), &game_id.to_le_bytes()],
        bump
    )]
    pub game_session: Account<'info, GameSession>,
    /// CHECK: Real player wallet for PDA seeds — validated by resolve_player in handler
    pub player: UncheckedAccount<'info>,
    pub signer: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Optional Gum session token — owner and fields validated in resolve_player
    pub session_token: Option<UncheckedAccount<'info>>,
    /// CHECK: MatchTicket PDA from the duel program, verified in instruction body
    pub match_ticket: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PlayerProfile {
    pub player: Pubkey,
    pub elo: u64,
    pub games_played: u64,
    pub games_won: u64,
}

impl PlayerProfile {
    pub const LEN: usize = 32 + 8 + 8 + 8;
}

#[account]
pub struct GameSession {
    pub game_id: u64,
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub player1_choice: Option<Choice>,
    pub player2_choice: Option<Choice>,
    pub result: GameResult,
    /// Optional session-keys program configured at game start; used by make_choice.
    pub session_program: Option<Pubkey>,
}

impl GameSession {
    // 8 + 32 + 32 + 2 + 2 + 33 + (1+32) = 142
    pub const LEN: usize = 8 + 32 + 32 + 2 + 2 + 33 + (1 + 32);
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
    #[msg("Already chose")]
    AlreadyChose,
    #[msg("Invalid player")]
    InvalidPlayer,
    #[msg("Invalid match ticket - not matched or wrong opponent")]
    InvalidMatchTicket,
    #[msg("Invalid session token")]
    InvalidSession,
    #[msg("Session token expired")]
    SessionExpired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    PlayerProfile { player: Pubkey },
    GameSession { p1: Pubkey, p2: Pubkey, id: u64 },
}

fn derive_seeds_from_account_type(account_type: &AccountType) -> Vec<Vec<u8>> {
    match account_type {
        AccountType::PlayerProfile { player } => {
            vec![PLAYER_PROFILE_SEED.to_vec(), player.to_bytes().to_vec()]
        }
        AccountType::GameSession { p1, p2, id } => {
             vec![GAME_SESSION_SEED.to_vec(), p1.to_bytes().to_vec(), p2.to_bytes().to_vec(), id.to_le_bytes().to_vec()]
        }
    }
}
