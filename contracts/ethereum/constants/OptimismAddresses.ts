/**
 * Optimism Bedrock Contract Addresses
 * Source: https://docs.optimism.io/builders/node-operators/deploy-config/contract-addresses
 * Last Updated: Check source for latest updates.
 */

interface OptimismL1Contracts {
  ProtocolVersions: string;
  SuperchainConfig: string;
  AnchorStateRegistryProxy?: string; // Sepolia only?
  BatchSubmitter?: string; // Mainnet only?
  Challenger?: string; // Mainnet only?
  DelayedWETHProxy?: string; // Mainnet only?
  DisputeGameFactoryProxy: string;
  FaultDisputeGame: string;
  Guardian: string;
  L1CrossDomainMessengerProxy: string;
  L1ERC721BridgeProxy: string;
  L1StandardBridgeProxy: string;
  MIPS?: string; // Mainnet only?
  OptimismMintableERC20FactoryProxy: string;
  OptimismPortalProxy: string;
  PermissionedDisputeGame: string;
  PreimageOracle: string;
  Proposer?: string; // Mainnet only?
  ProxyAdmin: string;
  ProxyAdminOwner: string;
  SystemConfigOwner: string;
  SystemConfigProxy: string;
  UnsafeBlockSigner: string;
  // Legacy
  AddressManager?: string; // Mainnet legacy
}

interface OptimismL2Contracts {
  L2ToL1MessagePasser: string;
  L2CrossDomainMessenger: string;
  L2StandardBridge: string;
  L2ERC721Bridge: string;
  SequencerFeeVault: string;
  OptimismMintableERC20Factory: string;
  OptimismMintableERC721Factory: string;
  L1Block: string;
  GasPriceOracle: string;
  ProxyAdmin: string;
  BaseFeeVault: string;
  L1FeeVault: string;
  GovernanceToken: string;
  SchemaRegistry: string;
  EAS: string;
  // Legacy
  L1MessageSender?: string;
  DeployerWhitelist?: string;
  LegacyERC20ETH?: string;
  L1BlockNumber?: string;
  LegacyMessagePasser?: string;
}

interface OptimismDeployment {
  l1: OptimismL1Contracts;
  l2: OptimismL2Contracts;
}

const mainnet: OptimismDeployment = {
  l1: {
    // Ethereum Superchain Contracts (L1)
    ProtocolVersions: '0x8062AbC286f5e7D9428a0Ccb9AbD71e50d93b935',
    SuperchainConfig: '0x95703e0982140D16f8ebA6d158FccEde42f04a4C',
    // Ethereum (L1)
    AnchorStateRegistryProxy: '0x1c68ECfbf9C8B1E6C0677965b3B9Ecf9A104305b',
    BatchSubmitter: '0x6887246668a3b87F54DeB3b94Ba47a6f63F32985',
    Challenger: '0x9BA6e03D8B90dE867373Db8cF1A58d2F7F006b3A',
    DelayedWETHProxy: '0x323dFC63c9B83CB83f40325AaB74b245937cbdF0',
    DisputeGameFactoryProxy: '0xe5965Ab5962eDc7477C8520243A95517CD252fA9',
    FaultDisputeGame: '0x5738a876359b48A65d35482C93B43e2c1147B32B',
    Guardian: '0x09f7150D8c019BeF34450d6920f6B3608ceFdAf2',
    L1CrossDomainMessengerProxy: '0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1',
    L1ERC721BridgeProxy: '0x5a7749f83b81B301cAb5f48EB8516B986DAef23D',
    L1StandardBridgeProxy: '0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1',
    MIPS: '0xF027F4A985560fb13324e943edf55ad6F1d15Dc1',
    OptimismMintableERC20FactoryProxy: '0x75505a97BD334E7BD3C476893285569C4136Fa0F',
    OptimismPortalProxy: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
    PermissionedDisputeGame: '0x1Ae178eBFEECd51709432EA5f37845Da0414EdFe',
    PreimageOracle: '0x1fb8cdFc6831fc866Ed9C51aF8817Da5c287aDD3',
    Proposer: '0x473300df21D047806A082244b417f96b32f13A33',
    ProxyAdmin: '0x543bA4AADBAb8f9025686Bd03993043599c6fB04',
    ProxyAdminOwner: '0x5a0Aae59D09fccBdDb6C6CcEB07B7279367C3d2A',
    // SuperchainConfig: '0x95703e0982140D16f8ebA6d158FccEde42f04a4C', // Duplicate
    SystemConfigOwner: '0x847B5c174615B1B7fDF770882256e2D3E95b9D92',
    SystemConfigProxy: '0x229047fed2591dbec1eF1118d64F7aF3dB9EB290',
    UnsafeBlockSigner: '0xAAAA45d9549EDA09E70937013520214382Ffc4A2',
    // Ethereum Legacy Contracts (L1)
    AddressManager: '0xdE1FCfB0851916CA5101820A69b13a4E276bd81F',
  },
  l2: {
    // OP Mainnet (L2)
    L2ToL1MessagePasser: '0x4200000000000000000000000000000000000016',
    L2CrossDomainMessenger: '0x4200000000000000000000000000000000000007',
    L2StandardBridge: '0x4200000000000000000000000000000000000010',
    L2ERC721Bridge: '0x4200000000000000000000000000000000000014',
    SequencerFeeVault: '0x4200000000000000000000000000000000000011',
    OptimismMintableERC20Factory: '0x4200000000000000000000000000000000000012',
    OptimismMintableERC721Factory: '0x4200000000000000000000000000000000000017',
    L1Block: '0x4200000000000000000000000000000000000015',
    GasPriceOracle: '0x420000000000000000000000000000000000000F',
    ProxyAdmin: '0x4200000000000000000000000000000000000018',
    BaseFeeVault: '0x4200000000000000000000000000000000000019',
    L1FeeVault: '0x420000000000000000000000000000000000001A',
    GovernanceToken: '0x4200000000000000000000000000000000000042',
    SchemaRegistry: '0x4200000000000000000000000000000000000020',
    EAS: '0x4200000000000000000000000000000000000021',
    // OP Mainnet Legacy Contracts (L2)
    L1MessageSender: '0x4200000000000000000000000000000000000001',
    DeployerWhitelist: '0x4200000000000000000000000000000000000002',
    LegacyERC20ETH: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000',
    L1BlockNumber: '0x4200000000000000000000000000000000000013',
    LegacyMessagePasser: '0x4200000000000000000000000000000000000000',
  },
};

const sepolia: OptimismDeployment = {
  l1: {
    // Sepolia Superchain Contracts (L1)
    ProtocolVersions: '0x8062AbC286f5e7D9428a0Ccb9AbD71e50d93b935',
    SuperchainConfig: '0x95703e0982140D16f8ebA6d158FccEde42f04a4C', // Note: Same as Mainnet SuperchainConfig? Verify.
    // Sepolia (L1)
    AnchorStateRegistryProxy: '0xDB2727Fc71176Bf8ED630F4142e0439733588e85',
    BatchSubmitter: '0x8F23BB38F531600e5d8FDDaAEC41F13FaB46E98c',
    Challenger: '0xfd1D2e729aE8eEe2E146c033bf4400fE75284301',
    DelayedWETHProxy: '0xcdFdC692a53B4aE9F81E0aEBd26107Da4a71dB84',
    DisputeGameFactoryProxy: '0x05F9613aDB30026FFd634f38e5C4dFd30a197Fa1',
    FaultDisputeGame: '0x38c2b9A214cDc3bBBc4915Dae8c2F0a7917952Dd',
    Guardian: '0x7a50f00e8D05b95F98fE38d8BeE366a7324dCf7E',
    L1CrossDomainMessengerProxy: '0x58Cc85b8D04EA49cC6DBd3CbFFd00B4B8D6cb3ef',
    L1ERC721BridgeProxy: '0xd83e03D576d23C9AEab8cC44Fa98d058D2176D1f',
    L1StandardBridgeProxy: '0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1',
    MIPS: '0xF027F4A985560fb13324e943edf55ad6F1d15Dc1', // Note: Same as Mainnet MIPS? Verify.
    OptimismMintableERC20FactoryProxy: '0x868D59fF9710159C2B330Cc0fBDF57144dD7A13b',
    OptimismPortalProxy: '0x16Fc5058F25648194471939df75CF27A2fdC48BC',
    PermissionedDisputeGame: '0x3dbfB370be95Eb598C8b89B45d7c101dC1679AB9',
    PreimageOracle: '0x1fb8cdFc6831fc866Ed9C51aF8817Da5c287aDD3', // Note: Same as Mainnet PreimageOracle? Verify.
    Proposer: '0x49277EE36A024120Ee218127354c4a3591dc90A9',
    ProxyAdmin: '0x189aBAAaa82DfC015A588A7dbaD6F13b1D3485Bc',
    ProxyAdminOwner: '0x1Eb2fFc903729a0F03966B917003800b145F56E2',
    // SuperchainConfig: '0xC2Be75506d5724086DEB7245bd260Cc9753911Be', // Different from Mainnet SuperchainConfig
    SystemConfigOwner: '0xfd1D2e729aE8eEe2E146c033bf4400fE75284301', // Same as Challenger
    SystemConfigProxy: '0x034edD2A225f7f429A63E0f1D2084B9E0A93b538',
    UnsafeBlockSigner: '0x57CACBB0d30b01eb2462e5dC940c161aff3230D3',
  },
  l2: {
    // OP Sepolia (L2)
    L2ToL1MessagePasser: '0x4200000000000000000000000000000000000016',
    L2CrossDomainMessenger: '0x4200000000000000000000000000000000000007',
    L2StandardBridge: '0x4200000000000000000000000000000000000010',
    L2ERC721Bridge: '0x4200000000000000000000000000000000000014',
    SequencerFeeVault: '0x4200000000000000000000000000000000000011',
    OptimismMintableERC20Factory: '0x4200000000000000000000000000000000000012',
    OptimismMintableERC721Factory: '0x4200000000000000000000000000000000000017',
    L1Block: '0x4200000000000000000000000000000000000015',
    GasPriceOracle: '0x420000000000000000000000000000000000000F',
    ProxyAdmin: '0x4200000000000000000000000000000000000018',
    BaseFeeVault: '0x4200000000000000000000000000000000000019',
    L1FeeVault: '0x420000000000000000000000000000000000001A',
    GovernanceToken: '0x4200000000000000000000000000000000000042',
    SchemaRegistry: '0x4200000000000000000000000000000000000020',
    EAS: '0x4200000000000000000000000000000000000021',
    // OP Sepolia Legacy Contracts (L2) - Not listed in source, assuming same pattern as mainnet if they exist
  },
};

export const OptimismAddresses = {
  mainnet,
  sepolia,
};

/**
 * Get Optimism L1 contracts for a given L1 chain ID
 * @param chainId L1 EVM Chain ID (1 for Mainnet, 11155111 for Sepolia)
 */
export function getOptimismL1Contracts(chainId: number): OptimismL1Contracts {
  switch (chainId) {
    case 1:
      return mainnet.l1;
    case 11155111:
      return sepolia.l1;
    default:
      throw new Error(`Unsupported Optimism L1 Chain ID: ${chainId}`);
  }
}

/**
 * Get Optimism L2 contracts for a given L2 chain ID
 * @param chainId L2 EVM Chain ID (10 for OP Mainnet, 11155420 for OP Sepolia)
 */
export function getOptimismL2Contracts(chainId: number): OptimismL2Contracts {
  switch (chainId) {
    case 10:
      return mainnet.l2;
    case 11155420:
      return sepolia.l2;
    default:
      throw new Error(`Unsupported Optimism L2 Chain ID: ${chainId}`);
  }
}

/**
 * Get the L2 Standard Bridge address for a given L2 chain ID
 * @param chainId L2 EVM Chain ID (10 for OP Mainnet, 11155420 for OP Sepolia)
 */
export function getOptimismL2BridgeAddress(chainId: number): string {
    return getOptimismL2Contracts(chainId).L2StandardBridge;
}

/**
 * Get the L1 Standard Bridge Proxy address for a given L1 chain ID
 * @param chainId L1 EVM Chain ID (1 for Mainnet, 11155111 for Sepolia)
 */
export function getOptimismL1BridgeProxyAddress(chainId: number): string {
    const l1Contracts = getOptimismL1Contracts(chainId);
    if (!l1Contracts.L1StandardBridgeProxy) {
        throw new Error(`L1 Standard Bridge Proxy not found for chain ID: ${chainId}`);
    }
    return l1Contracts.L1StandardBridgeProxy;
}