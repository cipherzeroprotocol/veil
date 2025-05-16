/**
 * Constants for the SolanaVeil SDK
 */

import { PublicKey } from '@solana/web3.js';
import { TokenType, PoolDenomination } from './core/types';

/**
 * SolanaVeil Program ID
 */
export const PROGRAM_ID = new PublicKey('SoLV1ejPU65oFJYgPLMg7c2r9BgH9MpNDPUJTSKUJqL');

/**
 * USDC Mint address on mainnet
 */
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

/**
 * Light System Program ID (for ZK Compression)
 */
export const LIGHT_SYSTEM_PROGRAM_ID = new PublicKey('SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7');

/**
 * Compressed Token Program ID
 */
export const COMPRESSED_TOKEN_PROGRAM_ID = new PublicKey('cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m');

/**
 * Account Compression Program ID
 */
export const ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq');

/**
 * Public State Tree ID
 */
export const PUBLIC_STATE_TREE_ID = new PublicKey('smt1NamzXdq4AMqS2fS2F1i5KTYPZRhoHgWx38d8WsT');

/**
 * Public Nullifier Queue ID
 */
export const PUBLIC_NULLIFIER_QUEUE_ID = new PublicKey('nfq1NvQDJ2GEgnS8zt9prAe8rjjpAW1zFkrvZoBR148');

/**
 * Public Address Tree ID
 */
export const PUBLIC_ADDRESS_TREE_ID = new PublicKey('amt1Ayt45jfbdw5YSo7iz6WZxUmnZsQTYXy82hVwyC2');

/**
 * SolanaVeil Lookup Table IDs
 */
export const LOOKUP_TABLES = {
  mainnet: new PublicKey('9NYFyEqPkyXUhkerbGHXUXkvb4qpzeEdHuGpgbgpH1NJ'),
  devnet: new PublicKey('qAJZMgnQJ8G6vA3WRcjD9Jan1wtKkaCFWLWskxJrR5V')
};

/**
 * Default relayer fee percentage (0.3%)
 */
export const DEFAULT_RELAYER_FEE_PERCENTAGE = 0.3;

/**
 * Deposit note format version
 */
export const DEPOSIT_NOTE_VERSION = 1;

/**
 * Default note prefix for SolanaVeil deposit notes
 */
export const NOTE_PREFIX = 'solana-veil-note';

/**
 * Minimum compute unit limit for transactions
 */
export const MIN_COMPUTE_UNIT_LIMIT = 350000;

/**
 * Default compute unit limit for transactions with proofs
 */
export const DEFAULT_COMPUTE_UNIT_LIMIT = 1000000;

/**
 * Default priority fee multiplier
 */
export const DEFAULT_PRIORITY_FEE_MULTIPLIER = 1;

/**
 * Maps token types to their corresponding program IDs
 */
export const TOKEN_PROGRAM_IDS: Record<TokenType, PublicKey> = {
  [TokenType.SOL]: PublicKey.default, // SOL is handled by the System Program
  [TokenType.USDC]: USDC_MINT
};

/**
 * Maps pool denominations to their human-readable values
 */
export const DENOMINATION_LABELS: Record<PoolDenomination, string> = {
  [PoolDenomination.SOL_0_1]: '0.1 SOL',
  [PoolDenomination.SOL_1]: '1 SOL',
  [PoolDenomination.SOL_10]: '10 SOL',
  [PoolDenomination.SOL_100]: '100 SOL',
  [PoolDenomination.USDC_0_1]: '0.1 USDC',
  [PoolDenomination.USDC_1]: '1 USDC',
  [PoolDenomination.USDC_10]: '10 USDC',
  //[PoolDenomination.USDC_100]: '100 USDC',
  // Ensure unique keys in the object
    //[PoolDenomination.USDC_1000]: '1000 USDC'
};

/**
 * Maps token types to their decimal places
 */
export const TOKEN_DECIMALS: Record<TokenType, number> = {
  [TokenType.SOL]: 9,
  [TokenType.USDC]: 6
};

/**
 * Error codes for the SDK
 */
export enum ErrorCode {
  // Connection and Setup Errors
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  INVALID_CONFIG = 'INVALID_CONFIG',
  RPC_ERROR = 'RPC_ERROR', // General RPC error

  // Pool Errors
  POOL_NOT_FOUND = 'POOL_NOT_FOUND',
  POOL_ALREADY_EXISTS = 'POOL_ALREADY_EXISTS',
  INVALID_DENOMINATION = 'INVALID_DENOMINATION',
  UNSUPPORTED_TOKEN = 'UNSUPPORTED_TOKEN', // Added

  // Deposit Errors
  DEPOSIT_FAILED = 'DEPOSIT_FAILED',
  NO_AVAILABLE_TREE = 'NO_AVAILABLE_TREE', // Added

  // Withdraw Errors
  INVALID_NOTE = 'INVALID_NOTE',
  ALREADY_WITHDRAWN = 'ALREADY_WITHDRAWN',
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  PROOF_VERIFICATION_FAILED = 'PROOF_VERIFICATION_FAILED',
  WITHDRAW_FAILED = 'WITHDRAW_FAILED',
  RELAYER_UNAVAILABLE = 'RELAYER_UNAVAILABLE',
  RELAYER_REJECTED = 'RELAYER_REJECTED',

  // Merkle Tree and Compression Errors
  MERKLE_PROOF_ERROR = 'MERKLE_PROOF_ERROR',
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND', // Added
  NULLIFIER_CHECK_FAILED = 'NULLIFIER_CHECK_FAILED',

  // Transaction Errors
  TRANSACTION_ERROR = 'TRANSACTION_ERROR',
  TRANSACTION_TIMEOUT = 'TRANSACTION_TIMEOUT',

  // General Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

/**
 * Custom error class for SolanaVeil
 */
export class SolanaVeilError extends Error {
  code: ErrorCode;
  details?: any;

  constructor(code: ErrorCode, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'SolanaVeilError';
  }
}