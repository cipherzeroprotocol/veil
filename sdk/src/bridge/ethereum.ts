/**
 * Ethereum-side bridge operations for SolanaVeil
 */

// Import necessary functions and types directly from 'ethers' v6
import { BridgeProofData } from './index';
import {
  ethers,
  Contract,
  Signer, // Keep Signer import
  Provider,
  ZeroAddress,
  getBytes,
  toBigInt,
  ContractEventPayload,
  // No isSigner import needed
} from 'ethers';

// Helper for hexToBytes (already correct for v6)
function hexToBytes(hex: string): Uint8Array {
  return getBytes(hex);
}

// Bridge ABI - only the methods we need
const BRIDGE_ABI = [
  'function bridgeToSolana(bytes32 solanaRecipient, uint256 amount, uint256 tokenId) external',
  'function receiveFromSolana(bytes calldata proof, bytes32 nullifier, address recipient, uint256 amount, uint256 tokenId) external',
  'function isNullifierUsed(bytes32 nullifier) external view returns (bool)',
  'function supportedTokens(uint256 tokenId) external view returns (address)',
  'event BridgeInitiated(address indexed sender, uint256 amount, bytes32 nullifier, bytes32 solanaRecipient, uint256 indexed tokenId)',
  'event BridgeCompleted(bytes32 nullifier, address indexed recipient, uint256 amount, uint256 indexed tokenId)'
];

// ERC20 ABI - only the methods we need
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
];

// Bridge to Solana parameters
interface BridgeToSolanaParams {
  amount: string; // Keep as string for input flexibility
  tokenId: number;
  recipient: string;
}

// Claim from Solana parameters
interface ClaimFromSolanaParams {
  proofData: BridgeProofData;
  recipient: string;
}

// Bridge to Solana result
interface BridgeToSolanaResult {
  transferId: string; // This is the nullifier from the event
  sender: string;
  txHash: string;
}

/**
 * Ethereum bridge client for cross-chain operations
 */
export class EthereumBridge {
  private provider: Provider;
  private signer: Signer | null;
  private bridgeAddress: string;
  private bridgeContract: Contract;

  /**
   * Create a new Ethereum bridge client
   * @param providerOrSigner Provider or signer instance
   * @param bridgeAddress Address of the SolanaVeilBridge contract
   */
  constructor(
    providerOrSigner: Provider | Signer,
    bridgeAddress: string
  ) {
    // Type guard: Check for properties specific to Signer (like provider and getAddress)
    if ('provider' in providerOrSigner && providerOrSigner.provider && typeof (providerOrSigner as Signer).getAddress === 'function') {
      // It's likely a Signer
      this.signer = providerOrSigner as Signer; // Cast is safe here due to the check
      if (!providerOrSigner.provider) {
        throw new Error("Signer must be connected to a provider.");
      }
      this.provider = providerOrSigner.provider;
    } else {
      // If it's not a Signer, it must be a Provider
      this.provider = providerOrSigner.provider;
      this.signer = null;
    }

    this.bridgeAddress = bridgeAddress;
    this.bridgeContract = new Contract(
      bridgeAddress,
      BRIDGE_ABI,
      providerOrSigner // Provider or Signer works here
    );
  }

  /**
   * Connect with a signer (if not already connected)
   * @param signer Ethers signer
   * @returns A new instance with the signer
   */
  connect(signer: Signer): EthereumBridge {
    if (this.signer) {
      // If already connected with a signer, ensure it has a provider
      if (!this.signer.provider) {
         throw new Error("Current signer is not connected to a provider.");
      }
      // If the new signer is different, create a new instance
      if (this.signer !== signer) {
         return new EthereumBridge(signer, this.bridgeAddress);
      }
      return this;
    }
    // If no signer currently, create a new instance with the provided signer
    return new EthereumBridge(signer, this.bridgeAddress);
  }


  /**
   * Bridge tokens from Ethereum to Solana
   * @param params Bridge parameters
   * @returns Bridge transaction result
   */
  async bridgeToSolana(params: BridgeToSolanaParams): Promise<BridgeToSolanaResult> {
    const { amount, tokenId, recipient } = params;

    // Ensure we have a signer
    if (!this.signer) {
      throw new Error('Signer required for bridging tokens');
    }

    // Get the token address for this token ID
    const tokenAddress = await this.bridgeContract.supportedTokens(tokenId);
    if (tokenAddress === ZeroAddress) { // Use ZeroAddress constant
      throw new Error(`Token with ID ${tokenId} is not supported`);
    }

    // Create token contract instance
    const tokenContract = new Contract(
      tokenAddress,
      ERC20_ABI,
      this.signer
    );

    // Check allowance and balance
    const signerAddress = await this.signer.getAddress();
    const allowance: bigint = await tokenContract.allowance(signerAddress, this.bridgeAddress);
    const balance: bigint = await tokenContract.balanceOf(signerAddress);

    const amountBN = toBigInt(amount); // Use toBigInt

    // Check if balance is sufficient using bigint comparison
    if (balance < amountBN) {
      throw new Error(`Insufficient balance. Required: ${amountBN.toString()}, Available: ${balance.toString()}`);
    }

    // Approve if necessary using bigint comparison
    if (allowance < amountBN) {
      console.log(`Approving ${amountBN.toString()} tokens for bridge...`);
      const approveTx = await tokenContract.approve(this.bridgeAddress, amountBN);
      await approveTx.wait();
      console.log('Approval confirmed');
    }

    // Format Solana recipient as bytes32
    const solanaRecipient = this.formatSolanaAddress(recipient);

    // Send bridge transaction
    console.log(`Sending bridge transaction: ${amount} of token ID ${tokenId} to ${recipient}`);
    try {
      const tx = await this.bridgeContract.bridgeToSolana(
        solanaRecipient,
        amountBN,
        tokenId
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction receipt not found after waiting.");
      }
      console.log('Bridge transaction confirmed:', receipt.hash); // Use receipt.hash

      // Extract nullifier from event logs
      const bridgeInterface = new ethers.Interface(BRIDGE_ABI);
      let transferId: string | null = null;

      for (const log of receipt.logs) {
         try {
            const parsedLog = bridgeInterface.parseLog(log);
            if (parsedLog && parsedLog.name === 'BridgeInitiated') {
               transferId = parsedLog.args.nullifier;
               break;
            }
         } catch (e) {
            // Ignore logs that don't match the bridge interface
         }
      }


      if (!transferId) {
        throw new Error('BridgeInitiated event not found in transaction receipt logs');
      }

      return {
        transferId: transferId, // This is the nullifier
        sender: signerAddress,
        txHash: receipt.hash // Use receipt.hash
      };
    } catch (error) {
      console.error('Bridge transaction failed:', error);
      throw new Error(`Failed to bridge tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Claim tokens on Ethereum that were bridged from Solana
   * @param params Claim parameters
   * @returns Transaction hash
   */
  async claimFromSolana(params: ClaimFromSolanaParams): Promise<string> {
    const { proofData, recipient } = params;

    // Ensure we have a signer
    if (!this.signer) {
      throw new Error('Signer required for claiming tokens');
    }

    // Check if nullifier has already been used
    const nullifierBytes = hexToBytes(proofData.publicInputs.nullifier);
    const isNullifierUsed = await this.bridgeContract.isNullifierUsed(nullifierBytes);
    if (isNullifierUsed) {
      throw new Error('This transfer has already been claimed');
    }

    // Extract proof parameters
    const {
      proof,
      publicInputs: {
        amount,
        tokenId,
        // nullifier is already handled above
      }
    } = proofData;

    // Verify recipient address format
    let recipientAddress = recipient;
    if (!recipient.startsWith('0x')) {
      throw new Error('Ethereum recipient must be a valid Ethereum address');
    }

    // Send claim transaction
    console.log('Sending claim transaction...');
    try {
      const tx = await this.bridgeContract.receiveFromSolana(
        proof,
        nullifierBytes,
        recipientAddress,
        toBigInt(amount), // Use toBigInt
        tokenId
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction receipt not found after waiting.");
      }
      console.log('Claim transaction confirmed:', receipt.hash); // Use receipt.hash

      return receipt.hash; // Use receipt.hash
    } catch (error) {
      console.error('Claim transaction failed:', error);
      throw new Error(`Failed to claim tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a nullifier has been used
   * @param nullifier Nullifier as hex string
   * @returns Whether the nullifier has been used
   */
  async isNullifierUsed(nullifier: string): Promise<boolean> {
    const nullifierBytes = hexToBytes(nullifier);
    return this.bridgeContract.isNullifierUsed(nullifierBytes);
  }

  /**
   * Get the token address for a token ID
   * @param tokenId Token ID
   * @returns Token contract address or null if not supported
   */
  async getTokenAddress(tokenId: number): Promise<string | null> {
    const address = await this.bridgeContract.supportedTokens(tokenId);
    return address === ZeroAddress ? null : address; // Use ZeroAddress
  }

  /**
   * Listen for bridge events
   * @param callback Callback function for events
   * @returns Event listener that can be used to remove the listener
   */
  listenForBridgeEvents(
    // Use ContractEventPayload for type safety with ethers v6 listeners
    callback: (event: ContractEventPayload) => void
  ): { remove: () => void } {
    // Listen for BridgeInitiated events
    const filter = this.bridgeContract.filters.BridgeInitiated();
    // Type the listener callback
    const listener = (...args: any[]) => {
        const event = args[args.length - 1] as ContractEventPayload;
        callback(event);
    };
    this.bridgeContract.on(filter, listener);

    // Return a function to remove the listener
    return {
      remove: () => {
        this.bridgeContract.off(filter, listener);
      }
    };
  }


  /**
   * Listen for completion events
   * @param callback Callback function for events
   * @returns Event listener that can be used to remove the listener
   */
  listenForCompletionEvents(
    // Use ContractEventPayload for type safety with ethers v6 listeners
    callback: (event: ContractEventPayload) => void
  ): { remove: () => void } {
    // Listen for BridgeCompleted events
    const filter = this.bridgeContract.filters.BridgeCompleted();
     // Type the listener callback
    const listener = (...args: any[]) => {
        const event = args[args.length - 1] as ContractEventPayload;
        callback(event);
    };
    this.bridgeContract.on(filter, listener);

    // Return a function to remove the listener
    return {
      remove: () => {
        this.bridgeContract.off(filter, listener);
      }
    };
  }


  // === Private Helpers ===

  /**
   * Format a Solana address as a bytes32 value for Ethereum
   * @param solanaAddress Solana address (base58)
   * @returns bytes32 representation
   */
  private formatSolanaAddress(solanaAddress: string): string {
    try {
      // If it's already bytes32 format, return as is
      if (solanaAddress.startsWith('0x') && solanaAddress.length === 66) {
        return solanaAddress;
      }

      // If it looks like a Solana address, convert from base58
      if (!solanaAddress.startsWith('0x')) {
        // Use bs58 library for decoding
        const bs58 = require('bs58');
        const decoded = bs58.decode(solanaAddress);
        // Ensure the buffer is 32 bytes before converting to hex and padding
        if (decoded.length !== 32) {
           throw new Error('Decoded Solana address is not 32 bytes long');
        }
        return '0x' + Buffer.from(decoded).toString('hex'); // No padding needed if already 32 bytes
      }

      // If it's an Ethereum address (20 bytes), pad to bytes32 (64 hex chars + 0x)
      if (solanaAddress.startsWith('0x') && solanaAddress.length === 42) {
         return '0x' + solanaAddress.slice(2).padStart(64, '0');
      }

      throw new Error(`Invalid address format: ${solanaAddress}`);
    } catch (error) {
      throw new Error(`Invalid Solana address formatting: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}