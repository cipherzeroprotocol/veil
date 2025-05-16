/**
 * Pyth Network contract addresses
 * Reference: https://docs.pyth.network/consumers/evm
 * Entropy Reference: https://docs.pyth.network/entropy/quickstart
 */

export const PythOracleAddresses = {
  // Mainnets
  Ethereum: '0x4305FB66699C3B2702D4d05CF36551390A4c69C6',
  Arbitrum: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
  Optimism: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C', // Same as Arbitrum on OP Stack chains
  Base: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',     // Same as Arbitrum on OP Stack chains

  // Testnets
  Sepolia: '0x4305FB66699C3B2702D4d05CF36551390A4c69C6', // Same as Ethereum Mainnet
  ArbitrumSepolia: '0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834',
  OptimismSepolia: '0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834', // Same as Arbitrum Sepolia
  BaseSepolia: '0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834',     // Same as Arbitrum Sepolia
};

export const PythEntropyAddresses = {
  // Mainnets
  Arbitrum: '0x7698E925FfC29655576D0b361D75Af579e20AdAc',
  // Add other mainnets if/when supported

  // Testnets
  ArbitrumSepolia: '0x549Ebba8036Ab746611B4fFA1423eb0A4Df61440',
  // Add other testnets if/when supported
};

/**
 * Get Pyth Oracle address based on EVM chain ID
 */
export function getPythOracleAddress(chainId: number): string {
  let address: string | undefined;
  switch (chainId) {
    case 1: address = PythOracleAddresses.Ethereum; break;
    case 42161: address = PythOracleAddresses.Arbitrum; break;
    case 10: address = PythOracleAddresses.Optimism; break;
    case 8453: address = PythOracleAddresses.Base; break;
    case 11155111: address = PythOracleAddresses.Sepolia; break;
    case 421614: address = PythOracleAddresses.ArbitrumSepolia; break;
    case 11155420: address = PythOracleAddresses.OptimismSepolia; break;
    case 84532: address = PythOracleAddresses.BaseSepolia; break;
    default:
      throw new Error(`Unsupported EVM Chain ID for Pyth Oracle: ${chainId}`);
  }
  if (!address) {
    throw new Error(`Pyth Oracle address not found for Chain ID: ${chainId}`);
  }
  return address;
}

/**
 * Get Pyth Entropy address based on EVM chain ID
 */
export function getPythEntropyAddress(chainId: number): string | undefined {
  let address: string | undefined;
  switch (chainId) {
    case 42161: address = PythEntropyAddresses.Arbitrum; break;
    case 421614: address = PythEntropyAddresses.ArbitrumSepolia; break;
    // Add other supported chains here
  }
  // Return undefined if not supported on the chain
  return address;
}
