use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::*;
use crate::error::*;

// Initialize a new pool with a specific denomination
pub fn initialize_pool(
    ctx: Context<InitializePool>,
    denomination: u64,
    max_depth: u8,
    is_spl_token: bool,
) -> Result<()> {
    // Validate input parameters
    if denomination == 0 {
        return Err(SolanaVeilError::InvalidDenomination.into());
    }
    
    if max_depth < 10 || max_depth > 30 {
        return Err(SolanaVeilError::InvalidTreeDepth.into());
    }
    
    // Initialize pool account
    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.denomination = denomination;
    pool.merkle_root = [0; 32]; // Initial empty merkle root
    pool.next_index = 0;
    pool.max_depth = max_depth;
    pool.tree = ctx.accounts.tree.key();
    pool.is_spl_token = is_spl_token;
    pool.max_fee_basis_points = 200; // Default 2% max fee
    pool.min_withdrawal_amount = denomination / 10; // Default 10% of denomination
    pool.is_active = true;
    pool.total_deposited = 0;
    pool.total_withdrawn = 0;
    pool.bump = *ctx.bumps.get("pool").unwrap();
    
    // Set token-specific fields if using SPL token
    if is_spl_token {
        pool.mint = ctx.accounts.mint.key();
        pool.token_vault = ctx.accounts.token_vault.key();
    } else {
        pool.mint = Pubkey::default();
        pool.token_vault = Pubkey::default();
    }
    
    // Initialize the merkle tree
    let tree = &mut ctx.accounts.tree;
    tree.authority = ctx.accounts.authority.key();
    tree.max_depth = max_depth;
    tree.num_leaves = 0;
    tree.root = [0; 32];
    tree.pool = pool.key();
    tree.bump = *ctx.bumps.get("tree").unwrap();
    
    // Emit an event for the ZK Compression system to initialize the tree
    // The log format is important and will be parsed by the ZK Compression indexer
    msg!("initialize_compressed_merkle_tree:{\"max_depth\":{},\"tree_id\":\"{}\",\"denomination\":{}}",
        max_depth,
        tree.key().to_string(),
        denomination
    );
    
    msg!("Initialized pool for denomination: {}", denomination);
    msg!("Tree ID: {}", tree.key());
    
    Ok(())
}

// Update pool configuration
pub fn update_pool_config(
    ctx: Context<UpdatePoolConfig>,
    max_fee_basis_points: Option<u16>,
    min_withdrawal_amount: Option<u64>,
    is_active: Option<bool>,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    
    // Validate authority
    if pool.authority != ctx.accounts.authority.key() {
        return Err(SolanaVeilError::Unauthorized.into());
    }
    
    // Update max fee if provided
    if let Some(fee_bp) = max_fee_basis_points {
        // Max 5%
        if fee_bp > 500 {
            return Err(SolanaVeilError::FeeTooHigh.into());
        }
        pool.max_fee_basis_points = fee_bp;
    }
    
    // Update min withdrawal amount if provided
    if let Some(min_amount) = min_withdrawal_amount {
        if min_amount > pool.denomination {
            return Err(SolanaVeilError::InvalidDenomination.into());
        }
        pool.min_withdrawal_amount = min_amount;
    }
    
    // Update active status if provided
    if let Some(active) = is_active {
        pool.is_active = active;
    }
    
    msg!("Updated pool configuration for denomination: {}", pool.denomination);
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(
    denomination: u64,
    max_depth: u8,
    is_spl_token: bool
)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + size_of::<Pool>(),
        seeds = [
            b"pool".as_ref(),
            &denomination.to_le_bytes(),
            if is_spl_token { mint.key().as_ref() } else { &[] },
        ],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + size_of::<MerkleTree>(),
        seeds = [
            b"tree".as_ref(),
            &denomination.to_le_bytes(),
            if is_spl_token { mint.key().as_ref() } else { &[] },
        ],
        bump
    )]
    pub tree: Account<'info, MerkleTree>,
    
    /// Only required for SPL token pools
    #[account(
        mut,
        constraint = (is_spl_token && mint.key() != Pubkey::default()) || !is_spl_token @ SolanaVeilError::InvalidTokenAccount
    )]
    pub mint: Option<Account<'info, Mint>>,
    
    /// Only required for SPL token pools
    #[account(
        init_if_needed,
        payer = authority,
        token::mint = mint,
        token::authority = pool,
        constraint = (is_spl_token && token_vault.key() != Pubkey::default()) || !is_spl_token @ SolanaVeilError::InvalidTokenAccount
    )]
    pub token_vault: Option<Account<'info, TokenAccount>>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Option<Program<'info, Token>>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdatePoolConfig<'info> {
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    
    pub system_program: Program<'info, System>,
}