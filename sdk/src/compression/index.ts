/**
 * Compression Module Index
 *
 * Exports core components related to ZK compression, Merkle trees,
 * nullifiers, proofs, and compressed tokens.
 */

export * from './merkle';
export * from './nullifier';
export * from './proof'; // Exports ValidityProofResponse
export * from './token';
// Explicitly export necessary types from types.ts to avoid conflicts
export { WithdrawalProof } from './types'; // Add other needed types if any
export { PrivacyMixer } from './privacy-mixers'; // Export specific class

// Re-export key classes and constants for convenience
import { MerkleTreeManager } from './merkle';
import { NullifierSetManager } from './nullifier';
import { PrivacyMixer } from './privacy-mixers';
import { ProofGenerator } from './proof';
import { CompressedTokenManager } from './token';
import { Rpc } from '@lightprotocol/stateless.js'; // Import Rpc type

/**
 * CompressionModule class that combines all compression-related functionality
 * for easier access in the main SDK
 */
export class CompressionModule {
  public merkleTree: MerkleTreeManager;
  public nullifierSet: NullifierSetManager;
  public proof: ProofGenerator;
  public privacyMixer: PrivacyMixer;
  public token: CompressedTokenManager;

  /**
   * Constructor for CompressionModule
   * 
   * @param rpc - The RPC connection to use
   */
  constructor(rpc: Rpc) { // Use Rpc type instead of any
    this.merkleTree = new MerkleTreeManager(rpc);
    this.nullifierSet = new NullifierSetManager(rpc);
    this.proof = new ProofGenerator(rpc);
    this.privacyMixer = new PrivacyMixer(rpc);
    this.token = new CompressedTokenManager(rpc);
  }
}