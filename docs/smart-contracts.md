# SolanaVeil Smart Contracts

<div align="center">
<img src="images/smart-contracts-header.png" alt="Smart Contracts Header" width="800">
</div>

## Overview

SolanaVeil's smart contracts are built using Rust and the Anchor framework on Solana. These contracts manage privacy pools, handle deposits and withdrawals, verify zero-knowledge proofs, and integrate with ZK Compression for efficient storage.

## Contract Architecture

<div align="center">
<img src="images/contract-architecture.png" alt="Contract Architecture" width="700">
</div>

The SolanaVeil program is organized into several modules:

```
solana-veil/
└── programs/
    └── solana-veil/
        └── src/
            ├── instructions/      # Instruction handlers
            │   ├── deposit.rs     # Deposit logic
            │   ├── withdraw.rs    # Withdrawal logic
            │   ├── pool.rs        # Pool management
            │   ├── tree.rs        # Merkle tree operations
            │   ├── relayer.rs     # Relayer operations
            │   └── mod.rs         # Module exports
            ├── state/             # Program state
            │   ├── pool.rs        # Pool configuration
            │   ├── nullifier.rs   # Nullifier tracking
            │   ├── tree.rs        # Merkle tree state
            │   ├── relayer.rs     # Relayer registry
            │   └── mod.rs         # Module exports
            ├── errors.rs          # Error definitions
            ├── events.rs          # Event definitions
            ├── verifier.rs        # ZK proof verification
            └── lib.rs             # Program entry points
```

## Program Entry Points

The main program entry points are defined in `lib.rs`:

```rust
#[program]
pub mod solana_veil {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>, params: PoolParams) -> Result<()> {
        instructions::pool::initialize_pool(ctx, params)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, proof_data: WithdrawProofData) -> Result<()> {
        instructions::withdraw::withdraw(ctx, proof_data)
    }

    pub fn register_relayer(ctx: Context<RegisterRelayer>, params: RelayerParams) -> Result<()> {
        instructions::relayer::register_relayer(ctx, params)
    }

    pub fn update_tree(ctx: Context<UpdateTree>, leaf: [u8; 32]) -> Result<()> {
        instructions::tree::update_tree(ctx, leaf)
    }
}
```

## State Structures

### Pool Configuration

The `Pool` structure stores information about each denomination pool:

```rust
#[account]
pub struct Pool {
    pub authority: Pubkey,           // Pool authority
    pub token_mint: Pubkey,          // Token mint (null for SOL)
    pub vault: Pubkey,               // Token vault account
    pub denomination: u64,           // Fixed denomination amount
    pub tree_root: [u8; 32],         // Current Merkle root
    pub merkle_authority: Pubkey,    // Authority for tree updates
    pub fee_basis_points: u16,       // Fee in basis points
    pub fee_recipient: Pubkey,       // Fee recipient
    pub is_initialized: bool,        // Initialization flag
    pub total_deposits: u64,         // Deposit counter
    pub total_withdrawals: u64,      // Withdrawal counter
    pub bump: u8,                    // PDA bump
}
```

### Nullifier Tracking

The `NullifierSet` tracks spent nullifiers to prevent double-spending:

```rust
#[account]
pub struct NullifierSet {
    pub pool: Pubkey,               // Associated pool
    pub nullifiers: Vec<[u8; 32]>,  // List of spent nullifiers
    pub is_compressed: bool,        // Compression flag
    pub compression_authority: Pubkey, // Authority for compression
    pub bump: u8,                   // PDA bump
}
```

### Merkle Tree State

The `MerkleTree` structure manages the deposit commitment tree:

```rust
#[account]
pub struct MerkleTree {
    pub pool: Pubkey,               // Associated pool
    pub current_root: [u8; 32],     // Current root
    pub next_index: u32,            // Next leaf index
    pub max_depth: u8,              // Tree depth
    pub is_compressed: bool,        // Compression flag
    pub authority: Pubkey,          // Tree authority
    pub bump: u8,                   // PDA bump
}
```

## Instruction Handlers

### Pool Management

The pool module handles the creation and management of privacy pools:

```rust
pub fn initialize_pool(ctx: Context<InitializePool>, params: PoolParams) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    
    // Initialize pool state
    pool.authority = ctx.accounts.authority.key();
    pool.token_mint = params.token_mint;
    pool.vault = ctx.accounts.vault.key();
    pool.denomination = params.denomination;
    pool.tree_root = [0; 32];  // Empty root
    pool.merkle_authority = ctx.accounts.merkle_authority.key();
    pool.fee_basis_points = params.fee_basis_points;
    pool.fee_recipient = params.fee_recipient;
    pool.is_initialized = true;
    pool.total_deposits = 0;
    pool.total_withdrawals = 0;
    pool.bump = *ctx.bumps.get("pool").unwrap();
    
    // Initialize the merkle tree
    let tree = &mut ctx.accounts.merkle_tree;
    tree.pool = pool.key();
    tree.current_root = [0; 32];
    tree.next_index = 0;
    tree.max_depth = params.tree_depth;
    tree.is_compressed = params.enable_compression;
    tree.authority = ctx.accounts.merkle_authority.key();
    tree.bump = *ctx.bumps.get("merkle_tree").unwrap();
    
    // Initialize the nullifier set
    let nullifier_set = &mut ctx.accounts.nullifier_set;
    nullifier_set.pool = pool.key();
    nullifier_set.is_compressed = params.enable_compression;
    nullifier_set.compression_authority = ctx.accounts.compression_authority.key();
    nullifier_set.bump = *ctx.bumps.get("nullifier_set").unwrap();
    
    // If compression is enabled, emit initialization event
    if params.enable_compression {
        emit!(TreeCompressionInitialized {
            pool: pool.key(),
            tree: tree.key(),
            nullifier_set: nullifier_set.key(),
            authority: ctx.accounts.compression_authority.key(),
        });
    }
    
    Ok(())
}
```

### Deposit Module

The deposit module handles user deposits into privacy pools:

```rust
pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    
    // Verify the deposit amount matches the denomination
    if amount != pool.denomination {
        return err!(SolanaVeilError::InvalidDepositAmount);
    }
    
    // Transfer tokens to the vault
    if pool.token_mint == Pubkey::default() {
        // SOL transfer
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.depositor.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.depositor.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
        )?;
    } else {
        // SPL token transfer
        let transfer_cpi_accounts = Transfer {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi_accounts,
        );
        
        token::transfer(cpi_ctx, amount)?;
    }
    
    // Update the Merkle tree
    let commitment = ctx.accounts.commitment.key();
    
    // If compression is enabled, emit deposit event for off-chain indexing
    if pool.is_compressed {
        emit!(CompressedDeposit {
            pool: pool.key(),
            commitment: commitment,
            amount: amount,
            timestamp: Clock::get()?.unix_timestamp,
        });
    } else {
        // Traditional on-chain update
        let tree = &mut ctx.accounts.merkle_tree;
        let leaf = commitment.to_bytes();
        
        // Update tree implementation
        // ...
    }
    
    // Update pool stats
    pool.total_deposits += 1;
    
    // Emit deposit event
    emit!(Deposit {
        pool: pool.key(),
        commitment: commitment,
        amount: amount,
    });
    
    Ok(())
}
```

### Withdrawal Module

The withdrawal module processes privacy-preserving withdrawals:

```rust
pub fn withdraw(ctx: Context<Withdraw>, proof_data: WithdrawProofData) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let nullifier_set = &mut ctx.accounts.nullifier_set;
    
    // Verify the nullifier hasn't been used
    if nullifier_set.is_compressed {
        // Check against compressed nullifier set
        let nullifier_status = ctx.accounts.compression_oracle.get_nullifier_status(
            nullifier_set.key(),
            proof_data.nullifier,
        )?;
        
        if nullifier_status.is_spent {
            return err!(SolanaVeilError::NullifierAlreadyUsed);
        }
    } else {
        // Check against on-chain nullifier set
        if nullifier_set.nullifiers.contains(&proof_data.nullifier) {
            return err!(SolanaVeilError::NullifierAlreadyUsed);
        }
    }
    
    // Verify the Merkle root is valid
    if pool.is_compressed {
        // Verify against compressed root
        let root_status = ctx.accounts.compression_oracle.verify_root(
            pool.key(),
            proof_data.root,
        )?;
        
        if !root_status.is_valid {
            return err!(SolanaVeilError::InvalidMerkleRoot);
        }
    } else {
        // Verify against on-chain root
        if proof_data.root != pool.tree_root {
            return err!(SolanaVeilError::InvalidMerkleRoot);
        }
    }
    
    // Verify the ZK proof
    let is_valid = verify_withdrawal_proof(
        proof_data.proof.to_vec(),
        proof_data.root,
        proof_data.nullifier,
        proof_data.recipient,
        proof_data.relayer,
        proof_data.fee,
        proof_data.refund,
    )?;
    
    if !is_valid {
        return err!(SolanaVeilError::InvalidProof);
    }
    
    // Mark nullifier as spent
    if pool.is_compressed {
        // Emit nullifier event for off-chain tracking
        emit!(CompressedNullifierSpent {
            pool: pool.key(),
            nullifier: proof_data.nullifier,
            timestamp: Clock::get()?.unix_timestamp,
        });
    } else {
        // Add to on-chain nullifier set
        nullifier_set.nullifiers.push(proof_data.nullifier);
    }
    
    // Calculate amounts
    let withdraw_amount = pool.denomination;
    let fee_amount = if proof_data.fee > 0 {
        (withdraw_amount as u128)
            .checked_mul(proof_data.fee as u128)
            .unwrap_or(0)
            .checked_div(10000)
            .unwrap_or(0) as u64
    } else {
        0
    };
    
    let recipient_amount = withdraw_amount.checked_sub(fee_amount).unwrap();
    
    // Transfer funds to recipient
    if pool.token_mint == Pubkey::default() {
        // SOL transfer
        let recipient_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.vault.key(),
            &proof_data.recipient,
            recipient_amount,
        );
        
        let vault_signer_seeds = [
            b"pool_vault".as_ref(),
            pool.key().as_ref(),
            &[pool.bump],
        ];
        
        anchor_lang::solana_program::program::invoke_signed(
            &recipient_ix,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.recipient.to_account_info(),
            ],
            &[&vault_signer_seeds],
        )?;
        
        // Transfer fee if applicable
        if fee_amount > 0 {
            let fee_ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.vault.key(),
                &proof_data.relayer,
                fee_amount,
            );
            
            anchor_lang::solana_program::program::invoke_signed(
                &fee_ix,
                &[
                    ctx.accounts.vault.to_account_info(),
                    ctx.accounts.relayer.to_account_info(),
                ],
                &[&vault_signer_seeds],
            )?;
        }
    } else {
        // SPL token transfers
        // ...
    }
    
    // Update pool stats
    pool.total_withdrawals += 1;
    
    // Emit withdrawal event
    emit!(Withdrawal {
        pool: pool.key(),
        nullifier: proof_data.nullifier,
        recipient: proof_data.recipient,
        amount: recipient_amount,
        fee: fee_amount,
        relayer: proof_data.relayer,
    });
    
    Ok(())
}
```

## ZK Verification

The `verifier.rs` module handles zero-knowledge proof verification:

```rust
pub fn verify_withdrawal_proof(
    proof: Vec<u8>,
    root: [u8; 32],
    nullifier: [u8; 32],
    recipient: Pubkey,
    relayer: Pubkey,
    fee: u64,
    refund: u64,
) -> Result<bool> {
    // Convert inputs to the format required by the verifier
    let mut public_inputs = Vec::new();
    public_inputs.extend_from_slice(&root);
    public_inputs.extend_from_slice(&nullifier);
    public_inputs.extend_from_slice(&recipient.to_bytes());
    public_inputs.extend_from_slice(&relayer.to_bytes());
    public_inputs.extend_from_slice(&fee.to_le_bytes());
    public_inputs.extend_from_slice(&refund.to_le_bytes());
    
    // Call the on-chain verifier
    let result = verify_proof(&proof, &public_inputs)?;
    
    Ok(result)
}

// Low-level verification function using the Groth16 verifier
fn verify_proof(proof: &[u8], public_inputs: &[u8]) -> Result<bool> {
    // Implementation depends on the specific ZK proof system
    // This is a placeholder for the actual verification logic
    
    // Example verification using a hypothetical on-chain verifier
    let verification_ix = Instruction {
        program_id: zk_verifier::id(),
        accounts: vec![
            AccountMeta::new_readonly(zk_verifier::config::id(), false),
        ],
        data: zk_verifier::instruction::Verify {
            proof: proof.to_vec(),
            public_inputs: public_inputs.to_vec(),
        }
        .data(),
    };
    
    let result = invoke_and_return(&verification_ix)?;
    
    Ok(result == 1)
}
```

## Events

The `events.rs` module defines the event structures for the program:

```rust
#[event]
pub struct Deposit {
    pub pool: Pubkey,
    pub commitment: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Withdrawal {
    pub pool: Pubkey,
    pub nullifier: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub relayer: Pubkey,
}

#[event]
pub struct CompressedDeposit {
    pub pool: Pubkey,
    pub commitment: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct CompressedNullifierSpent {
    pub pool: Pubkey,
    pub nullifier: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct TreeCompressionInitialized {
    pub pool: Pubkey,
    pub tree: Pubkey,
    pub nullifier_set: Pubkey,
    pub authority: Pubkey,
}
```

## Error Codes

The `errors.rs` module defines the program-specific error codes:

```rust
#[error_code]
pub enum SolanaVeilError {
    #[msg("Invalid proof")]
    InvalidProof,
    
    #[msg("Nullifier already used")]
    NullifierAlreadyUsed,
    
    #[msg("Invalid Merkle root")]
    InvalidMerkleRoot,
    
    #[msg("Invalid deposit amount")]
    InvalidDepositAmount,
    
    #[msg("Invalid fee")]
    InvalidFee,
    
    #[msg("Invalid recipient")]
    InvalidRecipient,
    
    #[msg("Compression not enabled")]
    CompressionNotEnabled,
    
    #[msg("Unauthorized")]
    Unauthorized,
    
    #[msg("Pool not initialized")]
    PoolNotInitialized,
    
    #[msg("Invalid tree update")]
    InvalidTreeUpdate,
    
    #[msg("Math overflow")]
    MathOverflow,
}
```

## Account Contexts

Here are examples of the account contexts for key instructions:

### InitializePool

```rust
#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Pool>(),
        seeds = [b"pool", authority.key().as_ref(), &denomination.to_le_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    pub token_mint: Option<Account<'info, Mint>>,
    
    #[account(
        init,
        payer = authority,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    
    pub merkle_authority: SystemAccount<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<MerkleTree>(),
        seeds = [b"merkle_tree", pool.key().as_ref()],
        bump
    )]
    pub merkle_tree: Account<'info, MerkleTree>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<NullifierSet>() + 32 * 100, // Initial capacity for 100 nullifiers
        seeds = [b"nullifier_set", pool.key().as_ref()],
        bump
    )]
    pub nullifier_set: Account<'info, NullifierSet>,
    
    pub compression_authority: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}
```

### Deposit

```rust
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    
    #[account(
        mut,
        constraint = pool.is_initialized @ SolanaVeilError::PoolNotInitialized
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.bump
    )]
    pub vault: SystemAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"merkle_tree", pool.key().as_ref()],
        bump
    )]
    pub merkle_tree: Account<'info, MerkleTree>,
    
    /// The commitment of the deposit, which will be added to the Merkle tree
    pub commitment: SystemAccount<'info>,
    
    /// The depositor's token account if using SPL tokens
    #[account(mut)]
    pub depositor_token_account: Option<Account<'info, TokenAccount>>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
```

### Withdraw

```rust
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub withdrawer: Signer<'info>,
    
    #[account(
        mut,
        constraint = pool.is_initialized @ SolanaVeilError::PoolNotInitialized
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.bump
    )]
    pub vault: SystemAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"nullifier_set", pool.key().as_ref()],
        bump
    )]
    pub nullifier_set: Account<'info, NullifierSet>,
    
    /// The recipient account that will receive the funds
    #[account(mut)]
    pub recipient: SystemAccount<'info>,
    
    /// The relayer account that will receive the fee (if any)
    #[account(mut)]
    pub relayer: SystemAccount<'info>,
    
    /// The oracle account for compressed state verification (if compression is enabled)
    pub compression_oracle: Option<AccountInfo<'info>>,
    
    /// The recipient's token account if using SPL tokens
    #[account(mut)]
    pub recipient_token_account: Option<Account<'info, TokenAccount>>,
    
    /// The relayer's token account if using SPL tokens
    #[account(mut)]
    pub relayer_token_account: Option<Account<'info, TokenAccount>>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
```

## Deployment and Interaction

### Program Deployment

The SolanaVeil program is deployed using the Anchor framework:

```bash
anchor build
anchor deploy --program-id SoLV1ejPU65oFJYgPLMg7c2r9BgH9MpNDPUJTSKUJqL
```

### Interacting with the Program

Here's an example of how to interact with the program using TypeScript:

```typescript
import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { SolanaVeil } from '../target/types/solana_veil';

async function main() {
  // Set up connection and wallet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.SolanaVeil as Program<SolanaVeil>;
  
  // Initialize a pool
  const poolParams = {
    tokenMint: anchor.web3.PublicKey.default, // SOL pool
    denomination: new anchor.BN(1_000_000_000), // 1 SOL in lamports
    feeBasisPoints: 30, // 0.3%
    feeRecipient: provider.wallet.publicKey,
    treeDepth: 20,
    enableCompression: true,
  };
  
  // ... additional implementation logic
}

main().catch(console.error);
```

## Security Considerations

SolanaVeil's smart contracts implement several security measures:

1. **No Admin Backdoors**: Once deployed, the protocol operates without centralized control
2. **Nullifier Protection**: Prevents double-spending of deposit notes
3. **Secure Proof Verification**: Rigorous validation of ZK proofs
4. **Storage Protection**: Compressed data integrity verification
5. **Role-Based Access**: Strict permissions for sensitive operations

## Audit Status

The SolanaVeil smart contracts have undergone several security audits:

1. **Internal Review**: Comprehensive internal security review
2. **Formal Verification**: Critical components have been formally verified
3. **External Audit**: Independent security audit by recognized firms

## Future Enhancements

Planned enhancements to the smart contracts include:

1. **Enhanced Compression**: Further optimization of storage costs
2. **Multi-Asset Pools**: Support for multiple asset types in a single pool
3. **Governance Integration**: DAO-based governance of protocol parameters
4. **Cross-Chain Integration**: Support for cross-chain privacy transfers

---

<div align="center">
<p><strong>SolanaVeil</strong> • Privacy-Preserving Mixer with ZK Compression</p>
</div>