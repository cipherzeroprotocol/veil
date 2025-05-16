import * as snarkjs from 'snarkjs';

export interface WithdrawCircuitInput {
  nullifier: number[];        // 32-byte array (as numbers)
  secret: number[];           // 32-byte array (as numbers)
  pathElements: number[][];   // Array of 32-byte arrays (as numbers)
  pathIndices: number[];      // Array of 0/1 values for the Merkle path
  root: number[];             // 32-byte array (as numbers)
  recipient: number[];        // 32-byte array (as numbers)
  relayer: number[];          // 32-byte array (as numbers)
  fee: number;                // Fee amount
  
  // Add string index signature to make it compatible with CircuitSignals
  [key: string]: number | number[] | number[][] | string;
}

export interface ProofOutput {
  proof: Uint8Array;
  publicSignals: string[];
}

/**
 * Manages ZK circuit operations
 */
export class CircuitManager {
  constructor() {}
  
  /**
   * Generate a proof for withdrawal
   * @param input Circuit input
   * @param wasmPath Path to circuit WASM file
   * @param zkeyPath Path to circuit zkey file
   * @param onProgress Progress callback with optional stage information
   * @param abortSignal Optional AbortSignal to cancel the operation
   * @returns Generated proof
   */
  async generateProof(
    input: WithdrawCircuitInput,
    wasmPath: string,
    zkeyPath: string,
    onProgress?: (progress: number, stage?: string) => void,
    abortSignal?: AbortSignal
  ): Promise<ProofOutput> {
    try {
      // Check if operation was aborted before starting
      if (abortSignal?.aborted) {
        throw new DOMException('Proof generation aborted', 'AbortError');
      }
      
      // Register abort listener
      const abortListener = () => {
        throw new DOMException('Proof generation aborted', 'AbortError');
      };
      
      if (abortSignal) {
        abortSignal.addEventListener('abort', abortListener);
      }
      
      try {
        // Set up initial progress
        onProgress?.(0.1, 'setup');
        
        // Validate input before proceeding
        this.validateInput(input);
        
        // Generate the proof using snarkjs
        onProgress?.(0.2, 'witness');
        
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
          input,
          wasmPath,
          zkeyPath,
          (progress: number) => {
            // snarkjs reports progress from 0 to 1, scale it to 0.3-0.9 for our UI
            onProgress?.(0.2 + progress * 0.7, progress < 0.5 ? 'witness' : 'proof');
          }
        );
        
        // Convert proof to the format expected by our contract
        onProgress?.(0.95, 'finalization');
        const proofData = this.formatProofForContract(proof);
        
        // Final progress
        onProgress?.(1, 'complete');
        
        return {
          proof: proofData,
          publicSignals
        };
      } finally {
        // Clean up abort listener
        if (abortSignal) {
          abortSignal.removeEventListener('abort', abortListener);
        }
      }
    } catch (error) {
      // Re-throw AbortError as is
      if ((error as DOMException).name === 'AbortError') {
        throw error;
      }
      
      console.error('Error generating proof:', error);
      throw new Error(`Failed to generate proof: ${(error as Error).message}`);
    }
  }
  
  /**
   * Validate input to catch errors early
   */
  private validateInput(input: WithdrawCircuitInput): void {
    if (!input.nullifier || input.nullifier.length !== 32) {
      throw new Error('Invalid nullifier: must be a 32-byte array');
    }
    
    if (!input.secret || input.secret.length !== 32) {
      throw new Error('Invalid secret: must be a 32-byte array');
    }
    
    if (!input.pathElements || !input.pathElements.length) {
      throw new Error('Invalid pathElements: must be an array of arrays');
    }
    
    if (!input.pathIndices || input.pathIndices.length !== input.pathElements.length) {
      throw new Error('Invalid pathIndices: must match length of pathElements');
    }
    
    if (!input.root || input.root.length !== 32) {
      throw new Error('Invalid root: must be a 32-byte array');
    }
    
    if (!input.recipient || input.recipient.length !== 32) {
      throw new Error('Invalid recipient: must be a 32-byte array');
    }
    
    // Validate all pathElements are 32-byte arrays
    for (let i = 0; i < input.pathElements.length; i++) {
      if (!input.pathElements[i] || input.pathElements[i].length !== 32) {
        throw new Error(`Invalid pathElement at index ${i}: must be a 32-byte array`);
      }
    }
    
    // Validate all pathIndices are 0 or 1
    for (let i = 0; i < input.pathIndices.length; i++) {
      if (input.pathIndices[i] !== 0 && input.pathIndices[i] !== 1) {
        throw new Error(`Invalid pathIndex at ${i}: must be 0 or 1`);
      }
    }
  }
  
  /**
   * Verify a proof
   * @param proof Proof to verify
   * @param publicSignals Public signals
   * @param verificationKeyPath Path to verification key
   * @returns True if proof is valid
   */
  async verifyProof(
    proof: any,
    publicSignals: string[],
    verificationKeyPath: string
  ): Promise<boolean> {
    try {
      // Load verification key
      const verificationKey = await fetch(verificationKeyPath).then(res => res.json());
      
      // Verify the proof
      const isValid = await snarkjs.groth16.verify(
        verificationKey,
        publicSignals,
        proof
      );
      
      return isValid;
    } catch (error) {
      console.error('Error verifying proof:', error);
      throw new Error(`Failed to verify proof: ${(error as Error).message}`);
    }
  }
  
  /**
   * Format proof for on-chain verification
   * @param proof Proof from snarkjs
   * @returns Formatted proof as Uint8Array
   */
  private formatProofForContract(proof: any): Uint8Array {
    // Convert proof to flat array format expected by the contract
    // pi_a, pi_b, pi_c as flat array
    const pi_a = this.extractBigIntArray(proof.pi_a);
    const pi_b = this.flattenBigIntArray(proof.pi_b);
    const pi_c = this.extractBigIntArray(proof.pi_c);
    
    // Combine all parts
    const fullProof = [...pi_a, ...pi_b, ...pi_c];
    
    // Convert to bytes
    const proofBytes = this.bigIntArrayToBytes(fullProof);
    
    return proofBytes;
  }
  
  /**
   * Extract a BigInt array from a proof component
   * @param component Proof component (pi_a or pi_c)
   * @returns Array of BigInts
   */
  private extractBigIntArray(component: string[]): bigint[] {
    return component.slice(0, 2).map(val => BigInt(val));
  }
  
  /**
   * Flatten a 2D BigInt array from a proof component
   * @param component Proof component (pi_b)
   * @returns Flattened array of BigInts
   */
  private flattenBigIntArray(component: string[][]): bigint[] {
    // pi_b is a 2x2 array, we need to flatten it and reverse each pair
    return [
      BigInt(component[0][1]), BigInt(component[0][0]),
      BigInt(component[1][1]), BigInt(component[1][0])
    ];
  }
  
  /**
   * Convert an array of BigInts to a byte array
   * @param bigintArray Array of BigInts
   * @returns Byte array
   */
  private bigIntArrayToBytes(bigintArray: bigint[]): Uint8Array {
    // Each field element is 32 bytes
    const bytes = new Uint8Array(32 * bigintArray.length);
    
    bigintArray.forEach((bigint, i) => {
      // Convert BigInt to hex string, remove '0x' prefix
      const hex = bigint.toString(16).padStart(64, '0');
      
      // Convert hex to bytes
      for (let j = 0; j < 32; j++) {
        const byteHex = hex.substring(j * 2, j * 2 + 2);
        bytes[i * 32 + j] = parseInt(byteHex, 16);
      }
    });
    
    return bytes;
  }
}