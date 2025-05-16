import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { getPythOracleAddress } from '../constants/PythAddresses'; // Adjust path
import { getWormholeContracts, getWormholeChainId } from '../constants/WormholeAddresses'; // Adjust path
import { ethers } from 'ethers'; // Import ethers

/**
 * Deploys the WormholeAdapter contract on L2s
 * @param hre HardhatRuntimeEnvironment
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = network.config.chainId;
  if (!chainId) {
    throw new Error("Chain ID not found in Hardhat network configuration.");
  }

  // Skip deployment on L1 or unsupported chains
  if (chainId === 1 || chainId === 11155111) {
     console.log(`Skipping WormholeAdapter deployment on L1 chain ${chainId}`);
     return;
  }
  if (![10, 42161, 8453, 11155420, 421614, 84532].includes(chainId)) { // OP, Arb, Base (Mainnet & Sepolia)
     console.log(`Skipping WormholeAdapter deployment on unsupported chain ${chainId}`);
     return;
  }

  // Get L1 bridge address (assuming it's deployed and saved)
  const l1Network = chainId === 10 || chainId === 42161 || chainId === 8453 ? 'mainnet' : 'sepolia';
  const l1BridgeDeployment = await hre.companionNetworks[l1Network].deployments.get('SolanaVeilBridge');
  const mainnetBridgeAddress = l1BridgeDeployment.address;

  // Get network-specific addresses
  const pythOracleAddress = getPythOracleAddress(chainId);
  const wormholeContracts = getWormholeContracts(chainId);
  const whTokenBridgeAddress = wormholeContracts.tokenBridge;
  const whCoreAddress = wormholeContracts.core;
  const whRelayerAddress = "0x..."; // TODO: Find L2 Wormhole Relayer address for this network
  const initialTargetFeeUSD = process.env.INITIAL_TARGET_FEE_USD || "100"; // Should match L1 config
  const l2TreasuryAddress = process.env.L2_TREASURY_ADDRESS || deployer; // Optional L2 treasury

  console.log(`Deploying WormholeAdapter on chain ${chainId}...`);
  console.log(`  Wormhole Token Bridge: ${whTokenBridgeAddress}`);
  console.log(`  Wormhole Relayer: ${whRelayerAddress}`); // Log Relayer
  console.log(`  Wormhole Core: ${whCoreAddress}`);       // Log Core
  console.log(`  L1 SolanaVeilBridge: ${mainnetBridgeAddress}`);
  console.log(`  Pyth Oracle: ${pythOracleAddress}`);
  console.log(`  Initial Target Fee (USD cents): ${initialTargetFeeUSD}`);
  console.log(`  L2 Treasury: ${l2TreasuryAddress}`);

  const adapterDeployment = await deploy('WormholeAdapter', {
    from: deployer,
    args: [
      whTokenBridgeAddress,
      whRelayerAddress, // Add Relayer
      whCoreAddress,    // Add Core
      mainnetBridgeAddress,
      pythOracleAddress,
      initialTargetFeeUSD,
      l2TreasuryAddress,
    ],
    log: true,
    waitConfirmations: 1,
  });

  console.log("WormholeAdapter deployed to:", adapterDeployment.address);

  // --- Register deployed adapter on L1 Bridge ---
  console.log(`Registering adapter ${adapterDeployment.address} on L1 bridge ${mainnetBridgeAddress}...`);

  // Get L1 provider and signer (using companion network)
  const l1Provider = new ethers.JsonRpcProvider(
    // Try to get the RPC URL string from the companion network config
    typeof hre.companionNetworks[l1Network].provider === 'string'
      ? hre.companionNetworks[l1Network].provider
      : (hre.companionNetworks[l1Network].provider as any)?.connection?.url // fallback for Hardhat's provider object
  );
  // Use deployer account from L1 companion network config if possible, or default deployer
  const l1Signer = new ethers.Wallet(process.env.PRIVATE_KEY!, l1Provider); // Ensure PRIVATE_KEY is available

  const l1BridgeContract = new ethers.Contract(mainnetBridgeAddress, l1BridgeDeployment.abi, l1Signer);

  const sourceWormholeChainId = getWormholeChainId(chainId); // Get Wormhole Chain ID for this L2
  const sourceAddressBytes32 = ethers.zeroPadValue(adapterDeployment.address, 32);

  // Check if already registered
  const isRegistered = await l1BridgeContract.registeredWormholeSenders(sourceWormholeChainId, sourceAddressBytes32);

  if (!isRegistered) {
      console.log(`Submitting registration transaction to L1...`);
      const tx = await l1BridgeContract.registerWormholeSender(sourceWormholeChainId, sourceAddressBytes32);
      console.log(`L1 Registration Tx Sent: ${tx.hash}, waiting for confirmation...`);
      await tx.wait();
      console.log(`Adapter registered successfully on L1.`);
  } else {
      console.log(`Adapter already registered on L1.`);
  }
  // --- End Registration ---

};

func.tags = ['WormholeAdapter', 'L2Adapter'];
func.dependencies = ['SolanaVeilBridge']; // Add dependency on L1 bridge deployment
func.id = 'deploy_wormhole_adapter'; // Unique ID

export default func;
