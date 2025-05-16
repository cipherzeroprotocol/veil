/**
 * Merkle Tree module for SolanaVeil ZK Compression
 */

import { Commitment, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { 
  Rpc, 
  bn, 
  MerkleContextWithMerkleProof, 
  CompressedAccountWithMerkleContext, 
  ActiveTreeBundle,
  CompressedProof, // Import CompressedProof type
  BN254, // Import BN254 type alias for BN
} from '@lightprotocol/stateless.js';
// Import MerkleProof from core types and CompressedAccount from local types
import { MerkleProof } from '../core/types'; 
import { Buffer } from 'buffer';
import * as BN from 'bn.js'; // Use * as import for BN

// System program ID for Light Protocol's system program that handles ZK compression
export const LIGHT_SYSTEM_PROGRAM_ID = new PublicKey('SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7');

// Compression program ID
const ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('compr6CUsB5m2jS4Y3831ztGSTnKJTKS95d64XVq');

// Public state tree for the protocol
const PUBLIC_STATE_TREE_ID = new PublicKey('smt1NamzXdq4AMqS2fS2F1i5KTYPZRhoHgWx38d8WsT');

/**
 * Placeholder structure for deserialized Merkle Tree account data.
 * Replace with the actual structure based on the on-chain program.
 */
interface DeserializedMerkleTreeData {
  root: Buffer; // Assuming root is stored as a Buffer/bytes
  maxDepth: number;
  rightMostIndex: number; // Assuming this represents the index of the last leaf inserted
  // Add other relevant fields based on the actual account structure
}

/**
 * Placeholder function to deserialize Merkle tree account data.
 * Replace with actual deserialization logic based on the on-chain program's state struct.
 * @param data - The raw account data buffer.
 * @returns Deserialized tree data.
 */
function deserializeMerkleTreeAccount(data: Buffer): DeserializedMerkleTreeData {
  // *** Placeholder Implementation ***
  // Replace this with actual deserialization logic (e.g., using Borsh or BufferLayout)
  // Example: Assuming root (32 bytes), maxDepth (u32 LE), rightMostIndex (u64 LE)
  if (data.length < 44) { // 32 (root) + 4 (depth) + 8 (index)
      console.warn("Merkle tree data buffer too small for placeholder deserialization.");
      // Return default/error values appropriate for your actual layout
      return { root: Buffer.alloc(32), maxDepth: 0, rightMostIndex: -1 }; 
  }
  const root = data.slice(0, 32); // Adjust offset if needed
  const maxDepth = data.readUInt32LE(32); // Adjust offset if needed
  // Use readBigUInt64LE for u64, convert to number if safe, otherwise handle BigInt
  const rightMostIndex = Number(data.readBigUInt64LE(36)); // Adjust offset if needed
  return { root, maxDepth, rightMostIndex };
  // *********************************
}


/**
 * MerkleTreeManager class for interacting with Solana Merkle trees
 */
export class MerkleTreeManager {
  private rpc: Rpc;
  private commitment: Commitment;

  /**
   * Constructor for MerkleTreeManager
   * 
   * @param rpc - The RPC connection to use
   * @param commitment - The commitment level to use
   */
  constructor(rpc: Rpc, commitment: Commitment = 'confirmed') {
    this.rpc = rpc;
    this.commitment = commitment;
  }

  /**
   * Get the active state trees from the RPC
   * 
   * @returns An array of active state tree bundles
   */
  async getActiveStateTrees(): Promise<ActiveTreeBundle[]> { 
    try {
      // Use the Rpc instance's method to get active trees
      // Assuming getActiveMerkleTreeV1 or a similar method exists based on previous context
      // If using lookup tables, use getLightStateTreeInfo directly or via Rpc wrapper
      const trees = await this.rpc.getLatestActiveStateTreeInfo(); // Use the method that fetches ActiveTreeBundle[]
      return trees;
    } catch (error) {
      console.error('Error getting active state trees:', error);
      throw error; // Re-throw or handle appropriately
    }
  }

  /**
   * Get the Merkle proof for a given commitment hash
   * 
   * @param commitmentHash - The commitment hash (hex string or BN)
   * @returns The Merkle proof object matching the local MerkleProof type
   */
  async getMerkleProof(commitmentHash: string | BN): Promise<MerkleProof> {
    try {
      const commitmentBN = typeof commitmentHash === 'string' ? bn(commitmentHash, 'hex') : commitmentHash;
      // Call method directly on rpc instance
      const merkleContext = await this.rpc.getCompressedAccountProof(commitmentBN); 
      
      if (!merkleContext) { // Check if context is null/undefined
        throw new Error(`Merkle proof not found for commitment: ${commitmentBN.toString(16)}`);
      }
      
      // Map the BN array proof to hex strings
      return {
        root: merkleContext.root.toString(16), 
        siblings: merkleContext.merkleProof.map((p: BN254) => p.toString(16)), // Map BN proof elements to hex strings
        leafIndex: merkleContext.leafIndex 
      };
    } catch (error) {
      console.error('Error getting Merkle proof:', error);
      throw error;
    }
  }

  /**
   * Get a compressed account by its commitment hash
   * 
   * @param commitmentHash - The commitment hash (hex string or BN)
   * @returns The compressed account details including Merkle context from stateless.js
   */
  async getCompressedAccount(commitmentHash: string | BN): Promise<CompressedAccountWithMerkleContext | null> {
    try {
      const commitmentBN = typeof commitmentHash === 'string' ? bn(commitmentHash, 'hex') : commitmentHash;
      // Call method directly on rpc instance
      const compressedAccountContext = await this.rpc.getCompressedAccount(undefined, commitmentBN); // Use getCompressedAccount
      
      // Return the result directly, or null if not found
      return compressedAccountContext;

    } catch (error) {
      // Handle specific RPC errors if needed, otherwise return null or rethrow
      if (error instanceof Error && error.message.includes('Account not found')) { // Example error check
         return null;
      }
      console.error('Error getting compressed account:', error);
      // Decide whether to return null or rethrow based on desired behavior
      // Returning null indicates not found or error during fetch
      return null;
      // throw error; // Or rethrow
    }
  }

  /**
   * Fetches and deserializes the account data for a given Merkle tree.
   * 
   * @param treeId - The public key of the Merkle tree account.
   * @returns The deserialized tree data, or null if the account is not found or deserialization fails.
   */
  async getTreeAccountData(treeId: PublicKey): Promise<DeserializedMerkleTreeData | null> {
    try {
      const accountInfo = await this.rpc.getAccountInfo(treeId, this.commitment);
      if (!accountInfo) {
        console.warn(`Merkle tree account not found: ${treeId.toBase58()}`);
        return null;
      }
      return deserializeMerkleTreeAccount(accountInfo.data);
    } catch (error) {
      console.error(`Error fetching or deserializing tree account ${treeId.toBase58()}:`, error);
      return null;
    }
  }


  /**
   * Get the latest Merkle root for a specific tree by fetching and deserializing its account data.
   * 
   * @param treeId - The public key of the Merkle tree
   * @returns The latest root hash as a hex string, or null if error.
   */
  async getLatestRoot(treeId: PublicKey = PUBLIC_STATE_TREE_ID): Promise<string | null> {
    try {
      const treeData = await this.getTreeAccountData(treeId);
      if (!treeData) {
        return null; // Error handled in getTreeAccountData
      }
      return treeData.root.toString('hex');
    } catch (error) {
      console.error('Error getting latest Merkle root:', error);
      return null; // Return null on unexpected errors
    }
  }

  /**
   * Verify a Merkle proof for a compressed account
   * 
   * @param proof - The Merkle proof to verify
   * @returns Whether the proof is valid
   */
  async verifyMerkleProof(proof: MerkleProof): Promise<boolean> {
    // In a real implementation, this would perform cryptographic verification
    // For now, we'll trust the proof from the RPC
    return true;
  }

  /**
   * Create an instruction to write to a compressed account
   * This is a simplified version - actual implementation would be more complex
   * 
   * @param params - Parameters for the write operation
   * @returns A transaction instruction
   */
  async createWriteInstruction(params: {
    payer: PublicKey;
    treeId: PublicKey;
    leafIndex?: number;
    data: Buffer;
    address?: PublicKey;
    owner: PublicKey;
  }): Promise<TransactionInstruction> {
    // This is a simplified placeholder for what would be a more complex instruction
    // The actual implementation would involve creating proper ZK proofs and instructions
    
    // In a real implementation, we would:
    // 1. Get the current tree state
    // 2. Create a proof for the write
    // 3. Create an instruction that includes the proof and new data
    
    return new TransactionInstruction({
      keys: [
        { pubkey: params.payer, isSigner: true, isWritable: true },
        { pubkey: params.treeId, isSigner: false, isWritable: true },
        { pubkey: params.owner, isSigner: true, isWritable: false }
      ],
      programId: LIGHT_SYSTEM_PROGRAM_ID,
      data: Buffer.from([]), // Simplified - would contain proper serialized data
    });
  }

  /**
   * Calculate the hash of a compressed account
   * 
   * @param data - The account data
   * @param owner - The owner of the account
   * @returns The hash of the account
   */
  calculateAccountHash(data: Buffer, owner: PublicKey): string {
    // This is a simplified placeholder
    // In a real implementation, this would use the appropriate hash function
    // matching what's used on-chain
    
    // The actual hash calculation would involve:
    // 1. Serializing the account data properly
    // 2. Applying the appropriate hash function (e.g., Poseidon or Pedersen)
    
    return "account_hash_placeholder";
  }

  /**
   * Check if a commitment hash exists in the Merkle tree
   * 
   * @param commitmentHash - The commitment hash (hex string or BN)
   * @returns True if the commitment exists, false otherwise
   */
  async commitmentExists(commitmentHash: string | BN): Promise<boolean> {
    try {
      // Use getCompressedAccount - if it returns non-null, it exists
      const commitmentBN = typeof commitmentHash === 'string' ? bn(commitmentHash, 'hex') : commitmentHash;
      const compressedAccount = await this.rpc.getCompressedAccount(undefined, commitmentBN); // Use getCompressedAccount
      return !!compressedAccount; // Return true if account is found, false otherwise
    } catch (error) {
      // Handle specific errors, e.g., if the RPC throws when not found
      // console.error(`Error checking commitment ${commitmentHash}:`, error);
      return false; // Assume not found if error occurs
    }
  }
}