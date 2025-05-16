/**
 * SolanaVeil SDK Entry Point
 *
 * Exports the core functionalities, compression utilities,
 * compliance tools, and common types/constants.
 */

// Core functionality (Deposits, Withdrawals, Pools)
export * from './core';

// Compression utilities (Merkle Trees, Proofs, Tokens)
export * from './compression';

// Compliance tools (Risk Assessment, Monitoring)
export * from './compliance';

// Common utilities
export { DepositNoteData } from './core';
export * from './utils';

// Re-export main constants and error types
// Explicitly re-export LIGHT_SYSTEM_PROGRAM_ID to resolve ambiguity
export { LIGHT_SYSTEM_PROGRAM_ID } from './constants';
export * from './constants';

// Optionally export the main SDK class if you create one later
// export { SolanaVeilSDK } from './sdk';
/**
 * SolanaVeil SDK
 * Complete privacy-preserving mixer with cross-chain bridging capabilities
 */

// Export core modules
export * from './core';

// Export compression modules
export * from './compression';

// Export compliance modules
export * from './compliance';



// Export constants
export * from './constants';

// Export bridge module
export * from './bridge';

// SDK version
export const SDK_VERSION = '1.0.0';

/**
 * Initialize the SolanaVeil SDK
 * @param options Initialization options
 * @returns Initialized SolanaVeil SDK instance
 */
export function initializeSolanaVeil(options: {
  rpcUrl?: string;
  programId?: string;
  ethRpcUrl?: string;
  ethBridgeAddress?: string;
  l2RpcUrls?: Record<string, string>;
  l2BridgeAddresses?: Record<string, string>;
}) {
  // Import needed dependencies
  const { Connection, PublicKey } = require('@solana/web3.js');
  const { ethers } = require('ethers');
  const {
    SolanaVeilBridge,
    SolanaBridge,
    EthereumBridge,
    L2BridgeFactory,
    ChainId
  } = require('./bridge');
  
  // Initialize Solana connection
  const connection = new Connection(options.rpcUrl || 'https://api.mainnet-beta.solana.com');
  const programId = options.programId ? new PublicKey(options.programId) : undefined;
  
  // Initialize Solana-side bridge
  const solanaBridge = new SolanaBridge(connection, programId);
  
  // Initialize Ethereum provider and bridge
  let ethereumBridge: any = null;
  if (options.ethRpcUrl && options.ethBridgeAddress) {
    const ethProvider = new ethers.providers.JsonRpcProvider(options.ethRpcUrl);
    ethereumBridge = new EthereumBridge(ethProvider, options.ethBridgeAddress);
  }
  
  // Initialize L2 bridges if configured
  let l2BridgeFactory: any = null;
  if (options.l2RpcUrls && options.l2BridgeAddresses) {
    const providers = new Map();
    const addresses = new Map();
    
    // Configure Optimism
    if (options.l2RpcUrls.optimism && options.l2BridgeAddresses.optimism) {
      providers.set(
        ChainId.Optimism,
        new ethers.providers.JsonRpcProvider(options.l2RpcUrls.optimism)
      );
      addresses.set(ChainId.Optimism, options.l2BridgeAddresses.optimism);
    }
    
    // Configure Arbitrum
    if (options.l2RpcUrls.arbitrum && options.l2BridgeAddresses.arbitrum) {
      providers.set(
        ChainId.Arbitrum,
        new ethers.providers.JsonRpcProvider(options.l2RpcUrls.arbitrum)
      );
      addresses.set(ChainId.Arbitrum, options.l2BridgeAddresses.arbitrum);
    }
    
    // Configure Base
    if (options.l2RpcUrls.base && options.l2BridgeAddresses.base) {
      providers.set(
        ChainId.Base,
        new ethers.providers.JsonRpcProvider(options.l2RpcUrls.base)
      );
      addresses.set(ChainId.Base, options.l2BridgeAddresses.base);
    }
    
    // Create factory if we have at least one L2 configured
    if (providers.size > 0) {
      l2BridgeFactory = new L2BridgeFactory(providers, addresses);
    }
  }
  
  // Create main bridge instance if all components are available
  let bridge = null;
  if (solanaBridge && ethereumBridge && l2BridgeFactory) {
    bridge = new SolanaVeilBridge(solanaBridge, ethereumBridge, l2BridgeFactory);
  }
  
  // Return the initialized SDK
  return {
    solana: {
      connection,
      programId
    },
    bridge: {
      solanaBridge,
      ethereumBridge,
      l2BridgeFactory,
      bridge
    },
    version: SDK_VERSION
  };
}