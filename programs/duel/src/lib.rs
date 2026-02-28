use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_accounts;
use ephemeral_rollups_sdk::access_control::instructions::{
    CreatePermissionCpi, CreatePermissionCpiAccounts, CreatePermissionInstructionArgs,
};
use ephemeral_rollups_sdk::access_control::structs::{Member, MembersArgs, AUTHORITY_FLAG};

declare_id!("EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X");

pub const TICKET_SEED: &[u8] = b"ticket";

// Gum Session Keys — enables gasless matchmaking via ephemeral session signers.
// SessionToken layout (owner: KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5):
//   [0..8]    discriminator
//   [8..40]   authority: Pubkey   (the real player's wallet)
//   [40..72]  target_program: Pubkey
//   [72..104] session_signer: Pubkey
//   [104..112] valid_until: i64
struct ParsedSessionToken {
    authority: Pubkey,
    target_program: Pubkey,
    session_signer: Pubkey,
    valid_until: i64,
}

fn parse_session_token(account: &AccountInfo, allowed_program: &Pubkey) -> Result<ParsedSessionToken> {
    require!(account.owner == allowed_program, MatchmakingError::InvalidSession);
    let data = account.try_borrow_data()?;
    require!(data.len() >= 112, MatchmakingError::InvalidSession);
    let authority = Pubkey::new_from_array(data[8..40].try_into().unwrap());
    let target_program = Pubkey::new_from_array(data[40..72].try_into().unwrap());
    let session_signer = Pubkey::new_from_array(data[72..104].try_into().unwrap());
    let valid_until = i64::from_le_bytes(data[104..112].try_into().unwrap());
    Ok(ParsedSessionToken { authority, target_program, session_signer, valid_until })
}

/// Resolves the "real" player pubkey from either a session token or a direct signer.
/// - No token: player == signer (direct wallet TX).
/// - Token present: validates owner (against session_program), target_program, expiry, and session_signer; returns authority.
/// - Token present but session_program is None: error (Tenant must configure a session program to accept session tokens).
fn resolve_player<'a>(
    signer_key: &Pubkey,
    session_token: Option<&UncheckedAccount<'a>>,
    session_program: Option<&Pubkey>,
) -> Result<Pubkey> {
    if let Some(token_account) = session_token {
        let allowed = session_program.ok_or(error!(MatchmakingError::InvalidSession))?;
        let token = parse_session_token(token_account.as_ref(), allowed)?;
        let clock = Clock::get()?;
        require!(token.session_signer == *signer_key, MatchmakingError::InvalidSession);
        require!(token.target_program == crate::ID, MatchmakingError::InvalidSession);
        require!(token.valid_until > clock.unix_timestamp, MatchmakingError::SessionExpired);
        Ok(token.authority)
    } else {
        Ok(*signer_key)
    }
}

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
        callback_program_id: Option<Pubkey>,
        callback_discriminator: Option<[u8; 8]>,
        session_program: Option<Pubkey>,
    ) -> Result<()> {
        let tenant = &mut ctx.accounts.tenant;
        tenant.authority = ctx.accounts.authority.key();
        tenant.tenant_program_id = tenant_program_id;
        tenant.elo_offset = elo_offset;
        tenant.elo_size = elo_size;
        tenant.elo_window = elo_window;
        tenant.callback_program_id = callback_program_id;
        tenant.callback_discriminator = callback_discriminator;
        tenant.session_program = session_program;
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
        queue.match_counter = 0;
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

    /// Player creates a MatchTicket PDA on L1
    pub fn create_ticket(ctx: Context<CreateTicket>) -> Result<()> {
        let real_player = resolve_player(
            &ctx.accounts.signer.key(),
            ctx.accounts.session_token.as_ref(),
            ctx.accounts.tenant.session_program.as_ref(),
        )?;
        require!(real_player == ctx.accounts.player.key(), MatchmakingError::Unauthorized);

        let ticket = &mut ctx.accounts.ticket;
        ticket.player = ctx.accounts.player.key();
        ticket.tenant = ctx.accounts.tenant.key();
        ticket.status = TicketStatus::Searching;
        ticket.created_at = Clock::get()?.unix_timestamp;
        ticket.bump = ctx.bumps.ticket;
        msg!(
            "Ticket created for player {} (tenant {})",
            ticket.player,
            ticket.tenant
        );
        Ok(())
    }

    /// Player delegates their ticket into TEE (becomes invisible on L1)
    pub fn delegate_ticket(ctx: Context<DelegateTicket>, account_type: AccountType) -> Result<()> {
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

    /// Set up permission for queue PDA so only the authority can read it on TEE.
    /// Must be called BEFORE delegate_queue while the program still owns the PDA.
    pub fn setup_queue_permission(ctx: Context<SetupQueuePermission>) -> Result<()> {
        let authority = ctx.accounts.authority.key();
        let auth_bytes = authority.to_bytes();
        let bump = ctx.accounts.queue.bump;

        let permission_program_info = &ctx.accounts.permission_program;

        CreatePermissionCpi::new(
            permission_program_info,
            CreatePermissionCpiAccounts {
                permissioned_account: &ctx.accounts.queue.to_account_info(),
                permission: &ctx.accounts.permission,
                payer: &ctx.accounts.authority.to_account_info(),
                system_program: &ctx.accounts.system_program.to_account_info(),
            },
            CreatePermissionInstructionArgs {
                args: MembersArgs {
                    members: Some(vec![
                        Member { flags: AUTHORITY_FLAG, pubkey: authority },
                    ]),
                },
            },
        ).invoke_signed(&[&[
            b"queue",
            &auth_bytes,
            &[bump],
        ]])?;

        Ok(())
    }

    /// Set up permission for ticket PDA so queueAuthority (and optionally a session key) can
    /// read/write it on TEE.  Must be called BEFORE delegate_ticket while the program still owns the PDA.
    pub fn setup_ticket_permission(
        ctx: Context<SetupTicketPermission>,
        session_key: Option<Pubkey>,
    ) -> Result<()> {
        let real_player = resolve_player(
            &ctx.accounts.signer.key(),
            ctx.accounts.session_token.as_ref(),
            ctx.accounts.tenant.session_program.as_ref(),
        )?;
        require!(real_player == ctx.accounts.player.key(), MatchmakingError::Unauthorized);

        let ticket = &ctx.accounts.ticket;
        let queue_authority = ctx.accounts.tenant.authority;
        let player = ctx.accounts.player.key();
        let tenant_key = ctx.accounts.tenant.key();
        let bump = ticket.bump;

        let permission_program_info = &ctx.accounts.permission_program;

        let mut members = vec![
            Member { flags: AUTHORITY_FLAG, pubkey: player },
            Member { flags: AUTHORITY_FLAG, pubkey: queue_authority },
        ];
        if let Some(sk) = session_key {
            members.push(Member { flags: AUTHORITY_FLAG, pubkey: sk });
        }

        CreatePermissionCpi::new(
            permission_program_info,
            CreatePermissionCpiAccounts {
                permissioned_account: &ctx.accounts.ticket.to_account_info(),
                permission: &ctx.accounts.permission,
                payer: &ctx.accounts.payer.to_account_info(),
                system_program: &ctx.accounts.system_program.to_account_info(),
            },
            CreatePermissionInstructionArgs {
                args: MembersArgs {
                    members: Some(members),
                },
            },
        ).invoke_signed(&[&[
            TICKET_SEED,
            player.as_ref(),
            tenant_key.as_ref(),
            &[bump],
        ]])?;

        Ok(())
    }

    /// Player cancels search, marks ticket as Cancelled (runs in TEE)
    pub fn cancel_ticket(ctx: Context<CancelTicket>) -> Result<()> {
        let real_player = resolve_player(
            &ctx.accounts.signer.key(),
            ctx.accounts.session_token.as_ref(),
            ctx.accounts.tenant.session_program.as_ref(),
        )?;
        require!(real_player == ctx.accounts.player.key(), MatchmakingError::Unauthorized);

        let ticket = &mut ctx.accounts.ticket;
        require!(
            matches!(ticket.status, TicketStatus::Searching),
            MatchmakingError::InvalidTicketStatus
        );
        require!(
            ticket.player == ctx.accounts.player.key(),
            MatchmakingError::Unauthorized
        );
        ticket.status = TicketStatus::Cancelled;
        msg!("Ticket cancelled for player {}", ticket.player);
        Ok(())
    }

    /// Reclaim rent after match consumed or cancelled (L1)
    pub fn close_ticket(ctx: Context<CloseTicket>) -> Result<()> {
        let real_player = resolve_player(
            &ctx.accounts.signer.key(),
            ctx.accounts.session_token.as_ref(),
            ctx.accounts.tenant.session_program.as_ref(),
        )?;
        require!(real_player == ctx.accounts.player.key(), MatchmakingError::Unauthorized);
        // Account is closed and rent returned to player via the `close = player` constraint
        msg!("Ticket closed and rent reclaimed for player {}", ctx.accounts.player.key());
        Ok(())
    }

    /// Modified join_queue: now requires player's MatchTicket
    pub fn join_queue<'a>(ctx: Context<'_, '_, 'a, 'a, JoinQueue<'a>>) -> Result<()> {
        // 1. Resolve the real player and verify ticket
        let real_player = resolve_player(
            &ctx.accounts.signer.key(),
            ctx.accounts.session_token.as_ref(),
            ctx.accounts.tenant.session_program.as_ref(),
        )?;
        require!(real_player == ctx.accounts.player.key(), MatchmakingError::Unauthorized);

        let ticket = &ctx.accounts.player_ticket;
        require!(
            matches!(ticket.status, TicketStatus::Searching),
            MatchmakingError::InvalidTicketStatus
        );
        require!(
            ticket.player == ctx.accounts.player.key(),
            MatchmakingError::Unauthorized
        );

        // 2. Verify Tenant
        let player_account_info = &ctx.accounts.player_data;
        let owner = player_account_info.owner;
        let tenant_program_id = &ctx.accounts.tenant.tenant_program_id;

        if owner != tenant_program_id {
            msg!(
                "Warning: Owner ({}) != Tenant ({}). Assuming Delegated Account.",
                owner,
                tenant_program_id
            );
            require!(owner != &System::id(), MatchmakingError::InvalidTenant);
        }

        // 3. Read ELO (Generic - supports u8, u16, u32, u64)
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

        // Need to drop borrow before mutable access
        drop(data);

        msg!("Player joined with ELO: {} ({} bytes)", elo, elo_size);

        // 4. Insert into Queue
        let entry = QueueEntry {
            player: ctx.accounts.player.key(),
            elo,
        };
        ctx.accounts.queue.entries.push(entry);

        msg!(
            "Player {} added to queue (Total: {})",
            entry.player,
            ctx.accounts.queue.entries.len()
        );

        // 5. Automatically process matches — capture result for callback
        let mut found_match: Option<(Pubkey, Pubkey, u64)> = None;
        {
            let queue = &mut ctx.accounts.queue;
            let window = ctx.accounts.tenant.elo_window;

            if queue.entries.len() >= 2 {
                let new_player_idx = queue.entries.len() - 1;
                let new_player = queue.entries[new_player_idx];

                // Find the closest-ELO opponent within the window (not just the first).
                let mut best_match: Option<(usize, u64)> = None; // (index, diff)
                for i in 0..new_player_idx {
                    let other_player = queue.entries[i];
                    let diff = new_player.elo.abs_diff(other_player.elo);

                    if diff <= window {
                        if best_match.map_or(true, |(_, best_diff)| diff < best_diff) {
                            best_match = Some((i, diff));
                        }
                    }
                }

                if let Some((best_idx, _)) = best_match {
                    let other_player = queue.entries[best_idx];

                    // Match found!
                    let timestamp = Clock::get()?.unix_timestamp;
                    queue.match_counter += 1;
                    let match_id = queue.match_counter;

                    msg!(
                        "Auto-Match Found: {} (ELO {}) vs {} (ELO {}), match_id: {}",
                        new_player.player,
                        new_player.elo,
                        other_player.player,
                        other_player.elo,
                        match_id
                    );

                    // Emit event
                    emit!(MatchFound {
                        player1: new_player.player,
                        player2: other_player.player,
                        match_id,
                        timestamp,
                    });

                    // Store in matches list (keep last 10)
                    let match_entry = MatchEntry {
                        player1: new_player.player,
                        player2: other_player.player,
                        match_id,
                        timestamp,
                    };
                    queue.matches.push(match_entry);
                    if queue.matches.len() > 10 {
                        queue.matches.remove(0);
                    }

                    // Update the joining player's ticket (we have it as an account)
                    let player_ticket = &mut ctx.accounts.player_ticket;
                    player_ticket.status = TicketStatus::Matched {
                        opponent: other_player.player,
                        match_id,
                    };

                    // Store a PendingMatch for the opponent (their ticket isn't available here)
                    queue.pending_matches.push(PendingMatch {
                        player: other_player.player,
                        opponent: new_player.player,
                        match_id,
                    });

                    // Remove both players from queue (remove higher index first)
                    queue.entries.remove(new_player_idx);
                    queue.entries.remove(best_idx);

                    found_match = Some((new_player.player, other_player.player, match_id));
                }
            }
        } // mutable borrows released here

        // 6. Fire callback via Tenant PDA (invoke_signed)
        if let Some((p1, p2, mid)) = found_match {
            if let (Some(callback_pid), Some(callback_disc)) = (
                ctx.accounts.tenant.callback_program_id,
                ctx.accounts.tenant.callback_discriminator,
            ) {
                if let Some(cb_prog) = ctx.remaining_accounts.first() {
                    if cb_prog.key() == callback_pid && cb_prog.executable {
                        let authority = ctx.accounts.tenant.authority;
                        let auth_bytes = authority.to_bytes();
                        let (_, bump) = Pubkey::find_program_address(
                            &[b"tenant", &auth_bytes],
                            ctx.program_id,
                        );
                        let bump_arr = [bump];
                        let seeds: &[&[u8]] = &[b"tenant", &auth_bytes, &bump_arr];

                        let mut data = Vec::with_capacity(80);
                        data.extend_from_slice(&callback_disc);
                        data.extend_from_slice(p1.as_ref());
                        data.extend_from_slice(p2.as_ref());
                        data.extend_from_slice(&mid.to_le_bytes());

                        let ix = Instruction {
                            program_id: callback_pid,
                            accounts: vec![AccountMeta {
                                pubkey: ctx.accounts.tenant.key(),
                                is_signer: true,
                                is_writable: false,
                            }],
                            data,
                        };
                        invoke_signed(
                            &ix,
                            &[ctx.accounts.tenant.to_account_info(), cb_prog.clone()],
                            &[seeds],
                        )?;
                        msg!("Callback via Tenant PDA: {} vs {} (id: {})", p1, p2, mid);
                    }
                }
            }
        }

        Ok(())
    }

    /// Flush pending matches: update opponent tickets and commit to L1
    /// Can be called by any TEE-authenticated wallet (permissionless crank)
    pub fn flush_matches<'a>(ctx: Context<'_, '_, 'a, 'a, FlushMatches<'a>>) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        let pending = std::mem::take(&mut queue.pending_matches);

        if pending.is_empty() {
            msg!("No pending matches to flush");
            return Ok(());
        }

        // Process each pending match against remaining accounts
        let remaining = &ctx.remaining_accounts;
        let ticket_account_limit = remaining.len();
        let mut remaining_idx = 0;

        for pm in &pending {
            if remaining_idx >= ticket_account_limit {
                // Put unprocessed matches back
                queue.pending_matches.extend_from_slice(&pending[remaining_idx..]);
                msg!(
                    "Warning: Not enough remaining accounts. {} matches unprocessed.",
                    pending.len() - remaining_idx
                );
                break;
            }

            let ticket_info = &remaining[remaining_idx];
            remaining_idx += 1;

            // Verify this is the correct ticket PDA
            let (expected_pda, _bump) = Pubkey::find_program_address(
                &[
                    TICKET_SEED,
                    pm.player.as_ref(),
                    ctx.accounts.tenant.key().as_ref(),
                ],
                ctx.program_id,
            );
            require!(
                ticket_info.key() == expected_pda,
                MatchmakingError::InvalidTicketAccount
            );

            // Deserialize, update, and re-serialize the ticket
            let mut ticket_data = ticket_info.try_borrow_mut_data()?;
            // Skip 8-byte discriminator, use deserialize (cursor-based) to handle trailing bytes
            let mut reader: &[u8] = &ticket_data[8..];
            let mut ticket = MatchTicket::deserialize(&mut reader)
                .map_err(|_| error!(MatchmakingError::InvalidTicketAccount))?;

            require!(
                matches!(ticket.status, TicketStatus::Searching),
                MatchmakingError::InvalidTicketStatus
            );

            ticket.status = TicketStatus::Matched {
                opponent: pm.opponent,
                match_id: pm.match_id,
            };

            // Re-serialize back into the account data
            let serialized = ticket
                .try_to_vec()
                .map_err(|_| MatchmakingError::InvalidTicketAccount)?;
            ticket_data[8..8 + serialized.len()].copy_from_slice(&serialized);

            msg!(
                "Flushed match: {} matched with {} (id: {})",
                pm.player,
                pm.opponent,
                pm.match_id
            );
        }

        msg!("Flush complete: {} matches processed", remaining_idx);
        Ok(())
    }

    /// Commit matched tickets back to L1 (runs in TEE, uses #[commit])
    pub fn commit_tickets<'a>(ctx: Context<'_, '_, 'a, 'a, CommitTickets<'a>>) -> Result<()> {
        // Verify all remaining accounts are owned by this program
        for ticket_info in ctx.remaining_accounts.iter() {
            require!(
                ticket_info.owner == ctx.program_id,
                MatchmakingError::InvalidTicketAccount
            );
        }

        if ctx.remaining_accounts.is_empty() {
            msg!("No tickets to commit");
            return Ok(());
        }

        let account_refs: Vec<&AccountInfo> = ctx.remaining_accounts.iter().collect();
        let count = account_refs.len();

        commit_accounts(
            &ctx.accounts.payer,
            account_refs,
            &ctx.accounts.magic_context.to_account_info(),
            &ctx.accounts.magic_program.to_account_info(),
        )?;

        msg!("Committed {} tickets to L1", count);
        Ok(())
    }
}

// --- Account Contexts ---

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
pub struct CreateTicket<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + MatchTicket::LEN,
        seeds = [TICKET_SEED, player.key().as_ref(), tenant.key().as_ref()],
        bump
    )]
    pub ticket: Account<'info, MatchTicket>,
    pub tenant: Account<'info, Tenant>,
    /// CHECK: Real player wallet for PDA seeds — validated by resolve_player in handler
    pub player: UncheckedAccount<'info>,
    pub signer: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Optional Gum session token — owner and fields validated in resolve_player
    pub session_token: Option<UncheckedAccount<'info>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetupQueuePermission<'info> {
    #[account(
        seeds = [b"queue", authority.key().as_ref()],
        bump = queue.bump,
    )]
    pub queue: Account<'info, Queue>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Permission PDA derived from queue (seeds: [b"permission:", queue_key])
    #[account(mut)]
    pub permission: AccountInfo<'info>,
    /// CHECK: Permission program (ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1)
    pub permission_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetupTicketPermission<'info> {
    #[account(
        seeds = [TICKET_SEED, player.key().as_ref(), tenant.key().as_ref()],
        bump = ticket.bump,
    )]
    pub ticket: Account<'info, MatchTicket>,
    pub tenant: Account<'info, Tenant>,
    /// CHECK: Real player wallet for PDA seeds — validated by resolve_player in handler
    pub player: UncheckedAccount<'info>,
    pub signer: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Optional Gum session token — owner and fields validated in resolve_player
    pub session_token: Option<UncheckedAccount<'info>>,
    /// CHECK: Permission PDA derived from ticket (seeds: [b"permission:", ticket_key])
    #[account(mut)]
    pub permission: AccountInfo<'info>,
    /// CHECK: Permission program (ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1)
    pub permission_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateTicket<'info> {
    /// CHECK: The ticket PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Validator
    pub validator: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
pub struct CancelTicket<'info> {
    #[account(
        mut,
        seeds = [TICKET_SEED, player.key().as_ref(), tenant.key().as_ref()],
        bump = ticket.bump,
    )]
    pub ticket: Account<'info, MatchTicket>,
    pub tenant: Account<'info, Tenant>,
    /// CHECK: Real player wallet for PDA seeds — validated by resolve_player in handler
    pub player: UncheckedAccount<'info>,
    pub signer: Signer<'info>,
    /// CHECK: Optional Gum session token — owner and fields validated in resolve_player
    pub session_token: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct CloseTicket<'info> {
    #[account(
        mut,
        close = player,
        seeds = [TICKET_SEED, player.key().as_ref(), tenant.key().as_ref()],
        bump = ticket.bump,
        constraint = matches!(ticket.status, TicketStatus::Matched { .. } | TicketStatus::Cancelled | TicketStatus::Expired) @ MatchmakingError::InvalidTicketStatus,
    )]
    pub ticket: Account<'info, MatchTicket>,
    pub tenant: Account<'info, Tenant>,
    /// CHECK: Real player wallet — receives reclaimed rent, used for PDA seeds
    #[account(mut)]
    pub player: UncheckedAccount<'info>,
    pub signer: Signer<'info>,
    /// CHECK: Optional Gum session token — owner and fields validated in resolve_player
    pub session_token: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct JoinQueue<'info> {
    #[account(mut)]
    pub queue: Account<'info, Queue>,
    #[account(
        constraint = queue.tenant == tenant.key() @ MatchmakingError::InvalidTenant
    )]
    pub tenant: Account<'info, Tenant>,
    /// CHECK: We inspect the owner and data manually (read-only).
    pub player_data: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [TICKET_SEED, player.key().as_ref(), tenant.key().as_ref()],
        bump = player_ticket.bump,
    )]
    pub player_ticket: Account<'info, MatchTicket>,
    /// CHECK: Real player wallet for ticket seeds — validated by resolve_player in handler
    pub player: UncheckedAccount<'info>,
    pub signer: Signer<'info>,
    /// CHECK: Optional Gum session token — owner and fields validated in resolve_player
    pub session_token: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct FlushMatches<'info> {
    #[account(mut)]
    pub queue: Account<'info, Queue>,
    pub tenant: Account<'info, Tenant>,
    pub signer: Signer<'info>,
    // remaining_accounts: opponent ticket PDAs to update
}

#[commit]
#[derive(Accounts)]
pub struct CommitTickets<'info> {
    pub tenant: Account<'info, Tenant>,
    #[account(mut)]
    pub payer: Signer<'info>,
    // remaining_accounts: ticket PDAs to commit
}

// --- Account Types ---

#[account]
pub struct MatchTicket {
    pub player: Pubkey,     // 32
    pub tenant: Pubkey,     // 32
    pub status: TicketStatus, // 1 + 32 + 8 = 41 max
    pub created_at: i64,    // 8
    pub bump: u8,           // 1
}

impl MatchTicket {
    // discriminator(1) + opponent(32) + match_id(8) = 41 for status
    pub const LEN: usize = 32 + 32 + 41 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum TicketStatus {
    Searching,
    Matched { opponent: Pubkey, match_id: u64 },
    Expired,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct MatchEntry {
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub match_id: u64,
    pub timestamp: i64,
}

#[event]
pub struct MatchFound {
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub match_id: u64,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct PendingMatch {
    pub player: Pubkey,   // The opponent whose ticket needs updating
    pub opponent: Pubkey, // Who they matched with
    pub match_id: u64,
}

#[account]
pub struct Queue {
    pub authority: Pubkey,
    pub tenant: Pubkey,
    pub bump: u8,
    pub match_counter: u64,
    pub entries: Vec<QueueEntry>,
    pub matches: Vec<MatchEntry>,
    pub pending_matches: Vec<PendingMatch>,
}

impl Queue {
    // Increased size to hold pending_matches
    // 32 + 32 + 1 + 8 + 4 + (100 * 40) + 4 + (10 * 80) + 4 + (20 * 72)
    pub const LEN: usize = 32 + 32 + 1 + 8 + 4 + (100 * 40) + 4 + (10 * 80) + 4 + (20 * 72);
}

#[account]
pub struct Tenant {
    pub authority: Pubkey,
    pub tenant_program_id: Pubkey,
    pub elo_offset: u32,
    pub elo_size: u8,
    pub elo_window: u64,
    pub callback_program_id: Option<Pubkey>,
    pub callback_discriminator: Option<[u8; 8]>,
    /// Optional session-keys program that may issue session tokens for this Tenant.
    /// If None, session tokens are rejected; direct wallet signing is always accepted.
    pub session_program: Option<Pubkey>,
}

impl Tenant {
    // 32 + 32 + 4 + 1 + 8 + (1+32) + (1+8) + (1+32) = 152
    pub const LEN: usize = 32 + 32 + 4 + 1 + 8 + (1 + 32) + (1 + 8) + (1 + 32);
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct QueueEntry {
    pub player: Pubkey,
    pub elo: u64,
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
    #[msg("Invalid ticket status for this operation")]
    InvalidTicketStatus,
    #[msg("Invalid ticket account")]
    InvalidTicketAccount,
    #[msg("Invalid session token")]
    InvalidSession,
    #[msg("Session token expired")]
    SessionExpired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Queue { authority: Pubkey },
    Ticket { player: Pubkey, tenant: Pubkey },
}

fn derive_seeds_from_account_type(account_type: &AccountType) -> Vec<Vec<u8>> {
    match account_type {
        AccountType::Queue { authority } => {
            vec![b"queue".to_vec(), authority.to_bytes().to_vec()]
        }
        AccountType::Ticket { player, tenant } => {
            vec![
                TICKET_SEED.to_vec(),
                player.to_bytes().to_vec(),
                tenant.to_bytes().to_vec(),
            ]
        }
    }
}

