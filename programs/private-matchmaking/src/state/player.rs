use anchor_lang::prelude::*;

#[account]
pub struct PlayerStatus {
    pub player: Pubkey, // The wallet to refund rent to
    pub queue: Pubkey, // Which queue are they currently in?
    pub in_match: bool, // Are they currently playing?
    pub joined_at: i64,
    pub bump: u8,
}

impl PlayerStatus {
    pub const LEN: usize = 8 + // Disc
        32 + // Player
        32 + // Queue
        1 + // Bool
        8 + // timestamp
        1; // Bump
}
