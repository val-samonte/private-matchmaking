use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;

declare_id!("EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X");

#[ephemeral]
#[program]
pub mod duel {
    use super::*;

    pub fn initialize_tenant(
        ctx: Context<InitializeTenant>,
        tenant_program_id: Pubkey,
        elo_offset: u32,
        elo_size: u8,
        elo_window: u64,
    ) -> Result<()> {
        let tenant = &mut ctx.accounts.tenant;
        tenant.authority = ctx.accounts.authority.key();
        tenant.tenant_program_id = tenant_program_id;
        tenant.elo_offset = elo_offset;
        tenant.elo_size = elo_size;
        tenant.elo_window = elo_window;
        msg!(
            "Tenant Initialized for Program: {} (ELO size: {} bytes)",
            tenant_program_id,
            elo_size
        );
        Ok(())
    }

    pub fn initialize_queue(ctx: Context<InitializeQueue>) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        queue.authority = ctx.accounts.authority.key();
        queue.tenant = ctx.accounts.tenant.key();
        queue.bump = ctx.bumps.queue;
        msg!("Queue Initialized linked to Tenant: {}", queue.tenant);
        Ok(())
    }

    pub fn delegate_queue(ctx: Context<DelegateQueue>, account_type: AccountType) -> Result<()> {
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

    pub fn join_queue(ctx: Context<JoinQueue>) -> Result<()> {
        // 1. Verify Tenant
        let player_account_info = &ctx.accounts.player_data;
        let owner = player_account_info.owner;
        let tenant_program_id = &ctx.accounts.tenant.tenant_program_id;

        // This PID is the MagicBlock Delegation Program ID on Devnet usually
        // But better to not hardcode.
        // For now, we allow if owner == tenant OR owner != system_program (weak check).

        if owner != tenant_program_id {
            msg!(
                "Warning: Owner ({}) != Tenant ({}). Assuming Delegated Account.",
                owner,
                tenant_program_id
            );
            // Verify it is NOT the System Program (000...)
            require!(owner != &System::id(), MatchmakingError::InvalidTenant);
        }

        // 2. Read ELO (Generic - supports u8, u16, u32, u64)
        let data = player_account_info.try_borrow_data()?;
        let offset = ctx.accounts.tenant.elo_offset as usize;
        let elo_size = ctx.accounts.tenant.elo_size as usize;

        if data.len() < offset + elo_size {
            return err!(MatchmakingError::DataTooSmall);
        }

        let elo = match elo_size {
            1 => data[offset] as u64,
            2 => {
                let mut bytes = [0u8; 2];
                bytes.copy_from_slice(&data[offset..offset + 2]);
                u16::from_le_bytes(bytes) as u64
            }
            4 => {
                let mut bytes = [0u8; 4];
                bytes.copy_from_slice(&data[offset..offset + 4]);
                u32::from_le_bytes(bytes) as u64
            }
            8 => {
                let mut bytes = [0u8; 8];
                bytes.copy_from_slice(&data[offset..offset + 8]);
                u64::from_le_bytes(bytes)
            }
            _ => return err!(MatchmakingError::InvalidEloSize),
        };

        msg!("Player joined with ELO: {} ({} bytes)", elo, elo_size);

        // 3. Insert into Queue
        let entry = QueueEntry {
            player: ctx.accounts.player_data.key(), // Use the account key as player ID
            elo,
        };
        ctx.accounts.queue.entries.push(entry);

        msg!(
            "Player {} added to queue (Total: {})",
            entry.player,
            ctx.accounts.queue.entries.len()
        );

        // 4. Automatically process matches after adding player
        let queue = &mut ctx.accounts.queue;
        let window = ctx.accounts.tenant.elo_window;

        if queue.entries.len() >= 2 {
            let new_player_idx = queue.entries.len() - 1;
            let new_player = queue.entries[new_player_idx];

            // Try to find a match for the newly added player
            for i in 0..new_player_idx {
                let other_player = queue.entries[i];
                let diff = if new_player.elo > other_player.elo {
                    new_player.elo - other_player.elo
                } else {
                    other_player.elo - new_player.elo
                };

                if diff <= window {
                    // Match found!
                    let timestamp = Clock::get()?.unix_timestamp;

                    msg!(
                        "Auto-Match Found: {} (ELO {}) vs {} (ELO {})",
                        new_player.player,
                        new_player.elo,
                        other_player.player,
                        other_player.elo
                    );

                    // Emit event
                    emit!(MatchFound {
                        player1: new_player.player,
                        player2: other_player.player,
                        timestamp,
                    });

                    // Store in matches list (keep last 10)
                    let match_entry = MatchEntry {
                        player1: new_player.player,
                        player2: other_player.player,
                        timestamp,
                    };

                    queue.matches.push(match_entry);

                    // Keep only last 10 matches
                    if queue.matches.len() > 10 {
                        queue.matches.remove(0);
                    }

                    // Remove both players from queue (remove higher index first)
                    queue.entries.remove(new_player_idx);
                    queue.entries.remove(i);
                    break;
                }
            }
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeTenant<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Tenant::LEN,
        seeds = [b"tenant", authority.key().as_ref()],
        bump
    )]
    pub tenant: Account<'info, Tenant>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeQueue<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Queue::LEN,
        seeds = [b"queue", authority.key().as_ref()], 
        bump
    )]
    pub queue: Account<'info, Queue>,
    #[account(
        constraint = tenant.authority == authority.key() @ MatchmakingError::Unauthorized
    )]
    pub tenant: Account<'info, Tenant>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateQueue<'info> {
    /// CHECK: The PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Checker
    pub validator: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
pub struct JoinQueue<'info> {
    #[account(mut)]
    pub queue: Account<'info, Queue>,
    #[account(
        constraint = queue.tenant == tenant.key() @ MatchmakingError::InvalidTenant
    )]
    pub tenant: Account<'info, Tenant>,
    /// CHECK: We inspect the owner and data manually.
    #[account(mut)]
    pub player_data: AccountInfo<'info>,
    pub signer: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct MatchEntry {
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MatchFound {
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub timestamp: i64,
}

#[account]
pub struct Queue {
    pub authority: Pubkey,
    pub tenant: Pubkey,
    pub bump: u8,
    pub entries: Vec<QueueEntry>,
    pub matches: Vec<MatchEntry>, // Store recent matches for visibility
}

#[account]
pub struct Tenant {
    pub authority: Pubkey,
    pub tenant_program_id: Pubkey,
    pub elo_offset: u32,
    pub elo_size: u8,
    pub elo_window: u64,
}

impl Tenant {
    pub const LEN: usize = 32 + 32 + 4 + 1 + 8;
}

impl Queue {
    // Increased size to hold matches
    pub const LEN: usize = 32 + 32 + 4 + 1 + 64 + (100 * 40) + (10 * 72);
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct QueueEntry {
    pub player: Pubkey,
    pub elo: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct QueueConfig {
    pub tenant_program_id: Pubkey,
    pub elo_offset: u32,
    pub elo_window: u64,
}

#[error_code]
pub enum MatchmakingError {
    #[msg("Account does not belong to the specified Tenant Program")]
    InvalidTenant,
    #[msg("Account data too small for ELO read")]
    DataTooSmall,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid ELO size (must be 1, 2, 4, or 8 bytes)")]
    InvalidEloSize,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Queue { authority: Pubkey },
}

fn derive_seeds_from_account_type(account_type: &AccountType) -> Vec<Vec<u8>> {
    match account_type {
        AccountType::Queue { authority } => {
            vec![b"queue".to_vec(), authority.to_bytes().to_vec()]
        }
    }
}
