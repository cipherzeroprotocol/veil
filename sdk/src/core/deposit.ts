/**
 * Deposit module for SolanaVeil
 */

import { 
    PublicKey, 
    Signer, 
    TransactionInstruction,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    ComputeBudgetProgram,
    VersionedTransaction, // Import VersionedTransaction
    TransactionMessage, // Import TransactionMessage
    Transaction
  } from '@solana/web3.js';
  import { 
    Rpc, 
    sendAndConfirmTx, // Keep sendAndConfirmTx
    LightSystemProgram, 
    bn, // Keep bn helper
    createRpc, // Import createRpc
    ActiveTreeBundle // Import ActiveTreeBundle
  } from '@lightprotocol/stateless.js';
  // import { TOKEN_PROGRAM_ID } from '@solana/spl-token'; // Already likely in constants
  
  // Assuming @lightprotocol/compressed-token is installed
  // If not, run: npm install @lightprotocol/compressed-token
  import { CompressedTokenProgram } from '@lightprotocol/compressed-token'; 
  
  import { 
    Pool, 
    TokenType, 
    PoolDenomination,
    DepositParams, 
    DepositResult, 
    DepositNoteData // Import DepositNoteData
  } from './types'; 
  
  // Import errors and constants from the correct path
  import {
    PROGRAM_ID,
    TOKEN_PROGRAM_IDS,
    LIGHT_SYSTEM_PROGRAM_ID, // Already imported via stateless.js? Check consistency
    ACCOUNT_COMPRESSION_PROGRAM_ID,
    PUBLIC_STATE_TREE_ID,
    DEFAULT_COMPUTE_UNIT_LIMIT, // Import constant
    SolanaVeilError, // Import error class
    ErrorCode // Import error codes
  } from '../constants'; // Correct path to constants.ts
  
  // Use CommonJS import style for bn.js
  import * as BN from 'bn.js'; // Changed import style
  
  // Assuming PoolManager, MerkleTreeManager are correctly imported/defined elsewhere
  import { PoolManager } from './pool';
  import { MerkleTreeManager } from '../compression/merkle';
  
  // Assuming these utils exist at the specified path
  // If not, create them or adjust paths
  import { poseidonHash } from '../utils/hash'; 
  // Import the note generation utility
  import { generateDepositNoteString } from '../utils/note'; // Corrected path

  import { pickRandomTreeAndQueue } from '../utils/tree'; // Verify path is correct
  
  // ... (rest of the interfaces like DepositParams, DepositResult if not imported from types.ts) ...
  
  export class DepositManager {
    private rpc: Rpc;
    private programId: PublicKey;
    private poolManager: PoolManager;
    private merkleTreeManager: MerkleTreeManager;
  
    /**
     * Constructor for DepositManager
     */
    constructor(
      rpc: Rpc, 
      poolManager: PoolManager,
      merkleTreeManager: MerkleTreeManager,
      programId: PublicKey = PROGRAM_ID // Use imported PROGRAM_ID
    ) {
      this.rpc = rpc;
      this.programId = programId;
      this.poolManager = poolManager;
      this.merkleTreeManager = merkleTreeManager;
    }
  
    /**
     * Deposit funds into a privacy pool
     */
    async deposit(params: DepositParams): Promise<DepositResult> {
      const { amount, tokenType, payer, recipient } = params;
  
      try {
        // 1. Get pool
        const pool = await this.poolManager.getPool(amount, tokenType);
        
        // 2. Generate deposit secrets
        const secret = crypto.getRandomValues(new Uint8Array(32));
        const nullifier = crypto.getRandomValues(new Uint8Array(32));
        
        // 3. Calculate commitment hash
        const commitmentBuffer = poseidonHash([secret, nullifier]);
        const commitmentHex = commitmentBuffer.toString('hex');
        
        // 4. Select state tree
        const stateTrees = await this.merkleTreeManager.getActiveStateTrees();
        const stateTreeBundle = await this.pickStateTree(stateTrees); // Now async
        
        // 5. Build deposit transaction
        const depositTx = await this.buildDepositTransaction({
          amount,
          tokenType,
          payerPublicKey: payer.publicKey,
          commitmentHex,
          pool,
          stateTree: stateTreeBundle.tree, // Use the 'tree' property from ActiveTreeBundle
          recipient // Pass recipient if provided
        });
        
        // 6. Build, sign, and send the transaction using VersionedTransaction
        const latestBlockhash = await this.rpc.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
            payerKey: payer.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: depositTx.instructions, // Assuming buildDepositTransaction returns legacy Transaction
        }).compileToV0Message();
        const versionedTx = new VersionedTransaction(messageV0);
        versionedTx.sign([payer]); // Sign with the payer

        // Use sendAndConfirmTx with VersionedTransaction
        const signature = await sendAndConfirmTx(this.rpc, versionedTx); // Pass VersionedTransaction
        
        // 7. Generate deposit note string
        const noteData: DepositNoteData = {
          pool: pool.address,
          tokenType,
          amount,
          secret,
          nullifier,
          timestamp: Math.floor(Date.now() / 1000),
          recipient
        };
        const noteString = generateDepositNoteString(noteData);
        
        // 8. Return deposit result
        return {
          signature,
          note: noteString,
          commitment: commitmentHex,
          amount,
          tokenType
        };
      } catch (error) {
        if (error instanceof SolanaVeilError) {
          throw error;
        }
        
        throw new SolanaVeilError(
          ErrorCode.CONNECTION_ERROR,
          `Failed to process deposit: ${error instanceof Error ? error.message : String(error)}`,
          error
        );
      }
    }
  
    /**
     * Build the deposit transaction using Light Protocol instructions
     * Returns a legacy Transaction object containing the instructions.
     */
    private async buildDepositTransaction(params: {
      amount: PoolDenomination;
      tokenType: TokenType;
      payerPublicKey: PublicKey;
      commitmentHex: string;
      pool: Pool;
      stateTree: PublicKey;
      recipient?: PublicKey; // Optional recipient for the compressed account
    }): Promise<Transaction> { // Return legacy Transaction
      const { 
        amount, 
        tokenType, 
        payerPublicKey, 
        commitmentHex, 
        pool, 
        stateTree,
        recipient 
      } = params;
      
      const transaction = new Transaction(); // Create legacy Transaction
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: DEFAULT_COMPUTE_UNIT_LIMIT })
        // Add priority fee instruction if needed
      );
      
      // Determine the owner of the new compressed account
      const compressedAccountOwner = recipient || payerPublicKey;
      
      if (tokenType === TokenType.SOL) {
        // Calculate amount in lamports based on denomination
        const lamports = this.denominationToLamports(amount);
        
        // Use LightSystemProgram.compress for SOL deposits
        const compressIx = await LightSystemProgram.compress({
          payer: payerPublicKey,
          toAddress: compressedAccountOwner,
          lamports: lamports,
          outputStateTree: stateTree,
        });
        
        transaction.add(compressIx);
      } else if (tokenType === TokenType.USDC) {
        // For token deposits, would need to get the token account and 
        // implement token-specific deposit logic using CompressedTokenProgram
        throw new Error("Token deposits not implemented yet");
      } else {
        throw new Error(`Unsupported token type: ${tokenType}`);
      }
      
      return transaction;
    }
    
    /**
     * Helper to convert PoolDenomination to lamports amount
     */
    private denominationToLamports(denomination: PoolDenomination): BN {
      switch (denomination) {
        case PoolDenomination.SOL_1:
          return new BN(1_000_000_000); // 1 SOL
        case PoolDenomination.SOL_10:
          return new BN(10_000_000_000); // 10 SOL
        case PoolDenomination.SOL_100:
          return new BN(100_000_000_000); // 100 SOL
        case PoolDenomination.USDC_100:
          return new BN(100_000_000); // 100 USDC (with 6 decimals)
        case PoolDenomination.USDC_1000:
          return new BN(1_000_000_000); // 1000 USDC (with 6 decimals)
        default:
          throw new Error(`Unsupported denomination: ${denomination}`);
      }
    }
  
    /**
     * Pick an appropriate state tree for storing a new commitment.
     * Fetches tree data to check capacity and fill level.
     * 
     * @param stateTrees - Available state tree bundles.
     * @returns The selected state tree bundle.
     */
    private async pickStateTree(stateTrees: ActiveTreeBundle[]): Promise<ActiveTreeBundle> { // Made async
      let availableTreesInfo: { treeBundle: ActiveTreeBundle; leafCount: number }[] = [];
  
      for (const treeBundle of stateTrees) {
        // Fetch deserialized data using MerkleTreeManager
        const treeData = await this.merkleTreeManager.getTreeAccountData(treeBundle.tree); 
        if (!treeData) {
          console.warn(`Could not get data for tree: ${treeBundle.tree.toBase58()}`);
          continue; // Skip this tree if data fetch failed
        }
        
        try {
            const capacity = 2 ** treeData.maxDepth;
            // Use rightMostIndex + 1 for leaf count (assuming 0-based index)
            const leafCount = treeData.rightMostIndex + 1; 
            const isFull = leafCount >= capacity;
    
            if (!isFull) {
              availableTreesInfo.push({ treeBundle, leafCount });
            }
        } catch (e) {
            console.error(`Failed to process tree data for ${treeBundle.tree.toBase58()}:`, e);
        }
      }
      
      if (availableTreesInfo.length === 0) {
        throw new SolanaVeilError(ErrorCode.NO_AVAILABLE_TREE, 'No available (non-full) state trees found');
      }
      
      // Select the tree with the most leaves for better anonymity
      availableTreesInfo.sort((a, b) => b.leafCount - a.leafCount); // Sort descending by leafCount
      return availableTreesInfo[0].treeBundle;
    }
  }