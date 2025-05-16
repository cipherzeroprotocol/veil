/**
 * Wormhole Network Contract Addresses
 * Reference: https://docs.wormhole.com/wormhole/contracts
 * Chain IDs Reference: https://docs.wormhole.com/wormhole/reference/constants
 */

// Wormhole Chain IDs (different from EVM/LayerZero IDs)
export const WormholeChainIds = {
  SOLANA: 1,
  ETHEREUM: 2,
  BSC: 4,
  POLYGON: 5,
  AVALANCHE: 6,
  OPTIMISM: 24,
  ARBITRUM: 23,
  BASE: 30,
  // Testnet IDs (assuming Sepolia for EVM testnets)
  ETHEREUM_SEPOLIA: 10002,
  ARBITRUM_SEPOLIA: 10003,
  OPTIMISM_SEPOLIA: 10005,
  BASE_SEPOLIA: 10006,
};

interface WormholeContracts {
  core: string;
  tokenBridge: string;
}

export const WormholeAddresses: { [key: number]: WormholeContracts } = {
  // Mainnets
  [WormholeChainIds.ETHEREUM]: {
    core: '0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B',
    tokenBridge: '0x3ee18B2214AFF97000D974cf647E7C347E8fa585',
  },
  [WormholeChainIds.ARBITRUM]: {
    core: '0xa5f208e072434bC67592E4C49C1B991BA79BCA46',
    tokenBridge: '0x0b2402144Bb366A632D14B83F244D2e0e21bD39c',
  },
  [WormholeChainIds.OPTIMISM]: {
    core: '0xEe91C335eab126dF5fDB3797EA9d6aD93aeC9722',
    tokenBridge: '0x1D68124e65faFC907325e3EDbF8c4d84499DAa8b',
  },
  [WormholeChainIds.BASE]: {
    core: '0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6',
    tokenBridge: '0x8d2de8d2f73F1F4cAB472AC9A881C9b123C79627',
  },

  // Testnets (using Sepolia addresses from Wormhole docs)
  [WormholeChainIds.ETHEREUM_SEPOLIA]: {
    core: '0x7Bd75E432855BaAD54589806474AAb8145817569',
    tokenBridge: '0x87a406635236368980552E1d8810F293A64F1A90',
  },
  [WormholeChainIds.ARBITRUM_SEPOLIA]: {
    core: '0x0Fa93FF0b53096Aa401a4C1c0956A92d81A54e31',
    tokenBridge: '0x648C6491b7fAb2513F708BC6466775e1008bC17C',
  },
  [WormholeChainIds.OPTIMISM_SEPOLIA]: {
    core: '0x0Fa93FF0b53096Aa401a4C1c0956A92d81A54e31', // Shared testnet core? Check docs.
    tokenBridge: '0x648C6491b7fAb2513F708BC6466775e1008bC17C', // Shared testnet token bridge? Check docs.
  },
  [WormholeChainIds.BASE_SEPOLIA]: {
    core: '0x0Fa93FF0b53096Aa401a4C1c0956A92d81A54e31', // Shared testnet core? Check docs.
    tokenBridge: '0x648C6491b7fAb2513F708BC6466775e1008bC17C', // Shared testnet token bridge? Check docs.
  },
};

/**
 * Get Wormhole contracts for a given EVM chain ID
 * @param chainId EVM Chain ID
 */
export function getWormholeContracts(chainId: number): WormholeContracts {
  let whChainId: number | undefined;
  switch (chainId) {
    case 1: whChainId = WormholeChainIds.ETHEREUM; break;
    case 42161: whChainId = WormholeChainIds.ARBITRUM; break;
    case 10: whChainId = WormholeChainIds.OPTIMISM; break;
    case 8453: whChainId = WormholeChainIds.BASE; break;
    case 11155111: whChainId = WormholeChainIds.ETHEREUM_SEPOLIA; break;
    case 421614: whChainId = WormholeChainIds.ARBITRUM_SEPOLIA; break;
    case 11155420: whChainId = WormholeChainIds.OPTIMISM_SEPOLIA; break;
    case 84532: whChainId = WormholeChainIds.BASE_SEPOLIA; break;
    default:
      throw new Error(`Unsupported EVM Chain ID for Wormhole Contracts: ${chainId}`);
  }
  const contracts = WormholeAddresses[whChainId];
  if (!contracts) {
    throw new Error(`Wormhole contracts not found for Wormhole Chain ID: ${whChainId}`);
  }
  return contracts;
}

/**
 * Get Wormhole Chain ID for a given EVM chain ID
 * @param chainId EVM Chain ID
 */
export function getWormholeChainId(chainId: number): number {
   let whChainId: number | undefined;
   switch (chainId) {
    case 1: whChainId = WormholeChainIds.ETHEREUM; break;
    case 42161: whChainId = WormholeChainIds.ARBITRUM; break;
    case 10: whChainId = WormholeChainIds.OPTIMISM; break;
    case 8453: whChainId = WormholeChainIds.BASE; break;
    case 11155111: whChainId = WormholeChainIds.ETHEREUM_SEPOLIA; break;
    case 421614: whChainId = WormholeChainIds.ARBITRUM_SEPOLIA; break;
    case 11155420: whChainId = WormholeChainIds.OPTIMISM_SEPOLIA; break;
    case 84532: whChainId = WormholeChainIds.BASE_SEPOLIA; break;
    default:
      throw new Error(`Unsupported EVM Chain ID for Wormhole Chain ID: ${chainId}`);
  }
   if (!whChainId) {
    throw new Error(`Wormhole Chain ID not found for EVM Chain ID: ${chainId}`);
  }
  return whChainId;
}
