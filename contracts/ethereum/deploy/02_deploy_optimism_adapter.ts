import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { getPythOracleAddress } from '../constants/PythAddresses'; // Adjust path
import { OptimismAddresses } from '../constants/OptimismAddresses'; // Assuming you create this

/**
 * Deploys the OptimismAdapter contract
 * @param hre HardhatRuntimeEnvironment
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  // Ensure this script runs only on Optimism or Optimism Sepolia
  const chainId = network.config.chainId;
  if (chainId !== 10 && chainId !== 11155420) { // Optimism Mainnet & Sepolia
    console.log(`Skipping OptimismAdapter deployment on chain ${chainId}`);
    return;
  }

  // Get L1 bridge address (assuming it's deployed and saved)
  // This might need adjustment based on how you manage L1 addresses during L2 deployment
  const l1BridgeDeployment = await hre.companionNetworks['l1'].deployments.get('SolanaVeilBridge');
  const mainnetBridgeAddress = l1BridgeDeployment.address;

  // Get network-specific addresses
  const opAddresses = chainId === 10 ? OptimismAddresses.mainnet : OptimismAddresses.sepolia; // Need to create OptimismAddresses.ts
  //const l2BridgeAddress = opAddresses.L2StandardBridge;
  const pythOracleAddress = getPythOracleAddress(chainId);
  const initialTargetFeeUSD = process.env.INITIAL_TARGET_FEE_USD || "100"; // Should match L1 config
  const l2TreasuryAddress = process.env.L2_TREASURY_ADDRESS || deployer; // Optional L2 treasury

  console.log(`Deploying OptimismAdapter on chain ${chainId}...`);
  //console.log(`  L2 Standard Bridge: ${l2BridgeAddress}`);
  console.log(`  L1 SolanaVeilBridge: ${mainnetBridgeAddress}`);
  console.log(`  Pyth Oracle: ${pythOracleAddress}`);
  console.log(`  Initial Target Fee (USD cents): ${initialTargetFeeUSD}`);
  console.log(`  L2 Treasury: ${l2TreasuryAddress}`);

  await deploy('OptimismAdapter', {
    from: deployer,
    args: [
      //l2BridgeAddress,
      mainnetBridgeAddress,
      pythOracleAddress,
      initialTargetFeeUSD,
      l2TreasuryAddress,
    ],
    log: true,
    waitConfirmations: 1,
  });

  console.log("OptimismAdapter deployed.");
};

func.tags = ['OptimismAdapter', 'L2Adapter'];
func.dependencies = []; // Add dependencies if needed (e.g., L1 bridge deployment completed)
// Specify that this deployment needs access to L1 deployment info
func.runAtTheEnd = false; // Deploy normally
func.id = 'deploy_optimism_adapter'; // Unique ID for the deployment

export default func;
