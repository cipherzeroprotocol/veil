/**
 * Core type definitions for SolanaVeil SDK
 */

import { PublicKey, Signer } from '@solana/web3.js';
// Use CommonJS import style for bn.js
import * as BN from 'bn.js'; // Changed import style

/**
 * Supported denomination sizes for privacy pools
 */
export enum PoolDenomination {
  SOL_0_1 = 100000000,  // 0.1 SOL
  SOL_1 = 1000000000,   // 1 SOL
  SOL_10 = 10000000000, // 10 SOL
  SOL_100 = 100000000000, // 100 SOL
  USDC_0_1 = 100000,    // 0.1 USDC (6 decimals)
  USDC_1 = 1000000,     // 1 USDC
  USDC_10 = 10000000,   // 10 USDC
  USDC_100 = 100000000, // 100 USDC
  USDC_1000 = 1000000000 // 1000 USDC
}

/**
 * Token types supported by the privacy mixer
 */
export enum TokenType {
  SOL = 'SOL',
  USDC = 'USDC'
  // Add other supported tokens like USDT, BONK, etc.
}

/**
 * Maps token types to their corresponding pool denominations
 */
export const TOKEN_DENOMINATIONS: Record<TokenType, PoolDenomination[]> = {
  [TokenType.SOL]: [
    PoolDenomination.SOL_0_1,
    PoolDenomination.SOL_1,
    PoolDenomination.SOL_10,
    PoolDenomination.SOL_100
  ],
  [TokenType.USDC]: [
    PoolDenomination.USDC_0_1,
    PoolDenomination.USDC_1,
    PoolDenomination.USDC_10,
    PoolDenomination.USDC_100,
    PoolDenomination.USDC_1000
  ]
};

/**
 * Represents a privacy pool on-chain
 */
export interface Pool {
  address: PublicKey;
  denomination: PoolDenomination;
  tokenType: TokenType;
  merkleTree: PublicKey; // Address of the associated Merkle tree
  totalDeposits: BN; // Total value deposited (in smallest units)
  totalWithdrawals: BN; // Total value withdrawn (in smallest units)
  // Add other relevant pool data like admin, fees, etc.
}

/**
 * Parameters for creating a new privacy pool
 */
export interface PoolCreationParams {
  denomination: PoolDenomination;
  tokenType: TokenType;
  admin: PublicKey; // Authority for managing the pool
  payer: Signer; // Account to pay for transaction fees
}

/**
 * Result of creating a new privacy pool
 */
export interface PoolCreationResult {
  signature: string; // Transaction signature
  poolAddress: PublicKey;
  denomination: PoolDenomination;
  tokenType: TokenType;
  merkleTree: PublicKey; // Merkle tree used by the pool
}

/**
 * Data contained within a deposit note string
 */
export interface DepositNoteData {
  pool: PublicKey; // Pool address the deposit was made to
  tokenType: TokenType;
  amount: PoolDenomination; // The exact denomination value
  secret: Uint8Array; // User's secret for withdrawal
  nullifier: Uint8Array; // User's nullifier pre-image
  timestamp: number; // Unix timestamp of deposit
  recipient?: PublicKey; // Optional intended recipient stored in the note
}

/**
 * Parameters for depositing funds
 */
export interface DepositParams {
  amount: PoolDenomination; // Must match a pool's denomination
  tokenType: TokenType;
  payer: Signer; // Account funding the deposit and paying fees
  recipient?: PublicKey; // Optional: Specify the owner of the resulting compressed account
}

/**
 * Result of a deposit operation
 */
export interface DepositResult {
  signature: string; // Transaction signature
  note: string; // The generated deposit note string
  commitment: string; // The commitment hash (hex string) added to the Merkle tree
  amount: PoolDenomination;
  tokenType: TokenType;
}

/**
 * Parameters for withdrawing funds
 */
export interface WithdrawParams {
  note: string; // The deposit note string
  recipient: PublicKey; // Address to receive the withdrawn funds
  payer: Signer; // Account paying for the transaction fees (if not using relayer)
  relayer?: PublicKey; // Optional: Address of the relayer to use
  relayerFee?: BN; // Optional: Fee paid to the relayer (in smallest units)
}

/**
 * Result of a withdrawal operation
 */
export interface WithdrawResult {
  signature: string; // Transaction signature
  recipient: PublicKey;
  amount: BN; // Amount withdrawn (in smallest units)
  tokenType: TokenType;
  fee: BN; // Fee paid (either network fee or relayer fee)
}

/**
 * Represents a Merkle proof for a commitment
 */
export interface MerkleProof {
    root: string; // Merkle root (hex string)
    siblings: string[]; // Sibling nodes in the path (hex strings)
    // pathIndices: number[]; // Removed: Not provided by stateless.js getCompressedAccountProof
    leafIndex: number; // Index of the leaf in the tree
}

/**
 * Configuration options for the SolanaVeil SDK
 */
export interface SdkConfig {
  rpcUrl: string; // Solana RPC endpoint URL
  programId?: PublicKey; // Override the default program ID
  commitment?: 'processed' | 'confirmed' | 'finalized'; // Default transaction commitment level
  merkleTreeManager?: any; // Allow providing a custom MerkleTreeManager instance
  poolManager?: any; // Allow providing a custom PoolManager instance
  // Add other configuration like default relayer URL, proof generation URL, etc.
}