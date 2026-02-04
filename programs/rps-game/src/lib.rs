use anchor_lang::prelude::*;
use duel::Queue; 

use ephemeral_rollups_sdk::anchor::{delegate, ephemeral, commit};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_accounts;

declare_id!("8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos");

pub const PLAYER_PROFILE_SEED: &[u8] = b"player_profile_v35";
pub const GAME_SESSION_SEED: &[u8] = b"game_session_v1";

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
        let session = &mut ctx.accounts.game_session;
        let player = ctx.accounts.player.key();

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
    
    // Close functions for cleanup
     pub fn close_player(_ctx: Context<ClosePlayer>) -> Result<()> { Ok(()) }
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
    pub player: Signer<'info>,
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
}

impl GameSession {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 2 + 33;
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
