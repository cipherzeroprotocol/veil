use anchor_lang::prelude::*;

// === Pool Events ===

#[event]
pub struct PoolInitializedEvent {
    pub authority: Pubkey,
    pub denomination: u64,
    pub timestamp: i64,
}

#[event]
pub struct PoolUpdatedEvent {
    pub authority: Pubkey,
    pub denomination: u64,
    pub timestamp: i64,
}

// === Deposit Events ===

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

// === Withdraw Events ===

#[event]
pub struct WithdrawEvent {
    pub recipient: Pubkey,
    pub nullifier_hash: [u8; 32],
    pub fee: u64,
    pub timestamp: i64,
}

// === Tree Events ===

#[event]
pub struct MerkleTreeInitializedEvent {
    pub authority: Pubkey,
    pub height: u32,
    pub timestamp: i64,
}

#[event]
pub struct MerkleTreeUpdatedEvent {
    pub leaf: [u8; 32],
    pub root: [u8; 32],
    pub timestamp: i64,
}

// === Relayer Events ===

#[event]
pub struct RelayerRegisteredEvent {
    pub relayer: Pubkey,
    pub stake_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct RelayerUpdatedEvent {
    pub relayer: Pubkey,
    pub fee: u64,
    pub timestamp: i64,
}

// === Bridge Events ===

#[event]
pub struct BridgeInitializedEvent {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_basis_points: u16,
    pub timestamp: i64,
}

#[event]
pub struct ChainAddedEvent {
    pub chain_id: u16,
    pub timestamp: i64,
}

#[event]
pub struct TokenAddedEvent {
    pub chain_id: u16,
    pub mint: Pubkey,
    pub dest_token_id: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct BridgeTransferEvent {
    pub user: Pubkey,
    pub dest_chain_id: u16,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub dest_token_id: u64,
    pub nullifier: [u8; 32],
    pub dest_address: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct IncomingTransferEvent {
    pub source_chain_id: u16,
    pub nullifier: [u8; 32],
    pub amount: u64,
    pub recipient: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BridgePausedEvent {
    pub paused: bool,
    pub timestamp: i64,
}

#[event]
pub struct NullifierAccountInitializedEvent {
    pub authority: Pubkey,
    pub compressed_set: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RelayerConfigInitializedEvent {
    pub authority: Pubkey,
    pub required_stake: u64,
    pub timestamp: i64,
}