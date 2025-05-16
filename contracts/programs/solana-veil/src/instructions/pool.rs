use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::*;
use crate::error::*;
use crate::events::*;

/// Accounts for initializing a privacy pool
#[derive(Accounts)]
#[instruction(denomination: u64, tree_height: u8)]
pub struct InitializePool<'info> {
    /// The pool authority (admin)
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// The pool account to be initialized
    #[account(
        init,
        payer = authority,
        space = 8 + PoolState::LEN,
        seeds = [b"pool", denomination.to_le_bytes().as_ref()],
        bump
    )]
    pub pool: Account<'info, PoolState>,
    
    /// Optional SPL token mint account for token pools
    pub mint: Option<Account<'info, Mint>>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
    
    /// Rent sysvar
    pub rent: Sysvar<'info, Rent>,
}

/// Initialize a new privacy pool
pub fn initialize_pool(
    ctx: Context<InitializePool>,
    denomination: u64,
    tree_height: u8,
) -> Result<()> {
    // Validate inputs
    if denomination == 0 {
        return Err(SolanaVeilError::InvalidDenomination.into());
    }
    
    if tree_height < 10 || tree_height > 32 {
        return Err(SolanaVeilError::InvalidTreeHeight.into());
    }
    
    // Initialize pool state
    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.denomination = denomination;
    pool.mint = match ctx.accounts.mint {
        Some(ref mint) => mint.key(),
        None => Pubkey::default(), // Default to SOL (native) pool
    };
    pool.tree_height = tree_height;
    pool.merkle_root = [0; 32]; // Initial empty root
    pool.next_leaf_index = 0;
    pool.is_active = true;
    pool.total_deposits = 0;
    pool.bump = *ctx.bumps.get("pool").unwrap();
    
    // Emit initialization event
    emit!(PoolInitializedEvent {
        pool: pool.key(),
        authority: pool.authority,
        denomination,
        mint: pool.mint,
        tree_height,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}