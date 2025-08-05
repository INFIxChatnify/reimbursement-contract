const { ethers } = require("hardhat");

async function main() {
  const projectAddress = "0x82459032D697ab7A064FE42F49DECE78ca451A86";
  const mockOMTHBAddress = "0xbfC8F1E1f450a95AAC41e76015aD90E95A0D6162";
  const projectBudget = ethers.parseEther("50000");
  
  const [deployer] = await ethers.getSigners();
  const mockOMTHB = await ethers.getContractAt("MockOMTHB", mockOMTHBAddress, deployer);
  
  console.log("Fixing gasless project balance...");
  const currentBalance = await mockOMTHB.balanceOf(projectAddress);
  console.log(`Current balance: ${ethers.formatEther(currentBalance)} OMTHB`);
  
  if (currentBalance === 0n) {
    const tx = await mockOMTHB.mint(projectAddress, projectBudget);
    await tx.wait();
    console.log("✅ Minted 50,000 OMTHB to gasless project");
  }
  
  const newBalance = await mockOMTHB.balanceOf(projectAddress);
  console.log(`New balance: ${ethers.formatEther(newBalance)} OMTHB`);
}

main().catch(console.error);
