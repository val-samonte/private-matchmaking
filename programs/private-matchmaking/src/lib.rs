use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::state::queue::*;
use crate::state::player::*;
use crate::errors::MatchError;

pub mod state;
// Flattening instructions into lib.rs due to #[ephemeral] macro limitation with modules
// pub mod instructions; 
pub mod errors {
    use anchor_lang::prelude::*;

    #[error_code]
    pub enum MatchError {
        #[msg("Account owner is invalid")]
        InvalidAccountOwner,
        #[msg("Queue is full")]
        QueueFull,
        #[msg("Account data too small for ELO offset")]
        AccountTooSmall,
        #[msg("Invalid ELO type configuration")]
        InvalidEloType,
        #[msg("Page index out of bounds")]
        IndexOutOfBounds,
    }
}

use state::*;

declare_id!("FTmhTEzrRrQp4U7ySjTLWry53VoKUCG4NqH12mcfzTSd"); 

#[ephemeral]
#[program]
pub mod private_matchmaking {
    use super::*;

    pub fn initialize_queue(
        ctx: Context<InitializeQueue>, 
        _queue_id: String,
        config: QueueConfig,
        capacity: u16,
        page_size: u8,
    ) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        queue.authority = ctx.accounts.authority.key();
        queue.tenant_program_id = ctx.accounts.tenant_program_id.key();
        queue.config = config;
        queue.capacity = capacity;
        queue.page_size = page_size;
        queue.write_page_index = 0;
        queue.read_page_index = 0;
        queue.bump = ctx.bumps.queue;
        Ok(())
    }

    pub fn initialize_page(ctx: Context<InitializePage>, page_index: u64) -> Result<()> {
        let page = &mut ctx.accounts.page;
        // Check if index is within capacity
        require!(page_index < ctx.accounts.queue.capacity as u64, crate::errors::MatchError::IndexOutOfBounds);
        // Initialize vector
        page.players = Vec::with_capacity(ctx.accounts.queue.page_size as usize);
        Ok(())
    }

    pub fn resize_queue(ctx: Context<ResizeQueue>, new_capacity: u16) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        let active_pages = queue.write_page_index.checked_sub(queue.read_page_index).unwrap();
        if (new_capacity as u64) < active_pages {
                msg!("Warning: New capacity {} is less than active pages {}. Queue might be stuck until drained.", new_capacity, active_pages);
        }
        
        queue.capacity = new_capacity;
        Ok(())
    }

    pub fn delegate_queue(ctx: Context<DelegateQueue>, queue_id: String) -> Result<()> {
        let authority_key = ctx.accounts.authority.key();
        let seeds = &[
            b"queue-head",
            authority_key.as_ref(),
            queue_id.as_bytes(),
        ];
        
        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
        
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            seeds,
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;
        
        msg!("Queue delegated to Ephemeral Rollup");
        Ok(())
    }

    pub fn join_queue(ctx: Context<JoinQueue>) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        let page = &mut ctx.accounts.page;
        let player_status = &mut ctx.accounts.player_status;
        let player_account_info = &ctx.accounts.player_game_account;

        // 1. Verify Ownership
        require!(
            player_account_info.owner == &queue.tenant_program_id,
            MatchError::InvalidAccountOwner
        );
        
        // 2. Lock Player (Prevent Double Queue)
        player_status.player = ctx.accounts.player_authority.key();
        player_status.queue = queue.key();
        player_status.in_match = false;
        player_status.joined_at = Clock::get()?.unix_timestamp;
        player_status.bump = ctx.bumps.player_status;

        // 3. Parse ELO (Universal Adapter)
        let elo_value = parse_elo(player_account_info, &queue.config)?;

        // 4. Add Player
        page.players.push(PlayerEntry {
            authority: ctx.accounts.player_authority.key(),
            account: player_account_info.key(),
            elo: elo_value,
            joined_at: Clock::get()?.unix_timestamp,
        });

        // 5. Handle Full Page
        if page.players.len() >= queue.page_size as usize {
            queue.write_page_index = queue.write_page_index.checked_add(1).unwrap();
            
            // Ring Overflow
            let active_pages = queue.write_page_index.checked_sub(queue.read_page_index).unwrap();
            if active_pages > queue.capacity as u64 {
                return err!(MatchError::QueueFull);
            }
        }

        Ok(())
    }
    
    pub fn unlock_player(_ctx: Context<UnlockPlayer>) -> Result<()> {
        // Just closing the account refunds the rent to the 'player' (destination).
        msg!("Player unlocked by Authority. Rent refunded to Player.");
        Ok(())
    }

    pub fn process_match(ctx: Context<ProcessMatch>, _page_index: u64) -> Result<()> {
        let queue = &ctx.accounts.queue;
        let page = &mut ctx.accounts.page;
        let config = &queue.config;
        
        let mut matches = Vec::new();
        let mut remove_indices = Vec::new();

        msg!("Processing Page with {} players", page.players.len());
        for i in 0..page.players.len() {
            if remove_indices.contains(&i) { continue; }
            
            for j in (i + 1)..page.players.len() {
                if remove_indices.contains(&j) { continue; }

                let p1 = &page.players[i];
                let p2 = &page.players[j];

                // Check ELO threshold
                let diff = if p1.elo > p2.elo { p1.elo - p2.elo } else { p2.elo - p1.elo };
                
                if diff <= config.match_threshold as u64 {
                    emit!(MatchFound {
                        queue: queue.key(),
                        player_a: p1.authority,
                        player_b: p2.authority,
                        elo_a: p1.elo,
                        elo_b: p2.elo,
                        timestamp: Clock::get()?.unix_timestamp,
                    });
                    
                    matches.push((i, j));
                    remove_indices.push(i);
                    remove_indices.push(j);
                    break; // Move to next p1
                }
            }
        }

        // Rebuild vector excluding matched players
        let mut remaining_players = Vec::with_capacity(page.players.len());
        for (i, p) in page.players.iter().enumerate() {
            if !remove_indices.contains(&i) {
                remaining_players.push(*p);
            }
        }
        page.players = remaining_players;

        Ok(())
    }

    // Dev Helper
    pub fn create_mock_player(ctx: Context<CreateMockPlayer>, elo: u64) -> Result<()> {
        let account = &mut ctx.accounts.player_account;
        account.elo = elo;
        Ok(())
    }
}

// --- Helpers ---

fn parse_elo(account: &AccountInfo, config: &QueueConfig) -> Result<u64> {
    let data = account.try_borrow_data()?;
    let offset = config.elo_offset as usize;
    
    // Bounds check
    if data.len() < offset + 4 { 
        return err!(MatchError::AccountTooSmall);
    }

    match config.elo_type {
        0 => { // u32
             if data.len() < offset + 4 { return err!(MatchError::AccountTooSmall); }
             let val = u32::from_le_bytes(data[offset..offset+4].try_into().unwrap());
             Ok(val as u64)
        },
        1 => { // u64
             if data.len() < offset + 8 { return err!(MatchError::AccountTooSmall); }
             let val = u64::from_le_bytes(data[offset..offset+8].try_into().unwrap());
             Ok(val)
        },
        2 => { // i32
             if data.len() < offset + 4 { return err!(MatchError::AccountTooSmall); }
             let val = i32::from_le_bytes(data[offset..offset+4].try_into().unwrap());
             Ok(val as u64) 
        },
        _ => err!(MatchError::InvalidEloType),
    }
}

// --- Contexts ---

#[derive(Accounts)]
#[instruction(queue_id: String)]
pub struct InitializeQueue<'info> {
    #[account(
        init,
        payer = authority,
        space = QueueHead::LEN,
        seeds = [b"queue-head", authority.key().as_ref(), queue_id.as_bytes()],
        bump
    )]
    pub queue: Account<'info, QueueHead>,
    
    /// CHECK: We trust the signer to provide the correct program ID
    pub tenant_program_id: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(page_index: u64)]
pub struct InitializePage<'info> {
    #[account(mut)]
    pub queue: Account<'info, QueueHead>,
    
    #[account(
        init,
        payer = authority,
        space = QueuePage::size(queue.page_size),
        seeds = [
            b"page", 
            queue.key().as_ref(), 
            &page_index.to_le_bytes()
        ],
        bump
    )]
    pub page: Account<'info, QueuePage>,
    
    #[account(mut)]
    pub authority: Signer<'info>, 
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResizeQueue<'info> {
    #[account(mut, has_one = authority)]
    pub queue: Account<'info, QueueHead>,
    pub authority: Signer<'info>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(queue_id: String)]
pub struct DelegateQueue<'info> {
    /// CHECK: The Queue PDA to delegate
    #[account(mut, del, seeds = [b"queue-head", authority.key().as_ref(), queue_id.as_bytes()], bump)]
    pub pda: AccountInfo<'info>,
    
    pub authority: Signer<'info>,
    pub payer: Signer<'info>,
    /// CHECK: Checked by the delegate program logic
    pub validator: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
pub struct JoinQueue<'info> {
    #[account(mut)]
    pub queue: Account<'info, QueueHead>,
    
    #[account(
        mut,
        seeds = [
            b"page",
            queue.key().as_ref(),
            &(queue.write_page_index % queue.capacity as u64).to_le_bytes()
        ],
        bump
    )]
    pub page: Account<'info, QueuePage>,
    
    /// CHECK: This account locks the player from joining other queues.
    #[account(
        init,
        payer = player_authority,
        space = PlayerStatus::LEN,
        seeds = [b"status", player_game_account.key().as_ref()],
        bump
    )]
    pub player_status: Account<'info, PlayerStatus>,
    
    #[account(mut)]
    pub player_authority: Signer<'info>,
    
    /// The account containing ELO data
    /// CHECK: Checked via ownership against tenant_program_id inside instructions
    pub player_game_account: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnlockPlayer<'info> {
    #[account(has_one = authority)]
    pub queue: Account<'info, QueueHead>,
    
    #[account(mut)]
    pub authority: Signer<'info>, // The Game Authority (Queue Owner)
    
    #[account(
        mut,
        close = player, // Refund rent to the player who paid it
        constraint = player_status.queue == queue.key(),
        constraint = player_status.player == player.key(),
        seeds = [b"status", player_game_account.key().as_ref()],
        bump
    )]
    pub player_status: Account<'info, PlayerStatus>,
    
    /// CHECK: Validated by constraint on player_status.player
    #[account(mut)]
    pub player: SystemAccount<'info>,
    
    /// CHECK: Used for seeds
    pub player_game_account: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(page_index: u64)]
pub struct ProcessMatch<'info> {
    #[account(mut)]
    pub queue: Account<'info, QueueHead>,
    
    #[account(
        mut,
        seeds = [b"page", queue.key().as_ref(), &page_index.to_le_bytes()],
        bump
    )]
    pub page: Account<'info, QueuePage>,
}

// Dev Helper Context (Keep here or move to separate test file? Keep here for convenience)
#[derive(Accounts)]
pub struct CreateMockPlayer<'info> {
    #[account(init, payer = authority, space = 8 + 8 + 64)] 
    pub player_account: Account<'info, MockPlayer>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct MockPlayer {
    pub elo: u64,
}

#[event]
pub struct MatchFound {
    pub queue: Pubkey,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub elo_a: u64,
    pub elo_b: u64,
    pub timestamp: i64,
}
