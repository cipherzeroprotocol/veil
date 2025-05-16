/**
 * Solana-side bridge operations for SolanaVeil
 */

import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    TransactionInstruction,
    SendTransactionError,
    Keypair,
} from '@solana/web3.js';
import * as BN from 'bn.js'; // Import BN using CommonJS style
import { TOKEN_PROGRAM_ID, createTransferInstruction } from '@solana/spl-token';
import { randomBytes } from 'crypto';
import * as borsh from 'borsh';
import { BridgeProofData, BridgeSecrets, ChainId } from './index';
import { generateBridgeProof } from './proof';

// Define an interface for the expected window.solana structure
interface SolanaWallet {
    publicKey: PublicKey | null;
    sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>;
    // Add other methods/properties if needed
}

// Extend the Window interface
declare global {
    interface Window {
        solana?: SolanaWallet;
    }
}

// Constants
const SOLANA_VEIL_PROGRAM_ID = new PublicKey('SoLVeiLzW99jkVhgcJCKpCoECGzUWMKDJvpoNk5AJ4b');
const BRIDGE_CONFIG_SEED = 'bridge_config';
const BRIDGE_TRANSFER_SEED = 'bridge_transfer';
const VAULT_AUTHORITY_SEED = 'vault_authority';
const MERKLE_TREE_SEED = 'merkle_tree';

// Bridge transfer parameters
interface BridgeToEthereumParams {
    amount: string;
    tokenId: number;
    destinationChain: number;
    recipient: string;
}

// Claim from Ethereum parameters
interface ClaimFromEthereumParams {
    transferId: string;
    secrets: BridgeSecrets;
    amount: string;
    tokenId: number;
}

// Result of a Solana bridge transaction
interface SolanaBridgeResult {
    transferId: string;
    sender: string;
    txHash: string;
    secrets: BridgeSecrets;
}

// Serializable bridge transfer state
class BridgeTransferState {
    destChainId: number;
    amount: BN; // Use BN directly as type after fixing import
    tokenMint: Uint8Array;
    destTokenId: BN; // Use BN directly as type
    nullifier: Uint8Array;
    destAddress: Uint8Array;
    timestamp: BN; // Use BN directly as type
    status: number;
    bump: number;

    constructor(props: {
        destChainId: number;
        amount: BN; // Use BN directly as type
        tokenMint: Uint8Array;
        destTokenId: BN; // Use BN directly as type
        nullifier: Uint8Array;
        destAddress: Uint8Array;
        timestamp: BN; // Use BN directly as type
        status: number;
        bump: number;
    }) {
        this.destChainId = props.destChainId;
        this.amount = props.amount;
        this.tokenMint = props.tokenMint;
        this.destTokenId = props.destTokenId;
        this.nullifier = props.nullifier;
        this.destAddress = props.destAddress;
        this.timestamp = props.timestamp;
        this.status = props.status;
        this.bump = props.bump;
    }

    static schema = new Map([
        [
            BridgeTransferState,
            {
                kind: 'struct',
                fields: [
                    ['destChainId', 'u16'],
                    ['amount', 'u64'],
                    ['tokenMint', [32]],
                    ['destTokenId', 'u64'],
                    ['nullifier', [32]],
                    ['destAddress', [32]],
                    ['timestamp', 'i64'],
                    ['status', 'u8'],
                    ['bump', 'u8']
                ]
            }
        ]
    ]);
}

/**
 * Solana bridge client for cross-chain operations
 */
export class SolanaBridge {
    private connection: Connection;
    private programId: PublicKey;

    /**
     * Create a new Solana bridge client
     * @param connection Solana connection
     * @param programId SolanaVeil program ID (optional)
     */
    constructor(connection: Connection, programId?: PublicKey) {
        this.connection = connection;
        this.programId = programId || SOLANA_VEIL_PROGRAM_ID;
    }

    /**
     * Bridge tokens from Solana to Ethereum
     * @param params Bridge parameters
     * @returns Bridge transaction result
     */
    async bridgeToEthereum(params: BridgeToEthereumParams): Promise<SolanaBridgeResult> {
        const { amount, tokenId, destinationChain, recipient } = params;

        const amountBN = new BN(amount);
        const destTokenIdBN = new BN(tokenId);

        // Get wallet & token info (assuming wallet-adapter is used in the application)
        // Use the defined interface/type assertion
        const wallet = window.solana;
        if (!wallet?.publicKey) {
            throw new Error('Wallet not connected or publicKey not available');
        }

        // Generate a secret and nullifier for privacy
        const secret = randomBytes(32);
        const nullifier = await this.generateNullifier(secret);
        const nullifierArray = Buffer.from(nullifier, 'hex');

        // Convert Ethereum recipient to bytes
        let destAddressBytes: Buffer;
        if (recipient.startsWith('0x')) {
            // Ethereum address (20 bytes)
            destAddressBytes = Buffer.from(recipient.slice(2).padStart(64, '0'), 'hex');
        } else {
            // Solana address (32 bytes)
            destAddressBytes = new PublicKey(recipient).toBuffer();
        }

        // Find the bridge config PDA
        const [bridgeConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from(BRIDGE_CONFIG_SEED)],
            this.programId
        );

        // Find the transfer PDA using the nullifier
        const [bridgeTransferPda, bridgeTransferBump] = PublicKey.findProgramAddressSync(
            [Buffer.from(BRIDGE_TRANSFER_SEED), nullifierArray],
            this.programId
        );

        // Find the vault authority PDA
        const [vaultAuthorityPda, vaultAuthorityBump] = PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_AUTHORITY_SEED)],
            this.programId
        );

        // Get the token mint for this token ID (would come from config in practice)
        const tokenMint = await this.getTokenMintForId(tokenId);

        // Get the user's token account for this mint
        const userTokenAccount = await this.findTokenAccount(wallet.publicKey, tokenMint);

        // Get the vault token account for this mint
        const vaultTokenAccount = await this.findTokenAccount(vaultAuthorityPda, tokenMint);

        // Get the treasury token account for this mint
        const treasuryTokenAccount = await this.getTreasuryTokenAccount(tokenMint);

        // Find the merkle tree account
        const [merkleTreePda] = PublicKey.findProgramAddressSync(
            [Buffer.from(MERKLE_TREE_SEED)],
            this.programId
        );

        // Create lock_tokens_for_bridge instruction
        const lockInstruction = new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: bridgeConfigPda, isSigner: false, isWritable: false },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: bridgeTransferPda, isSigner: false, isWritable: true },
                { pubkey: tokenMint, isSigner: false, isWritable: false },
                { pubkey: userTokenAccount, isSigner: false, isWritable: true },
                { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
                { pubkey: vaultAuthorityPda, isSigner: false, isWritable: false },
                { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
                { pubkey: merkleTreePda, isSigner: false, isWritable: true },
                { pubkey: vaultAuthorityPda, isSigner: false, isWritable: false }, // tree_authority reuses vault auth
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
            ],
            data: Buffer.from([
                0, // Instruction discriminator for lock_tokens_for_bridge (assuming 0)
                ...amountBN.toArray('le', 8), // amount (u64)
                ...new BN(destinationChain).toArray('le', 2), // destination_chain_id (u16)
                ...Array.from(destAddressBytes), // destination_address ([u8; 32]) - Use Array.from
                ...Array.from(nullifierArray), // nullifier ([u8; 32]) - Use Array.from
                bridgeTransferBump // bump (u8)
            ])
        });

        // Create and sign the transaction
        const transaction = new Transaction().add(lockInstruction);

        // Set recent blockhash and fee payer
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;

        // Sign and send the transaction
        try {
            const signature = await wallet.sendTransaction(transaction, this.connection);
            console.log('Bridge transaction sent:', signature);

            // Generate the commitment for record-keeping
            const commitment = await this.generateCommitment(
                secret,
                amountBN,
                destTokenIdBN, // Use the correctly declared variable
                ChainId.Solana
            );

            return {
                transferId: bridgeTransferPda.toBase58(),
                sender: wallet.publicKey.toBase58(),
                txHash: signature,
                secrets: {
                    secret: secret,
                    nullifier: nullifier,
                    commitment: commitment
                }
            };
        } catch (error) {
            console.error('Bridge transaction failed:', error);
            // Throw a regular Error with the message
            throw new Error(
                `Failed to send bridge transaction: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Claim tokens on Solana that were bridged from Ethereum
     * @param params Claim parameters
     * @returns Transaction signature
     */
    async claimFromEthereum(params: ClaimFromEthereumParams): Promise<string> {
        const { transferId, secrets, amount, tokenId } = params;

        // Get wallet info
        const wallet = window.solana;
        if (!wallet?.publicKey) {
            throw new Error('Wallet not connected or publicKey not available');
        }

        // Convert parameters
        const amountBN = new BN(amount);
        const nullifierArray = Buffer.from(secrets.nullifier, 'hex');

        // Find the bridge config PDA
        const [bridgeConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from(BRIDGE_CONFIG_SEED)],
            this.programId
        );

        // Find the nullifier account
        const [nullifierAccountPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('nullifier_account')],
            this.programId
        );

        // Get the token mint for this token ID
        const tokenMint = await this.getTokenMintForId(tokenId);

        // Find the vault authority PDA
        const [vaultAuthorityPda, vaultAuthorityBump] = PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_AUTHORITY_SEED)],
            this.programId
        );

        // Get the vault token account for this mint
        const vaultTokenAccount = await this.findTokenAccount(vaultAuthorityPda, tokenMint);

        // Get or create the recipient token account
        const recipientTokenAccount = await this.findOrCreateTokenAccount(
            wallet.publicKey,
            tokenMint
        );

        // Generate ZK proof for the claim
        const proofData = await this.generateClaimProof(
            secrets,
            amount,
            tokenId,
            wallet.publicKey.toBase58(),
            ChainId.Ethereum
        );

        // Create process_incoming_transfer instruction
        const claimInstruction = new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: bridgeConfigPda, isSigner: false, isWritable: false },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: nullifierAccountPda, isSigner: false, isWritable: true },
                { pubkey: tokenMint, isSigner: false, isWritable: false },
                { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
                { pubkey: vaultAuthorityPda, isSigner: false, isWritable: false },
                { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
            ],
            data: Buffer.from([
                1, // Instruction discriminator for process_incoming_transfer
                ...new BN(ChainId.Ethereum).toArray('le', 2), // source_chain_id (u16)
                ...Array.from(nullifierArray), // source_nullifier ([u8; 32]) - Use Array.from
                ...amountBN.toArray('le', 8), // amount (u64)
                ...Array.from(wallet.publicKey.toBuffer()) // recipient (Pubkey)
            ])
        });

        // Create and sign the transaction
        const transaction = new Transaction().add(claimInstruction);

        // Set recent blockhash and fee payer
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;

        // Sign and send the transaction
        try {
            const signature = await wallet.sendTransaction(transaction, this.connection);
            console.log('Claim transaction sent:', signature);
            return signature;
        } catch (error) {
            console.error('Claim transaction failed:', error);
            // Throw a regular Error with the message
            throw new Error(
                `Failed to send claim transaction: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Get the state of a bridge transfer
     * @param transferId ID of the transfer (PDA address)
     * @returns Bridge transfer state
     */
    async getBridgeTransferState(transferId: string): Promise<BridgeTransferState> {
        const transferPda = new PublicKey(transferId);

        // Fetch the account data
        const accountInfo = await this.connection.getAccountInfo(transferPda);
        if (!accountInfo) {
            throw new Error(`Bridge transfer account ${transferId} not found`);
        }

        // Deserialize the data
        const transferState = borsh.deserialize(
            BridgeTransferState.schema,
            BridgeTransferState,
            accountInfo.data.slice(8) // Skip the 8-byte discriminator
        );

        return transferState;
    }

    // === Helper Methods ===

    /**
     * Find a token account for a specific owner and mint
     * @param owner Account owner
     * @param mint Token mint
     * @returns Token account
     */
    private async findTokenAccount(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
        const [tokenAccount] = PublicKey.findProgramAddressSync(
            [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
            TOKEN_PROGRAM_ID
        );
        return tokenAccount;
    }

    /**
     * Find or create a token account for a specific owner and mint
     * @param owner Account owner
     * @param mint Token mint
     * @returns Token account
     */
    private async findOrCreateTokenAccount(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
        // In a real implementation, this would check if the account exists
        // and create it if it doesn't
        return this.findTokenAccount(owner, mint);
    }

    /**
     * Get the token mint for a specific token ID
     * @param tokenId Token ID
     * @returns Token mint address
     */
    private async getTokenMintForId(tokenId: number): Promise<PublicKey> {
        // In a real implementation, this would query a config account
        // or lookup table for the token mint based on the ID

        // For this example, we'll use some hardcoded values
        switch (tokenId) {
            case 1:
                return new PublicKey('So11111111111111111111111111111111111111112'); // SOL
            case 2:
                return new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
            default:
                throw new Error(`Unknown token ID: ${tokenId}`);
        }
    }

    /**
     * Get the treasury token account for a specific mint
     * @param mint Token mint
     * @returns Treasury token account
     */
    private async getTreasuryTokenAccount(mint: PublicKey): Promise<PublicKey> {
        // In a real implementation, this would get the treasury account from config

        // Find the bridge config PDA
        const [bridgeConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from(BRIDGE_CONFIG_SEED)],
            this.programId
        );

        // Fetch account data to get treasury pubkey
        const accountInfo = await this.connection.getAccountInfo(bridgeConfigPda);
        if (!accountInfo) {
            throw new Error('Bridge config account not found');
        }

        // In a real implementation, we'd deserialize the account data
        // to get the treasury pubkey, but for this example we'll use a default
        const treasury = new PublicKey('Treasury111111111111111111111111111111111');

        // Find the treasury's token account for this mint
        return this.findTokenAccount(treasury, mint);
    }

    /**
     * Generate a nullifier from a secret
     * @param secret Secret bytes
     * @returns Nullifier as hex string
     */
    private async generateNullifier(secret: Buffer): Promise<string> {
        // In a real implementation, this would use the same hashing logic
        // as the circuit (Poseidon hash)

        // For this example, we'll use SHA-256
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256');
        hash.update(secret);
        hash.update(Buffer.from([ChainId.Solana])); // Add source chain ID
        return hash.digest('hex');
    }

    /**
     * Generate a commitment from a secret and other data
     * @param secret Secret bytes
     * @param amount Amount
     * @param tokenId Token ID
     * @param sourceChain Source chain ID
     * @returns Commitment as hex string
     */
    private async generateCommitment(
        secret: Buffer,
        amount: BN, // Use BN directly as type
        tokenId: BN, // Use BN directly as type
        sourceChain: ChainId
    ): Promise<string> {
        // In a real implementation, this would use the same hashing logic
        // as the circuit (Poseidon hash)

        // For this example, we'll use SHA-256
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256');
        hash.update(secret);
        hash.update(Buffer.from(amount.toArray('le', 8)));
        hash.update(Buffer.from(tokenId.toArray('le', 8)));
        hash.update(Buffer.from([sourceChain]));
        return hash.digest('hex');
    }

    /**
     * Generate a ZK proof for claiming tokens
     * @param secrets Bridge secrets
     * @param amount Amount
     * @param tokenId Token ID
     * @param recipient Recipient address
     * @param sourceChain Source chain ID
     * @returns Bridge proof data
     */
    private async generateClaimProof(
        secrets: BridgeSecrets,
        amount: string,
        tokenId: number,
        recipient: string,
        sourceChain: ChainId
    ): Promise<BridgeProofData> {
        // This would call into the proof generation module
        return generateBridgeProof({
            secret: secrets.secret,
            amount,
            tokenId,
            nullifier: secrets.nullifier,
            commitment: secrets.commitment,
            recipient,
            sourceChain,
            destinationChain: ChainId.Solana,
        });
    }
}