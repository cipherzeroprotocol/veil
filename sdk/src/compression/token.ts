/**
 * Compressed Token module for SolanaVeil
 * 
 * This module provides utilities for working with compressed tokens using ZK Compression
 */

import { 
    PublicKey, 
    Keypair, 
    Signer, 
    Transaction,
    ComputeBudgetProgram, // Ensure ComputeBudgetProgram is imported
    TransactionInstruction,
    ConfirmOptions // Import ConfirmOptions
  } from '@solana/web3.js';
  import { 
    Rpc, 
    bn, 
    buildAndSignTx, // Ensure buildAndSignTx is imported
    sendAndConfirmTx, // Ensure sendAndConfirmTx is imported
    dedupeSigner,
    ActiveTreeBundle, 
    ParsedTokenAccount, 
    TokenBalance,
    CompressedProofWithContext, 
    HashWithTree, 
    AddressWithTree, 
    WithContext, 
    WithCursor, 
  } from '@lightprotocol/stateless.js';
  import { 
    CompressedTokenProgram, 
    createMint as createCompressedMint,
    mintTo as mintToCompressedAccount,
    transfer as transferCompressedToken,
    compress, 
    // Remove the aliased decompress import if not used elsewhere
    // decompress as decompressSplTokens, 
    selectMinCompressedTokenAccountsForTransfer,
    
  } from '@lightprotocol/compressed-token';
  import * as BN from 'bn.js'; // Use * as import for BN
  
  /**
   * Represents a compressed token account with its details
   */
  export interface CompressedTokenAccount {
    hash: string;
    address?: string;
    parsed: {
      mint: string;
      owner: string;
      amount: BN;
      delegateOption: boolean;
      delegate?: string;
      state: string;
      isNativeOption: boolean;
      isNative?: number;
      delegatedAmount?: BN;
    };
    merkleTreeAddress: string;
    leafIndex: number;
    compressedAccount: {
      hash: string;
      owner: string;
      data: string;
      treeId: string;
      leafIndex: number;
    };
  }
  
  /**
   * CompressedTokenManager class for managing compressed tokens
   */
  export class CompressedTokenManager {
    private rpc: Rpc;
  
    /**
     * Constructor for CompressedTokenManager
     * 
     * @param rpc - The RPC connection to use
     */
    constructor(rpc: Rpc) {
      this.rpc = rpc;
    }
  
    /**
     * Create a new compressed token mint
     * 
     * @param params - Parameters for creating a mint
     * @returns The mint address and transaction signature
     */
    async createMint(params: {
      payer: Signer;
      authority?: PublicKey;
      decimals?: number;
    }): Promise<{ mint: PublicKey; transactionSignature: string }> {
      const { payer, authority = payer.publicKey, decimals = 9 } = params;
  
      try {
        return await createCompressedMint(
          this.rpc,
          payer,
          authority,
          decimals
        );
      } catch (error) {
        console.error('Error creating compressed token mint:', error);
        throw error;
      }
    }
  
    /**
     * Mint compressed tokens to a recipient
     * 
     * @param params - Parameters for minting tokens
     * @returns The transaction signature
     */
    async mintTo(params: {
      payer: Signer;
      mint: PublicKey;
      destination: PublicKey;
      authority: Signer;
      amount: number | bigint | BN;
    }): Promise<string> {
      const { payer, mint, destination, authority, amount } = params;
  
      try {
        return await mintToCompressedAccount(
          this.rpc,
          payer,
          mint,
          destination,
          authority,
          typeof amount === 'number' || typeof amount === 'bigint' ? bn(amount.toString()) : amount
        );
      } catch (error) {
        console.error('Error minting compressed tokens:', error);
        throw error;
      }
    }
  
    /**
     * Transfer compressed tokens from one account to another
     * 
     * @param params - Parameters for transferring tokens
     * @returns The transaction signature
     */
    async transfer(params: {
      payer: Signer;
      mint: PublicKey;
      amount: number | bigint | BN;
      owner: Signer;
      recipient: PublicKey;
      computeUnitLimit?: number;
      usePriorityFees?: boolean;
      priorityFeeMultiplier?: number;
    }): Promise<string> {
      const { 
        payer, 
        mint, 
        amount, 
        owner, 
        recipient, 
        computeUnitLimit = 350000,
        usePriorityFees = false,
        priorityFeeMultiplier = 1
      } = params;
  
      try {
        // Convert amount to BN if it's not already
        const amountBn = typeof amount === 'number' || typeof amount === 'bigint'
          ? bn(amount.toString())
          : amount;
  
        // 1. Fetch the token accounts owned by the owner using the correct method
        const compressedTokenAccountsResponse: WithCursor<ParsedTokenAccount[]> = 
            await this.rpc.getCompressedTokenAccountsByOwner( // Use non-V2 version
              owner.publicKey,
              { mint }
            );
        
        const accountsToSelectFrom = compressedTokenAccountsResponse.items || []; // Access items directly

        // 2. Select accounts with enough balance for the transfer
        const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
          accountsToSelectFrom, // Use the fetched accounts
          amountBn
        );
  
        if (!inputAccounts || inputAccounts.length === 0) {
          throw new Error(`Insufficient token balance. Required: ${amountBn.toString()}`);
        }
  
        // 3. Get validity proof for the accounts using V0
        // Map input accounts to HashWithTree structure
        const hashesWithTree: HashWithTree[] = inputAccounts.map(account => ({
            hash: account.compressedAccount.hash, // Use the BN hash directly
            tree: account.compressedAccount.merkleTree,
            queue: account.compressedAccount.nullifierQueue, // Assuming nullifierQueue is available
        }));

        const proof: CompressedProofWithContext = await this.rpc.getValidityProofV0(hashesWithTree, []); // Use V0
  
        // 4. Create the transfer instruction
        const transferIx = await CompressedTokenProgram.transfer({
          payer: payer.publicKey,
          inputCompressedTokenAccounts: inputAccounts,
          toAddress: recipient,
          amount: amountBn,
          // Pass proof components correctly
          recentInputStateRootIndices: proof.rootIndices, 
          recentValidityProof: proof.compressedProof, 
          outputStateTrees: undefined // Will use default state trees
        });
  
        // 5. Build the transaction
        const instructions: TransactionInstruction[] = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
        ];
        
        // Add priority fees if requested
        if (usePriorityFees) {
          const { feeCalculator } = await this.rpc.getRecentBlockhash();
          const baseFee = feeCalculator?.lamportsPerSignature || 5000;
          const microLamports = Math.ceil(baseFee * 1000 * priorityFeeMultiplier);
          
          instructions.push(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
          );
        }
        
        instructions.push(transferIx);
  
        // 6. Get latest blockhash
        const { blockhash } = await this.rpc.getLatestBlockhash();
  
        // 7. Deduplicate signers and build the transaction
        const additionalSigners = dedupeSigner(payer, [payer, owner]);
        const signedTx = buildAndSignTx(
          instructions,
          payer,
          blockhash,
          additionalSigners
        );
  
        // 8. Send and confirm the transaction
        return await sendAndConfirmTx(this.rpc, signedTx);
      } catch (error) {
        console.error('Error transferring compressed tokens:', error);
        throw error;
      }
    }
  
    /**
     * Compress regular SPL tokens into compressed tokens
     * 
     * @param params - Parameters for compressing tokens
     * @returns The transaction signature
     */
    async compressTokens(params: {
      payer: Signer;
      mint: PublicKey;
      amount: number | bigint | BN;
      owner: Signer;
      sourceTokenAccount: PublicKey;
      destinationOwner?: PublicKey;
    }): Promise<string> {
      const { 
        payer, 
        mint, 
        amount, 
        owner, 
        sourceTokenAccount, 
        destinationOwner = owner.publicKey 
      } = params;
  
      try {
        // Convert amount to BN if it's not already
        const amountBn = typeof amount === 'number' || typeof amount === 'bigint'
          ? bn(amount.toString())
          : amount;
  
        return await compress(
          this.rpc,
          payer,
          mint,
          amountBn,
          owner,
          sourceTokenAccount,
          destinationOwner
        );
      } catch (error) {
        console.error('Error compressing tokens:', error);
        throw error;
      }
    }
  
    /**
     * Decompress compressed tokens into regular SPL tokens
     * 
     * @param params - Parameters for decompressing tokens
     * @returns The transaction signature
     */
    async decompressTokens(params: {
      payer: Signer;
      mint: PublicKey;
      amount: number | bigint | BN;
      owner: Signer;
      destinationTokenAccount?: PublicKey;
      computeUnitLimit?: number; // Add compute unit limit option
      usePriorityFees?: boolean; // Add priority fee option
      priorityFeeMultiplier?: number; // Add priority fee multiplier option
      confirmOptions?: ConfirmOptions; // Add confirm options
    }): Promise<string> {
      const { 
        payer, 
        mint, 
        amount, 
        owner, 
        destinationTokenAccount,
        computeUnitLimit = 350000, // Default compute limit
        usePriorityFees = false,
        priorityFeeMultiplier = 1,
        confirmOptions 
      } = params;
  
      try {
        // Convert amount to BN if it's not already
        const amountBn = typeof amount === 'number' || typeof amount === 'bigint'
          ? bn(amount.toString())
          : amount;
  
        // 1. Fetch the compressed token accounts owned by the owner using the correct method
        const compressedTokenAccountsResponse: WithCursor<ParsedTokenAccount[]> = 
            await this.rpc.getCompressedTokenAccountsByOwner( // Use non-V2 version
              owner.publicKey,
              { mint }
            );
        
        const accountsToSelectFrom = compressedTokenAccountsResponse.items || []; // Access items directly

        // 2. Select accounts with enough balance for the decompression
        const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
          accountsToSelectFrom, // Use the fetched accounts
          amountBn
        );
  
        if (!inputAccounts || inputAccounts.length === 0) {
          throw new Error(`Insufficient token balance. Required: ${amountBn.toString()}`);
        }
  
        // 3. Get validity proof for the accounts using V0
        const hashesWithTree: HashWithTree[] = inputAccounts.map(account => ({
            hash: account.compressedAccount.hash, 
            tree: account.compressedAccount.merkleTree,
            queue: account.compressedAccount.nullifierQueue, 
        }));

        const proof: CompressedProofWithContext = await this.rpc.getValidityProofV0(hashesWithTree, []); // Use V0
  
        // 4. Create the decompress instruction using CompressedTokenProgram
        const decompressIx = await CompressedTokenProgram.decompress({
          payer: payer.publicKey,
          inputCompressedTokenAccounts: inputAccounts, // Pass ParsedTokenAccount[]
          amount: amountBn,
          //owner: owner.publicKey, // Pass owner PublicKey
          //destinationTokenAccount: destinationTokenAccount, // Optional destination SPL account
          recentInputStateRootIndices: proof.rootIndices,
          recentValidityProof: proof.compressedProof,
          toAddress: new PublicKey(destinationTokenAccount || owner.publicKey.toBase58())
        });

        // 5. Build the transaction
        const instructions: TransactionInstruction[] = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
        ];
        
        // Add priority fees if requested
        if (usePriorityFees) {
          const { feeCalculator } = await this.rpc.getRecentBlockhash();
          const baseFee = feeCalculator?.lamportsPerSignature || 5000;
          const microLamports = Math.ceil(baseFee * 1000 * priorityFeeMultiplier);
          
          instructions.push(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
          );
        }
        
        instructions.push(decompressIx); // Add the decompress instruction

        // 6. Get latest blockhash
        const { blockhash, lastValidBlockHeight } = await this.rpc.getLatestBlockhash();
  
        // 7. Deduplicate signers and build the transaction
        const additionalSigners = dedupeSigner(payer, [payer, owner]); // Payer and owner must sign
        const signedTx = buildAndSignTx(
          instructions,
          payer,
          blockhash,
          additionalSigners
        );
  
        // 8. Send and confirm the transaction
        return await sendAndConfirmTx(
            this.rpc, 
            signedTx, 
            confirmOptions, 
            { blockhash, lastValidBlockHeight } // Pass blockhash context for confirmation
        );
        
      } catch (error) {
        console.error('Error decompressing tokens:', error);
        throw error;
      }
    }
  
    /**
     * Get compressed token balances for an owner
     * 
     * @param owner - The owner's public key
     * @param mint - Optional mint to filter by
     * @returns Array of token balances with mint information
     */
    async getTokenBalancesByOwner(owner: PublicKey, mint?: PublicKey): Promise<{
      mint: string;
      amount: string;
      decimals?: number;
      tokenName?: string;
      tokenSymbol?: string;
    }[]> {
      try {
        const filter = mint ? { mint } : undefined;
        // Use V2 which returns WithContext<WithCursor<TokenBalance[]>>
        const response: WithContext<WithCursor<TokenBalance[]>> = 
            await this.rpc.getCompressedTokenBalancesByOwnerV2(owner, filter);
        
        // Access the items array via response.value.items
        return response.value.items.map((balance: TokenBalance) => ({ 
          mint: balance.mint.toBase58(), // Convert PublicKey to string
          amount: balance.balance.toString(), // Convert BN to string
          // Decimals, name, symbol might not be directly available on TokenBalance, adjust as needed
          decimals: undefined, // Placeholder
          tokenName: undefined, // Placeholder
          tokenSymbol: undefined // Placeholder
        }));
      } catch (error) {
        console.error('Error getting token balances:', error);
        throw error;
      }
    }
  
    /**
     * Get detailed compressed token accounts for an owner
     * 
     * @param owner - The owner's public key
     * @param filter - Optional filter parameters (mint, limit, cursor)
     * @returns Array of parsed token accounts
     */
    async getTokenAccountsByOwner(
      owner: PublicKey,
      filter?: { mint?: PublicKey; limit?: number; cursor?: string }
    ): Promise<ParsedTokenAccount[]> { // Change return type
      try {
        // Use non-V2 version which returns WithCursor<ParsedTokenAccount[]>
        const response: WithCursor<ParsedTokenAccount[]> = 
            await this.rpc.getCompressedTokenAccountsByOwner(owner, filter || {}); // Use non-V2 version
        // Return the items array directly from response.items
        return response.items; 
      } catch (error) {
        console.error('Error getting token accounts:', error);
        throw error;
      }
    }
  
    /**
     * Calculate the required amount of SOL to hold compressed tokens
     * (minimal, as compressed tokens require much less rent than SPL tokens)
     * 
     * @returns The minimum SOL amount in lamports
     */
    getMinimumBalanceForCompressedToken(): number {
      // Compressed tokens require much less rent than SPL tokens
      // This is an estimated minimum amount that should be sufficient
      return 10000; // 0.00001 SOL
    }
  }