use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

declare_id!("sUcFSbEig6ydu7ddNhb1dvRksqmC5eRuLxg77wK4PDz");

#[ephemeral]
#[program]
pub mod private_matchmaking {
    use super::*;

    pub fn initialize_queue(ctx: Context<InitializeQueue>, config: QueueConfig) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        queue.authority = ctx.accounts.authority.key();
        queue.tenant_program_id = config.tenant_program_id;
        queue.elo_offset = config.elo_offset;
        queue.elo_window = config.elo_window;
        queue.bump = ctx.bumps.queue;

        msg!(
            "Queue Initialized for Tenant: {} (Window: {})",
            config.tenant_program_id,
            config.elo_window
        );
        Ok(())
    }

    pub fn join_queue(ctx: Context<JoinQueue>) -> Result<()> {
        // 1. Verify Tenant
        let player_account_info = &ctx.accounts.player_data;
        require!(
            player_account_info.owner == &ctx.accounts.queue.tenant_program_id,
            MatchmakingError::InvalidTenant
        );

        // 2. Read ELO (Generic)
        // Note: In TEE we trust the AccountInfo passed via delegation (or read from L1)
        // The constraints ensure we are looking at the right account.
        let data = player_account_info.try_borrow_data()?;
        let offset = ctx.accounts.queue.elo_offset as usize;

        if data.len() < offset + 8 {
            return err!(MatchmakingError::DataTooSmall);
        }

        let mut elo_bytes = [0u8; 8];
        elo_bytes.copy_from_slice(&data[offset..offset + 8]);
        let elo = u64::from_le_bytes(elo_bytes);

        msg!("Player joined with ELO: {}", elo);

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
        Ok(())
    }

    pub fn process_match(ctx: Context<ProcessMatch>) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        let window = queue.elo_window;

        let mut match_found = None;
        let mut remove_indices = None;

        // Simple O(N^2) or just checking head against others?
        // For simplicity: Check Head against all others. If match, pop both.
        // Since we are ephemeral, we can hold state in memory or just sort.
        // Let's assume queue is relatively small (100).

        if queue.entries.len() >= 2 {
            // Try to find a match for the first player
            let p1 = queue.entries[0];

            for i in 1..queue.entries.len() {
                let p2 = queue.entries[i];
                let diff = if p1.elo > p2.elo {
                    p1.elo - p2.elo
                } else {
                    p2.elo - p1.elo
                };

                if diff <= window {
                    match_found = Some((p1, p2));
                    remove_indices = Some((0, i));
                    break;
                }
            }
        }

        if let Some((indices)) = remove_indices {
            // Remove higher index first to not shift lower index
            queue.entries.remove(indices.1);
            queue.entries.remove(indices.0);

            if let Some((p1, p2)) = match_found {
                msg!(
                    "Match Found: {} (ELO {}) vs {} (ELO {})",
                    p1.player,
                    p1.elo,
                    p2.player,
                    p2.elo
                );
            }
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct ProcessMatch<'info> {
    #[account(mut)] // Access control: who calls this? The TEE Cron.
    pub queue: Account<'info, Queue>,
    /// CHECK: Authority
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeQueue<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Queue::LEN,
        seeds = [b"queue", authority.key().as_ref()], // One queue per authority for now? Or per tenant? 
        bump
    )]
    pub queue: Account<'info, Queue>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinQueue<'info> {
    #[account(mut)]
    pub queue: Account<'info, Queue>,
    /// CHECK: We inspect the owner and data manually. This is the generic player account.
    #[account(mut)] // Mutable if we lock them?
    pub player_data: AccountInfo<'info>,
    pub signer: Signer<'info>, // The player authority?
}

#[account]
pub struct Queue {
    pub authority: Pubkey,
    pub tenant_program_id: Pubkey,
    pub elo_offset: u32,
    pub elo_window: u64,
    pub bump: u8,
    pub entries: Vec<QueueEntry>,
}

impl Queue {
    // Basic overhead + 100 entries * 40 bytes = 4000 bytes
    pub const LEN: usize = 32 + 32 + 4 + 1 + 64 + (100 * 40);
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
}
