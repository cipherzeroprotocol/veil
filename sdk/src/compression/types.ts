/**
 * Type definitions for the SolanaVeil compression module
 */

import { PublicKey } from '@solana/web3.js';
import * as BN from 'bn.js'; // Use * as import for BN
import { CompressedProof, MerkleContext } from '@lightprotocol/stateless.js'; 

/**
 * Represents a compressed account in the ZK Compression system
 */
export interface CompressedAccount {
  /** The hash of the compressed account */
  hash: string; // Commitment hash
  
  /** The address of the compressed account (optional) */
  address?: PublicKey;
  
  /** The owner of the compressed account */
  owner: PublicKey;
  
  /** The discriminator of the compressed account data (optional, depends on account structure) */
  discriminator?: number[];
  
  /** The raw data of the compressed account (optional, depends on account structure) */
  data?: Buffer;
  
  /** The merkle tree where this account is stored */
  tree: PublicKey; // Changed from treeId to match usage
  
  /** The index of this account in the merkle tree */
  leafIndex: number;
  
  /** The amount in the compressed account */
  amount: BN;
  
  /** The token type in the compressed account */
  tokenType: string; // e.g., 'SOL', 'USDC'
}

/**
 * Parameters for a merkle tree proof
 */
export interface MerkleProof {
  /** The root of the merkle tree */
  root: string;
  
  /** The leaf index in the merkle tree */
  leafIndex: number;
  
  /** The leaf value (account hash) */
  leaf?: string; // Make optional as it might not always be needed/available
  
  /** The sibling hashes forming the merkle proof */
  siblings: string[];
}

/**
 * Represents a nullifier for preventing double-spending
 */
export interface Nullifier {
  /** The nullifier hash */
  hash: string; // The nullifier hash
  
  /** Whether the nullifier has been used */
  isSpent: boolean;
  
  /** When the nullifier was created */
  timestamp?: number; // Optional timestamp when spent
  
  /** The transaction ID where the nullifier was spent */
  transactionId?: string; // Optional transaction ID where spent
}

/**
 * Represents a ZK proof generated for a withdrawal
 */
export interface WithdrawalProof {
  /** The ZK proof data */
  proof: Uint8Array;
  
  /** Public inputs to the proof */
  publicInputs: {
    /** The merkle root */
    root: string;
    
    /** The nullifier hash */
    nullifierHash: string;
    
    /** The recipient address */
    recipient: PublicKey;
    
    /** The relayer address */
    relayer: PublicKey;
    
    /** The fee for the relayer */
    fee: bigint;
    
    /** The refund amount */
    refund: bigint;
  };
}

/**
 * Configuration for interacting with ZK Compression
 */
export interface CompressionConfig {
  /** The endpoint for the ZK Compression RPC */
  rpcEndpoint: string;
  
  /** The endpoint for the Photon indexer */
  photonEndpoint: string;
  
  /** The endpoint for the ZK prover */
  proverEndpoint?: string;
}

/**
 * Validity proof response from the prover
 * NOTE: Structure might differ based on Light Protocol version.
 * This matches a common structure.
 */
export interface ValidityProofResponse {
  /** The compressed proof data */
  compressedProof: CompressedProof;
  
  /** The indices of the roots used in the proof */
  rootIndices: number[]; 
  
  merkleContext: MerkleContext;
  
  // Other properties like leaves, leafIndices, merkleTrees might exist depending on context/version
}