use anchor_lang::prelude::*;

/// State for a nullifier to prevent double-spend
#[account]
pub struct NullifierState {
    /// Pool this nullifier belongs to
    pub pool: Pubkey,
    
    /// The nullifier hash value
    pub nullifier_hash: [u8; 32],
    
    /// Whether this nullifier has been spent
    pub is_spent: bool,
    
    /// Timestamp when this nullifier was spent
    pub timestamp: i64,
}

impl NullifierState {
    /// Size of the NullifierState struct for space allocation
    pub const LEN: usize = 
        32 +    // pool: Pubkey
        32 +    // nullifier_hash: [u8; 32]
        1 +     // is_spent: bool
        8;      // timestamp: i64
}