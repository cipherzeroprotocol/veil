use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::error::*;

// Withdraw funds from a pool
pub fn withdraw(
    ctx: Context<Withdraw>,
    proof_data: Vec<u8>,
    root: [u8; 32],
    nullifier_hash: [u8; 32],
    recipient: Pubkey,
    fee: u64,
) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let nullifier = &mut ctx.accounts.nullifier;
    let tree = &ctx.accounts.tree;
    
    // Check that the pool is active
    if !pool.is_active {
        return Err(SolanaVeilError::PoolInactive.into());
    }
    
    // Verify that the provided root exists in the tree
    // In a production implementation, we would verify this against recent valid roots
    if root != tree.root {
        return Err(SolanaVeilError::InvalidMerkleRoot.into());
    }
    
    // Check that the nullifier hasn't been used before
    if nullifier.is_spent {
        return Err(SolanaVeilError::NullifierAlreadySpent.into());
    }
    
    // Validate fee
    let denomination = pool.denomination;
    if fee > denomination {
        return Err(SolanaVeilError::InvalidFeeAmount.into());
    }
    
    // Calculate the max allowed fee
    let max_fee = (denomination as u128)
        .checked_mul(pool.max_fee_basis_points as u128)
        .ok_or(SolanaVeilError::CalculationError)?
        .checked_div(10000)
        .ok_or(SolanaVeilError::CalculationError)? as u64;
    
    if fee > max_fee {
        return Err(SolanaVeilError::FeeTooHigh.into());
    }
    
    // Calculate withdrawal amount
    let withdraw_amount = denomination.checked_sub(fee)
        .ok_or(SolanaVeilError::CalculationError)?;
    
    // Ensure withdrawal amount is above minimum
    if withdraw_amount < pool.min_withdrawal_amount {
        return Err(SolanaVeilError::WithdrawalAmountTooLow.into());
    }
    
    // Verify ZK proof by calling the verifier contract
    // In this example, we'll just log the proof verification
    // In a real implementation, we would call a separate verifier contract
    msg!("verify_zk_proof:{{\"tree_id\":\"{}\",\"root\":\"{:?}\",\"nullifier_hash\":\"{:?}\"}}",
        tree.key().to_string(),
        root,
        nullifier_hash
    );
    
    // Mark nullifier as spent
    nullifier.is_spent = true;
    nullifier.nullifier_hash = nullifier_hash;
    nullifier.pool = pool.key();
    nullifier.spent_at = Clock::get()?.unix_timestamp;
    nullifier.recipient = recipient;
    
    // Transfer funds based on token type
    if pool.is_spl_token {
        // Handle SPL token withdrawal
        let token_program = ctx.accounts.token_program.as_ref()
            .ok_or(SolanaVeilError::InvalidTokenAccount)?;
            
        let pool_token_account = ctx.accounts.pool_token_account.as_ref()
            .ok_or(SolanaVeilError::InvalidTokenAccount)?;
            
        let recipient_token_account = ctx.accounts.recipient_token_account.as_ref()
            .ok_or(SolanaVeilError::InvalidTokenAccount)?;
        
        // Transfer tokens to recipient
        let pool_seeds = &[
            b"pool".as_ref(),
            &pool.denomination.to_le_bytes(),
            &pool.mint.to_bytes(),
            &[pool.bump],
        ];
        
        let pool_signer = &[&pool_seeds[..]];
        
        let transfer_ctx = CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: pool_token_account.to_account_info(),
                to: recipient_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            pool_signer,
        );
        
        token::transfer(transfer_ctx, withdraw_amount)?;
        
        // If there's a fee, transfer to relayer
        if fee > 0 && ctx.accounts.relayer.is_some() {
            let relayer_token_account = ctx.accounts.relayer_token_account.as_ref()
                .ok_or(SolanaVeilError::InvalidTokenAccount)?;
            
            let fee_transfer_ctx = CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: pool_token_account.to_account_info(),
                    to: relayer_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                pool_signer,
            );
            
            token::transfer(fee_transfer_ctx, fee)?;
        }
    } else {
        // Handle native SOL withdrawal
        let pool_seeds = &[
            b"pool".as_ref(),
            &pool.denomination.to_le_bytes(),
            &[pool.bump],
        ];
        
        let pool_signer = &[&pool_seeds[..]];
        
        // Transfer SOL to recipient
        invoke_signed(
            &system_instruction::transfer(
                &pool.key(),
                &recipient,
                withdraw_amount,
            ),
            &[
                ctx.accounts.pool.to_account_info(),
                ctx.accounts.recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            pool_signer,
        )?;
        
        // If there's a fee, transfer to relayer
        if fee > 0 && ctx.accounts.relayer.is_some() {
            let relayer = ctx.accounts.relayer.as_ref().unwrap();
            
            invoke_signed(
                &system_instruction::transfer(
                    &pool.key(),
                    &relayer.key(),
                    fee,
                ),
                &[
                    ctx.accounts.pool.to_account_info(),
                    relayer.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                pool_signer,
            )?;
        }
    }
    
    // Update relayer stats if applicable
    if fee > 0 && ctx.accounts.relayer.is_some() && ctx.accounts.relayer_stats.is_some() {
        let relayer_stats = &mut ctx.accounts.relayer_stats.as_ref().unwrap();
        relayer_stats.total_relayed = relayer_stats.total_relayed.checked_add(withdraw_amount)
            .ok_or(SolanaVeilError::CalculationError)?;
        relayer_stats.total_fees = relayer_stats.total_fees.checked_add(fee)
            .ok_or(SolanaVeilError::CalculationError)?;
    }
    
    // Emit a Withdraw event
    emit!(WithdrawEvent {
        pool: pool.key(),
        nullifier_hash,
        recipient,
        fee,
        amount: withdraw_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Withdrawal successful for amount: {}", withdraw_amount);
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(
    proof_data: Vec<u8>,
    root: [u8; 32],
    nullifier_hash: [u8; 32],
    recipient: Pubkey,
    fee: u64
)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = pool.is_active @ SolanaVeilError::PoolInactive
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        constraint = tree.key() == pool.tree @ SolanaVeilError::InvalidMerkleTree,
        constraint = tree.pool == pool.key() @ SolanaVeilError::InvalidMerkleTree
    )]
    pub tree: Account<'info, MerkleTree>,
    
    #[account(
        init,
        payer = user,
        space = 8 + size_of::<Nullifier>(),
        seeds = [
            b"nullifier".as_ref(),
            &nullifier_hash,
            pool.key().as_ref()
        ],
        bump
    )]
    pub nullifier: Account<'info, Nullifier>,
    
    #[account(
        mut,
        constraint = !pool.is_spl_token || (
            pool_token_account.is_some() && 
            pool_token_account.as_ref().unwrap().key() == pool.token_vault
        ) @ SolanaVeilError::InvalidTokenAccount
    )]
    pub pool_token_account: Option<Account<'info, TokenAccount>>,
    
    /// Must be a valid account for the recipient
    #[account(mut)]
    pub recipient: SystemAccount<'info>,
    
    /// Must be a valid token account for the recipient if using SPL tokens
    #[account(
        mut,
        constraint = !pool.is_spl_token || recipient_token_account.is_some() @ SolanaVeilError::InvalidTokenAccount,
        constraint = !pool.is_spl_token || (
            recipient_token_account.is_some() &&
            recipient_token_account.as_ref().unwrap().owner == recipient.key()
        ) @ SolanaVeilError::InvalidRecipient
    )]
    pub recipient_token_account: Option<Account<'info, TokenAccount>>,
    
    /// Optional relayer account
    #[account(
        mut,
        constraint = fee == 0 || relayer.is_some() @ SolanaVeilError::InvalidFeeAmount
    )]
    pub relayer: Option<SystemAccount<'info>>,
    
    /// Optional relayer statistics account
    #[account(
        mut,
        constraint = (relayer.is_some() && relayer_stats.is_some()) || relayer.is_none() @ SolanaVeilError::InvalidRelayer
    )]
    pub relayer_stats: Option<Account<'info, Relayer>>,
    
    /// Optional relayer token account for receiving fees
    #[account(
        mut,
        constraint = !pool.is_spl_token || relayer_token_account.is_none() || (
            fee > 0 && 
            relayer.is_some() && 
            relayer_token_account.is_some() &&
            relayer_token_account.as_ref().unwrap().owner == relayer.as_ref().unwrap().key()
        ) @ SolanaVeilError::InvalidRelayer
    )]
    pub relayer_token_account: Option<Account<'info, TokenAccount>>,
    
    pub system_program: Program<'info, System>,
    
    /// Only required for SPL token withdrawals
    pub token_program: Option<Program<'info, Token>>,
}

#[event]
pub struct WithdrawEvent {
    pub pool: Pubkey,
    pub nullifier_hash: [u8; 32],
    pub recipient: Pubkey,
    pub fee: u64,
    pub amount: u64,
    pub timestamp: i64,
}