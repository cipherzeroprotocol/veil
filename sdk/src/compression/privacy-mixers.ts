/**
 * Privacy Mixer implementation for SolanaVeil using ZK Compression
 * 
 * This module combines the components of the compression module
 * into a privacy-focused mixer utility.
 */

import { 
    PublicKey, 
    TransactionInstruction, 
    Signer,
    Keypair,
    VersionedTransaction, // Import VersionedTransaction
    TransactionMessage // Import TransactionMessage
  } from '@solana/web3.js';
  // Import sendAndConfirmTx correctly and ActiveTreeBundle
  import { Rpc, sendAndConfirmTx, ActiveTreeBundle } from '@lightprotocol/stateless.js'; 
  import { 
    MerkleTreeManager, 
    NullifierSetManager, 
    ProofGenerator,
      // Add PoolManager import
  } from './index';
  import * as BN from 'bn.js'; // Import BN using CommonJS-style
  import { poseidonHash } from '../utils/hash'; // Assuming Poseidon hash utility
  import { PoolDenomination, TokenType } from '../core/types'; // Import from core/types
import { LIGHT_SYSTEM_PROGRAM_ID } from '../constants';
import { PoolManager } from '../core/pool';
  
  /**
   * Structure of a deposit note needed for withdrawal
   */
  export interface DepositNote {
    pool: PublicKey; // Added pool to match generateDepositData output
    amount: number; // Use number to match PoolDenomination
    tokenType: TokenType;
    secret: Uint8Array;
    nullifier: Uint8Array;
    timestamp: number;
    recipient?: PublicKey;
  }
  
  /**
   * PrivacyMixer class for SolanaVeil
   */
  export class PrivacyMixer {
    private rpc: Rpc;
    private merkleTree: MerkleTreeManager;
    private nullifierSet: NullifierSetManager;
    private proofGenerator: ProofGenerator;
    private poolManager: PoolManager; // Add poolManager property
    
    /**
     * Constructor for PrivacyMixer
     * 
     * @param rpc - The RPC connection to use
     */
    constructor(rpc: Rpc) {
      this.rpc = rpc;
      this.merkleTree = new MerkleTreeManager(rpc);
      this.nullifierSet = new NullifierSetManager(rpc);
      this.proofGenerator = new ProofGenerator(rpc);
      this.poolManager = new PoolManager(rpc, this.merkleTree); // Initialize poolManager
    }
    
    /**
     * Get the pool address for a specific denomination
     * 
     * @param denomination - The pool denomination
     * @param tokenType - The token type (SOL or USDC)
     * @returns The pool address
     */
    getPoolAddress(denomination: PoolDenomination, tokenType: TokenType): PublicKey {
      // Real implementation to derive the program-derived address (PDA)
      const seeds = [
        Buffer.from("pool"),
        Buffer.from([denomination]),
        Buffer.from([tokenType])
      ];
      
      try {
        // Generate a program derived address deterministically
        const [poolAddress] = PublicKey.findProgramAddressSync(
          seeds,
          LIGHT_SYSTEM_PROGRAM_ID
        );
        return poolAddress;
      } catch (error) {
        console.error("Error deriving pool address:", error);
        throw error;
      }
    }
    
    /**
     * Deposit funds into a privacy pool
     * 
     * @param params - Deposit parameters
     * @returns The transaction signature and deposit note
     */
    async deposit(params: {
      amount: PoolDenomination;
      tokenType: TokenType;
      payer: Signer; // Payer needs to be a Signer
      recipient?: PublicKey; // Optional fixed recipient (reduces anonymity set)
    }): Promise<{ signature: string; note: string }> {
      try {
        // 1. Get the pool address
        const poolAddress = this.getPoolAddress(params.amount, params.tokenType);
        
        // 2. Generate deposit data (Corrected function name)
        const depositData = this.proofGenerator.generateDepositData({
          pool: poolAddress, // Pass pool address
          amount: params.amount, // Pass amount directly
          tokenType: params.tokenType,
          recipient: params.recipient
        });
        
        // 3. Get active state trees and pick one
        const stateTrees = await this.merkleTree.getActiveStateTrees();
        const stateTreeBundle = await this.pickStateTree(stateTrees); // Now async
        
        // 4. Create the deposit instruction
        const depositIx = await this.createDepositInstruction({
          amount: params.amount,
          tokenType: params.tokenType,
          payer: params.payer.publicKey,
          commitment: depositData.commitment, // Use commitment from generated data
          poolAddress,
          stateTree: stateTreeBundle.tree // Use the 'tree' property from ActiveTreeBundle
        });
        
        // 5. Build, sign, and send the transaction
        const latestBlockhash = await this.rpc.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
            payerKey: params.payer.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [depositIx], // Array of instructions
        }).compileToV0Message();
        const versionedTx = new VersionedTransaction(messageV0);
        versionedTx.sign([params.payer]); // Sign with the payer

        // Use sendAndConfirmTx which returns the signature string
        const signature = await sendAndConfirmTx(this.rpc, versionedTx); 
        
        return {
          signature, // Directly use the returned signature
          note: depositData.note // Use note from generated data
        };
      } catch (error) {
        console.error('Error making deposit:', error);
        throw error; // Re-throw or handle appropriately
      }
    }
    
    /**
     * Withdraw funds from a privacy pool
     * 
     * @param params - Withdrawal parameters
     * @returns The transaction signature
     */
    async withdraw(params: {
      note: string;
      recipient: PublicKey;
      payer: Signer; // Payer needs to be a Signer
      relayer?: PublicKey; // Optional relayer for gas-less withdrawals
      relayerFee?: bigint; // Fee to pay the relayer
    }): Promise<string> { // Return signature string
      try {
        // 1. Parse the deposit note
        const parsedNote = this.proofGenerator.parseDepositNote(params.note);
        
        // 2. Get the pool address
        const poolAddress = this.getPoolAddress(
          parsedNote.amount as PoolDenomination, // Cast amount back to enum if needed
          parsedNote.tokenType
        );
        
        // 3. Generate the nullifier hash
        const nullifierHash = this.nullifierSet.createNullifier(
          parsedNote.nullifier,
          poolAddress
        );
        
        // 4. Check if the nullifier has already been spent
        const isSpent = await this.nullifierSet.checkNullifier(nullifierHash);
        if (isSpent) {
          throw new Error('This note has already been spent');
        }
        
        // 5. Get the latest Merkle root for the pool
        const merkleRoot = await this.merkleTree.getLatestRoot(poolAddress); // Use poolAddress or derived tree address
        
        // 6. Get the Merkle proof path for the commitment
        // (Placeholder - Requires finding the commitment hash first)
        const commitmentHash = "commitment_placeholder"; // Need to calculate this from note
        const merkleProof = await this.merkleTree.getMerkleProof(commitmentHash);
        
        // 7. Generate the withdrawal proof
        const relayer = params.relayer || params.payer.publicKey;
        const fee = params.relayerFee || BigInt(0);
        const feeBN = new BN(fee.toString()); // Convert bigint fee to BN for proof generator if needed

        const withdrawalProof = await this.proofGenerator.generateWithdrawalProof({
          merkleRoot: merkleProof.root, // Use root from the fetched proof
          nullifier: parsedNote.nullifier, // Pass raw nullifier bytes (Corrected parameter name)
          secret: parsedNote.secret,
          siblings: merkleProof.siblings,
          pathIndices: [], // Placeholder - calculate properly
          recipient: params.recipient,
          relayerAddress: relayer,
          fee: feeBN, // Pass fee as BN
          // refund: BigInt(0), // Add refund if needed by proof generator
        });
        
        // 8. Create the withdrawal instruction
        const withdrawIx = await this.createWithdrawInstruction({
          poolAddress,
          nullifierHash, // Pass the hex string hash
          proof: withdrawalProof.proof, // Pass the proof part
          recipient: params.recipient,
          relayer,
          payer: params.payer.publicKey,
          amount: BigInt(parsedNote.amount), // Convert amount to bigint
          tokenType: parsedNote.tokenType,
          fee // Pass fee as bigint
        });
        
        // 9. Build, sign, and send the transaction
        const latestBlockhash = await this.rpc.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
            payerKey: params.payer.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [withdrawIx], // Array of instructions
        }).compileToV0Message();
        const versionedTx = new VersionedTransaction(messageV0);
        versionedTx.sign([params.payer]); // Sign with the payer

        // Use sendAndConfirmTx which returns the signature string
        const signature = await sendAndConfirmTx(this.rpc, versionedTx);
        
        return signature; // Return the signature string
      } catch (error) {
        console.error('Error making withdrawal:', error);
        throw error; // Re-throw or handle appropriately
      }
    }
    
    /**
     * Create a deposit instruction
     * 
     * @param params - Deposit instruction parameters
     * @returns The deposit instruction
     */
    private async createDepositInstruction(params: {
      amount: PoolDenomination;
      tokenType: TokenType;
      payer: PublicKey;
      commitment: string;
      poolAddress: PublicKey;
      stateTree: PublicKey;
    }): Promise<TransactionInstruction> {
      // Get active state trees to find the queue for this state tree
      const activeStateTrees = await this.merkleTree.getActiveStateTrees();
      const stateTreeBundle = activeStateTrees.find(bundle => 
        bundle.tree.equals(params.stateTree)
      );
      
      if (!stateTreeBundle) {
        throw new Error(`State tree ${params.stateTree.toBase58()} not found in active trees`);
      }
      
      // Get the nullifier queue for this state tree
      const nullifierQueue = stateTreeBundle.queue;
      if (!nullifierQueue) {
        throw new Error(`No nullifier queue found for state tree ${params.stateTree.toBase58()}`);
      }
      
      // Construct the instruction with proper data format
      const data = Buffer.concat([
        Buffer.from([0x01]), // Deposit instruction discriminator
        Buffer.from(params.commitment, 'hex'), // The commitment as a hex string converted to bytes
        // Encode amount as a u64 little-endian
        new BN(params.amount).toArrayLike(Buffer, 'le', 8),
      ]);
      
      return new TransactionInstruction({
        keys: [
          { pubkey: params.payer, isSigner: true, isWritable: true },
          { pubkey: params.poolAddress, isSigner: false, isWritable: true },
          { pubkey: params.stateTree, isSigner: false, isWritable: true },
          { pubkey: nullifierQueue, isSigner: false, isWritable: true },
          { pubkey: LIGHT_SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: LIGHT_SYSTEM_PROGRAM_ID,
        data: data,
      });
    }
    
    /**
     * Create a withdrawal instruction
     * 
     * @param params - Withdrawal instruction parameters
     * @returns The withdrawal instruction
     */
    private async createWithdrawInstruction(params: {
      poolAddress: PublicKey;
      nullifierHash: string;
      proof: Uint8Array;
      recipient: PublicKey;
      relayer: PublicKey;
      payer: PublicKey;
      amount: bigint; // Expect bigint
      tokenType: TokenType;
      fee: bigint; // Expect bigint
    }): Promise<TransactionInstruction> {
      // Get the active state trees
      const activeStateTrees = await this.merkleTree.getActiveStateTrees();
      if (activeStateTrees.length === 0) {
        throw new Error("No active state trees found");
      }
      
      // Use the first active state tree
      const stateTree = activeStateTrees[0].tree;
      const nullifierQueue = activeStateTrees[0].queue;
      
      if (!nullifierQueue) {
        throw new Error(`No nullifier queue found for state tree ${stateTree.toBase58()}`);
      }
      
      // Construct the instruction data
      const data = Buffer.concat([
        Buffer.from([0x02]), // Withdraw instruction discriminator
        Buffer.from(params.nullifierHash, 'hex'), // The nullifier hash
        Buffer.from(params.proof), // The zero-knowledge proof
        // Encode amount as a u64 little-endian
        new BN(params.amount.toString()).toArrayLike(Buffer, 'le', 8),
        // Encode fee as a u64 little-endian
        new BN(params.fee.toString()).toArrayLike(Buffer, 'le', 8),
      ]);
      
      return new TransactionInstruction({
        keys: [
          { pubkey: params.payer, isSigner: true, isWritable: true },
          { pubkey: params.poolAddress, isSigner: false, isWritable: true },
          { pubkey: stateTree, isSigner: false, isWritable: true },
          { pubkey: nullifierQueue, isSigner: false, isWritable: true },
          { pubkey: params.recipient, isSigner: false, isWritable: true },
          { pubkey: params.relayer, isSigner: false, isWritable: params.fee > BigInt(0) },
          { pubkey: LIGHT_SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: LIGHT_SYSTEM_PROGRAM_ID,
        data: data,
      });
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
        const treeData = await this.merkleTree.getTreeAccountData(treeBundle.tree); 
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
        throw new Error('No available (non-full) state trees found');
      }
      
      // Select the tree with the most leaves for better anonymity
      availableTreesInfo.sort((a, b) => b.leafCount - a.leafCount); // Sort descending by leafCount
      return availableTreesInfo[0].treeBundle;
    }
    
    /**
     * Selects an appropriate active state tree for a deposit.
     * Prefers trees that are not full by fetching and checking tree account data.
     * 
     * @returns The selected ActiveTreeBundle or null if none are suitable.
     */
    async selectDepositTree(): Promise<ActiveTreeBundle | null> {
      const trees = await this.merkleTree.getActiveStateTrees();
      if (!trees || trees.length === 0) {
        console.warn('No active state trees found.');
        return null;
      }
  
      for (const treeBundle of trees) {
        // Fetch deserialized data using MerkleTreeManager
        const treeData = await this.merkleTree.getTreeAccountData(treeBundle.tree);
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
              return treeBundle; // Return the first non-full tree found
            }
        } catch (e) {
            console.error(`Failed to deserialize or process tree data for ${treeBundle.tree.toBase58()}:`, e);
        }
      }
  
      // If all trees are full or errored, return the first one (or handle as error)
      console.warn('All active state trees appear full or failed to process. Selecting the first available.');
      return trees.length > 0 ? trees[0] : null; // Return null if trees array was initially empty
    }
  
    /**
     * Get the current fill status of a specific state tree by fetching its account data.
     * 
     * @param treeAddress - The public key of the state tree
     * @returns An object with leaf count and capacity, or null if error.
     */
    async getTreeStatus(treeAddress: PublicKey): Promise<{ leafCount: number; capacity: number } | null> {
      // Fetch deserialized data using MerkleTreeManager
      const treeData = await this.merkleTree.getTreeAccountData(treeAddress);
      if (!treeData) {
        // Error already logged in getTreeAccountData
        return null;
      }
  
      try {
        const capacity = 2 ** treeData.maxDepth; 
        // Use rightMostIndex + 1 for leaf count (assuming 0-based index)
        const leafCount = treeData.rightMostIndex + 1; 
    
        return { leafCount, capacity };
      } catch (e) {
        console.error(`Failed to process tree data for ${treeAddress.toBase58()}:`, e);
        return null;
      }
    }
    
    /**
     * Get all pools and their statistics
     * 
     * @returns An array of pool data
     */
    async getPools(): Promise<{
      address: PublicKey;
      denomination: PoolDenomination;
      tokenType: TokenType;
      totalDeposits: number;
      totalWithdrawals: number;
    }[]> {
      // This is still using mock data - implementation needed
      try {
        // Get all pool addresses through the PoolManager
        const pools = await this.poolManager.getAllPools();
        
        const poolStats = [];
        
        for (const pool of pools) {
          // Fetch real statistics for each pool from the blockchain
          const totalDeposits = await this.poolManager.getPoolDepositCount(pool.address);
          const totalWithdrawals = await this.poolManager.getPoolWithdrawalCount(pool.address);
          
          poolStats.push({
            address: pool.address,
            denomination: pool.denomination,
            tokenType: pool.tokenType,
            totalDeposits: totalDeposits.toNumber(),
            totalWithdrawals: totalWithdrawals.toNumber()
          });
        }
        
        return poolStats;
      } catch (error) {
        console.error('Error fetching pool statistics:', error);
        throw new Error(`Failed to get pools: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
export { PoolDenomination, TokenType };

