use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::error::*;

// Deposit funds into a pool
pub fn deposit(
    ctx: Context<Deposit>,
    commitment: [u8; 32],
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let tree = &mut ctx.accounts.tree;
    
    // Check that the pool is active
    if !pool.is_active {
        return Err(SolanaVeilError::PoolInactive.into());
    }
    
    // Get the denomination amount
    let denomination = pool.denomination;
    
    // Handle deposit based on token type
    if pool.is_spl_token {
        // SPL token deposit
        let token_program = ctx.accounts.token_program.as_ref()
            .ok_or(SolanaVeilError::InvalidTokenAccount)?;
        
        let user_token_account = ctx.accounts.user_token_account.as_ref()
            .ok_or(SolanaVeilError::InvalidTokenAccount)?;
        
        let pool_token_account = ctx.accounts.pool_token_account.as_ref()
            .ok_or(SolanaVeilError::InvalidTokenAccount)?;
        
        // Check if the user has enough tokens
        if user_token_account.amount < denomination {
            return Err(SolanaVeilError::InsufficientFunds.into());
        }
        
        // Transfer tokens to the pool
        let transfer_ctx = CpiContext::new(
            token_program.to_account_info(),
            Transfer {
                from: user_token_account.to_account_info(),
                to: pool_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        
        token::transfer(transfer_ctx, denomination)?;
    } else {
        // Native SOL deposit
        // Check if the user is sending enough SOL
        if ctx.accounts.user.lamports() < denomination {
            return Err(SolanaVeilError::InsufficientFunds.into());
        }
        
        // Transfer SOL to the pool account
        invoke(
            &system_instruction::transfer(
                ctx.accounts.user.key,
                ctx.accounts.pool.to_account_info().key,
                denomination,
            ),
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.pool.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
    }
    
    // Update pool statistics
    pool.total_deposited = pool.total_deposited.checked_add(denomination)
        .ok_or(SolanaVeilError::CalculationError)?;
    
    // Insert the commitment into the merkle tree
    let leaf_index = pool.next_index;
    
    // Update pool's next index
    pool.next_index = pool.next_index.checked_add(1)
        .ok_or(SolanaVeilError::CalculationError)?;
    
    // Update tree's leaf count
    tree.num_leaves = tree.num_leaves.checked_add(1)
        .ok_or(SolanaVeilError::CalculationError)?;
    
    // Emit an event for the ZK Compression system to insert the leaf
    // This log will be parsed by the ZK Compression indexer
    msg!("insert_compressed_leaf:{{\"tree_id\":\"{}\",\"leaf_index\":{},\"leaf\":\"{}\"}}",
        tree.key().to_string(),
        leaf_index,
        format!("{:?}", commitment)
    );
    
    // For now, we're not updating the merkle root on-chain since we're using ZK Compression
    // In a real implementation, we would get the updated root from the ZK Compression system
    
    msg!("Deposit successful with commitment: {:?}", commitment);
    msg!("Leaf index: {}", leaf_index);
    
    // Emit a Deposit event
    emit!(DepositEvent {
        pool: pool.key(),
        tree: tree.key(),
        commitment,
        leaf_index,
        amount: denomination,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    
    #[account(
        mut,
        constraint = tree.key() == pool.tree @ SolanaVeilError::InvalidMerkleTree,
        constraint = tree.pool == pool.key() @ SolanaVeilError::InvalidMerkleTree
    )]
    pub tree: Account<'info, MerkleTree>,
    
    /// Only required for SPL token deposits
    #[account(
        mut,
        constraint = pool.is_spl_token || user_token_account.is_none() @ SolanaVeilError::InvalidTokenAccount
    )]
    pub user_token_account: Option<Account<'info, TokenAccount>>,
    
    /// Only required for SPL token deposits
    #[account(
        mut,
        constraint = pool.is_spl_token || pool_token_account.is_none() @ SolanaVeilError::InvalidTokenAccount,
        constraint = !pool.is_spl_token || (
            pool_token_account.is_some() && 
            pool_token_account.as_ref().unwrap().key() == pool.token_vault
        ) @ SolanaVeilError::InvalidTokenAccount
    )]
    pub pool_token_account: Option<Account<'info, TokenAccount>>,
    
    pub system_program: Program<'info, System>,
    
    /// Only required for SPL token deposits
    pub token_program: Option<Program<'info, Token>>,
}

#[event]
pub struct DepositEvent {
    pub pool: Pubkey,
    pub tree: Pubkey,
    pub commitment: [u8; 32],
    pub leaf_index: u64,
    pub amount: u64,
    pub timestamp: i64,
}