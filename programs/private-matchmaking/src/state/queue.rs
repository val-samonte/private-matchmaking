use anchor_lang::prelude::*;

#[account]
pub struct QueueHead {
    pub authority: Pubkey,
    pub tenant_program_id: Pubkey, // The game program allowed to add players
    pub config: QueueConfig,
    pub capacity: u16,    // Max pages in ring
    pub page_size: u8,    // Max players per page
    pub write_page_index: u64, // Incrementing index for writes
    pub read_page_index: u64,  // Incrementing index for cleaning/processing
    pub bump: u8,
}

impl QueueHead {
    pub const LEN: usize = 8 + // Disc
        32 + // Authority
        32 + // Tenant Program
        QueueConfig::LEN + // Config
        2 + // Capacity
        1 + // Page Size
        8 + // Write Index
        8 + // Read Index
        1; // Bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct QueueConfig {
    pub elo_offset: u32, // Where to find ELO in the player account
    pub elo_type: u8,    // 0: u32, 1: u64, 2: i32
    pub match_threshold: u32, // +/- ELO difference allowed
    pub search_window: u32,   // in seconds
    pub reserved: [u8; 64],
}

impl QueueConfig {
    pub const LEN: usize = 4 + 1 + 4 + 4 + 64;
}

#[account]
pub struct QueuePage {
    pub players: Vec<PlayerEntry>,
    // Optional: pub metadata: PageMetadata 
}

impl QueuePage {
    pub fn size(page_size: u8) -> usize {
        8 + // Disc
        4 + // Vec Prefix
        (PlayerEntry::LEN * page_size as usize)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct PlayerEntry {
    pub authority: Pubkey, // The player's wallet
    pub account: Pubkey,   // The game data account (ELO source)
    pub elo: u64,          // Snapshot of ELO at join time
    pub joined_at: i64,
}

impl PlayerEntry {
    pub const LEN: usize = 32 + 32 + 8 + 8;
}
