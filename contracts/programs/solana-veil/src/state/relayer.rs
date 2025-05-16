use anchor_lang::prelude::*;

/// State for a relayer that pays gas fees
#[account]
pub struct RelayerState {
    /// Relayer authority (owner)
    pub authority: Pubkey,
    
    /// Fee in basis points (e.g., 100 = 1%)
    pub fee_basis_points: u16,
    
    /// Minimum withdrawal amount that relayer will process
    pub min_withdrawal: u64,
    
    /// Whether this relayer is active
    pub is_active: bool,
    
    /// Total number of withdrawals processed
    pub total_processed: u64,
    
    /// Total fees earned
    pub total_fees_earned: u64,
    
    /// PDA bump seed
    pub bump: u8,
}

impl RelayerState {
    /// Size of the RelayerState struct for space allocation
    pub const LEN: usize = 
        32 +    // authority: Pubkey
        2 +     // fee_basis_points: u16
        8 +     // min_withdrawal: u64
        1 +     // is_active: bool
        8 +     // total_processed: u64
        8 +     // total_fees_earned: u64
        1;      // bump: u8
}