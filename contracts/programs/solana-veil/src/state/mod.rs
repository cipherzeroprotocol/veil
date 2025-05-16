use anchor_lang::prelude::*;

pub mod bridge;

/// Pool account to store the state of each denomination pool
/// This holds configuration and current state for a specific mixer pool
#[account]
pub struct Pool {
    /// The authority that can update pool settings
    pub authority: Pubkey,
    
    /// Denomination amount in lamports (or token smallest units)
    pub denomination: u64,
    
    /// Current merkle root (32 bytes for Poseidon hash)
    pub merkle_root: [u8; 32],
    
    /// Next index for merkle tree insertion
    pub next_index: u64,
    
    /// Maximum depth of the merkle tree
    pub max_depth: u8,
    
    /// The compressed merkle tree account
    pub tree: Pubkey,
    
    /// The SPL token mint (if applicable, otherwise zeros)
    pub mint: Pubkey,
    
    /// Token account holding deposits (if SPL token)
    pub token_vault: Pubkey,
    
    /// Whether this pool uses SPL tokens or native SOL
    pub is_spl_token: bool,
    
    /// Maximum fee in basis points (e.g. 100 = 1%)
    pub max_fee_basis_points: u16,
    
    /// Minimum withdrawal amount (prevents dust attacks)
    pub min_withdrawal_amount: u64,
    
    /// Whether the pool is currently active
    pub is_active: bool,
    
    /// Total deposited amount
    pub total_deposited: u64,
    
    /// Total withdrawn amount
    pub total_withdrawn: u64,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
}

/// Nullifier account to prevent double spending
/// This is a compressed account that tracks used nullifiers
#[account]
pub struct Nullifier {
    /// Whether this nullifier has been spent
    pub is_spent: bool,
    
    /// The nullifier hash
    pub nullifier_hash: [u8; 32],
    
    /// The pool this nullifier is associated with
    pub pool: Pubkey,
    
    /// When the nullifier was spent
    pub spent_at: i64,
    
    /// Recipient of the withdrawal
    pub recipient: Pubkey,
}

/// Relayer account for facilitating private withdrawals
#[account]
pub struct Relayer {
    /// The relayer's public key
    pub authority: Pubkey,
    
    /// Whether this relayer is active
    pub is_active: bool,
    
    /// Fee charged by relayer in basis points (e.g. 100 = 1%)
    pub fee_basis_points: u16,
    
    /// Total relayed amount
    pub total_relayed: u64,
    
    /// Total fees earned
    pub total_fees: u64,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
}

/// Merkle tree account for ZK Compression
#[account]
pub struct MerkleTree {
    /// The authority that can update the tree
    pub authority: Pubkey,
    
    /// Maximum depth of the tree
    pub max_depth: u8,
    
    /// Current number of leaves in the tree
    pub num_leaves: u64,
    
    /// Current root of the tree
    pub root: [u8; 32],
    
    /// The pool associated with this tree
    pub pool: Pubkey,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
}

/// Configuration account for the protocol
#[account]
pub struct Config {
    /// Authority that can update protocol settings
    pub authority: Pubkey,
    
    /// Protocol fee in basis points
    pub protocol_fee_basis_points: u16,
    
    /// Treasury account that receives protocol fees
    pub treasury: Pubkey,
    
    /// Whether new pools can be created
    pub pools_enabled: bool,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
}pub mod pool;
pub mod nullifier;
pub mod tree;
pub mod relayer;
pub mod bridge; // Add the new bridge module

pub use pool::*;
pub use nullifier::*;
pub use tree::*;
pub use relayer::*;
pub use bridge::*; // Export bridge types