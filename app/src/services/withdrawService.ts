import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { Rpc } from '@lightprotocol/stateless.js';
import * as snarkjs from 'snarkjs';
import { keccak256 } from 'js-sha3';
import { PROGRAM_ID } from '../constants';
import { LightProtocolClient } from '../utils/lightProtocolClient';

export interface WithdrawResult {
  txId: string;
  recipient: PublicKey;
  amount: number;
}

export interface WithdrawNote {
  nullifier: Buffer;
  secret: Buffer;
  leafIndex: number;
  denomination: string;
  poolId: string;
}

/**
 * Service for handling withdrawals from SolanaVeil pools
 */
export class WithdrawService {
  private connection: Rpc;
  private lightClient: LightProtocolClient;
  
  constructor(endpoint: string, apiKey?: string) {
    this.lightClient = new LightProtocolClient(endpoint, apiKey);
    this.connection = this.lightClient.getConnection();
  }

  /**
   * Parse a withdrawal note
   */
  parseNote(noteStr: string): WithdrawNote {
    try {
      // Decode the base64 note
      const decoded = atob(noteStr);
      const noteData = JSON.parse(decoded);
      
      // Validate required fields
      if (!noteData.nullifier || !noteData.secret || 
          noteData.leafIndex === undefined || !noteData.denomination || !noteData.poolId) {
        throw new Error('Invalid note format');
      }
      
      // Convert hex strings to buffers
      const nullifier = Buffer.from(noteData.nullifier, 'hex');
      const secret = Buffer.from(noteData.secret, 'hex');
      
      return {
        nullifier,
        secret,
        leafIndex: noteData.leafIndex,
        denomination: noteData.denomination,
        poolId: noteData.poolId
      };
    } catch (error) {
      console.error('Error parsing note:', error);
      throw new Error(`Failed to parse withdrawal note: ${error}`);
    }
  }

  /**
   * Generate a zero-knowledge proof for withdrawal using Light Protocol
   */
  async generateWithdrawalProof(params: {
    nullifier: Buffer;
    secret: Buffer;
    merkleRoot: Buffer;
    pathElements: Buffer[];
    pathIndices: number[];
    recipient: PublicKey;
    relayer?: PublicKey;
    fee?: number;
    poolId: string;
    denomination: number;
    wasmPath: string;
    zkeyPath: string;
  }): Promise<{
    proof: Buffer;
    publicSignals: {
      root: string;
      nullifierHash: string;
      recipient: string;
      relayer: string;
      fee: string;
    };
  }> {
    const { 
      nullifier, 
      secret, 
      merkleRoot, 
      pathElements, 
      pathIndices, 
      recipient, 
      relayer, 
      fee = 0,
      poolId,
      denomination,
      wasmPath,
      zkeyPath
    } = params;
    
    // Calculate the nullifier hash using Light Protocol format
    const nullifierHash = Buffer.from(keccak256.digest(Buffer.concat([
      nullifier,
      Buffer.from(poolId)
    ])));
    
    // Check if the nullifier has already been spent
    const isSpent = await this.isNullifierSpent(nullifierHash);
    if (isSpent) {
      throw new Error('Nullifier has already been spent');
    }
    
    // Format inputs for the ZK circuit - ensuring compatibility with Light Protocol
    const circuitInput = {
      // Convert Buffer to array for snarkjs
      nullifier: Array.from(nullifier),
      secret: Array.from(secret),
      root: Array.from(merkleRoot),
      pathElements: pathElements.map(el => Array.from(el)),
      pathIndices,
      recipient: Array.from(recipient.toBuffer()),
      relayer: Array.from((relayer || recipient).toBuffer()),
      fee: fee.toString(),
      poolId: Array.from(Buffer.from(poolId)),
      denomination: denomination.toString(),
      hasRecipient: relayer ? 1 : 0
    };
    
    console.log('Generating proof with Light Protocol...');
    
    // Generate the proof using snarkjs with Light Protocol's circuit
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInput,
      wasmPath,
      zkeyPath
    );
    
    // Format the proof for Light Protocol
    const formattedProof = Buffer.from(JSON.stringify(proof));
    
    return {
      proof: formattedProof,
      publicSignals: {
        root: publicSignals[0],
        nullifierHash: publicSignals[1],
        recipient: publicSignals[2],
        relayer: publicSignals[3],
        fee: publicSignals[4]
      }
    };
  }

  /**
   * Create a withdrawal transaction using Light Protocol
   */
  async createWithdrawTransaction(params: {
    payer: PublicKey;
    poolId: string;
    proof: Buffer;
    merkleRoot: Buffer;
    nullifierHash: Buffer;
    recipient: PublicKey;
    fee: number;
    relayer?: PublicKey;
  }): Promise<Transaction> {
    const { 
      payer, 
      poolId, 
      proof, 
      merkleRoot, 
      nullifierHash, 
      recipient, 
      fee,
      relayer
    } = params;
    
    // Create the nullifier PDA address with Light Protocol
    const [nullifierPda] = await PublicKey.findProgramAddress(
      [
        Buffer.from('nullifier'),
        nullifierHash,
        new PublicKey(poolId).toBuffer()
      ],
      new PublicKey(PROGRAM_ID)
    );
    
    // Create withdraw instruction with Light Protocol
    const withdrawInstruction = {
      programId: new PublicKey(PROGRAM_ID),
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(poolId), isSigner: false, isWritable: true },
        { pubkey: nullifierPda, isSigner: false, isWritable: true },
        { pubkey: recipient, isSigner: false, isWritable: true },
        { pubkey: relayer || payer, isSigner: relayer ? false : true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: this.createWithdrawInstructionData(
        proof, 
        merkleRoot, 
        nullifierHash, 
        recipient,
        fee
      )
    };
    
    // Build the transaction
    const transaction = new Transaction().add(withdrawInstruction);
    
    // Add a recent blockhash using Light Protocol RPC
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = payer;
    
    return transaction;
  }

  /**
   * Create withdraw instruction data buffer
   */
  private createWithdrawInstructionData(
    proof: Buffer,
    root: Buffer,
    nullifierHash: Buffer,
    recipient: PublicKey,
    fee: number
  ): Buffer {
    // Instruction format for Light Protocol:
    // [1 byte instruction index (2 = withdraw),
    //  4 bytes proof length, N bytes proof,
    //  32 bytes root, 32 bytes nullifierHash,
    //  32 bytes recipient, 8 bytes fee]
    
    const data = Buffer.alloc(1 + 4 + proof.length + 32 + 32 + 32 + 8);
    let offset = 0;
    
    // Instruction index: 2 = withdraw
    data.writeUInt8(2, offset);
    offset += 1;
    
    // Proof length
    data.writeUInt32LE(proof.length, offset);
    offset += 4;
    
    // Proof data
    proof.copy(data, offset);
    offset += proof.length;
    
    // Root
    root.copy(data, offset);
    offset += 32;
    
    // Nullifier hash
    nullifierHash.copy(data, offset);
    offset += 32;
    
    // Recipient
    recipient.toBuffer().copy(data, offset);
    offset += 32;
    
    // Fee
    data.writeBigUInt64LE(BigInt(fee), offset);
    
    return data;
  }

  /**
   * Get the Merkle proof for a leaf in the tree
   */
  async getMerkleProof(params: {
    treeId: string;
    leafIndex: number;
  }): Promise<{
    root: Buffer;
    pathElements: Buffer[];
    pathIndices: number[];
  }> {
    const { treeId, leafIndex } = params;
    
    try {
      // Use our Light Protocol client to get the merkle proof
      const response = await this.lightClient.getCompressedMerkleProof(treeId, leafIndex);
      
      if (!response || !response.root) { 
        throw new Error(`Failed to get Merkle proof for leaf ${leafIndex}`);
      }
      
      // Process the proof data from the response
      const root = Buffer.from(response.root, 'hex');
      const pathElements = response.proof.map(element => 
        Buffer.from(element, 'hex')
      );
      
      // Calculate path indices from leaf index
      const pathIndices = [];
      let idx = leafIndex;
      for (let i = 0; i < pathElements.length; i++) {
        pathIndices.push(idx & 1); // Get least significant bit
        idx = idx >> 1; // Shift right to get next bit
      }
      
      return {
        root,
        pathElements,
        pathIndices
      };
    } catch (error) {
      console.error('Error getting merkle proof:', error);
      throw new Error(`Failed to get Merkle proof: ${error}`);
    }
  }

  /**
   * Check if a nullifier has been spent
   */
  async isNullifierSpent(nullifierHash: Buffer): Promise<boolean> {
    try {
      // Use our Light Protocol client to check nullifier status
      return await this.lightClient.checkNullifier(nullifierHash.toString('hex'));
    } catch (error: any) {
      console.error('Error checking nullifier status:', error);
      throw error;
    }
  }

  /**
   * Perform a withdrawal from a privacy pool
   */
  async withdraw(params: {
    wallet: Keypair;
    note: string;
    recipient: PublicKey;
    relayer?: PublicKey;
    fee?: number;
    wasmPath: string;
    zkeyPath: string;
  }): Promise<WithdrawResult> {
    const { wallet, note, recipient, relayer, fee = 0, wasmPath, zkeyPath } = params;
    
    // Parse the note
    const parsedNote = this.parseNote(note);
    
    // Get the merkle proof
    const merkleProof = await this.getMerkleProof({
      treeId: parsedNote.poolId,
      leafIndex: parsedNote.leafIndex
    });
    
    // Convert denomination to lamports
    const denomination = parseFloat(parsedNote.denomination) * LAMPORTS_PER_SOL;
    
    // Generate the ZK proof
    const { proof, publicSignals } = await this.generateWithdrawalProof({
      nullifier: parsedNote.nullifier,
      secret: parsedNote.secret,
      merkleRoot: merkleProof.root,
      pathElements: merkleProof.pathElements,
      pathIndices: merkleProof.pathIndices,
      recipient,
      relayer,
      fee,
      poolId: parsedNote.poolId,
      denomination,
      wasmPath,
      zkeyPath
    });
    
    // Create the withdrawal transaction
    const transaction = await this.createWithdrawTransaction({
      payer: wallet.publicKey,
      poolId: parsedNote.poolId,
      proof,
      merkleRoot: merkleProof.root,
      nullifierHash: Buffer.from(publicSignals.nullifierHash),
      recipient,
      fee,
      relayer
    });
    
    // Sign and send transaction
    const txId = await this.connection.sendTransaction(transaction, [wallet]);
    
    // Wait for confirmation
    await this.connection.confirmTransaction(txId);
    
    // Calculate the actual withdrawal amount
    const withdrawAmount = parseFloat(parsedNote.denomination) - (fee / LAMPORTS_PER_SOL);
    
    return {
      txId,
      recipient,
      amount: withdrawAmount
    };
  }
}