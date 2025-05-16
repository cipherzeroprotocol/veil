/**
 * Layer 2 adapters for SolanaVeil bridge
 */

import {
  Contract,
  Signer,
  Provider,
  JsonRpcProvider,
  toBigInt,
  isError,
  ZeroAddress,
  getBytes,
  hexlify,
} from 'ethers';
import { ChainId, BridgeProofData } from './index';

// L2 Bridge ABI - only the methods we need
const L2_BRIDGE_ABI = [
  'function bridgeToSolana(bytes32 solanaRecipient, uint256 amount, uint256 tokenId) external',
  'function finalizeFromSolana(bytes32 nullifier, address recipient, uint256 amount, uint256 tokenId) external',
  'function configureToken(uint256 tokenId, address l2TokenAddress, address l1TokenAddress) external',
  'function l2TokenToId(address l2TokenAddress) external view returns (uint256)',
  'function idToL2Token(uint256 tokenId) external view returns (address)',
  'event BridgeToSolana(address indexed sender, uint256 amount, bytes32 nullifier, bytes32 solanaRecipient, uint256 indexed tokenId)',
  'event BridgeFromSolana(bytes32 nullifier, address indexed recipient, uint256 amount, uint256 indexed tokenId)'
];

// ERC20 ABI - only the methods we need
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
];

// Bridge to Solana parameters
interface BridgeToSolanaParams {
  amount: string;
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
  transferId: string;
  sender: string;
  txHash?: string;
}

/**
 * Base L2 bridge client for cross-chain operations
 */
export abstract class L2Bridge {
  protected provider: Provider;
  protected signer: Signer | null;
  protected bridgeAddress: string;
  protected bridgeContract: Contract;
  protected chainId: ChainId;

  /**
   * Create a new L2 bridge client
   * @param providerOrSigner Provider or signer instance
   * @param bridgeAddress Address of the L2 adapter contract
   * @param chainId Chain ID of the L2 network
   */
  constructor(
    providerOrSigner: Provider | Signer,
    bridgeAddress: string,
    chainId: ChainId
  ) {
    // Check if we have a signer by looking for getAddress method
    if (typeof (providerOrSigner as any).getAddress === 'function') {
      this.signer = providerOrSigner as Signer;
      this.provider = (providerOrSigner as Signer).provider || 
                      new JsonRpcProvider(''); // Fallback empty provider
    } else {
      this.provider = providerOrSigner as Provider;
      this.signer = null;
    }
    
    this.bridgeAddress = bridgeAddress;
    this.bridgeContract = new Contract(
      bridgeAddress,
      L2_BRIDGE_ABI,
      providerOrSigner
    );
    this.chainId = chainId;
  }

  /**
   * Connect with a signer (if not already connected)
   * @param signer Ethers signer
   * @returns A new instance with the signer
   */
  connect(signer: Signer): L2Bridge {
    if (this.signer) {
      return this;
    }
    
    // Create new instance for the appropriate L2
    return L2BridgeFactory.createBridge(
      this.chainId,
      signer,
      this.bridgeAddress
    );
  }

  /**
   * Bridge tokens from L2 to Solana
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
    const tokenAddress = await this.bridgeContract.idToL2Token(tokenId);
    if (tokenAddress === ZeroAddress) {
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
    const allowance = await tokenContract.allowance(signerAddress, this.bridgeAddress);
    const balance = await tokenContract.balanceOf(signerAddress);
    
    const amountBN = toBigInt(amount);
    
    // Check if balance is sufficient
    if (balance < amountBN) {
      throw new Error(`Insufficient balance. Required: ${amountBN.toString()}, Available: ${balance.toString()}`);
    }
    
    // Approve if necessary
    if (allowance < amountBN) {
      console.log(`Approving ${amountBN.toString()} tokens for bridge...`);
      const approveTx = await tokenContract.approve(this.bridgeAddress, amountBN);
      await approveTx.wait();
      console.log('Approval confirmed');
    }
    
    // Format Solana recipient as bytes32
    const solanaRecipient = this.formatSolanaAddress(recipient);
    
    // Send bridge transaction
    console.log(`Sending L2 bridge transaction: ${amount} of token ID ${tokenId} to ${recipient}`);
    try {
      const tx = await this.bridgeContract.bridgeToSolana(
        solanaRecipient,
        amountBN,
        tokenId
      );
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('L2 bridge transaction confirmed:', receipt.transactionHash);
      
      // Extract nullifier from event
      const event = receipt.events?.find(e => e.event === 'BridgeToSolana');
      if (!event) {
        throw new Error('Bridge event not found in transaction receipt');
      }
      
      const nullifier = event.args?.nullifier;
      
      return {
        transferId: nullifier,
        sender: signerAddress,
        txHash: receipt.transactionHash
      };
    } catch (error) {
      console.error('L2 bridge transaction failed:', error);
      throw new Error(`Failed to bridge tokens from L2: ${isError(error, "UNKNOWN_ERROR") ? 
        error.message : String(error)}`);
    }
  }

  /**
   * Claim tokens that were bridged from Solana
   * @param params Claim parameters
   * @returns Transaction hash
   */
  async claimFromSolana(params: ClaimFromSolanaParams): Promise<string> {
    const { proofData, recipient } = params;
    
    // Ensure we have a signer
    if (!this.signer) {
      throw new Error('Signer required for claiming tokens');
    }
    
    // Extract parameters from proof data
    const {
      publicInputs: {
        nullifier,
        amount,
        tokenId
      }
    } = proofData;
    
    // Send finalization transaction
    console.log('Finalizing L2 transfer...');
    try {
      const tx = await this.bridgeContract.finalizeFromSolana(
        hexlify(getBytes(nullifier)),
        recipient,
        toBigInt(amount),
        tokenId
      );
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('L2 finalization confirmed:', receipt.transactionHash);
      
      return receipt.transactionHash;
    } catch (error) {
      console.error('L2 finalization failed:', error);
      throw new Error(`Failed to finalize L2 transfer: ${isError(error, "UNKNOWN_ERROR") ? 
        error.message : String(error)}`);
    }
  }

  /**
   * Get the token address for a token ID on this L2
   * @param tokenId Token ID
   * @returns Token contract address or null if not supported
   */
  async getTokenAddress(tokenId: number): Promise<string | null> {
    const address = await this.bridgeContract.idToL2Token(tokenId);
    return address === ZeroAddress ? null : address;
  }

  /**
   * Get the token ID for a token address on this L2
   * @param tokenAddress Token address
   * @returns Token ID or null if not supported
   */
  async getTokenId(tokenAddress: string): Promise<number | null> {
    const id = await this.bridgeContract.l2TokenToId(tokenAddress);
    return id === toBigInt(0) ? null : Number(id);
  }

  /**
   * Format a Solana address as a bytes32 value for L2
   * @param solanaAddress Solana address (base58)
   * @returns bytes32 representation
   */
  protected formatSolanaAddress(solanaAddress: string): string {
    try {
      // If it's already bytes32 format, return as is
      if (solanaAddress.startsWith('0x') && solanaAddress.length === 66) {
        return solanaAddress;
      }
      
      // If it looks like a Solana address, convert from base58
      if (!solanaAddress.startsWith('0x')) {
        // In a real implementation, we'd use bs58 to decode
        // For this example, we'll use a simpler approach
        const bs58 = require('bs58');
        const decoded = bs58.decode(solanaAddress);
        return '0x' + Buffer.from(decoded).toString('hex').padStart(64, '0');
      }
      
      // If it's an Ethereum address, pad to bytes32
      return '0x' + solanaAddress.slice(2).padStart(64, '0');
    } catch (error) {
      throw new Error(`Invalid Solana address: ${solanaAddress}`);
    }
  }
}

/**
 * Optimism-specific bridge implementation
 */
export class OptimismBridge extends L2Bridge {
  constructor(
    providerOrSigner: Provider | Signer,
    bridgeAddress: string
  ) {
    super(providerOrSigner, bridgeAddress, ChainId.Optimism);
  }
  
  // Optimism-specific methods could be added here
}

/**
 * Arbitrum-specific bridge implementation
 */
export class ArbitrumBridge extends L2Bridge {
  constructor(
    providerOrSigner: Provider | Signer,
    bridgeAddress: string
  ) {
    super(providerOrSigner, bridgeAddress, ChainId.Arbitrum);
  }
  
  // Arbitrum-specific methods could be added here
  
  /**
   * Send a transaction to L1 through Arbitrum's outbox
   * @param destination L1 destination address
   * @param data Transaction data
   * @param value ETH value to send
   * @returns Transaction hash
   */
  async sendTxToL1(destination: string, data: string, value: string = '0'): Promise<string> {
    // Ensure we have a signer
    if (!this.signer) {
      throw new Error('Signer required for sending to L1');
    }
    
    // Send the transaction
    try {
      // Call the sendTxToL1 method on the bridge
      const tx = await this.bridgeContract.sendTxToL1(
        destination,
        data,
        { value: toBigInt(value) }
      );
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('Transaction to L1 sent:', receipt.transactionHash);
      
      return receipt.transactionHash;
    } catch (error) {
      console.error('Failed to send transaction to L1:', error);
      throw new Error(`Failed to send to L1: ${isError(error, "UNKNOWN_ERROR") ? 
        error.message : String(error)}`);
    }
  }
}

/**
 * Base-specific bridge implementation
 */
export class BaseBridge extends L2Bridge {
  constructor(
    providerOrSigner: Provider | Signer,
    bridgeAddress: string
  ) {
    super(providerOrSigner, bridgeAddress, ChainId.Base);
  }
  
  // Base-specific methods could be added here
}

/**
 * Factory class for creating L2 bridge instances
 */
export class L2BridgeFactory {
  private bridges: Map<ChainId, L2Bridge> = new Map();
  
  /**
   * Create a new L2 bridge factory
   * @param providers Map of providers/signers by chain ID
   * @param addresses Map of bridge addresses by chain ID
   */
  constructor(
    providers: Map<ChainId, Provider | Signer>,
    addresses: Map<ChainId, string>
  ) {
    // Initialize bridges for each supported L2
    for (const [chainId, provider] of Array.from(providers.entries())) {
      const address = addresses.get(chainId);
      if (!address) {
        console.warn(`No bridge address provided for chain ID ${chainId}`);
        continue;
      }
      
      this.bridges.set(
        chainId,
        L2BridgeFactory.createBridge(chainId, provider, address)
      );
    }
  }
  
  /**
   * Get a bridge instance for a specific chain
   * @param chainId Chain ID
   * @returns L2 bridge instance
   */
  getBridgeForChain(chainId: ChainId): L2Bridge {
    const bridge = this.bridges.get(chainId);
    if (!bridge) {
      throw new Error(`No bridge available for chain ID ${chainId}`);
    }
    return bridge;
  }
  
  /**
   * Create a bridge instance for a specific chain
   * @param chainId Chain ID
   * @param providerOrSigner Provider or signer
   * @param bridgeAddress Bridge address
   * @returns L2 bridge instance
   */
  static createBridge(
    chainId: ChainId,
    providerOrSigner: Provider | Signer,
    bridgeAddress: string
  ): L2Bridge {
    switch (chainId) {
      case ChainId.Optimism:
        return new OptimismBridge(providerOrSigner, bridgeAddress);
      case ChainId.Arbitrum:
        return new ArbitrumBridge(providerOrSigner, bridgeAddress);
      case ChainId.Base:
        return new BaseBridge(providerOrSigner, bridgeAddress);
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
  }
}