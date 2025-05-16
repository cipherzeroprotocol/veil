use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

// Register or update a relayer
pub fn set_relayer(
    ctx: Context<SetRelayer>,
    is_active: bool,
    fee_basis_points: u16,
) -> Result<()> {
    // Max fee is 5%
    if fee_basis_points > 500 {
        return Err(SolanaVeilError::FeeTooHigh.into());
    }
    
    // Update relayer account
    let relayer = &mut ctx.accounts.relayer;
    relayer.authority = ctx.accounts.authority.key();
    relayer.is_active = is_active;
    relayer.fee_basis_points = fee_basis_points;
    
    // Initialize the statistics if this is a new relayer
    if relayer.total_relayed == 0 && relayer.total_fees == 0 {
        relayer.total_relayed = 0;
        relayer.total_fees = 0;
    }
    
    relayer.bump = *ctx.bumps.get("relayer").unwrap();
    
    msg!("Relayer {} set to {} with fee basis points: {}",
        relayer.key(),
        if is_active { "active" } else { "inactive" },
        fee_basis_points
    );
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(is_active: bool, fee_basis_points: u16)]
pub struct SetRelayer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + size_of::<Relayer>(),
        seeds = [
            b"relayer".as_ref(),
            authority.key().as_ref()
        ],
        bump
    )]
    pub relayer: Account<'info, Relayer>,
    
    pub system_program: Program<'info, System>,
}