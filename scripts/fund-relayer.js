const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.test" });

async function main() {
  console.log("💸 Funding relayer wallet...");
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  const relayerAddress = process.env.RELAYER_ADDRESS;
  
  // Check balances
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  const relayerBalance = await ethers.provider.getBalance(relayerAddress);
  
  console.log(`\n📊 Current balances:`);
  console.log(`   Deployer: ${ethers.formatEther(deployerBalance)} OM`);
  console.log(`   Relayer: ${ethers.formatEther(relayerBalance)} OM`);
  
  // Transfer 1 OM to relayer
  const transferAmount = ethers.parseEther("1");
  console.log(`\n💸 Transferring ${ethers.formatEther(transferAmount)} OM to relayer...`);
  
  const tx = await deployer.sendTransaction({
    to: relayerAddress,
    value: transferAmount
  });
  
  await tx.wait();
  console.log(`✅ Transfer complete! Hash: ${tx.hash}`);
  
  // Check final balance
  const finalRelayerBalance = await ethers.provider.getBalance(relayerAddress);
  console.log(`\n📊 Relayer final balance: ${ethers.formatEther(finalRelayerBalance)} OM`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
