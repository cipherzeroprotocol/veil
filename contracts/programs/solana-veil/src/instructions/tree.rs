use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;
use crate::events::*;
use solana_program::program::invoke;
use solana_program::program_log;

// Compressed tree program ID (Light Protocol or Helius)
const COMPRESSED_TREE_PROGRAM_ID: &str = "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK";

/// Accounts for initializing a compressed merkle tree
#[derive(Accounts)]
#[instruction(max_depth: u8, max_buffer_size: u32)]
pub struct InitializeTree<'info> {
    /// The pool authority (admin)
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// The associated privacy pool
    #[account(
        mut,
        seeds = [b"pool", pool.denomination.to_le_bytes().as_ref()],
        bump = pool.bump,
        has_one = authority @ SolanaVeilError::Unauthorized,
    )]
    pub pool: Account<'info, PoolState>,
    
    /// The compressed tree program
    /// CHECK: External program
    #[account(
        constraint = compressed_tree_program.key() == COMPRESSED_TREE_PROGRAM_ID.parse::<Pubkey>().unwrap() 
            @ SolanaVeilError::InvalidCompressedTreeProgram
    )]
    pub compressed_tree_program: AccountInfo<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Initialize a compressed merkle tree for the pool
pub fn initialize_tree(
    ctx: Context<InitializeTree>,
    max_depth: u8,
    max_buffer_size: u32,
) -> Result<()> {
    // Validate inputs
    if max_depth < 10 || max_depth > 32 {
        return Err(SolanaVeilError::InvalidTreeHeight.into());
    }
    
    if max_buffer_size < 2 || max_buffer_size > 256 {
        return Err(SolanaVeilError::InvalidBufferSize.into());
    }
    
    // Emit tree initialization log for ZK Compression to pick up
    let log_message = format!(
        "initialize_compressed_tree:{},{},{}",
        ctx.accounts.pool.key(),
        max_depth,
        max_buffer_size
    );
    program_log::sol_log(&log_message);
    
    // Update pool with tree information
    let pool = &mut ctx.accounts.pool;
    pool.tree_height = max_depth;
    
    // Emit tree initialization event
    emit!(TreeInitializedEvent {
        pool: pool.key(),
        max_depth,
        max_buffer_size,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

/// Accounts for updating the merkle tree root
#[derive(Accounts)]
pub struct UpdateTreeRoot<'info> {
    /// The pool authority (admin)
    pub authority: Signer<'info>,
    
    /// The privacy pool to update
    #[account(
        mut,
        seeds = [b"pool", pool.denomination.to_le_bytes().as_ref()],
        bump = pool.bump,
        has_one = authority @ SolanaVeilError::Unauthorized,
    )]
    pub pool: Account<'info, PoolState>,
}

/// Update the merkle tree root (admin only)
pub fn update_tree_root(
    ctx: Context<UpdateTreeRoot>,
    new_root: [u8; 32],
) -> Result<()> {
    // Update the root
    let pool = &mut ctx.accounts.pool;
    pool.merkle_root = new_root;
    
    // Emit root update event
    emit!(TreeRootUpdatedEvent {
        pool: pool.key(),
        old_root: pool.merkle_root,
        new_root,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}