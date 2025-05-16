import { keccak256 } from 'js-sha3';
import { PublicKey } from '@solana/web3.js';
import { MERKLE_TREE_CONSTANTS } from '../constants';


/**
 * Generate a random buffer of a specific size
 * @param size Buffer size in bytes
 * @returns Random buffer
 */
export function generateRandomBuffer(size: number): Buffer {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

/**
 * Generate a nullifier
 * @returns Random nullifier buffer
 */
export function generateNullifier(): Buffer {
  return generateRandomBuffer(32);
}

/**
 * Generate a secret
 * @returns Random secret buffer
 */
export function generateSecret(): Buffer {
  return generateRandomBuffer(32);
}

/**
 * Generate a commitment from nullifier, secret, and optional recipient
 * @param nullifier Nullifier buffer
 * @param secret Secret buffer
 * @param recipient Optional recipient public key
 * @returns Commitment hash buffer
 */
export function generateCommitment(
  nullifier: Buffer,
  secret: Buffer,
  recipient?: PublicKey
): Buffer {
  // Create preimage with nullifier, secret, and optional recipient
  const preimage = Buffer.concat([
    nullifier,
    secret,
    recipient ? recipient.toBuffer() : Buffer.alloc(32, 0)
  ]);
  
  // Hash to create the commitment
  return Buffer.from(keccak256.digest(preimage));
}

/**
 * Compute nullifier hash for a pool
 * @param nullifier Nullifier buffer
 * @param poolId Pool ID
 * @returns Nullifier hash buffer
 */
export function computeNullifierHash(nullifier: Buffer, poolId: string): Buffer {
  // Hash the nullifier with the pool ID to prevent cross-pool double spending
  const preimage = Buffer.concat([
    nullifier,
    Buffer.from(poolId)
  ]);
  
  return Buffer.from(keccak256.digest(preimage));
}

/**
 * Generate Merkle tree path for a given leaf index
 * @param leaves Tree leaves
 * @param leafIndex Target leaf index
 * @returns Object containing path elements and indices
 */
export function generateMerkleProof(leaves: Buffer[], leafIndex: number): {
  pathElements: Buffer[];
  pathIndices: number[];
} {
  const { DEPTH, ZERO_VALUE } = MERKLE_TREE_CONSTANTS;
  
  // Convert hex string zero value to buffer
  const zeroValueBuffer = Buffer.from(ZERO_VALUE, 'hex');
  
  // Initialize path elements and indices
  const pathElements: Buffer[] = [];
  const pathIndices: number[] = [];
  
  // Copy leaves array to avoid modifying the original
  const tree = [...leaves];
  
  // Fill the tree with zero values if necessary
  while (tree.length < Math.pow(2, DEPTH)) {
    tree.push(zeroValueBuffer);
  }
  
  // Calculate binary path to the leaf
  let index = leafIndex;
  for (let i = 0; i < DEPTH; i++) {
    // Record current level's path index
    const pathIndex = index % 2;
    pathIndices.push(pathIndex);
    
    // Calculate sibling index
    const siblingIndex = pathIndex === 0 ? index + 1 : index - 1;
    
    // Add sibling to path elements
    const levelStartIndex = Math.pow(2, DEPTH - i - 1);
    if (siblingIndex < levelStartIndex * 2) {
      pathElements.push(tree[siblingIndex]);
    } else {
      pathElements.push(zeroValueBuffer);
    }
    
    // Prepare for next level
    index = Math.floor(index / 2);
  }
  
  return {
    pathElements,
    pathIndices
  };
}

/**
 * Convert a number to a bit array
 * @param num Number to convert
 * @param length Bit array length
 * @returns Array of bits (0 or 1)
 */
export function numberToBits(num: number, length: number): number[] {
  const bits: number[] = [];
  for (let i = 0; i < length; i++) {
    bits.push((num >> i) & 1);
  }
  return bits;
}

/**
 * Convert a buffer to a bit array
 * @param buffer Buffer to convert
 * @returns Array of bits (0 or 1)
 */
export function bufferToBits(buffer: Buffer): number[] {
  const bits: number[] = [];
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < 8; j++) {
      bits.push((buffer[i] >> j) & 1);
    }
  }
  return bits;
}

/**
 * Convert a buffer to field elements for ZK circuit
 * @param buffer Buffer to convert
 * @returns Array of numbers
 */
export function bufferToFields(buffer: Buffer): number[] {
  return Array.from(buffer);
}

/**
 * Convert a public key to field elements for ZK circuit
 * @param publicKey Public key to convert
 * @returns Array of numbers
 */
export function publicKeyToFields(publicKey: PublicKey): number[] {
  return bufferToFields(publicKey.toBuffer());
}