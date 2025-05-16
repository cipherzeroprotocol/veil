/**
 * Base network contract addresses - Official Base protocol contracts
 * Reference: https://docs.base.org/base-contracts
 */

export const BaseMainnetAddresses = {
  // Standard L2 protocol contracts (same across mainnet and testnet)
  L2StandardBridge: '0x4200000000000000000000000000000000000010',
  L2CrossDomainMessenger: '0x4200000000000000000000000000000000000007',
  L2ToL1MessagePasser: '0x4200000000000000000000000000000000000016',
  WETH9: '0x4200000000000000000000000000000000000006',
  GasPriceOracle: '0x420000000000000000000000000000000000000F',
  L1Block: '0x4200000000000000000000000000000000000015',
  L2ERC721Bridge: '0x4200000000000000000000000000000000000014',
  OptimismMintableERC20Factory: '0xF10122D428B4bc8A9d050D06a2037259b4c4B83B',
  OptimismMintableERC721Factory: '0x4200000000000000000000000000000000000017',
  ProxyAdmin: '0x4200000000000000000000000000000000000018',
  BaseFeeVault: '0x4200000000000000000000000000000000000019',
  L1FeeVault: '0x420000000000000000000000000000000000001a',
  SequencerFeeVault: '0x4200000000000000000000000000000000000011',
  EAS: '0x4200000000000000000000000000000000000021',
  EASSchemaRegistry: '0x4200000000000000000000000000000000000020',
  LegacyERC20ETH: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000',
  
  // L1 contracts (Ethereum mainnet)
  L1: {
    L1CrossDomainMessenger: '0x866E82a600A1414e583f7F13623F1aC5d58b0Afa',
    L1StandardBridge: '0x3154Cf16ccdb4C6d922629664174b904d80F2C35',
    OptimismPortal: '0x49048044D57e1C92A77f79988d21Fa8fAF74E97e',
    AddressManager: '0x8EfB6B5c4767B09Dc9AA6Af4eAA89F749522BaE2',
    L1ERC721Bridge: '0x608d94945A64503E642E6370Ec598e519a2C1E53',
    OptimismMintableERC20Factory: '0x05cc379EBD9B30BbA19C6fA282AB29218EC61D84',
    SystemConfig: '0x73a79Fab69143498Ed3712e519A88a918e1f4072',
    ProxyAdmin: '0x0475cBCAebd9CE8AfA5025828d5b98DFb67E059E',
    DisputeGameFactoryProxy: '0x43edB88C4B80fDD2AdFF2412A7BebF9dF42cB40e',
    PreimageOracle: '0x1fb8cdFc6831fc866Ed9C51aF8817Da5c287aDD3'
  },
  
  // Admin addresses
  Admin: {
    BatchSender: '0x5050f69a9786f081509234f1a7f4684b5e5b76c9', // EOA managed by Coinbase Technologies
    BatchInbox: '0xff00000000000000000000000000000000008453', // EOA with no known private key
    OutputProposer: '0x642229f238fb9de03374be34b0ed8d9de80752c5', // EOA managed by Coinbase Technologies
    ProxyAdminOwner: '0x7bB41C3008B3f03FE483B28b8DB90e19Cf07595c', // Gnosis Safe
    Challenger: '0x8Ca1E12404d16373Aef756179B185F27b2994F3a', // EOA managed by Coinbase Technologies
    SystemConfigOwner: '0x14536667Cd30e52C0b458BaACcB9faDA7046E056', // Gnosis Safe
    Guardian: '0x09f7150D8c019BeF34450d6920f6B3608ceFdAf2' // Gnosis Safe
  },
  
  // Common protocols on Base
  Multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
  
  // Uniswap v3
  UniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  UniswapV3Router: '0x2626664c2603336E57B271c5C0b26F421741e481',
  UniswapV3PositionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
  
  // Uniswap v2
  UniswapV2Factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
  UniswapV2Router: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
};

export const BaseSepoliaAddresses = {
  // Standard L2 protocol contracts (same across mainnet and testnet)
  L2StandardBridge: '0x4200000000000000000000000000000000000010',
  L2CrossDomainMessenger: '0x4200000000000000000000000000000000000007',
  L2ToL1MessagePasser: '0x4200000000000000000000000000000000000016',
  WETH9: '0x4200000000000000000000000000000000000006',
  GasPriceOracle: '0x420000000000000000000000000000000000000F',
  L1Block: '0x4200000000000000000000000000000000000015',
  L2ERC721Bridge: '0x4200000000000000000000000000000000000014',
  OptimismMintableERC20Factory: '0x4200000000000000000000000000000000000012', // Note: Different from mainnet
  OptimismMintableERC721Factory: '0x4200000000000000000000000000000000000017',
  ProxyAdmin: '0x4200000000000000000000000000000000000018',
  BaseFeeVault: '0x4200000000000000000000000000000000000019',
  L1FeeVault: '0x420000000000000000000000000000000000001a',
  SequencerFeeVault: '0x4200000000000000000000000000000000000011',
  EAS: '0x4200000000000000000000000000000000000021',
  EASSchemaRegistry: '0x4200000000000000000000000000000000000020',
  LegacyERC20ETH: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000',

  // L1 contracts (Ethereum Sepolia testnet)
  L1: {
    L1CrossDomainMessenger: '0xC34855F4De64F1840e5686e64278da901e261f20',
    L1StandardBridge: '0xfd0Bf71F60660E2f608ed56e1659C450eB113120',
    OptimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
    AddressManager: '0x709c2B8ef4A9feFc629A8a2C1AF424Dc5BD6ad1B',
    L1ERC721Bridge: '0x21eFD066e581FA55Ef105170Cc04d74386a09190',
    OptimismMintableERC20Factory: '0xb1efB9650aD6d0CC1ed3Ac4a0B7f1D5732696D37',
    SystemConfig: '0xf272670eb55e895584501d564AfEB048bEd26194',
    ProxyAdmin: '0x0389E59Aa0a41E4A413Ae70f0008e76CAA34b1F3',
    L2OutputOracle: '0x84457ca9D0163FbC4bbfe4Dfbb20ba46e48DF254',
    DisputeGameFactoryProxy: '0xd6E6dBf4F7EA0ac412fD8b65ED297e64BB7a06E1',
    PreimageOracle: '0x1fb8cdFc6831fc866Ed9C51aF8817Da5c287aDD3'
  },

  // Admin addresses
  Admin: {
    BatchSender: '0x6CDEbe940BC0F26850285cacA097C11c33103E47', // EOA managed by Coinbase Technologies
    BatchInbox: '0xff00000000000000000000000000000000084532', // EOA with no known private key
    OutputProposer: '0x037637067c1DbE6d2430616d8f54Cb774Daa5999', // EOA managed by Coinbase Technologies
    ProxyAdminOwner: '0x0fe884546476dDd290eC46318785046ef68a0BA9', // Gnosis Safe
    Challenger: '0x8b8c52B04A38f10515C52670fcb23f3C4C44474F', // EOA managed by Coinbase Technologies
    SystemConfigOwner: '0x0fe884546476dDd290eC46318785046ef68a0BA9', // Gnosis Safe
    Guardian: '0xA9FF930151130fd19DA1F03E5077AFB7C78F8503' // EOA managed by Coinbase Technologies
  },
  
  // Common protocols on Base Sepolia
  Multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
  
  // Uniswap v3
  UniswapV3Factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
  UniswapV3Router: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
  UniswapV3PositionManager: '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2',
  
  // Uniswap v2
  UniswapV2Factory: '0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e',
  UniswapV2Router: '0x1689E7B1F10000AE47eBfE339a4f69dECd19F602',
};

/**
 * Get addresses based on network ID
 * @param chainId Chain ID (8453 for Base, 84532 for Base Sepolia)
 */
export function getBaseAddresses(chainId: number) {
  switch (chainId) {
    case 8453: // Base Mainnet
      return BaseMainnetAddresses;
    case 84532: // Base Sepolia
      return BaseSepoliaAddresses;
    default:
      throw new Error(`Chain ID ${chainId} not supported for Base`);
  }
}
