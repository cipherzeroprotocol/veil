/**
 * Pool management module for SolanaVeil
 */

import {
    PublicKey,
    Signer,
    TransactionInstruction,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Connection, // Import Connection
    Transaction
  } from '@solana/web3.js';
import {
    Rpc,
    createRpc, // Import createRpc
    ActiveTreeBundle, // Import ActiveTreeBundle
    getLightStateTreeInfo,
    nullifiedStateTreeLookupTableDevnet,
    stateTreeLookupTableDevnet, // Import getLightStateTreeInfo
  } from '@lightprotocol/stateless.js';
// import { TOKEN_PROGRAM_ID } from '@solana/spl-token'; // Already likely in constants

import {
    Pool,
    TokenType,
    PoolDenomination,
    PoolCreationParams,
    PoolCreationResult
  } from './types';

// Import errors and constants from the correct path
import {
    PROGRAM_ID,
    TOKEN_PROGRAM_IDS,
    LIGHT_SYSTEM_PROGRAM_ID, // Already imported via stateless.js? Check consistency
    ACCOUNT_COMPRESSION_PROGRAM_ID,
    PUBLIC_STATE_TREE_ID,
    // Assuming these constants exist for lookup tables
   
    SolanaVeilError, // Import error class
    ErrorCode // Import error codes
  } from '../constants'; // Correct path to constants.ts

// Use CommonJS import style for bn.js
import * as BN from 'bn.js'; // Changed import style

// Assuming MerkleTreeManager is correctly imported/defined elsewhere
import { MerkleTreeManager } from '../compression/merkle';

// Placeholder for the actual Pool account data structure layout
// This would typically be defined using libraries like @project-serum/borsh
// or generated from an Anchor IDL
interface PoolAccountData {
  denomination: number; // Store the enum value
  tokenType: number; // Store the enum value (e.g., 0 for SOL, 1 for USDC)
  merkleTree: PublicKey;
  totalDeposits: BN; // Use BN for large numbers
  totalWithdrawals: BN; // Use BN for large numbers
  // Add other fields like admin, fees, etc.
}

export class PoolManager {
  private rpc: Rpc;
  private programId: PublicKey;
  private merkleTreeManager: MerkleTreeManager;

  /**
   * Constructor for PoolManager
   */
  constructor(
    rpc: Rpc, 
    merkleTreeManager: MerkleTreeManager,
    programId: PublicKey = PROGRAM_ID // Use imported PROGRAM_ID
  ) {
    this.rpc = rpc;
    this.programId = programId;
    this.merkleTreeManager = merkleTreeManager;
  }

  /**
   * Derive the Program Derived Address (PDA) for a pool
   */
  async derivePoolAddress(
    denomination: PoolDenomination, 
    tokenType: TokenType
  ): Promise<[PublicKey, number]> {
    const seeds = [
      Buffer.from("solanaveil_pool"),
      Buffer.from(denomination.toString()),
      Buffer.from(tokenType)
    ];
    return PublicKey.findProgramAddress(seeds, this.programId);
  }

  /**
   * Create a new privacy pool
   */
  async createPool(params: PoolCreationParams): Promise<PoolCreationResult> {
    const { denomination, tokenType, admin, payer } = params;

    try {
      // 1. Derive pool PDA
      const [poolAddress, poolBump] = await this.derivePoolAddress(denomination, tokenType);
      
      // 2. Check if pool already exists
      const existingPool = await this.rpc.getAccountInfo(poolAddress);
      if (existingPool) {
        throw new SolanaVeilError(ErrorCode.POOL_ALREADY_EXISTS, `Pool already exists at address: ${poolAddress.toBase58()}`);
      }
      
      // 3. Create a new Merkle tree for the pool (or use a shared one)
      // For simplicity, let's assume we use a shared public tree for now
      // In a real scenario, you might create a dedicated tree per pool
      const merkleTreeAddress = PUBLIC_STATE_TREE_ID; // Use the shared tree
      
      // 4. Build the create pool instruction
      const createPoolIx = await this.buildCreatePoolInstruction({
        denomination,
        tokenType,
        admin,
        payerPublicKey: payer.publicKey,
        poolAddress,
        poolBump,
        merkleTreeAddress
      });
      
      // 5. Build and send transaction (simplified, needs proper signing and sending)
      const transaction = new Transaction().add(createPoolIx);
      transaction.feePayer = payer.publicKey;
      const { blockhash } = await this.rpc.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      // Sign transaction (payer must sign)
      transaction.sign(payer); 
      
      // Send and confirm
      const signature = await this.rpc.sendTransaction(transaction, [payer]);
      await this.rpc.confirmTransaction(signature);
      
      // 6. Return pool creation result
      return {
        signature,
        poolAddress,
        denomination,
        tokenType,
        merkleTree: merkleTreeAddress
      };
    } catch (error) {
      if (error instanceof SolanaVeilError) {
        throw error;
      }
      
      throw new SolanaVeilError(
        ErrorCode.CONNECTION_ERROR,
        `Failed to create pool: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Get pool details by its address
   */
  async getPoolByAddress(poolAddress: PublicKey): Promise<Pool> {
    const accountInfo = await this.rpc.getAccountInfo(poolAddress);
    if (!accountInfo) {
      throw new SolanaVeilError(ErrorCode.POOL_NOT_FOUND, `Pool not found at address: ${poolAddress.toBase58()}`);
    }
    
    // Deserialize account data (Placeholder - needs actual deserialization logic)
    const poolData = this.deserializePoolData(accountInfo.data);
    
    return {
      address: poolAddress,
      denomination: poolData.denomination as PoolDenomination, // Cast back to enum
      tokenType: this.mapTokenTypeFromNumber(poolData.tokenType), // Map number back to enum string
      merkleTree: poolData.merkleTree,
      totalDeposits: poolData.totalDeposits,
      totalWithdrawals: poolData.totalWithdrawals
    };
  }

  /**
   * Get pool details by denomination and token type
   */
  async getPool(denomination: PoolDenomination, tokenType: TokenType): Promise<Pool> {
    const [poolAddress, _] = await this.derivePoolAddress(denomination, tokenType);
    return this.getPoolByAddress(poolAddress);
  }

  /**
   * Get all active pools (Placeholder - needs on-chain query)
   */
  async getAllPools(): Promise<Pool[]> {
    // In a real implementation, this would query all accounts owned by the program
    // and filter/deserialize the ones matching the Pool account structure.
    console.warn("getAllPools is a placeholder and needs on-chain implementation.");
    
    // Example placeholder data:
    const pools: Pool[] = [];
    for (const denom of Object.values(PoolDenomination).filter(v => typeof v === 'number')) {
        for (const token of Object.values(TokenType)) {
            try {
                const pool = await this.getPool(denom as PoolDenomination, token);
                pools.push(pool);
            } catch (e) {
                // Ignore if pool doesn't exist for this combo
                if (!(e instanceof SolanaVeilError && e.code === ErrorCode.POOL_NOT_FOUND)) {
                    console.error(`Error fetching pool for ${denom}/${token}:`, e);
                }
            }
        }
    }
    return pools;
  }

  /**
   * Get the count of deposits for a specific pool
   * 
   * @param poolAddress The address of the pool
   * @returns The total number of deposits as a BN
   */
  async getPoolDepositCount(poolAddress: PublicKey): Promise<BN> {
    try {
      const pool = await this.getPoolByAddress(poolAddress);
      return pool.totalDeposits;
    } catch (error) {
      throw new SolanaVeilError(
        ErrorCode.POOL_NOT_FOUND,
        `Failed to get deposit count: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Get the count of withdrawals for a specific pool
   * 
   * @param poolAddress The address of the pool
   * @returns The total number of withdrawals as a BN
   */
  async getPoolWithdrawalCount(poolAddress: PublicKey): Promise<BN> {
    try {
      const pool = await this.getPoolByAddress(poolAddress);
      return pool.totalWithdrawals;
    } catch (error) {
      throw new SolanaVeilError(
        ErrorCode.POOL_NOT_FOUND,
        `Failed to get withdrawal count: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Get active state trees (using getLightStateTreeInfo)
   */
  async getActiveStateTrees(): Promise<ActiveTreeBundle[]> {
    // Delegate to MerkleTreeManager or directly use RPC if stateless.js provides it
    // Use getLightStateTreeInfo with appropriate lookup table addresses
    // TODO: Make lookup table addresses configurable or detect network
    try {
        return await getLightStateTreeInfo({
            connection: this.rpc, // Pass the underlying Connection object
            stateTreeLookupTableAddress: new PublicKey(stateTreeLookupTableDevnet), // Use configured/detected address
            nullifyTableAddress: new PublicKey(nullifiedStateTreeLookupTableDevnet), // Use configured/detected address
        });
    } catch (error) {
        console.error("Failed to get active state trees using lookup tables:", error);
        // Fallback or rethrow as appropriate
        // As a fallback, maybe return the default test tree if applicable?
        // return localTestActiveStateTreeInfo(); // Only if appropriate for context
        throw new SolanaVeilError(ErrorCode.RPC_ERROR, "Failed to fetch active state trees", error);
    }
  }

  /**
   * Build the instruction to create a new pool account
   * (Placeholder - needs actual instruction format)
   */
  private async buildCreatePoolInstruction(params: {
    denomination: PoolDenomination;
    tokenType: TokenType;
    admin: PublicKey;
    payerPublicKey: PublicKey;
    poolAddress: PublicKey;
    poolBump: number;
    merkleTreeAddress: PublicKey;
  }): Promise<TransactionInstruction> {
    const { 
      denomination, 
      tokenType, 
      admin, 
      payerPublicKey, 
      poolAddress, 
      poolBump, 
      merkleTreeAddress 
    } = params;
    
    // Placeholder: Encode instruction data (e.g., using borsh)
    // This needs to match the on-chain program's expected format
    const instructionData = Buffer.from([]); // Replace with actual encoded data
    
    // Define accounts required by the instruction
    const keys = [
      { pubkey: payerPublicKey, isSigner: true, isWritable: true },
      { pubkey: poolAddress, isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: false, isWritable: false }, // Assuming admin is stored
      { pubkey: merkleTreeAddress, isSigner: false, isWritable: false }, // Assuming tree is just referenced
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      // Add TOKEN_PROGRAM_ID if needed for pool initialization (e.g., creating pool vault)
    ];
    
    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data: instructionData,
    });
  }

  /**
   * Deserialize pool account data (Placeholder)
   */
  private deserializePoolData(data: Buffer): PoolAccountData {
    // Replace with actual deserialization logic (e.g., using borsh)
    console.warn("deserializePoolData is a placeholder and needs implementation.");
    // Example structure (adjust based on actual layout):
    return {
      denomination: data.readUInt32LE(0), // Example: Read enum value
      tokenType: data.readUInt8(4), // Example: Read enum value
      merkleTree: new PublicKey(data.slice(5, 37)), // Example
      totalDeposits: new BN(data.slice(37, 45), 'le'), // Example: 8 bytes for BN
      totalWithdrawals: new BN(data.slice(45, 53), 'le'), // Example: 8 bytes for BN
    };
  }

  /**
   * Map numeric token type from account data back to enum string
   */
  private mapTokenTypeFromNumber(tokenTypeNumber: number): TokenType {
    // Assuming 0 maps to SOL, 1 to USDC, etc. Adjust as needed.
    if (tokenTypeNumber === 0) return TokenType.SOL;
    if (tokenTypeNumber === 1) return TokenType.USDC;
    // Add other mappings
    throw new Error(`Unknown token type number: ${tokenTypeNumber}`);
  }
}