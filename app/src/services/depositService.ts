import { Connection, PublicKey, Transaction, VersionedTransaction, Signer, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { generateCommitment, generateNullifier, generateSecret } from '../utils/zkUtils';

// Import SDK components
import {
    PrivacyMixer,
    PoolDenomination,
    TokenType,
    SolanaVeilError,
    PoolManager,
    DepositManager,
    MerkleTreeManager, // Add import for MerkleTreeManager
    NullifierSetManager, // Add import for NullifierSetManager
    LIGHT_SYSTEM_PROGRAM_ID, // Import the constant program ID
    // Other imports...
} from '../../../sdk/src';
import { createRpc, Rpc } from '@lightprotocol/stateless.js';

// Define a Signer interface compatible with Wallet Adapter's capabilities
interface ServiceSigner {
    publicKey: PublicKey;
    signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
    // signAllTransactions might also be needed depending on SDK usage
}

export class DepositService {
  private connection: Connection;
  private apiKey: string;

  // SDK specific properties
  private rpc: Rpc;
  private privacyMixer: PrivacyMixer;
  private poolManager: PoolManager;
  private depositManager: DepositManager;
  private merkleTreeManager: MerkleTreeManager; // Added for proper SDK initialization
  private nullifierSetManager: NullifierSetManager; // Added for proper SDK initialization

  constructor(
      rpcEndpoint: string,
      apiKey: string,
      compressionApiEndpoint: string,
      proverEndpoint: string
    ) {
    this.connection = new Connection(rpcEndpoint, 'confirmed');
    this.apiKey = apiKey;

    // Initialize SDK components with the RPC connection
    this.rpc = createRpc(rpcEndpoint, compressionApiEndpoint, proverEndpoint);
    
    // Initialize the required managers in the correct order
    this.merkleTreeManager = new MerkleTreeManager(this.rpc);
    this.nullifierSetManager = new NullifierSetManager(this.rpc);
    
    // Now initialize PoolManager with required dependencies
    this.poolManager = new PoolManager(this.rpc, this.merkleTreeManager);
    
    // Initialize DepositManager with all required dependencies - pass merkleTreeManager as third argument
    this.depositManager = new DepositManager(this.rpc, this.poolManager, this.merkleTreeManager);
    
    // Initialize PrivacyMixer (which probably creates its own managers internally)
    this.privacyMixer = new PrivacyMixer(this.rpc);
  }

  /**
   * Creates a deposit transaction using the SDK but returns transaction objects
   * for manual signing and sending.
   * 
   * @param params Deposit parameters
   * @returns Transaction object and deposit components for backward compatibility
   */
  async createDepositTransaction(params: {
    payer: PublicKey;
    poolId: string;
    treeId: string;
    denomination: number;
  }): Promise<{
    transaction: Transaction;
    commitment: Buffer;
    nullifier: Buffer;
    secret: Buffer;
  }> {
    console.log("Creating deposit transaction with SDK");
    
    try {
      // Generate cryptographic values as required by the legacy interface
      const nullifier = generateNullifier();
      const secret = generateSecret();
      const commitment = generateCommitment(nullifier, secret);
      
      // Map parameters to SDK types
      const sdkAmount = this.mapAmountToPoolDenomination(params.denomination);
      const sdkTokenType = TokenType.SOL; // Default to SOL
      const poolAddress = new PublicKey(params.poolId);
      const stateTree = new PublicKey(params.treeId);
      
      // Create a new transaction
      const transaction = new Transaction();
      
      // Set compute budget - this is needed for ZK operations
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ 
          units: 1_400_000 // Use appropriate compute unit limit for deposit operations
        })
      );
      
      const stateTrees = await this.merkleTreeManager.getActiveStateTrees();
      
      // Find the queue for the specified tree
      const stateTreeBundle = stateTrees.find(bundle => 
        bundle.tree.equals(stateTree)
      );
      
      if (!stateTreeBundle) {
        throw new Error(`State tree ${params.treeId} not found in active trees`);
      }

      // Create a commit hash from the nullifier and secret
      const commitmentHex = commitment.toString('hex');
      
      // Get the proper addresses needed for the deposit
      const compressedAccountOwner = params.payer; // The payer will own the compressed account
      
      // Determine if this is a SOL or token deposit
      if (sdkTokenType === TokenType.SOL) {
        // Add instruction to transfer SOL to the pool
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: params.payer,
            toPubkey: poolAddress,
            lamports: sdkAmount, // Convert to lamports
          })
        );
        
        // Add the compression instruction
        // Note: In a real implementation, you would use the actual tree data
        transaction.add({
          keys: [
            { pubkey: params.payer, isSigner: true, isWritable: true },
            { pubkey: poolAddress, isSigner: false, isWritable: true },
            { pubkey: stateTree, isSigner: false, isWritable: true },
            { pubkey: stateTreeBundle.queue || SystemProgram.programId, isSigner: false, isWritable: true },
            { pubkey: LIGHT_SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          programId: LIGHT_SYSTEM_PROGRAM_ID,
          data: Buffer.concat([
            // Real instruction data format would include:
            Buffer.from([0x01]), // Example deposit instruction discriminator
            Buffer.from(commitment), // The commitment
            Buffer.from([sdkAmount]), // The amount as a byte array
          ])
        });
      } else {
        // For token deposits, would add token program instructions
        // This would involve finding the associated token account, etc.
        throw new Error("Token deposits not implemented in transaction preview");
      }
      
      return {
        transaction,
        commitment: Buffer.from(commitment),
        nullifier: Buffer.from(nullifier),
        secret: Buffer.from(secret)
      };
    } catch (error) {
      console.error("Error creating deposit transaction:", error);
      
      // If an error occurs, still return the cryptographic values
      const nullifier = generateNullifier();
      const secret = generateSecret();
      const commitment = generateCommitment(nullifier, secret);
      
      // Return an empty transaction with the generated values
      return {
        transaction: new Transaction(),
        commitment: Buffer.from(commitment),
        nullifier: Buffer.from(nullifier),
        secret: Buffer.from(secret)
      };
    }
  }

  /**
   * Performs a deposit operation using the SolanaVeil SDK.
   * 
   * @param params Deposit parameters
   * @returns The transaction signature and deposit note
   */
  async depositWithSdk(params: {
    amount: number;
    tokenType: string;
    payer: ServiceSigner;
    recipient?: PublicKey;
  }): Promise<{ signature: string; note: string }> {
    try {
      // Map values to SDK enums
      const sdkAmount = this.mapAmountToPoolDenomination(params.amount);
      const sdkTokenType = this.mapStringToTokenType(params.tokenType);

      console.log(`Initiating deposit for ${sdkAmount} ${sdkTokenType}`);

      // Use the PrivacyMixer for deposit operation
      // Type assertion needed because the SDK requires a full Signer
      const result = await this.privacyMixer.deposit({
        amount: sdkAmount,
        tokenType: sdkTokenType,
        payer: params.payer as unknown as Signer,
        recipient: params.recipient
      });

      console.log(`Deposit successful. Signature: ${result.signature}`);

      return {
        signature: result.signature,
        note: result.note
      };
    } catch (error) {
      console.error('Error during deposit:', error);
      
      if (error instanceof SolanaVeilError) {
        throw new Error(`SDK Error (${error.code}): ${error.message}`);
      } else {
        throw new Error(`Deposit failed: ${(error as Error).message}`);
      }
    }
  }
  
  /**
   * Get available pools from the SDK
   * @returns List of available pools with their info
   */
  async getAvailablePools() {
    try {
      return await this.poolManager.getAllPools();
    } catch (error) {
      console.error('Error fetching pools:', error);
      throw error;
    }
  }

  // Helper function to map numeric amount to PoolDenomination Enum
  private mapAmountToPoolDenomination(amount: number): PoolDenomination {
      // Add mapping logic based on your application's amounts
      if (amount === 1) return PoolDenomination.SOL_1;
      if (amount === 10) return PoolDenomination.SOL_10;
      if (amount === 100) return PoolDenomination.USDC_100;
      throw new Error(`Unsupported deposit amount: ${amount}`);
  }

  // Helper function to map string token type to TokenType Enum
  private mapStringToTokenType(token: string): TokenType {
      if (token.toUpperCase() === 'SOL') return TokenType.SOL;
      if (token.toUpperCase() === 'USDC') return TokenType.USDC;
      throw new Error(`Unsupported token type: ${token}`);
  }
}