import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

/**
 * Deploys updated ZKVerifier that supports AWS Nitro Attestation
 * @param hre HardhatRuntimeEnvironment
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  // Get the CertManager address
  const certManagerDeployment = await get('CertManager');
  const certManagerAddress = certManagerDeployment.address;

  // This value should come from your actual Nitro Enclave measurement
  // See: https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave-concepts.html#term-pcr
  // Replace this with your actual PCR0 value from the enclave
  const expectedPcr0 = '0x1234567890123456789012345678901234567890123456789012345678901234'; // Example - REPLACE THIS!
  
  console.log("Deploying ZKVerifier with Nitro validation support...");
  
  const zkVerifierResult = await deploy('ZKVerifier', {
    from: deployer,
    args: [
      certManagerAddress, 
      expectedPcr0
    ],
    log: true,
    waitConfirmations: 1,
  });
  
  console.log(`ZKVerifier deployed at ${zkVerifierResult.address}`);
};

func.tags = ['ZKVerifier', 'security'];
func.dependencies = ['CertManager'];

export default func;
