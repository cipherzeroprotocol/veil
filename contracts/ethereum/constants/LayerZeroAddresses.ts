/**
 * LayerZero network contract addresses - Official LayerZero V2 Endpoints
 * Reference: https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts
 */

// LayerZero Chain IDs (different from EVM Chain IDs)
export const LayerZeroChainIds = {
  Ethereum: 30101,
  Arbitrum: 30110,
  Optimism: 30111,
  Base: 30184,
  ArbitrumSepolia: 40231,
  OptimismSepolia: 40232,
  BaseSepolia: 40245,
  Sepolia: 40161,
};

export const LayerZeroEndpoints = {
  // Mainnets
  [LayerZeroChainIds.Ethereum]: '0x1a44076050125825900e736c501f859c50fE728c', // Lz Endpoint on Ethereum
  [LayerZeroChainIds.Arbitrum]: '0x1a44076050125825900e736c501f859c50fE728c', // Lz Endpoint on Arbitrum One
  [LayerZeroChainIds.Optimism]: '0x1a44076050125825900e736c501f859c50fE728c', // Lz Endpoint on Optimism
  [LayerZeroChainIds.Base]: '0x1a44076050125825900e736c501f859c50fE728c', // Lz Endpoint on Base

  // Testnets
  [LayerZeroChainIds.Sepolia]: '0x6EDCE65403992e310A62460808c4b910D972f10f', // Lz Endpoint on Sepolia
  [LayerZeroChainIds.ArbitrumSepolia]: '0x6EDCE65403992e310A62460808c4b910D972f10f', // Lz Endpoint on Arbitrum Sepolia
  [LayerZeroChainIds.OptimismSepolia]: '0x6EDCE65403992e310A62460808c4b910D972f10f', // Lz Endpoint on Optimism Sepolia
  [LayerZeroChainIds.BaseSepolia]: '0x6EDCE65403992e310A62460808c4b910D972f10f', // Lz Endpoint on Base Sepolia
};

/**
 * Get LayerZero Endpoint address based on EVM chain ID
 * @param chainId EVM Chain ID
 */
export function getLayerZeroEndpoint(chainId: number): string {
  let lzChainId: number | undefined;
  switch (chainId) {
    case 1: lzChainId = LayerZeroChainIds.Ethereum; break;
    case 42161: lzChainId = LayerZeroChainIds.Arbitrum; break;
    case 10: lzChainId = LayerZeroChainIds.Optimism; break;
    case 8453: lzChainId = LayerZeroChainIds.Base; break;
    case 11155111: lzChainId = LayerZeroChainIds.Sepolia; break;
    case 421614: lzChainId = LayerZeroChainIds.ArbitrumSepolia; break;
    case 11155420: lzChainId = LayerZeroChainIds.OptimismSepolia; break;
    case 84532: lzChainId = LayerZeroChainIds.BaseSepolia; break;
    default:
      throw new Error(`Unsupported EVM Chain ID for LayerZero Endpoint: ${chainId}`);
  }
  const endpoint = LayerZeroEndpoints[lzChainId];
  if (!endpoint) {
    throw new Error(`LayerZero Endpoint not found for LZ Chain ID: ${lzChainId}`);
  }
  return endpoint;
}
