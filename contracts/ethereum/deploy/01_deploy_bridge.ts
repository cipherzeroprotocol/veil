import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { getWormholeContracts, getWormholeChainId } from '../constants/WormholeAddresses'; // Adjust path
import { ethers } from 'ethers'; // Ensure ethers is imported

// Example: Define Merkle Tree Height
const MERKLE_TREE_HEIGHT = 20; // Choose an appropriate height

// Example: Define Solana Emitter Address (Replace with actual address in Wormhole format)
// This needs to be obtained after deploying the Solana program.
const SOLANA_VEIL_EMITTER_ADDRESS_HEX = process.env.SOLANA_EMITTER_ADDRESS_HEX || '0x0000000000000000000000000000000000000000000000000000000000000000'; // Placeholder

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get } = deployments; // Add 'get'
  const { deployer } = await getNamedAccounts();

  // Get network-specific addresses
  const chainId = network.config.chainId;
  if (!chainId) {
    throw new Error("Chain ID not found in Hardhat network configuration.");
  }

  // Skip deployment on L2s or unsupported chains for L1 Bridge
  if (![1, 11155111].includes(chainId)) { // Mainnet, Sepolia
     console.log(`Skipping SolanaVeilBridge deployment on non-L1 chain ${chainId}`);
     return;
  }

  const wormholeContracts = getWormholeContracts(chainId); // Get Wormhole addresses
  const wormholeCoreAddress = wormholeContracts.core;
  const wormholeTokenBridgeAddress = wormholeContracts.tokenBridge;

  // Deploy or get the Verifier contract (assuming it's deployed separately)
  // Replace 'ZKVerifier' with the actual name if different
  const zkVerifierDeployment = await deploy('Verifier', { // Deploy the Verifier contract
      from: deployer,
      args: [], // Add constructor args for Verifier if any
      log: true,
      waitConfirmations: 1,
  });
  const verifierAddress = zkVerifierDeployment.address;

  // Convert Solana emitter hex address to bytes32
  const solanaVeilEmitterBytes32 = ethers.zeroPadValue(SOLANA_VEIL_EMITTER_ADDRESS_HEX, 32);

  console.log(`Deploying SolanaVeilBridge on chain ${chainId}...`);
  console.log(`  Wormhole Core: ${wormholeCoreAddress}`);
  console.log(`  Wormhole Token Bridge: ${wormholeTokenBridgeAddress}`);
  console.log(`  Verifier: ${verifierAddress}`);
  console.log(`  Merkle Tree Height: ${MERKLE_TREE_HEIGHT}`);
  console.log(`  Solana Emitter: ${solanaVeilEmitterBytes32} (from ${SOLANA_VEIL_EMITTER_ADDRESS_HEX})`);

  const bridgeDeployment = await deploy('SolanaVeilBridge', {
    from: deployer,
    args: [
      wormholeCoreAddress,
      wormholeTokenBridgeAddress,
      verifierAddress,
      MERKLE_TREE_HEIGHT,
      solanaVeilEmitterBytes32,
    ],
    log: true,
    waitConfirmations: 1, // Adjust as needed for different networks
    // Link MerkleTree library if it's not automatically linked
    // libraries: {
    //   MerkleTree: (await get('MerkleTree')).address // Assuming MerkleTree is deployed as a library
    // }
  });

  console.log("SolanaVeilBridge deployed to:", bridgeDeployment.address);

  // Remove old post-deployment steps (setting relayer, authorizing vault) as they don't apply
  // ...removed vault authorization code...
  // ...removed setWormholeRelayer code...

};

func.tags = ['SolanaVeilBridge', 'core'];
// Add dependencies: Verifier must be deployed first (if deployed separately)
// If MerkleTree is a deployed library, add it too.
func.dependencies = ['Verifier']; // Example dependency
func.id = 'deploy_solana_veil_bridge'; // Unique ID

export default func;
