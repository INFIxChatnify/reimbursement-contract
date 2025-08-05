const { ethers } = require("hardhat");

async function main() {
  const projectAddress = "0x59f0daA4c6C34F3aADa785320c372e97eCD9efe7";
  const mockOMTHBAddress = "0xbfC8F1E1f450a95AAC41e76015aD90E95A0D6162";
  const projectBudget = ethers.parseEther("50000");
  
  const [deployer] = await ethers.getSigners();
  const mockOMTHB = await ethers.getContractAt("MockOMTHB", mockOMTHBAddress, deployer);
  
  console.log("Minting OMTHB for gasless project...");
  const tx = await mockOMTHB.mint(projectAddress, projectBudget);
  await tx.wait();
  
  const balance = await mockOMTHB.balanceOf(projectAddress);
  console.log(`✅ Project balance: ${ethers.formatEther(balance)} OMTHB`);
}

main().catch(console.error);
