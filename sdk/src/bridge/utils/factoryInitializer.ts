import { ethers, Provider, JsonRpcProvider } from 'ethers'; // Import Provider and JsonRpcProvider
import { ChainId } from '../index';
import { L2BridgeFactory } from '../l2';

/**
 * Configuration for L2 Bridge Factory
 */
export interface L2BridgeConfig {
  optimismRpcUrl?: string;
  optimismBridgeAddress?: string;
  arbitrumRpcUrl?: string;
  arbitrumBridgeAddress?: string;
  baseRpcUrl?: string;
  baseBridgeAddress?: string;
}

/**
 * Initialize an L2BridgeFactory with the provided configuration
 * @param config L2 bridge configuration
 * @returns Initialized L2BridgeFactory instance
 */
export function initializeL2BridgeFactory(config: L2BridgeConfig): L2BridgeFactory {
  const providers = new Map<ChainId, Provider>(); // Use Provider type directly
  const bridgeAddresses = new Map<ChainId, string>();

  // Add Optimism if configured
  if (config.optimismRpcUrl && config.optimismBridgeAddress) {
    providers.set(ChainId.Optimism, new JsonRpcProvider(config.optimismRpcUrl)); // Use JsonRpcProvider directly
    bridgeAddresses.set(ChainId.Optimism, config.optimismBridgeAddress);
  }

  // Add Arbitrum if configured
  if (config.arbitrumRpcUrl && config.arbitrumBridgeAddress) {
    providers.set(ChainId.Arbitrum, new JsonRpcProvider(config.arbitrumRpcUrl)); // Use JsonRpcProvider directly
    bridgeAddresses.set(ChainId.Arbitrum, config.arbitrumBridgeAddress);
  }

  // Add Base if configured
  if (config.baseRpcUrl && config.baseBridgeAddress) {
    providers.set(ChainId.Base, new JsonRpcProvider(config.baseRpcUrl)); // Use JsonRpcProvider directly
    bridgeAddresses.set(ChainId.Base, config.baseBridgeAddress);
  }

  // Create and return the factory
  return new L2BridgeFactory(providers, bridgeAddresses);
}
