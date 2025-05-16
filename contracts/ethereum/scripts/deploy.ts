import { ethers } from "hardhat";
import { ZKVerifier__factory, SolanaVeilVault__factory, SolanaVeilBridge__factory } from "../typechain";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", await deployer.getAddress());
  
  // Deploy ZKVerifier
  console.log("Deploying ZKVerifier...");
  const zkVerifierFactory = new ZKVerifier__factory(deployer);
  const zkVerifier = await zkVerifierFactory.deploy();
  await zkVerifier.waitForDeployment();
  const zkVerifierAddress = await zkVerifier.getAddress();
  console.log("ZKVerifier deployed to:", zkVerifierAddress);
  
  // Deploy SolanaVeilVault
  console.log("Deploying SolanaVeilVault...");
  const vaultFactory = new SolanaVeilVault__factory(deployer);
  const vault = await vaultFactory.deploy();
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("SolanaVeilVault deployed to:", vaultAddress);
  
  // Deploy SolanaVeilBridge with deployer as treasury (can be changed later)
  console.log("Deploying SolanaVeilBridge...");
  const bridgeFactory = new SolanaVeilBridge__factory(deployer);
  const bridge = await bridgeFactory.deploy(
    zkVerifierAddress,
    vaultAddress,
    await deployer.getAddress() // Treasury address - change to actual treasury
  );
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("SolanaVeilBridge deployed to:", bridgeAddress);
  
  // Configure vault to trust bridge
  console.log("Authorizing bridge in vault...");
  const authorizeTx = await vault.authorizeBridge(bridgeAddress);
  await authorizeTx.wait();
  console.log("Bridge authorized in vault");
  
  // Save deployment addresses
  const deploymentInfo = {
    network: process.env.HARDHAT_NETWORK || "unknown",
    zkVerifier: zkVerifierAddress,
    vault: vaultAddress,
    bridge: bridgeAddress,
    deployer: await deployer.getAddress(),
    deploymentTime: new Date().toISOString()
  };
  
  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  
  // Save deployment info to file
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const filePath = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment information saved to ${filePath}`);
  
  console.log("Deployment completed successfully");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });