import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

/**
 * Deploys the CertManager contract for AWS Nitro Validator
 * @param hre HardhatRuntimeEnvironment
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying CertManager...");
  
  // Deploy CertManager first, as it's a dependency for NitroValidator
  const certManagerResult = await deploy('CertManager', {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: 1,
  });
  
  console.log(`CertManager deployed at ${certManagerResult.address}`);
  
  // Make a note of the gas used - this can be expensive due to cert validation
  console.log(`Gas used for CertManager deployment: ${certManagerResult.receipt?.gasUsed}`);
};

func.tags = ['CertManager', 'security'];
func.dependencies = []; // No dependencies

export default func;
