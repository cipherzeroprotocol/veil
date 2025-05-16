/**
 * Arbitrum network contract addresses - Official Arbitrum protocol contracts
 * Reference: https://docs.arbitrum.io/build-infra/useful-addresses
 */

export const ArbitrumOneAddresses = {
  // L1 Contracts (Ethereum Mainnet)
  L1: {
    DelayedInbox: '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f',
    Bridge: '0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a',
    Outbox: '0x0B98057eA310F4d31F2a452B414647007d164840',
    Rollup: '0x4DCce78594819039A54109BD7395CFfcCfc0',
    SequencerInbox: '0x1c479675ad559DC151F6Ec7ed3FbF8ceE79582B6',
    L1GatewayRouter: '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef',
    L1ERC20Gateway: '0xa3A7B6F88361F48403514059F1F16C8E78d60EeC',
    L1WethGateway: '0xd92023E9d9913e4d59B8751866999780B9C4e2db',
    L1Weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Mainnet WETH
    L1ProxyAdmin: '0x9aD46fac0Cf7f790E5be05A0F15223935A0c0aDa',
  },

  // L2 Contracts (Arbitrum One)
  L2: {
    L2GatewayRouter: '0x5288c571Fd7aD117BeA99bF60FE0846C4E84F933',
    L2ERC20Gateway: '0x09e9222E96E7B4AE2a407B98d48e330053351EEe',
    L2WethGateway: '0x6c411aD3E46096F02A59d3511c9D410CA061623B',
    L2Weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum One WETH
    L2ProxyAdmin: '0xd570aCEE95265716f7039745566254699542a86',
    ArbSys: '0x0000000000000000000000000000000000000064', // Precompile
    Multicall: '0x842eC2c7D803033Edf55E478F461FC547Bc54EB2',
  },
};

export const ArbitrumSepoliaAddresses = {
  // L1 Contracts (Ethereum Sepolia)
  L1: {
    DelayedInbox: '0xaAe2eB61403d911F634A47187161A947345ae21',
    Bridge: '0x38f918D0E5683087C361067888103A64079a33a9',
    Outbox: '0x65f08a2799B99B7939938E691B5104C1B78FB78F',
    Rollup: '0x042B88104A645c830A7E1a534A050Cf441340Cf4',
    SequencerInbox: '0x6c97864CE4bEf387dE0b3310A44179bebe0Dbe0D',
    L1GatewayRouter: '0xcE18090A51545674B94945715D4735eA82648264',
    L1ERC20Gateway: '0x902b16173c4369549967D49F5b9955433aFF3aFF',
    L1WethGateway: '0xA8aD6454445Ab590399e1189073ac45907300e1E',
    L1Weth: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', // Sepolia WETH
    L1ProxyAdmin: '0xDBFCd8C8540d3451e219885e6B41ae44b0A044b0',
  },

  // L2 Contracts (Arbitrum Sepolia)
  L2: {
    L2GatewayRouter: '0x9fDD1735197450A394453473489E5C43C7443C7',
    L2ERC20Gateway: '0x6e241d8899668A7417C0614194113a715b50b502',
    L2WethGateway: '0xCFB1e1a7625516f46996199578FE9d556D5556D',
    L2Weth: '0x980B62Da83eFf310C9006565850757e8E0063C73', // Arbitrum Sepolia WETH
    L2ProxyAdmin: '0x715D58a961184793733567691608734579055FdF',
    ArbSys: '0x0000000000000000000000000000000000000064', // Precompile
    Multicall: '0xA11514b6007539a05e990f1f10a6564d334AAd092',
  },
};

/**
 * Get addresses based on network ID
 * @param chainId Chain ID (42161 for Arbitrum One, 421614 for Arbitrum Sepolia)
 */
export function getArbitrumAddresses(chainId: number) {
  switch (chainId) {
    case 42161: // Arbitrum One
      return ArbitrumOneAddresses;
    case 421614: // Arbitrum Sepolia
      return ArbitrumSepoliaAddresses;
    default:
      throw new Error(`Chain ID ${chainId} not supported for Arbitrum`);
  }
}
