/**
 * Withdraw module for SolanaVeil
 */

import {
    PublicKey,
    Signer, // Keep Signer if needed for payer types
    TransactionInstruction,
    Transaction,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    ComputeBudgetProgram,
    VersionedTransaction, // Import VersionedTransaction
    TransactionMessage // Import TransactionMessage
  } from '@solana/web3.js';
import {
    Rpc,
    sendAndConfirmTx, // Keep sendAndConfirmTx
    LightSystemProgram,
    bn, // Keep bn helper
    // getValidityProof is likely a method on Rpc, not a direct export
    CompressedAccountWithMerkleContext, // Import this type
    ParsedTokenAccount, // Import ParsedTokenAccount
    getQueueForTree, // Import helper
    parseTokenLayoutWithIdl, // Import the parser function
    // Import the correct TransferParams type if available, otherwise rely on inference
    // TransferParams as CompressedTokenTransferParams // Example alias
  } from '@lightprotocol/stateless.js';
// import { TOKEN_PROGRAM_ID } from '@solana/spl-token'; // Already likely in constants

// Assuming @lightprotocol/compressed-token is installed
// If not, run: npm install @lightprotocol/compressed-token
import { CompressedTokenProgram } from '@lightprotocol/compressed-token';

import {
    Pool,
    TokenType,
    PoolDenomination,
    WithdrawParams,
    WithdrawResult,
    MerkleProof // Import MerkleProof from core types
  } from './types';

// Import errors and constants from the correct path
import {
    PROGRAM_ID,
    TOKEN_PROGRAM_IDS,
    LIGHT_SYSTEM_PROGRAM_ID, // Already imported via stateless.js? Check consistency
    ACCOUNT_COMPRESSION_PROGRAM_ID,
    PUBLIC_STATE_TREE_ID,
    DEFAULT_COMPUTE_UNIT_LIMIT, // Import constant
    SolanaVeilError, // Import error class
    ErrorCode // Import error codes
  } from '../constants'; // Correct path to constants.ts

// Use CommonJS import style for bn.js
import * as BN from 'bn.js'; // Changed import style

// Assuming snarkjs is installed: npm install snarkjs @types/snarkjs
// import * as snarkjs from 'snarkjs'; // If needed for local proof generation/verification

// Assuming PoolManager, MerkleTreeManager, NullifierSetManager are correctly imported/defined elsewhere
import { PoolManager } from './pool';
import { MerkleTreeManager } from '../compression/merkle';
import { NullifierSetManager } from '../compression/nullifier';

// Assuming these utils exist at the specified path
// If not, create them or adjust paths
import { poseidonHash } from '../utils/hash'; 
import { pickRandomTreeAndQueue } from '../utils/tree'; // Verify path is correct

// Remove duplicate import if defined elsewhere
// import { pickRandomTreeAndQueue } from '../utils/tree'; 

// ... (rest of the interfaces like WithdrawParams, WithdrawResult if not imported from types.ts) ...

export class WithdrawManager {
    private rpc: Rpc;
    private programId: PublicKey;
    private poolManager: PoolManager;
    private merkleTreeManager: MerkleTreeManager;
    private nullifierManager: NullifierSetManager;
    private proofGenerationUrl: string;
    private relayerServiceUrl: string;

    /**
     * Constructor for WithdrawManager
     */
    constructor(
      rpc: Rpc, 
      poolManager: PoolManager,
      merkleTreeManager: MerkleTreeManager,
      nullifierManager: NullifierSetManager,
      programId: PublicKey = PROGRAM_ID, // Use imported PROGRAM_ID
      proofGenerationUrl = 'https://prover.solanaveil.com/generate', // Example URL
      relayerServiceUrl = 'https://relayer.solanaveil.com' // Example URL
    ) {
      this.rpc = rpc;
      this.programId = programId;
      this.poolManager = poolManager;
      this.merkleTreeManager = merkleTreeManager;
      this.nullifierManager = nullifierManager;
      this.proofGenerationUrl = proofGenerationUrl;
      this.relayerServiceUrl = relayerServiceUrl;
    }

    /**
     * Withdraw funds from a privacy pool
     */
    async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
      // Destructure payer from params
      const { note, recipient, relayer, relayerFee = new BN(0), payer } = params; 
      // Determine the actual fee payer (signer) for the transaction
      const feePayerSigner = payer; // Use the payer from params

      try {
        // ... (steps 1-7 remain largely the same, ensure correct hash functions and checks) ...
        // 1. Parse note
        const noteData = await this.parseNote(note);
        // 2. Get pool
        const pool = await this.poolManager.getPoolByAddress(noteData.pool);
        // 3. Calculate nullifier hash
        const nullifierBuffer = poseidonHash([noteData.nullifier]); 
        const nullifierHashHex = nullifierBuffer.toString('hex');
        // 4. Check nullifier
        const isSpent = await this.nullifierManager.checkNullifier(nullifierBuffer);
        if (isSpent) {
          throw new SolanaVeilError(
            ErrorCode.ALREADY_WITHDRAWN,
            'This note has already been spent',
            { nullifierHash: nullifierHashHex }
          );
        }
        // 5. Calculate commitment
        const commitmentBuffer = poseidonHash([noteData.secret, noteData.nullifier]); 
        const commitmentHex = commitmentBuffer.toString('hex');
        // 6. Get Merkle proof
        const merkleProof = await this.merkleTreeManager.getMerkleProof(commitmentHex);
        // 7. Verify Merkle root (optional: check against recent roots)
        const currentRoot = await this.merkleTreeManager.getLatestRoot(pool.merkleTree);
        if (merkleProof.root !== currentRoot) {
           console.warn(`Merkle root mismatch. Proof root: ${merkleProof.root}, Current pool root: ${currentRoot}`);
           // Decide whether to throw based on protocol rules
        }

        // 8. Generate zero-knowledge proof
        const feeBn = bn(relayerFee.toString()); // Use bn helper
        const zkProofInputs = {
          nullifier: noteData.nullifier, 
          secret: noteData.secret,       
          merkleRoot: merkleProof.root,
          siblings: merkleProof.siblings, 
          pathIndices: this.calculatePathIndices(merkleProof.leafIndex, merkleProof.siblings.length), 
          recipient, // Use recipient directly (it's a PublicKey)
          relayerAddress: relayer ? relayer : recipient, // Use relayer PublicKey directly or recipient
          relayerFee: feeBn, 
        };
        const zkProofResult = await this.generateWithdrawalProof(zkProofInputs);

        // 9. Get validity proof using rpc.getValidityProof
        // Pass commitment hash BN directly in an array as the first argument
        const validityProof = await this.rpc.getValidityProof(
            [bn(commitmentHex, 'hex')], // Array of input hashes
            [] // Array of new addresses (empty for withdrawal)
        );

        // 10. Build withdrawal transaction
        const withdrawalTx = await this.buildWithdrawalTransaction({
          validityProof,
          zkProof: zkProofResult, 
          nullifierBuffer, 
          recipient,
          tokenType: noteData.tokenType,
          amount: new BN(noteData.amount), 
          signerPublicKey: feePayerSigner.publicKey, // Pass the fee payer's public key
          pool,
          inputCommitmentHash: commitmentHex, 
          merkleProof, 
        });

        // 11. Send transaction using VersionedTransaction
        const latestBlockhash = await this.rpc.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
            payerKey: feePayerSigner.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: withdrawalTx.instructions, // Assuming buildWithdrawalTransaction returns legacy Transaction
        }).compileToV0Message();
        const versionedTx = new VersionedTransaction(messageV0);

        // Sign with the fee payer
        versionedTx.sign([feePayerSigner]); 

        // Use sendAndConfirmTx with VersionedTransaction
        const signature = await sendAndConfirmTx(this.rpc, versionedTx); // Pass VersionedTransaction

        // 12. Return withdrawal result
        // ... (return statement) ...
        return {
          signature,
          recipient,
          amount: new BN(noteData.amount),
          tokenType: noteData.tokenType,
          fee: relayerFee
        };
      } catch (error) {
        // ... (error handling) ...
        if (error instanceof SolanaVeilError) {
          throw error;
        }

        throw new SolanaVeilError(
          ErrorCode.CONNECTION_ERROR,
          `Failed to process withdrawal: ${error instanceof Error ? error.message : String(error)}`,
          error
        );
      }
    }

    // ... parseNote (ensure it matches the format in proof.ts) ...
    private async parseNote(note: string): Promise<{
      pool: PublicKey;
      tokenType: TokenType;
      amount: number; // Keep as number matching PoolDenomination values
      secret: Uint8Array;
      nullifier: Uint8Array;
      timestamp: number;
      recipient?: PublicKey;
    }> {
       // Re-implement or ensure consistency with proof.ts parseDepositNote
       // Example using the logic from proof.ts:
       const parts = note.split('-');
       if (parts.length < 8 || parts[0] !== 'solana-veil-note' || !parts[1].startsWith('v')) {
         throw new SolanaVeilError(ErrorCode.INVALID_NOTE, 'Invalid note format or version prefix');
       }
       // Add version check if needed: const version = parseInt(parts[1].substring(1), 10); if (version !== ...) ...
       try {
         const pool = new PublicKey(parts[2]);
         const tokenType = parts[3] as TokenType;
         const amount = parseInt(parts[4], 10);
         const secret = Buffer.from(parts[5], 'hex');
         const nullifier = Buffer.from(parts[6], 'hex');
         const timestamp = parseInt(parts[7], 10);
         let recipient: PublicKey | undefined;
         if (parts.length > 8) recipient = new PublicKey(parts[8]);

         if (!Object.values(TokenType).includes(tokenType)) throw new Error('Invalid token type');
         if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');
         // Add more validation as needed

         return { pool, tokenType, amount, secret, nullifier, timestamp, recipient };
       } catch (e) {
         throw new SolanaVeilError(ErrorCode.INVALID_NOTE, `Failed to parse note: ${e instanceof Error ? e.message : String(e)}`, e);
       }
    }

    // ... calculatePathIndices ...
    private calculatePathIndices(leafIndex: number, depth: number): number[] {
      const binaryPath = leafIndex.toString(2).padStart(depth, '0');
      return binaryPath.split('').map(bit => parseInt(bit, 10));
    }

    // ... generateWithdrawalProof (ensure fetch logic is correct) ...
    private async generateWithdrawalProof(params: {
        nullifier: Uint8Array;
        secret: Uint8Array;
        merkleRoot: string;
        siblings: string[];
        pathIndices: number[];
        recipient: PublicKey;
        relayerAddress: PublicKey;
        relayerFee: BN; // Use BN
      }): Promise<{
        proof: any; // Adjust type based on actual proof format
        publicInputs: string[]; // Adjust type based on actual public inputs format
      }> {
         const body = JSON.stringify({
              nullifier: Buffer.from(params.nullifier).toString('hex'),
              secret: Buffer.from(params.secret).toString('hex'),
              merkleRoot: params.merkleRoot,
              merkleProof: params.siblings, 
              pathIndices: params.pathIndices,
              recipient: params.recipient.toBase58(),
              relayer: params.relayerAddress.toBase58(),
              fee: params.relayerFee.toString() 
            });

         try {
             const fetchResponse = await fetch(this.proofGenerationUrl, { // Use 'fetchResponse' to avoid conflict
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: body
             });

             if (!fetchResponse.ok) {
                 const errorText = await fetchResponse.text();
                 throw new Error(`Proof generation failed (${fetchResponse.status}): ${errorText}`);
             }

             const result = await fetchResponse.json();
             
             // TODO: Adapt the result parsing based on the actual prover response format
             return {
                 proof: result.proof, 
                 publicInputs: result.publicInputs 
             };
         } catch (error) {
             console.error('Error generating proof:', error);
             throw new SolanaVeilError(
                 ErrorCode.PROOF_GENERATION_FAILED,
                 'Failed to generate withdrawal proof',
                 error
             );
         }
      }

    /**
     * Build the withdrawal transaction using Light Protocol instructions
     * Returns a legacy Transaction object containing the instructions.
     */
    private async buildWithdrawalTransaction(params: {
      validityProof: any; 
      zkProof: { proof: any; publicInputs: string[] }; 
      nullifierBuffer: Buffer; 
      recipient: PublicKey;
      tokenType: TokenType;
      amount: BN;
      signerPublicKey: PublicKey; // Changed to PublicKey
      pool: Pool; 
      inputCommitmentHash: string; 
      merkleProof: MerkleProof; // Use MerkleProof from core types
    }): Promise<Transaction> { // Return legacy Transaction
      const { 
        validityProof,
        zkProof,
        nullifierBuffer,
        recipient,
        tokenType,
        amount,
        signerPublicKey, // Use PublicKey
        pool,
        inputCommitmentHash,
        merkleProof
      } = params;

      const transaction = new Transaction(); // Create legacy Transaction

      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: DEFAULT_COMPUTE_UNIT_LIMIT })
        // Add priority fee instruction if needed
      );

      // Fetch the input compressed account details including Merkle context
      // Use different fetching methods based on token type
      let inputAccountInfo: CompressedAccountWithMerkleContext | ParsedTokenAccount | null = null;
      const commitmentBN = bn(inputCommitmentHash, 'hex');

      if (tokenType === TokenType.SOL) {
          // Fetch CompressedAccountWithMerkleContext for SOL
          // Use getCompressedAccount instead of getCompressedAccountByHash
          inputAccountInfo = await this.merkleTreeManager.getCompressedAccount(commitmentBN);
      } else {
          // For SPL tokens, fetch CompressedAccountWithMerkleContext first, then parse token data
          try {
              // Use getCompressedAccount instead of getCompressedAccountByHash
              const compressedAccountResult = await this.rpc.getCompressedAccount(commitmentBN);

              if (compressedAccountResult && compressedAccountResult.data) {
                  // Parse the token data from the compressed account data
                  const parsedTokenData = parseTokenLayoutWithIdl(compressedAccountResult); // Pass the whole result

                  if (parsedTokenData) {
                      // Construct the ParsedTokenAccount structure
                      // Explicitly cast to ParsedTokenAccount to resolve union type issue
                      inputAccountInfo = {
                          parsed: parsedTokenData,
                          compressedAccount: compressedAccountResult, // Include the base compressed account info
                          merkleContext: { // Reconstruct MerkleContext from compressedAccountResult
                              merkleTree: compressedAccountResult.merkleTree,
                              // Use activeStateTreeInfo property instead of getActiveStateTreeInfo method
                              nullifierQueue: getQueueForTree(this.rpc.activeStateTreeInfo, compressedAccountResult.merkleTree), // Fetch queue based on tree
                              hash: compressedAccountResult.hash,
                              leafIndex: compressedAccountResult.leafIndex,
                          },
                          // Add other properties if needed based on ParsedTokenAccount definition
                      } as ParsedTokenAccount;
                  } else {
                      console.error(`Failed to parse token data for compressed account hash ${commitmentBN.toString(16)}`);
                      inputAccountInfo = null;
                  }
              } else {
                  inputAccountInfo = null; // Account not found or has no data
              }
          } catch (e) {
              // Handle cases where the account might exist but isn't a token account, or RPC errors
              console.error(`Failed to get or parse compressed token account by hash ${commitmentBN.toString(16)}:`, e);
              inputAccountInfo = null; // Ensure it's null if fetch fails
          }
      }

      if (!inputAccountInfo) {
        throw new SolanaVeilError(ErrorCode.ACCOUNT_NOT_FOUND, `Input compressed account not found for hash: ${inputCommitmentHash}`);
      }

      // Add spend nullifier instruction (example)
      // This might be implicitly handled by the main withdraw/transfer instruction
      // transaction.add(this.nullifierManager.createSpendNullifierInstruction({
      //    payer: signerPublicKey, // Fee payer pays for this state change
      //    nullifier: nullifierBuffer,
      // }));

      if (tokenType === TokenType.SOL) {
        // Ensure inputAccountInfo is CompressedAccountWithMerkleContext for SOL
        if (!('merkleTree' in inputAccountInfo)) { // Simple check to differentiate types
             throw new SolanaVeilError(ErrorCode.INVALID_NOTE, `Fetched account for SOL withdrawal is not of expected type.`);
        }
        // Use LightSystemProgram.decompress for SOL withdrawal
        const decompressIx = await LightSystemProgram.decompress({
          payer: signerPublicKey,
          inputCompressedAccounts: [inputAccountInfo], // Pass the fetched account info (CompressedAccountWithMerkleContext)
          toAddress: recipient, // Recipient of the decompressed SOL
          lamports: amount,
          recentInputStateRootIndices: validityProof.rootIndices,
          recentValidityProof: validityProof.compressedProof,
          // outputStateTree: // Optional: Specify if change needs to go to a specific tree
        });
        transaction.add(decompressIx);

      } else {
        // Ensure inputAccountInfo is ParsedTokenAccount for SPL
         if (!('parsed' in inputAccountInfo)) { // Simple check to differentiate types
             throw new SolanaVeilError(ErrorCode.INVALID_NOTE, `Fetched account for SPL withdrawal is not of expected type ParsedTokenAccount.`);
         }
        // For SPL tokens like USDC
        const mint = TOKEN_PROGRAM_IDS[tokenType];

        // Use CompressedTokenProgram.transfer
        // Assuming 'mint' is a required parameter for CompressedTokenProgram.transfer,
        // even if the inferred type definition shows an error.
        const transferIx = await CompressedTokenProgram.transfer({
          payer: signerPublicKey, // Fee payer
          inputCompressedTokenAccounts: [inputAccountInfo], // Pass the fetched account info (ParsedTokenAccount)
          toAddress: recipient, // Recipient of the decompressed tokens (needs an SPL account)
          amount: amount,
          // @ts-expect-error // Suppress error as per comment, assuming library requires mint
          mint: mint, // Keep mint, assuming it's required by the library despite TS error
          recentInputStateRootIndices: validityProof.rootIndices,
          recentValidityProof: validityProof.compressedProof,
        });

        transaction.add(transferIx);
      }

      // Fee payer is set when creating TransactionMessage
      // transaction.feePayer = signerPublicKey; // Not needed here for legacy tx if set later

      return transaction; // Return legacy Transaction
    }

    // ... withdrawWithRelayer (ensure payer is handled correctly) ...
    async withdrawWithRelayer(params: {
      note: string;
      recipient: PublicKey;
      // No 'payer' needed here, relayer pays
    }): Promise<WithdrawResult> {
      const { note, recipient } = params;

      try {
        const noteData = await this.parseNote(note);

        // Find relayer (implementation assumed)
        const relayerInfo = await this.findAvailableRelayer(
          noteData.tokenType,
          new BN(noteData.amount)
        );

        if (!relayerInfo) {
          throw new SolanaVeilError(ErrorCode.RELAYER_UNAVAILABLE, 'No available relayers found');
        }

        // Calculate relayer fee (example: 0.3%)
        const relayerFee = new BN(noteData.amount).muln(3).divn(1000);

        // Send request to relayer service
        const relayerResponse = await fetch(`${this.relayerServiceUrl}/withdraw`, { // Use different var name
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            note,
            recipient: recipient.toBase58(),
            relayerAddress: relayerInfo.address, // Send relayer address from findAvailableRelayer
            fee: relayerFee.toString()
          })
        });

        if (!relayerResponse.ok) {
          const errorData = await relayerResponse.json().catch(() => ({ message: 'Relayer request failed' }));
          throw new SolanaVeilError(
              ErrorCode.RELAYER_REJECTED, 
              `Relayer failed: ${errorData?.message || relayerResponse.statusText}`, 
              errorData
          );
        }

        const result = await relayerResponse.json();

        return {
          signature: result.signature,
          recipient,
          amount: new BN(noteData.amount),
          tokenType: noteData.tokenType,
          fee: relayerFee // The fee charged by the relayer
        };
      } catch (error) {
        if (error instanceof SolanaVeilError) { throw error; }

        throw new SolanaVeilError(
          ErrorCode.CONNECTION_ERROR,
          `Failed to process relayed withdrawal: ${error instanceof Error ? error.message : String(error)}`,
          error
        );
      }
    }

    // ... findAvailableRelayer (placeholder implementation) ...
    private async findAvailableRelayer(tokenType: TokenType, amount: BN): Promise<{
      address: string; // Relayer's address (base58)
      fee: string; // Relayer's fee basis points or fixed amount as string
    } | null> {
       // In a real implementation, query the relayer service or a registry
       console.warn("findAvailableRelayer is a placeholder.");
       // Example placeholder: return a default relayer if configured
       // const defaultRelayer = this.config?.defaultRelayer; // Assuming config exists
       // if (defaultRelayer) return { address: defaultRelayer.toBase58(), fee: "30" }; // 0.3% example
       return null; 
    }
}