import { PublicKey } from '@solana/web3.js';
import * as BN from 'bn.js';
import { TokenType, PoolDenomination } from '../core/types';

/**
 * Interface representing the data structure of a deposit note
 */
export interface DepositNoteData {
  /**
   * The pool public key
   */
  pool: PublicKey;
  
  /**
   * The token type (SOL, USDC, etc.)
   */
  tokenType: TokenType;
  
  /**
   * The amount denomination
   */
  amount: PoolDenomination;
  
  /**
   * Secret value for zero-knowledge proofs
   */
  secret: Uint8Array;
  
  /**
   * Nullifier value to prevent double-spending
   */
  nullifier: Uint8Array;
  
  /**
   * Timestamp of the deposit (Unix timestamp)
   */
  timestamp: number;
  
  /**
   * Optional recipient public key
   */
  recipient?: PublicKey;
  
  /**
   * Optional merkle tree leaf index
   */
  leafIndex?: number;
}

/**
 * Generates a base64-encoded deposit note string from the provided note data
 * 
 * @param noteData The deposit note data to encode
 * @returns Base64-encoded deposit note string
 */
export function generateDepositNoteString(noteData: DepositNoteData): string {
  // Create a serializable object from the note data
  const serializableNote = {
    pool: noteData.pool.toBase58(),
    tokenType: noteData.tokenType,
    amount: noteData.amount,
    secret: Buffer.from(noteData.secret).toString('hex'),
    nullifier: Buffer.from(noteData.nullifier).toString('hex'),
    timestamp: noteData.timestamp,
    recipient: noteData.recipient ? noteData.recipient.toBase58() : undefined,
    leafIndex: noteData.leafIndex
  };
  
  // Serialize and encode as base64
  return Buffer.from(JSON.stringify(serializableNote)).toString('base64');
}

/**
 * Parses a base64-encoded deposit note string
 * 
 * @param noteString Base64-encoded deposit note string
 * @returns Parsed DepositNoteData object
 */
export function parseDepositNoteString(noteString: string): DepositNoteData {
  try {
    // Decode and parse JSON
    const parsed = JSON.parse(Buffer.from(noteString, 'base64').toString());
    
    // Convert string values back to their proper types
    return {
      pool: new PublicKey(parsed.pool),
      tokenType: parsed.tokenType,
      amount: parsed.amount,
      secret: Buffer.from(parsed.secret, 'hex'),
      nullifier: Buffer.from(parsed.nullifier, 'hex'),
      timestamp: parsed.timestamp,
      recipient: parsed.recipient ? new PublicKey(parsed.recipient) : undefined,
      leafIndex: parsed.leafIndex
    };
  } catch (error) {
    throw new Error(`Failed to parse deposit note: ${error instanceof Error ? error.message : String(error)}`);
  }
}
