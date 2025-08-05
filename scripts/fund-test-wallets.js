const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.test" });

/**
 * Fund test wallets with OM for gas fees
 */

async function main() {
  console.log("💸 Funding test wallets for approval flow...");
  console.log("=".repeat(60));
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  
  // Wallets to fund
  const walletsToFund = [
    { name: "Secretary", address: process.env.SECRETARY_ADDRESS },
    { name: "Committee", address: process.env.COMMITTEE_ADDRESS },
    { name: "Finance", address: process.env.FINANCE_ADDRESS },
    { name: "Director", address: process.env.DIRECTOR_ADDRESS }
  ];
  
  // Check deployer balance
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`\n💰 Deployer balance: ${ethers.formatEther(deployerBalance)} OM`);
  console.log(`   Address: ${deployer.address}`);
  
  // Amount to send to each wallet
  const amountPerWallet = ethers.parseEther("0.5"); // 0.5 OM each
  const totalNeeded = amountPerWallet * BigInt(walletsToFund.length);
  
  if (deployerBalance < totalNeeded) {
    console.error(`\n❌ Insufficient balance! Need ${ethers.formatEther(totalNeeded)} OM`);
    process.exit(1);
  }
  
  console.log(`\n💸 Funding ${walletsToFund.length} wallets with ${ethers.formatEther(amountPerWallet)} OM each...`);
  
  for (const wallet of walletsToFund) {
    try {
      // Check current balance
      const currentBalance = await ethers.provider.getBalance(wallet.address);
      console.log(`\n${wallet.name}:`);
      console.log(`   Address: ${wallet.address}`);
      console.log(`   Current balance: ${ethers.formatEther(currentBalance)} OM`);
      
      if (currentBalance < ethers.parseEther("0.1")) {
        // Send OM
        const tx = await deployer.sendTransaction({
          to: wallet.address,
          value: amountPerWallet
        });
        await tx.wait();
        
        const newBalance = await ethers.provider.getBalance(wallet.address);
        console.log(`   ✅ Funded with ${ethers.formatEther(amountPerWallet)} OM`);
        console.log(`   New balance: ${ethers.formatEther(newBalance)} OM`);
      } else {
        console.log(`   ✅ Already has sufficient balance`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to fund ${wallet.name}: ${error.message}`);
    }
  }
  
  // Check final deployer balance
  const finalBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`\n💰 Final deployer balance: ${ethers.formatEther(finalBalance)} OM`);
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ Wallet funding complete!");
  console.log("\n💡 You can now run: npm run test:approval-flow");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
