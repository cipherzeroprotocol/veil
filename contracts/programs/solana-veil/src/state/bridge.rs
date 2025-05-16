use anchor_lang::prelude::*;
use std::collections::BTreeMap; // For registered emitters map

pub const MAX_SUPPORTED_CHAINS: usize = 10;
pub const MAX_SUPPORTED_TOKENS: usize = 20;
pub const MAX_RELAYERS: usize = 50; // Example limit

#[account]
#[derive(Default)]
pub struct BridgeConfig {
    /// Authority who can manage the bridge settings.
    pub authority: Pubkey,
    /// Account that collects bridging fees.
    pub treasury: Pubkey,
    /// Wormhole Core Bridge program ID.
    pub wormhole_program_id: Pubkey,
    /// Wormhole Token Bridge program ID.
    pub wormhole_token_bridge_program_id: Pubkey,
    /// Basis points fee for bridging operations (e.g., 10 = 0.1%).
    pub fee_basis_points: u16,
    /// Bump seed for the BridgeConfig PDA.
    pub bump: u8,
    /// Flag to pause bridge operations.
    pub paused: bool,
    /// Number of currently supported chains.
    pub chain_count: u8,
    /// Configuration for each supported destination chain.
    pub supported_chains: [ChainConfig; MAX_SUPPORTED_CHAINS],
    /// PDA bump for the Wormhole emitter sequence.
    pub wormhole_sequence_bump: u8,
    /// Wormhole finality level required.
    pub wormhole_finality: u8, // 0 = Confirmed, 1 = Finalized
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Copy)]
pub struct ChainConfig {
    /// Wormhole Chain ID of the destination chain.
    pub chain_id: u16,
    /// Number of supported tokens for this chain.
    pub token_count: u8,
    /// Configuration for each supported token on this chain.
    pub tokens: [TokenConfig; MAX_SUPPORTED_TOKENS],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Copy)]
pub struct TokenConfig {
    /// Mint address of the token on Solana.
    pub mint: Pubkey,
    /// Corresponding token identifier on the destination chain (e.g., address or ID).
    pub dest_token_id: u64, // Using u64 as a generic identifier; adjust if needed
    /// Minimum bridge amount for this token.
    pub min_amount: u64,
    /// Maximum bridge amount for this token.
    pub max_amount: u64,
    /// Whether bridging is enabled for this token.
    pub enabled: bool,
}

#[account]
pub struct BridgeTransfer {
    /// Destination chain ID (Wormhole format).
    pub dest_chain_id: u16,
    /// Net amount transferred (after fees).
    pub amount: u64,
    /// Mint address of the token transferred.
    pub token_mint: Pubkey,
    /// Corresponding token identifier on the destination chain.
    pub dest_token_id: u64,
    /// Privacy commitment hash.
    pub commitment: [u8; 32],
    /// Destination address on the target chain (Wormhole format).
    pub dest_address: [u8; 32],
    /// Wormhole message sequence number for this transfer.
    pub wormhole_sequence: u64,
    /// Timestamp when the transfer was initiated.
    pub timestamp: i64,
    /// Current status of the transfer.
    pub status: TransferStatus,
    /// Bump seed for the BridgeTransfer PDA.
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Copy)]
pub enum TransferStatus {
    Pending,   // Message published to Wormhole, awaiting confirmation/processing on destination
    Completed, // Transfer successfully processed on destination chain (commitment added)
    Failed,    // Transfer failed (e.g., VAA verification failed, relayer issue)
}

impl Default for TransferStatus {
    fn default() -> Self {
        TransferStatus::Pending
    }
}


#[account]
pub struct ExternalBridgeEmitter {
    /// Chain ID of the external blockchain (Wormhole format).
    pub chain_id: u16,
    /// Emitter address of the bridge contract on the external chain (Wormhole format).
    pub emitter_address: [u8; 32],
    /// Whether this emitter is currently active and trusted.
    pub is_active: bool,
    /// Timestamp of the last update.
    pub last_updated_timestamp: i64,
    /// Bump seed for the PDA.
    pub bump: u8,
}

/// Supported chain IDs
pub mod chains {
    pub const ETHEREUM: u16 = 1;
    pub const OPTIMISM: u16 = 10;
    pub const ARBITRUM: u16 = 42161;
    pub const BASE: u16 = 8453;
}

