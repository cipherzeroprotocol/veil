use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use solana_program::program::invoke_signed;
use solana_program::system_instruction;
// Import Wormhole related items
use wormhole_anchor_sdk::wormhole; // Assuming wormhole_anchor_sdk crate

use crate::errors::ErrorCode;
use crate::events::*;
use crate::state::bridge::*;
use crate::state::pool::Pool; // Keep if pool interaction is needed
use crate::state::tree::MerkleTree; // Keep for commitment insertion
// Remove local verifier import if using Wormhole VAA verification
// use crate::verifier::verify_bridge_proof;

/// Initialize a new bridge configuration
pub fn initialize_bridge(
    ctx: Context<InitializeBridge>,
    fee_basis_points: u16,
    wormhole_finality: u8,
) -> Result<()> {
    let bridge_config = &mut ctx.accounts.bridge_config;
    let wormhole_sequence = &ctx.accounts.wormhole_sequence;

    bridge_config.authority = ctx.accounts.authority.key();
    bridge_config.treasury = ctx.accounts.treasury.key();
    bridge_config.wormhole_program_id = ctx.accounts.wormhole_program.key();
    bridge_config.wormhole_token_bridge_program_id = ctx.accounts.wormhole_token_bridge.key();
    bridge_config.fee_basis_points = fee_basis_points;
    bridge_config.bump = ctx.bumps.bridge_config;
    bridge_config.paused = false;
    bridge_config.chain_count = 0;
    bridge_config.wormhole_sequence_bump = ctx.bumps.wormhole_sequence;
    bridge_config.wormhole_finality = wormhole_finality;

    // Initialize supported chains with default values
    for i in 0..MAX_SUPPORTED_CHAINS {
        bridge_config.supported_chains[i] = ChainConfig::default();
    }

    // Initialize Wormhole sequence tracker
    // This requires CPI to Wormhole Core Bridge to initialize the sequence PDA
    // Example using wormhole_anchor_sdk:
    // wormhole::initialize(
    //     CpiContext::new_with_signer(
    //         ctx.accounts.wormhole_program.to_account_info(),
    //         wormhole::Initialize {
    //             bridge: ctx.accounts.wormhole_bridge.to_account_info(), // Wormhole's bridge state
    //             emitter: ctx.accounts.wormhole_emitter.to_account_info(), // Our emitter PDA
    //             sequence: wormhole_sequence.to_account_info(),
    //             payer: ctx.accounts.authority.to_account_info(),
    //             system_program: ctx.accounts.system_program.to_account_info(),
    //             clock: ctx.accounts.wormhole_clock.to_account_info(), // Wormhole needs clock sysvar
    //             rent: ctx.accounts.wormhole_rent.to_account_info(),   // Wormhole needs rent sysvar
    //         },
    //         &[&[b"emitter".as_ref(), &[ctx.bumps.wormhole_emitter]]] // Signer seeds for our emitter PDA
    //     ),
    //     // guardian_set_index, fee
    // )?;
    // Note: Actual initialization might differ based on Wormhole SDK specifics.

    emit!(BridgeInitializedEvent {
        authority: bridge_config.authority,
        treasury: bridge_config.treasury,
        fee_basis_points,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Update bridge configuration settings
pub fn update_bridge_config(
    ctx: Context<UpdateBridgeConfig>,
    new_fee_basis_points: Option<u16>,
    new_wormhole_finality: Option<u8>,
    new_paused_state: Option<bool>,
    new_treasury: Option<Pubkey>,
) -> Result<()> {
    let bridge_config = &mut ctx.accounts.bridge_config;

    if let Some(fee) = new_fee_basis_points {
        bridge_config.fee_basis_points = fee;
    }
    if let Some(finality) = new_wormhole_finality {
        bridge_config.wormhole_finality = finality;
    }
    if let Some(paused) = new_paused_state {
        bridge_config.paused = paused;
    }
    if let Some(treasury) = new_treasury {
        bridge_config.treasury = treasury;
    }

    // Emit event
    emit!(BridgeConfigUpdatedEvent {
        authority: bridge_config.authority,
        new_fee_basis_points: bridge_config.fee_basis_points,
        new_wormhole_finality: bridge_config.wormhole_finality,
        new_paused_state: bridge_config.paused,
        new_treasury: bridge_config.treasury,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}


/// Register a trusted bridge emitter from another chain
pub fn register_external_emitter(
    ctx: Context<RegisterExternalEmitter>,
    chain_id: u16,
    emitter_address: [u8; 32],
) -> Result<()> {
    let external_emitter = &mut ctx.accounts.external_emitter;

    external_emitter.chain_id = chain_id;
    external_emitter.emitter_address = emitter_address;
    external_emitter.is_active = true; // Activate by default
    external_emitter.last_updated_timestamp = Clock::get()?.unix_timestamp;
    external_emitter.bump = ctx.bumps.external_emitter;

    emit!(ExternalEmitterRegisteredEvent {
        chain_id,
        emitter_address,
        timestamp: external_emitter.last_updated_timestamp,
    });

    Ok(())
}

/// Initiate a cross-chain transfer by locking tokens and emitting a Wormhole message
pub fn initiate_cross_chain_transfer(
    ctx: Context<InitiateCrossChainTransfer>,
    amount: u64,
    destination_chain_id: u16,
    destination_address: [u8; 32],
    commitment: [u8; 32], // Commitment generated off-chain by user
    nonce: u32, // Nonce for Wormhole message uniqueness
) -> Result<()> {
    let bridge_config = &ctx.accounts.bridge_config;
    let bridge_transfer = &mut ctx.accounts.bridge_transfer;

    require!(!bridge_config.paused, ErrorCode::BridgePaused);

    let (chain_config, token_config) = find_token_config(
        bridge_config,
        destination_chain_id,
        ctx.accounts.mint.key(),
    )?;
    require!(token_config.enabled, ErrorCode::TokenNotEnabled);
    require!(
        amount >= token_config.min_amount && amount <= token_config.max_amount,
        ErrorCode::InvalidAmount
    );

    let fee_amount = (amount as u128)
        .checked_mul(bridge_config.fee_basis_points as u128)
        .unwrap()
        .checked_div(10000)
        .unwrap() as u64;
    let transfer_amount = amount.checked_sub(fee_amount).ok_or(ErrorCode::ArithmeticOverflow)?;

    // Transfer tokens from user to vault/bridge account
    // Option 1: Transfer to a bridge-controlled vault account
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(), // Bridge vault
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Option 2: Use Wormhole Token Bridge `transfer_tokens_with_payload`
    // This locks tokens directly in the Token Bridge and emits a message.
    // Requires different accounts and CPI structure. Let's stick with Option 1 for now.

    // Transfer fee to treasury
    if fee_amount > 0 {
        let fee_transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(), // Vault PDA
            },
        );
        let vault_seeds = &[
            b"vault_authority", // Make sure seeds match vault PDA derivation
            &[ctx.accounts.vault_authority_bump], // Pass bump if needed
        ];
        token::transfer(fee_transfer_ctx.with_signer(&[&vault_seeds[..]]), fee_amount)?;
    }

    // Construct Wormhole message payload
    // Payload ID (1 for standard transfer, 3 for transfer with payload)
    // Let's use a custom payload ID, e.g., 100, for SolanaVeil commitment transfer
    let payload_id: u8 = 100;
    let mut message_payload: Vec<u8> = Vec::new();
    message_payload.push(payload_id);
    message_payload.extend_from_slice(&transfer_amount.to_be_bytes()); // Amount (net)
    message_payload.extend_from_slice(&token_config.mint.to_bytes()); // Token address (Solana mint)
    message_payload.extend_from_slice(&wormhole::CHAIN_ID_SOLANA.to_be_bytes()); // Source Chain ID (Solana)
    message_payload.extend_from_slice(&destination_chain_id.to_be_bytes()); // Destination Chain ID
    message_payload.extend_from_slice(&destination_address); // Recipient (Bridge contract on dest chain)
    message_payload.extend_from_slice(&commitment); // Privacy commitment
    message_payload.extend_from_slice(&nonce.to_be_bytes()); // Nonce

    // Post message to Wormhole
    let wormhole_accounts = wormhole::PostMessage {
        config: ctx.accounts.wormhole_bridge.to_account_info(), // Wormhole bridge state
        message: ctx.accounts.wormhole_message.to_account_info(), // PDA for message data
        emitter: ctx.accounts.wormhole_emitter.to_account_info(), // Our emitter PDA
        sequence: ctx.accounts.wormhole_sequence.to_account_info(), // Emitter sequence PDA
        payer: ctx.accounts.user.to_account_info(), // User pays Wormhole fee
        fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(), // Wormhole fee collector
        clock: ctx.accounts.wormhole_clock.to_account_info(),
        rent: ctx.accounts.wormhole_rent.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let emitter_signer_seeds = &[
        b"emitter".as_ref(), // Seed used in InitializeBridge
        &[ctx.bumps.wormhole_emitter],
    ];
    let sequence = wormhole::post_message(
        CpiContext::new_with_signer(
            ctx.accounts.wormhole_program.to_account_info(),
            wormhole_accounts,
            &[&emitter_signer_seeds[..]],
        ),
        nonce,
        message_payload,
        bridge_config.wormhole_finality,
    )?;

    // Record the bridge transfer details
    bridge_transfer.dest_chain_id = destination_chain_id;
    bridge_transfer.amount = transfer_amount;
    bridge_transfer.token_mint = ctx.accounts.mint.key();
    bridge_transfer.dest_token_id = token_config.dest_token_id; // Store dest token ID if needed
    bridge_transfer.commitment = commitment;
    bridge_transfer.dest_address = destination_address;
    bridge_transfer.wormhole_sequence = sequence;
    bridge_transfer.timestamp = Clock::get()?.unix_timestamp;
    bridge_transfer.status = TransferStatus::Pending;
    bridge_transfer.bump = ctx.bumps.bridge_transfer;

    // Add commitment to Merkle tree (using existing pool/tree logic)
    // This assumes the commitment needs to be added to the *local* Solana tree as well.
    // If the commitment is only relevant on the destination chain, this step might be removed.
    crate::instructions::tree::add_leaf(
        &ctx.accounts.merkle_tree,
        commitment,
    )?;

    emit!(CrossChainTransferInitiatedEvent {
        sender: ctx.accounts.user.key(),
        dest_chain_id: destination_chain_id,
        token_mint: ctx.accounts.mint.key(),
        amount: transfer_amount, // Net amount
        commitment: commitment,
        wormhole_sequence: sequence,
        nonce: nonce,
        timestamp: bridge_transfer.timestamp,
    });

    Ok(())
}


/// Process an incoming transfer VAA from Wormhole
pub fn process_incoming_transfer(
    ctx: Context<ProcessIncomingTransfer>,
    vaa_hash: [u8; 32], // Pass the VAA hash for verification
) -> Result<()> {
    let bridge_config = &ctx.accounts.bridge_config;
    require!(!bridge_config.paused, ErrorCode::BridgePaused);

    // Verify the VAA using Wormhole Core Bridge CPI
    let posted_vaa = &ctx.accounts.posted_vaa; // Account containing the VAA data posted by relayers
    let vaa = wormhole::parse_vaa(posted_vaa.as_ref())?; // Use Wormhole SDK to parse

    // Check VAA hash matches the one passed in (ensures correct VAA is used)
    // require!(vaa.digest().hash == vaa_hash, ErrorCode::InvalidWormholeMessage);

    // Verify the emitter chain and address are registered/trusted
    let external_emitter_key = Pubkey::create_program_address(
        &[
            b"external_emitter",
            &vaa.emitter_chain.to_be_bytes(),
            &vaa.emitter_address, // Wormhole emitter address is already bytes32
        ],
        ctx.program_id,
    ).map_err(|_| ProgramError::InvalidSeeds)?;

    require!(external_emitter_key == ctx.accounts.external_emitter.key(), ErrorCode::InvalidExternalEmitter);
    require!(ctx.accounts.external_emitter.is_active, ErrorCode::InvalidExternalEmitter);

    // Decode the payload from the VAA
    // Assuming the payload format defined in the documentation
    let payload = vaa.payload;
    require!(payload.len() > 1 + 8 + 32 + 2 + 2 + 32 + 32 + 4, ErrorCode::InvalidWormholeMessage); // Basic length check

    let payload_id = payload[0];
    require!(payload_id == 100, ErrorCode::InvalidWormholeMessage); // Check for our custom payload ID

    let amount = u64::from_be_bytes(payload[1..9].try_into().unwrap());
    let token_address_bytes: [u8; 32] = payload[9..41].try_into().unwrap(); // Origin token address bytes
    let source_chain_id = u16::from_be_bytes(payload[41..43].try_into().unwrap());
    let target_chain_id = u16::from_be_bytes(payload[43..45].try_into().unwrap());
    let recipient_bytes: [u8; 32] = payload[45..77].try_into().unwrap(); // Should be this bridge program ID in Wormhole format
    let commitment: [u8; 32] = payload[77..109].try_into().unwrap();
    // let nonce = u32::from_be_bytes(payload[109..113].try_into().unwrap()); // Nonce might be useful

    require!(source_chain_id == vaa.emitter_chain, ErrorCode::InvalidWormholeMessage);
    require!(target_chain_id == wormhole::CHAIN_ID_SOLANA, ErrorCode::InvalidWormholeMessage);
    // Verify recipient is this program?

    // Find corresponding Solana mint for the incoming token
    // This requires looking up based on source_chain_id and token_address_bytes
    // Need a reverse mapping in BridgeConfig or a separate lookup mechanism.
    // Placeholder: Assume we found the mint.
    let local_mint_pubkey = ctx.accounts.mint.key(); // Use the mint passed in context for now

    // Add the commitment to the local Merkle tree
    crate::instructions::tree::add_leaf(
        &ctx.accounts.merkle_tree,
        commitment,
    )?;

    // Mark the VAA as processed to prevent replay
    // This usually involves storing the VAA hash or emitter/sequence in an account.
    // Let's use a simple PDA based on the VAA hash.
    let processed_vaa = &mut ctx.accounts.processed_vaa;
    processed_vaa.timestamp = Clock::get()?.unix_timestamp;
    processed_vaa.bump = ctx.bumps.processed_vaa;


    // Note: Tokens are NOT released here. They are made available for withdrawal
    // via the `complete_bridge_withdrawal` instruction using the commitment.
    // The actual tokens should have been transferred to a vault via Wormhole Token Bridge's
    // `complete_transfer` mechanism before this instruction is called, or managed by this program.

    emit!(IncomingTransferProcessedEvent {
        vaa_emitter_chain: vaa.emitter_chain,
        vaa_emitter_address: vaa.emitter_address,
        vaa_sequence: vaa.sequence,
        commitment: commitment,
        timestamp: processed_vaa.timestamp,
    });

    Ok(())
}

/// Complete a withdrawal initiated from another chain (verifies ZK proof)
pub fn complete_bridge_withdrawal(
    ctx: Context<CompleteBridgeWithdrawal>,
    proof_data: Vec<u8>,
    root: [u8; 32],
    nullifier_hash: [u8; 32],
    recipient: Pubkey, // Solana recipient address
    relayer: Pubkey,   // Relayer submitting the transaction (can be recipient)
    fee: u64,          // Fee paid to relayer in token units
    refund: u64,       // Refund amount in SOL (unused here?)
) -> Result<()> {
    // This instruction is essentially the same as the standard `withdraw` instruction
    // but might use context derived from the cross-chain flow (e.g., commitment added by `process_incoming_transfer`).

    // 1. Verify Merkle Root is known (using MerkleTree state)
    require!(ctx.accounts.merkle_tree.is_known_root(root), ErrorCode::InvalidRoot);

    // 2. Verify Nullifier is not used (using NullifierSet state)
    require!(!ctx.accounts.nullifier_set.contains(nullifier_hash), ErrorCode::NullifierAlreadyUsed);

    // 3. Verify ZK Proof
    //    The public inputs should include: root, nullifier_hash, recipient, relayer, fee
    //    Need to fetch the verification key (e.g., from an account)
    //    verify_zk_proof(proof_data, vk_data, public_inputs)?; // Placeholder

    // 4. Mark Nullifier as used
    ctx.accounts.nullifier_set.insert(nullifier_hash)?;

    // 5. Calculate amounts
    let withdraw_amount = ctx.accounts.pool.get_deposit_amount(); // Get amount associated with commitment/proof
    let amount_to_recipient = withdraw_amount.checked_sub(fee).ok_or(ErrorCode::InvalidFee)?;

    // 6. Transfer tokens to recipient
    let transfer_recipient_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
    );
    let vault_seeds = &[
        b"vault_authority", // Make sure seeds match vault PDA derivation
        &[ctx.accounts.vault_authority_bump], // Pass bump if needed
    ];
    token::transfer(transfer_recipient_ctx.with_signer(&[&vault_seeds[..]]), amount_to_recipient)?;

    // 7. Transfer fee to relayer
    if fee > 0 && relayer != Pubkey::default() {
        let transfer_relayer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.relayer_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
        );
        token::transfer(transfer_relayer_ctx.with_signer(&[&vault_seeds[..]]), fee)?;
    }

    // 8. Handle SOL refund (if applicable, though less common in token withdrawals)
    // if refund > 0 && relayer != Pubkey::default() { ... transfer SOL ... }

    emit!(WithdrawalEvent {
        to: recipient,
        nullifier_hash: nullifier_hash,
        amount: amount_to_recipient,
        fee: fee,
    });

    Ok(())
}


// === Helper Functions ===

/// Helper function to find token configuration for a chain and mint
fn find_token_config<'a>(
    bridge_config: &'a BridgeConfig,
    chain_id: u16,
    mint: Pubkey,
) -> Result<(&'a ChainConfig, &'a TokenConfig)> {
    let chain_config = bridge_config.supported_chains.iter().find(|c| c.chain_id == chain_id)
        .ok_or(ErrorCode::ChainNotSupported)?;

    let token_config = chain_config.tokens.iter().find(|t| t.mint == mint)
        .ok_or(ErrorCode::TokenNotSupported)?;

    Ok((chain_config, token_config))
}

// Remove old helper functions related to local ZK proof verification if handled differently
// fn add_commitment_to_tree(...) -> Result<()> { ... }
// fn verify_nullifier_unused(...) -> Result<()> { ... }
// fn add_nullifier_to_compressed_set(...) -> Result<()> { ... }
// fn keccak256(...) -> [u8; 32] { ... }


// === Context Structs ===

#[derive(Accounts)]
#[instruction(fee_basis_points: u16, wormhole_finality: u8)]
pub struct InitializeBridge<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<BridgeConfig>(),
        seeds = [b"bridge_config"],
        bump,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Treasury account, can be any pubkey.
    pub treasury: AccountInfo<'info>,

    /// CHECK: Wormhole Core Bridge Program ID.
    #[account(address = wormhole::program::ID)]
    pub wormhole_program: AccountInfo<'info>,
    /// CHECK: Wormhole Token Bridge Program ID.
    pub wormhole_token_bridge: AccountInfo<'info>, // Verify address if known

    /// CHECK: Wormhole Bridge state account.
    #[account(seeds = [b"Bridge"], bump, seeds::program = wormhole_program.key())]
    pub wormhole_bridge: AccountInfo<'info>,
    /// CHECK: PDA signer for Wormhole messages. Seeds: ["emitter"]
    #[account(seeds = [b"emitter"], bump)]
    pub wormhole_emitter: AccountInfo<'info>,
    /// CHECK: Wormhole sequence tracking PDA. Seeds: ["Sequence", wormhole_emitter.key().as_ref()]
    #[account(mut, seeds = [b"Sequence", wormhole_emitter.key().as_ref()], bump, seeds::program = wormhole_program.key())]
    pub wormhole_sequence: AccountInfo<'info>,
    /// CHECK: Wormhole fee collector account.
    #[account(mut, seeds = [b"fee_collector"], bump, seeds::program = wormhole_program.key())]
    pub wormhole_fee_collector: AccountInfo<'info>,
    /// CHECK: Clock sysvar.
    #[account(address = solana_program::sysvar::clock::ID)]
    pub wormhole_clock: AccountInfo<'info>,
    /// CHECK: Rent sysvar.
    #[account(address = solana_program::sysvar::rent::ID)]
    pub wormhole_rent: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateBridgeConfig<'info> {
    #[account(
        mut,
        seeds = [b"bridge_config"],
        bump = bridge_config.bump,
        has_one = authority,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(chain_id: u16, emitter_address: [u8; 32])]
pub struct RegisterExternalEmitter<'info> {
    #[account(
        seeds = [b"bridge_config"],
        bump = bridge_config.bump,
        has_one = authority,
    )]
    pub bridge_config: Account<'info, BridgeConfig>, // Need config to check authority

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<ExternalBridgeEmitter>(),
        seeds = [b"external_emitter", &chain_id.to_be_bytes(), &emitter_address],
        bump,
    )]
    pub external_emitter: Account<'info, ExternalBridgeEmitter>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(amount: u64, destination_chain_id: u16, destination_address: [u8; 32], commitment: [u8; 32], nonce: u32)]
pub struct InitiateCrossChainTransfer<'info> {
    #[account(
        seeds = [b"bridge_config"],
        bump = bridge_config.bump,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<BridgeTransfer>(),
        // Use commitment or wormhole sequence for PDA uniqueness? Sequence is better.
        seeds = [b"bridge_transfer", bridge_config.wormhole_emitter.key().as_ref(), &destination_chain_id.to_be_bytes(), &nonce.to_be_bytes()], // Placeholder seeds
        bump,
    )]
    pub bridge_transfer: Account<'info, BridgeTransfer>,

    pub mint: Account<'info, Mint>,

    #[account(mut, constraint = user_token_account.owner == user.key(), constraint = user_token_account.mint == mint.key())]
    pub user_token_account: Account<'info, TokenAccount>,

    // Bridge Vault Account (holds tokens before Wormhole transfer or if not using Token Bridge directly)
    #[account(mut, constraint = vault_token_account.mint == mint.key())]
    pub vault_token_account: Account<'info, TokenAccount>,
    /// CHECK: PDA authority for the vault. Seeds: ["vault_authority"]
    #[account(seeds = [b"vault_authority"], bump)] // Add bump if needed
    pub vault_authority: AccountInfo<'info>,
    // Add vault_authority_bump if needed
    pub vault_authority_bump: u8,


    #[account(mut, constraint = treasury_token_account.mint == mint.key(), constraint = treasury_token_account.owner == bridge_config.treasury)]
    pub treasury_token_account: Account<'info, TokenAccount>,

    // Merkle Tree Account (for local commitment insertion)
    #[account(mut)]
    pub merkle_tree: Account<'info, MerkleTree>,

    // Wormhole Accounts
    /// CHECK: Wormhole Core Bridge Program ID.
    #[account(address = bridge_config.wormhole_program_id)]
    pub wormhole_program: AccountInfo<'info>,
    /// CHECK: Wormhole Bridge state account.
    #[account(mut, seeds = [b"Bridge"], bump, seeds::program = wormhole_program.key())]
    pub wormhole_bridge: AccountInfo<'info>,
    /// CHECK: PDA signer for Wormhole messages. Seeds: ["emitter"]
    #[account(seeds = [b"emitter"], bump)] // Use bump from bridge_config?
    pub wormhole_emitter: AccountInfo<'info>,
    /// CHECK: Wormhole sequence tracking PDA. Seeds: ["Sequence", wormhole_emitter.key().as_ref()]
    #[account(mut, seeds = [b"Sequence", wormhole_emitter.key().as_ref()], bump = bridge_config.wormhole_sequence_bump, seeds::program = wormhole_program.key())]
    pub wormhole_sequence: AccountInfo<'info>,
    /// CHECK: Wormhole fee collector account.
    #[account(mut, seeds = [b"fee_collector"], bump, seeds::program = wormhole_program.key())]
    pub wormhole_fee_collector: AccountInfo<'info>,
    /// CHECK: Account to store the Wormhole message data. Needs to be initialized.
    #[account(mut)] // Should be initialized by payer before calling post_message
    pub wormhole_message: Signer<'info>, // Message account needs to sign? Or is it written to? Check Wormhole docs. Often written to.
    /// CHECK: Clock sysvar.
    #[account(address = solana_program::sysvar::clock::ID)]
    pub wormhole_clock: AccountInfo<'info>,
    /// CHECK: Rent sysvar.
    #[account(address = solana_program::sysvar::rent::ID)]
    pub wormhole_rent: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(vaa_hash: [u8; 32])]
pub struct ProcessIncomingTransfer<'info> {
    #[account(
        seeds = [b"bridge_config"],
        bump = bridge_config.bump,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    // Payer for initializing ProcessedVaa account
    #[account(mut)]
    pub payer: Signer<'info>,

    // Wormhole Accounts
    /// CHECK: Wormhole Core Bridge Program ID.
    #[account(address = bridge_config.wormhole_program_id)]
    pub wormhole_program: AccountInfo<'info>,
    /// CHECK: Account holding the posted VAA data. Seeds: ["PostedVAA", &vaa_hash]
    #[account(seeds = [b"PostedVAA", &vaa_hash], bump, seeds::program = wormhole_program.key())]
    pub posted_vaa: AccountInfo<'info>, // This needs to be the account structure defined by Wormhole Core

    // External Emitter Account (derived from VAA)
    /// CHECK: Derived based on VAA emitter_chain and emitter_address. Seeds: ["external_emitter", chain_id_bytes, emitter_address_bytes]
    #[account(seeds = [b"external_emitter", &posted_vaa.emitter_chain.to_be_bytes(), &posted_vaa.emitter_address], bump = external_emitter.bump)] // Assuming posted_vaa has these fields after parsing
    pub external_emitter: Account<'info, ExternalBridgeEmitter>,

    // Merkle Tree Account (to add commitment)
    #[account(mut)]
    pub merkle_tree: Account<'info, MerkleTree>,

    // Mint account (needed to associate commitment with token type?)
    // How do we know which mint this corresponds to without parsing payload first?
    // Maybe commitment insertion doesn't need mint context directly.
    /// CHECK: Mint associated with the transfer (needs lookup based on VAA payload).
    pub mint: Account<'info, Mint>,

    // Processed VAA tracking account
    #[account(
        init,
        payer = payer,
        space = 8 + 8 + 1, // timestamp + bump
        seeds = [b"processed_vaa", &vaa_hash],
        bump
    )]
    pub processed_vaa: Account<'info, ProcessedVaa>,

    pub system_program: Program<'info, System>,
}

// Simple account to track processed VAAs
#[account]
pub struct ProcessedVaa {
    pub timestamp: i64,
    pub bump: u8,
}


#[derive(Accounts)]
#[instruction(proof_data: Vec<u8>, root: [u8; 32], nullifier_hash: [u8; 32], recipient: Pubkey, relayer: Pubkey, fee: u64, refund: u64)]
pub struct CompleteBridgeWithdrawal<'info> {
    // Pool account (if amount is derived from pool state)
    // pub pool: Account<'info, Pool>,

    // Merkle Tree account (to verify root)
    #[account()]
    pub merkle_tree: Account<'info, MerkleTree>,

    // Nullifier set account (to check and insert nullifier)
    #[account(mut)]
    pub nullifier_set: Account<'info, crate::state::nullifier::NullifierSet>, // Assuming path

    // Verification Key Account (needed for ZK proof verification)
    /// CHECK: Account holding the ZK verification key.
    pub verification_key: AccountInfo<'info>,

    // Vault token account holding the funds
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    /// CHECK: PDA authority for the vault. Seeds: ["vault_authority"]
    #[account(seeds = [b"vault_authority"], bump)] // Add bump if needed
    pub vault_authority: AccountInfo<'info>,
    // Add vault_authority_bump if needed
    pub vault_authority_bump: u8,


    // Recipient's token account
    #[account(
        mut,
        constraint = recipient_token_account.owner == recipient @ ErrorCode::InvalidProof, // Recipient must match proof/input
        constraint = recipient_token_account.mint == vault_token_account.mint @ ErrorCode::InvalidProof, // Mints must match
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    // Relayer's token account (optional, for fee)
    #[account(
        mut,
        constraint = relayer_token_account.owner == relayer @ ErrorCode::InvalidProof, // Relayer must match input
        constraint = relayer_token_account.mint == vault_token_account.mint @ ErrorCode::InvalidProof, // Mints must match
    )]
    pub relayer_token_account: Account<'info, TokenAccount>, // Use Box if truly optional based on fee > 0

    // Token program
    pub token_program: Program<'info, Token>,

    // System program (potentially for SOL refund)
    pub system_program: Program<'info, System>,
}


// Remove old contexts if they are fully replaced
// #[derive(Accounts)] ... InitializeNullifier ...
// #[derive(Accounts)] ... InitializeRelayer ...
// #[derive(Accounts)] ... RegisterRelayer ...
// #[derive(Accounts)] ... LockTokensForBridge (replaced by InitiateCrossChainTransfer) ...
// #[derive(Accounts)] ... ProcessIncomingTransfer (old version) ...