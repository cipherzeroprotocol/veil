import { Connection, PublicKey } from '@solana/web3.js';
import { JsonRpcProvider, BrowserProvider, } from 'ethers';

import { BridgeDirection, BridgeProofData, BridgeSecrets, BridgeTransferDetails, ChainId, EthereumBridge, generateBridgeProof, initializeL2BridgeFactory, L2BridgeFactory, SolanaBridge, SolanaVeilBridge } from '../../../sdk/src/bridge';

// Re-export types from the SDK

// Configuration for the bridge service
interface BridgeConfig {
  solanaRpcUrl: string;
  solanaProgramId: string;
  ethereumRpcUrl: string;
  ethereumBridgeAddress: string;
  optimismRpcUrl?: string;
  optimismBridgeAddress?: string;
  arbitrumRpcUrl?: string;
  arbitrumBridgeAddress?: string;
  baseRpcUrl?: string;
  baseBridgeAddress?: string;
}

// Interface for the bridge service
export interface IBridgeService {
  // Initialize the bridge
  initialize(): Promise<void>;
  
  // Connect wallets
  connectSolanaWallet(publicKey: PublicKey): void;
  connectEthereumWallet(provider: BrowserProvider): void;
  
  // Bridge operations
  bridgeTokens(params: BridgeTokensParams): Promise<BridgeTransferResult>;
  claimTokens(transferId: string): Promise<string>;
  
  // Query methods
  getTransferDetails(transferId: string): Promise<BridgeTransferDetails>;
  getTransfersForAddress(address: string): Promise<BridgeTransferDetails[]>;
  getSupportedTokens(chainId: number): Promise<SupportedToken[]>;
}

// Parameters for bridging tokens
export interface BridgeTokensParams {
  sourceChain: number;
  destinationChain: number;
  amount: string;
  tokenId: number;
  recipient: string;
}

// Result of a bridge transaction
export interface BridgeTransferResult {
  transfer: BridgeTransferDetails;
  secrets?: BridgeSecrets;
}

// Supported token information
export interface SupportedToken {
  id: number;
  symbol: string;
  name: string;
  logo: string;
  minAmount: string;
  maxAmount: string;
}

/**
 * Service for interacting with the SolanaVeil bridge
 */
export class BridgeService implements IBridgeService {
  private config: BridgeConfig;
  private solanaConnection: Connection | null = null;
  private solanaProgramId: PublicKey | null = null;
  private solanaBridge: SolanaBridge | null = null;
  private ethereumBridge: EthereumBridge | null = null;
  private l2BridgeFactory: L2BridgeFactory | null = null;
  private bridge: SolanaVeilBridge | null = null;
  
  private solanaWallet: PublicKey | null = null;
  private ethereumProvider: BrowserProvider | null = null;
  
  // Mapping of transfer IDs to secrets (stored locally)
  private transferSecrets: Map<string, BridgeSecrets> = new Map();
  
  constructor(config: BridgeConfig) {
    this.config = config;
  }
  
  /**
   * Initialize the bridge service
   */
  async initialize(): Promise<void> {
    try {
      // Initialize Solana connection
      this.solanaConnection = new Connection(this.config.solanaRpcUrl);
      this.solanaProgramId = new PublicKey(this.config.solanaProgramId);
      
      // Initialize Solana bridge
      this.solanaBridge = new SolanaBridge(this.solanaConnection, this.solanaProgramId);
      
      // Initialize Ethereum bridge
      const ethProvider = new JsonRpcProvider(this.config.ethereumRpcUrl);
      this.ethereumBridge = new EthereumBridge(ethProvider, this.config.ethereumBridgeAddress);
      
      // Initialize L2 bridges if configured
      const providers = new Map();
      const addresses = new Map();
      
      // Add Optimism if configured
      if (this.config.optimismRpcUrl && this.config.optimismBridgeAddress) {
        providers.set(
          10, // Chain ID for Optimism
          new JsonRpcProvider(this.config.optimismRpcUrl)
        );
        addresses.set(10, this.config.optimismBridgeAddress);
      }
      
      // Add Arbitrum if configured
      if (this.config.arbitrumRpcUrl && this.config.arbitrumBridgeAddress) {
        providers.set(
          42161, // Chain ID for Arbitrum
          new JsonRpcProvider(this.config.arbitrumRpcUrl)
        );
        addresses.set(42161, this.config.arbitrumBridgeAddress);
      }
      
      // Add Base if configured
      if (this.config.baseRpcUrl && this.config.baseBridgeAddress) {
        providers.set(
          8453, // Chain ID for Base
          new JsonRpcProvider(this.config.baseRpcUrl)
        );
        addresses.set(8453, this.config.baseBridgeAddress);
      }
      
      // Create L2 bridge factory if any L2s are configured
      if (providers.size > 0) {
        this.l2BridgeFactory = initializeL2BridgeFactory({
          optimismRpcUrl: this.config.optimismRpcUrl,
          optimismBridgeAddress: this.config.optimismBridgeAddress,
          arbitrumRpcUrl: this.config.arbitrumRpcUrl,
          arbitrumBridgeAddress: this.config.arbitrumBridgeAddress,
          baseRpcUrl: this.config.baseRpcUrl,
          baseBridgeAddress: this.config.baseBridgeAddress
        });
      }
      
      // Create the bridge if all components are initialized
      if (this.solanaBridge && this.ethereumBridge && this.l2BridgeFactory) {
        this.bridge = new SolanaVeilBridge(
          this.solanaBridge,
          this.ethereumBridge,
          this.l2BridgeFactory
        );
        console.log('Bridge service initialized successfully');
      } else {
        console.warn('Bridge service initialized with limited functionality');
      }
    } catch (error) {
      console.error('Failed to initialize bridge service:', error);
      throw new Error(`Bridge initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Connect a Solana wallet to the bridge
   * @param publicKey Solana wallet public key
   */
  connectSolanaWallet(publicKey: PublicKey): void {
    this.solanaWallet = publicKey;
    console.log('Solana wallet connected:', publicKey.toBase58());
  }
  
  /**
   * Connect an Ethereum wallet to the bridge
   * @param provider Ethereum Web3 provider (MetaMask)
   */
  connectEthereumWallet(provider: BrowserProvider): void {
    this.ethereumProvider = provider;
    
    // Update Ethereum bridge with signer
    if (this.ethereumBridge) {
      provider.getSigner().then(signer => {
        if (this.ethereumBridge) {
          this.ethereumBridge = this.ethereumBridge.connect(signer);
        }
      }).catch(err => {
        console.error('Failed to get signer:', err);
      });
    }
    
    // Update L2 bridges with signer if available
    if (this.l2BridgeFactory) {
      // Each L2 bridge would need to be updated with the signer
      // This would happen when accessing the bridge through the factory
    }
    
    console.log('Ethereum wallet connected');
  }
  
  /**
   * Bridge tokens between chains
   * @param params Bridge parameters
   * @returns Bridge transfer result
   */
  async bridgeTokens(params: BridgeTokensParams): Promise<BridgeTransferResult> {
    const { sourceChain, destinationChain, amount, tokenId, recipient } = params;
    
    // Ensure bridge is initialized
    if (!this.bridge) {
      throw new Error('Bridge service not fully initialized');
    }
    
    try {
      let result: BridgeTransferResult;
      
      // Determine direction and execute appropriate bridge function
      if (sourceChain === 1) { // Solana
        // Ensure Solana wallet is connected
        if (!this.solanaWallet) {
          throw new Error('Solana wallet not connected');
        }
        
        // Bridge from Solana to Ethereum/L2
        const bridgeResult = await this.bridge.transferFromSolana({
          sourceChain,
          destinationChain,
          amount,
          tokenId,
          recipient
        });
        
        result = bridgeResult;
        
        // Store secrets for later use
        if (bridgeResult.secrets) {
          this.transferSecrets.set(bridgeResult.transfer.id, bridgeResult.secrets);
          
          // Also store in local storage for persistence
          this.saveSecretsToLocalStorage();
        }
      } else {
        // Ensure Ethereum wallet is connected
        if (!this.ethereumProvider) {
          throw new Error('Ethereum wallet not connected');
        }
        
        // Bridge from Ethereum/L2 to Solana
        const bridgeResult = await this.bridge.transferToSolana({
          sourceChain,
          destinationChain,
          amount,
          tokenId,
          recipient
        });
        
        result = bridgeResult;
      }
      
      return result;
    } catch (error) {
      console.error('Bridge transaction failed:', error);
      throw new Error(`Failed to bridge tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Claim tokens that were bridged
   * @param transferId ID of the transfer to claim
   * @returns Transaction hash
   */
  async claimTokens(transferId: string): Promise<string> {
    // Ensure bridge is initialized
    if (!this.bridge) {
      throw new Error('Bridge service not fully initialized');
    }
    
    try {
      // Get transfer details
      const transfer = await this.getTransferDetails(transferId);
      
      // Determine direction and requirements for claiming
      let txHash: string;
      
      if (
        transfer.direction === BridgeDirection.SolanaToEthereum ||
        transfer.direction === BridgeDirection.SolanaToL2
      ) {
        // Ensure Ethereum wallet is connected
        if (!this.ethereumProvider) {
          throw new Error('Ethereum wallet not connected');
        }
        
        // For Solana -> Ethereum/L2, we need to generate a proof
        // Get the secrets for this transfer
        const secrets = this.transferSecrets.get(transferId);
        if (!secrets) {
          throw new Error('Transfer secrets not found. Unable to generate proof');
        }
        
        // Generate proof
        const proofData = await this.generateProof(transfer, secrets);
        
        // Claim on Ethereum/L2
        const result = await this.bridge.claimBridgedTokens(
          transferId,
          proofData
        );
        
        txHash = result.transfer.txHash || '';
      } else {
        // Ensure Solana wallet is connected
        if (!this.solanaWallet) {
          throw new Error('Solana wallet not connected');
        }
        
        // For Ethereum/L2 -> Solana, we need secrets
        const secrets = this.transferSecrets.get(transferId);
        if (!secrets) {
          throw new Error('Transfer secrets not found. Unable to claim tokens');
        }
        
        // Claim on Solana
        const result = await this.bridge.claimBridgedTokens(
          transferId,
          undefined,
          secrets
        );
        
        txHash = result.transfer.txHash || '';
      }
      
      return txHash;
    } catch (error) {
      console.error('Claim transaction failed:', error);
      throw new Error(`Failed to claim tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get details for a specific transfer
   * @param transferId ID of the transfer
   * @returns Bridge transfer details
   */
  async getTransferDetails(transferId: string): Promise<BridgeTransferDetails> {
    // Ensure bridge is initialized
    if (!this.bridge) {
      throw new Error('Bridge service not fully initialized');
    }
    
    try {
      return await this.bridge.getTransferDetails(transferId);
    } catch (error) {
      console.error('Failed to get transfer details:', error);
      throw new Error(`Failed to get transfer details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get all transfers for a specific address
   * @param address Address to get transfers for
   * @returns Array of bridge transfer details
   */
  async getTransfersForAddress(address: string): Promise<BridgeTransferDetails[]> {
    // Ensure bridge is initialized
    if (!this.bridge) {
      throw new Error('Bridge service not fully initialized');
    }
    
    try {
      return await this.bridge.getTransfersForAddress(address);
    } catch (error) {
      console.error('Failed to get transfers:', error);
      throw new Error(`Failed to get transfers: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get supported tokens for a specific chain
   * @param chainId Chain ID
   * @returns Array of supported tokens
   */
  async getSupportedTokens(chainId: number): Promise<SupportedToken[]> {
    // In a real implementation, this would query the chain or an API
    // For this example, we'll return some mock data
    
    const tokens: Record<number, SupportedToken[]> = {
      // Solana tokens
      1: [
        {
          id: 1,
          symbol: 'SOL',
          name: 'Solana',
          logo: '/images/tokens/sol.svg',
          minAmount: '0.1',
          maxAmount: '100'
        },
        {
          id: 2,
          symbol: 'USDC',
          name: 'USD Coin',
          logo: '/images/tokens/usdc.svg',
          minAmount: '1',
          maxAmount: '10000'
        }
      ],
      
      // Ethereum tokens
      2: [
        {
          id: 1,
          symbol: 'ETH',
          name: 'Ethereum',
          logo: '/images/tokens/eth.svg',
          minAmount: '0.01',
          maxAmount: '10'
        },
        {
          id: 2,
          symbol: 'USDC',
          name: 'USD Coin',
          logo: '/images/tokens/usdc.svg',
          minAmount: '1',
          maxAmount: '10000'
        }
      ],
      
      // Optimism tokens
      10: [
        {
          id: 1,
          symbol: 'ETH',
          name: 'Ethereum',
          logo: '/images/tokens/eth.svg',
          minAmount: '0.01',
          maxAmount: '10'
        },
        {
          id: 2,
          symbol: 'USDC',
          name: 'USD Coin',
          logo: '/images/tokens/usdc.svg',
          minAmount: '1',
          maxAmount: '10000'
        }
      ],
      
      // Arbitrum tokens
      42161: [
        {
          id: 1,
          symbol: 'ETH',
          name: 'Ethereum',
          logo: '/images/tokens/eth.svg',
          minAmount: '0.01',
          maxAmount: '10'
        },
        {
          id: 2,
          symbol: 'USDC',
          name: 'USD Coin',
          logo: '/images/tokens/usdc.svg',
          minAmount: '1',
          maxAmount: '10000'
        }
      ],
      
      // Base tokens
      8453: [
        {
          id: 1,
          symbol: 'ETH',
          name: 'Ethereum',
          logo: '/images/tokens/eth.svg',
          minAmount: '0.01',
          maxAmount: '10'
        },
        {
          id: 2,
          symbol: 'USDC',
          name: 'USD Coin',
          logo: '/images/tokens/usdc.svg',
          minAmount: '1',
          maxAmount: '10000'
        }
      ]
    };
    
    return tokens[chainId] || [];
  }
  
  // === Private Helper Methods ===
  
  /**
   * Generate a proof for claiming tokens
   * @param transfer Transfer details
   * @param secrets Transfer secrets
   * @returns Bridge proof data
   */
  private async generateProof(
    transfer: BridgeTransferDetails,
    secrets: BridgeSecrets
  ): Promise<BridgeProofData> {
    return await generateBridgeProof({
      secret: secrets.secret,
      amount: transfer.amount,
      tokenId: transfer.tokenId,
      nullifier: secrets.nullifier,
      commitment: secrets.commitment,
      recipient: transfer.recipient,
      sourceChain: transfer.sourceChain,
      destinationChain: transfer.destinationChain
    });
  }
  
  /**
   * Save transfer secrets to local storage
   */
  private saveSecretsToLocalStorage(): void {
    try {
      const secrets: Record<string, {
        secret: string;
        nullifier: string;
        commitment: string;
      }> = {};
      
      // Convert Uint8Arrays to strings for storage
      this.transferSecrets.forEach((value, key) => {
        secrets[key] = {
          secret: Buffer.from(value.secret).toString('hex'),
          nullifier: value.nullifier,
          commitment: value.commitment
        };
      });
      
      localStorage.setItem('solanaveil_bridge_secrets', JSON.stringify(secrets));
    } catch (error) {
      console.error('Failed to save secrets to local storage:', error);
    }
  }
  
  /**
   * Load transfer secrets from local storage
   */
  private loadSecretsFromLocalStorage(): void {
    try {
      const secretsJson = localStorage.getItem('solanaveil_bridge_secrets');
      if (!secretsJson) return;
      
      const secrets = JSON.parse(secretsJson) as Record<string, {
        secret: string;
        nullifier: string;
        commitment: string;
      }>;
      
      // Convert strings back to Uint8Arrays
      Object.entries(secrets).forEach(([key, value]) => {
        this.transferSecrets.set(key, {
          secret: new Uint8Array(Buffer.from(value.secret, 'hex')),
          nullifier: value.nullifier,
          commitment: value.commitment
        });
      });
    } catch (error) {
      console.error('Failed to load secrets from local storage:', error);
    }
  }

  /**
   * Get supported chains including all L2 networks
   */
  getSupportedChains(): ChainId[] {
    const chains = [ChainId.Solana, ChainId.Ethereum];
    
    // Add L2 chains if L2BridgeFactory is initialized
    if (this.l2BridgeFactory) {
      // Since getSupportedChains is missing in the current L2BridgeFactory, 
      // we'll manually return the known L2 chains
      return [...chains, ChainId.Optimism, ChainId.Arbitrum, ChainId.Base];
    }
    
    return chains;
  }

  /**
   * Check if a specific chain is supported
   */
  isChainSupported(chainId: ChainId): boolean {
    // Base chains are always supported
    if (Number(chainId) === Number(ChainId.Solana) || Number(chainId) === Number(ChainId.Ethereum)) {
      return true;
    }
    
    // L2 chains depend on the factory
    if (this.l2BridgeFactory) {
      // Check if the chain ID is one of the supported L2s
      return [ChainId.Optimism, ChainId.Arbitrum, ChainId.Base].includes(chainId);
    }
    
    return false;
  }
}

// Create and export a singleton instance
export const bridgeService = new BridgeService({
  solanaRpcUrl: process.env.REACT_APP_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  solanaProgramId: process.env.REACT_APP_SOLANA_PROGRAM_ID || 'SoLVeiLzW99jkVhgcJCKpCoECGzUWMKDJvpoNk5AJ4b',
  ethereumRpcUrl: process.env.REACT_APP_ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/your-infura-key',
  ethereumBridgeAddress: process.env.REACT_APP_ETHEREUM_BRIDGE_ADDRESS || '0x1234567890123456789012345678901234567890',
  optimismRpcUrl: process.env.REACT_APP_OPTIMISM_RPC_URL,
  optimismBridgeAddress: process.env.REACT_APP_OPTIMISM_BRIDGE_ADDRESS,
  arbitrumRpcUrl: process.env.REACT_APP_ARBITRUM_RPC_URL,
  arbitrumBridgeAddress: process.env.REACT_APP_ARBITRUM_BRIDGE_ADDRESS,
  baseRpcUrl: process.env.REACT_APP_BASE_RPC_URL,
  baseBridgeAddress: process.env.REACT_APP_BASE_BRIDGE_ADDRESS
});