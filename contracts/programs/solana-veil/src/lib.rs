use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod verifier;

use instructions::*;

declare_id!("SoLVeiLzW99jkVhgcJCKpCoECGzUWMKDJvpoNk5AJ4b");

#[program]
pub mod solana_veil {
    use super::*;

    // === Pool Management Instructions ===
    pub fn initialize_pool(ctx: Context<InitializePool>, params: PoolParams) -> Result<()> {
        instructions::initialize_pool(ctx, params)
    }
    pub fn update_pool(ctx: Context<UpdatePool>, params: PoolParams) -> Result<()> {
        instructions::update_pool(ctx, params)
    }

    // === Deposit Instructions ===
    pub fn deposit(ctx: Context<Deposit>, amount: u64, commitment: [u8; 32]) -> Result<()> {
        instructions::deposit(ctx, amount, commitment)
    }

    // === Withdraw Instructions ===
    pub fn withdraw(
        ctx: Context<Withdraw>,
        proof_data: Vec<u8>,
        root: [u8; 32],
        nullifier_hash: [u8; 32],
        recipient: Pubkey,
        relayer: Pubkey,
        fee: u64,
        refund: u64,
    ) -> Result<()> {
        instructions::withdraw(
            ctx,
            proof_data,
            root,
            nullifier_hash,
            recipient,
            relayer,
            fee,
            refund,
        )
    }

    // === Tree Management Instructions ===
    pub fn initialize_merkle_tree(ctx: Context<InitializeMerkleTree>, height: u32) -> Result<()> {
        instructions::initialize_merkle_tree(ctx, height)
    }
    pub fn update_merkle_tree(ctx: Context<UpdateMerkleTree>, leaf: [u8; 32]) -> Result<()> {
        instructions::update_merkle_tree(ctx, leaf)
    }

    // === Relayer Management Instructions ===
    pub fn register_relayer(ctx: Context<RegisterRelayer>, fee: u64) -> Result<()> {
        instructions::register_relayer(ctx, fee)
    }
    pub fn update_relayer(ctx: Context<UpdateRelayer>, fee: u64) -> Result<()> {
        instructions::update_relayer(ctx, fee)
    }

    // === Bridge Instructions ===
    pub fn initialize_bridge(
        ctx: Context<InitializeBridge>,
        fee_basis_points: u16,
        bump: u8,
    ) -> Result<()> {
        instructions::initialize_bridge(ctx, fee_basis_points, bump)
    }
    pub fn add_destination_chain(
        ctx: Context<UpdateBridge>,
        chain_id: u16,
    ) -> Result<()> {
        instructions::add_destination_chain(ctx, chain_id)
    }
    pub fn add_supported_token(
        ctx: Context<UpdateBridge>,
        chain_id: u16,
        mint: Pubkey,
        dest_token_id: u64,
        min_amount: u64,
        max_amount: u64,
    ) -> Result<()> {
        instructions::add_supported_token(
            ctx,
            chain_id,
            mint,
            dest_token_id,
            min_amount,
            max_amount,
        )
    }
    pub fn lock_tokens_for_bridge(
        ctx: Context<LockTokensForBridge>,
        amount: u64,
        destination_chain_id: u16,
        destination_address: [u8; 32],
        nullifier: [u8; 32],
        bump: u8,
    ) -> Result<()> {
        instructions::lock_tokens_for_bridge(
            ctx,
            amount,
            destination_chain_id,
            destination_address,
            nullifier,
            bump,
        )
    }
    pub fn process_incoming_transfer(
        ctx: Context<ProcessIncomingTransfer>,
        proof_data: Vec<u8>,
        source_chain_id: u16,
        source_nullifier: [u8; 32],
        amount: u64,
        recipient: Pubkey,
    ) -> Result<()> {
        instructions::process_incoming_transfer(
            ctx,
            proof_data,
            source_chain_id,
            source_nullifier,
            amount,
            recipient,
        )
    }
    pub fn set_bridge_paused(
        ctx: Context<UpdateBridge>,
        paused: bool,
    ) -> Result<()> {
        instructions::set_bridge_paused(ctx, paused)
    }
    pub fn initialize_nullifier_account(
        ctx: Context<InitializeNullifier>,
        bump: u8,
    ) -> Result<()> {
        instructions::initialize_nullifier_account(ctx, bump)
    }
    // Additional bridge instructions
    pub fn initialize_relayer_config(
        ctx: Context<InitializeRelayer>,
        required_stake: u64,
        bump: u8,
    ) -> Result<()> {
        instructions::initialize_relayer_config(ctx, required_stake, bump)
    }
}