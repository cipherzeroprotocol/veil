/**
 * Proof Generation module for SolanaVeil ZK Compression
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { 
  Rpc, 
  bn, 
  CompressedProofWithContext, 
  HashWithTree, 
  AddressWithTree,
  MerkleContextWithMerkleProof, // For deposit data generation context
  CompressedAccountWithMerkleContext, // For deposit data generation context
  BN254, // Import BN254 type alias for BN
} from '@lightprotocol/stateless.js';
import * as BN from 'bn.js'; // Use * as import for BN
import { PoolDenomination, TokenType } from './privacy-mixers'; // Import enums
import { NOTE_PREFIX, DEPOSIT_NOTE_VERSION } from '../constants';
import { poseidonHash } from '../utils/hash';
import { WithdrawalProof } from './types';

// Local type for the proof response expected by other parts of the SDK
export interface ValidityProofResponse {
  compressedProof: { // Matches CompressedProof structure
    a: number[];
    b: number[];
    c: number[];
  };
  roots: string[]; // Store roots as hex strings
  rootIndices: number[];
  leafIndices: number[];
  leaves: string[]; // Store leaves as hex strings
  merkleTrees: PublicKey[];
  nullifierQueues: PublicKey[];
  // merkleContext?: MerkleContextWithMerkleProof; // Removed as it's not in CompressedProofWithContext
}

// ... (Keep DepositData and WithdrawalProofParams interfaces) ...

/**
 * ProofGenerator class for generating ZK proofs
 */
export class ProofGenerator {
  private rpc: Rpc;

  /**
   * Constructor for ProofGenerator
   * 
   * @param rpc - The RPC connection to use
   */
  constructor(rpc: Rpc) {
    this.rpc = rpc;
  }

  /**
   * Generate a validity proof for a set of input accounts and new addresses
   * 
   * @param inputAccounts - Array of input accounts with their Merkle context
   * @param newAddresses - Array of new addresses being created
   * @returns The validity proof response
   */
  async generateValidityProof(
    inputAccounts: CompressedAccountWithMerkleContext[],
    newAddresses: AddressWithTree[] // Expect AddressWithTree objects
  ): Promise<ValidityProofResponse> {
    try {
      // Map input accounts to HashWithTree structure
      const hashesWithTree: HashWithTree[] = inputAccounts.map(account => ({
        hash: bn(account.hash), // Ensure hash is BN
        tree: account.merkleTree,
        queue: account.nullifierQueue,
      }));

      // Call getValidityProofV0 with the correctly structured arrays
      const proofContext: CompressedProofWithContext = await this.rpc.getValidityProofV0(
        hashesWithTree, // Pass the array of HashWithTree
        newAddresses   // Pass the array of AddressWithTree
      );

      // Map the result to the local ValidityProofResponse type
      return {
        compressedProof: proofContext.compressedProof,
        roots: proofContext.roots.map(r => r.toString(16)), // Convert BN roots to hex strings
        rootIndices: proofContext.rootIndices,
        leafIndices: proofContext.leafIndices,
        leaves: proofContext.leaves.map(l => l.toString(16)), // Convert BN leaves to hex strings
        merkleTrees: proofContext.merkleTrees,
        nullifierQueues: proofContext.nullifierQueues,
      };
    } catch (error) {
      console.error('Error generating validity proof:', error);
      throw error;
    }
  }

  /**
   * Generate a withdrawal proof (Placeholder - Actual generation is complex)
   * This function likely calls an external service or a WASM module.
   * Ensure the parameters match the requirements of the actual prover.
   */
  async generateWithdrawalProof(params: {
    merkleRoot: string;
    nullifier: Uint8Array; // Raw nullifier bytes
    secret: Uint8Array;    // Raw secret bytes
    siblings: string[];    // Merkle proof siblings
    pathIndices: number[]; // Merkle proof path indices (0 or 1)
    recipient: PublicKey;
    relayerAddress: PublicKey;
    fee: BN; // Use BN
    // Add other necessary inputs like refund, poolId, etc.
  }): Promise<WithdrawalProof> { // Use the type defined in compression/types.ts
    // ... existing placeholder logic ...
    // This function remains largely a placeholder or interface to an external prover.
    // The key is ensuring the `params` match what the prover expects.
    
    // Placeholder return matching the WithdrawalProof interface
    return {
      proof: new Uint8Array(0), // Placeholder for actual proof data (e.g., Groth16 format)
      publicInputs: {
        root: params.merkleRoot,
        // Nullifier hash needs to be calculated correctly based on circuit inputs
        nullifierHash: poseidonHash([params.nullifier]).toString('hex'), // Example calculation
        recipient: params.recipient,
        relayer: params.relayerAddress,
        fee: BigInt(params.fee.toString()), // Convert BN to bigint
        refund: BigInt(0) // Example refund value
      }
    };
  }

  /**
   * Load the verification key for a specific circuit
   * 
   * @param circuitType - The type of circuit
   * @returns The verification key
   */
  async loadVerificationKey(circuitType: 'withdraw' | 'merkle'): Promise<object> {
    // In a real implementation, this would load the verification key
    // from a file or fetch it from an API
    
    return {};
  }

  /**
   * Verify a proof locally (for client-side verification)
   * 
   * @param proof - The proof to verify
   * @param publicInputs - The public inputs to the proof
   * @param verificationKey - The verification key
   * @returns Whether the proof is valid
   */
  async verifyProof(
    proof: Uint8Array,
    publicInputs: string[],
    verificationKey: object
  ): Promise<boolean> {
    try {
      // In a real implementation, this would:
      // 1. Use snarkjs or similar to verify the proof
      // 2. Return whether verification succeeded
      
      return true;
    } catch (error) {
      console.error('Error verifying proof:', error);
      throw error;
    }
  }

  /**
   * Generate a deposit note string and calculate the commitment hash.
   * Uses Poseidon hash for commitment.
   * 
   * @param params - Parameters for the note.
   * @returns The deposit note string and commitment hash (hex string).
   */
  generateDepositData(params: {
    pool: PublicKey; // Pool address is needed for context/uniqueness
    tokenType: TokenType;
    amount: PoolDenomination; // Use the enum type
    recipient?: PublicKey; // Optional fixed recipient
  }): { note: string; commitment: string; secret: Uint8Array; nullifier: Uint8Array } {
    // Generate cryptographically random secret and nullifier
    const secret = Keypair.generate().secretKey.slice(0, 32);
    const nullifier = Keypair.generate().secretKey.slice(0, 32);
    const timestamp = Math.floor(Date.now() / 1000);

    // Calculate commitment hash using Poseidon (adjust inputs based on circuit)
    const commitmentBuffer = poseidonHash([secret, nullifier]); // Example inputs
    const commitment = commitmentBuffer.toString('hex');
    
    // Format the note string including all necessary parts
    // Format: prefix-version-pool-type-amount-secret-nullifier-timestamp(-recipient)
    const noteParts = [
      NOTE_PREFIX,
      `v${DEPOSIT_NOTE_VERSION}`,
      params.pool.toBase58(),
      params.tokenType,
      params.amount.toString(),
      Buffer.from(secret).toString('hex'),
      Buffer.from(nullifier).toString('hex'),
      timestamp.toString()
    ];
    if (params.recipient) {
      noteParts.push(params.recipient.toBase58());
    }
    const note = noteParts.join('-');
    
    return { note, commitment, secret, nullifier };
  }

  /**
   * Parse a deposit note string into its components.
   * 
   * @param note - The deposit note string.
   * @returns The parsed data from the note.
   */
  parseDepositNote(note: string): {
    pool: PublicKey;
    tokenType: TokenType;
    amount: number; // Keep as number matching PoolDenomination values
    secret: Uint8Array;
    nullifier: Uint8Array;
    timestamp: number;
    recipient?: PublicKey;
  } {
    const parts = note.split('-');
    
    // Validate prefix and version
    if (parts.length < 8 || parts[0] !== NOTE_PREFIX || parts[1] !== `v${DEPOSIT_NOTE_VERSION}`) {
      throw new Error('Invalid note format or version');
    }
    
    try {
      const pool = new PublicKey(parts[2]);
      const tokenType = parts[3] as TokenType;
      const amount = parseInt(parts[4], 10);
      const secret = Buffer.from(parts[5], 'hex');
      const nullifier = Buffer.from(parts[6], 'hex');
      const timestamp = parseInt(parts[7], 10);
      
      let recipient: PublicKey | undefined;
      if (parts.length > 8) {
        recipient = new PublicKey(parts[8]);
      }

      // Basic validation
      if (!Object.values(TokenType).includes(tokenType)) throw new Error('Invalid token type');
      if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');
      if (isNaN(timestamp)) throw new Error('Invalid timestamp');
      if (secret.length !== 32) throw new Error('Invalid secret length');
      if (nullifier.length !== 32) throw new Error('Invalid nullifier length');

      return {
        pool,
        tokenType,
        amount, // Return as number
        secret,
        nullifier,
        timestamp,
        recipient
      };
    } catch (e) {
       throw new Error(`Failed to parse note: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}