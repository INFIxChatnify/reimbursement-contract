const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Upgrading OMTHBToken to V3...");

  // Configuration
  const PROXY_ADDRESS = process.env.OMTHB_PROXY_ADDRESS;
  const TIMELOCK_DELAY = 2 * 24 * 60 * 60; // 2 days in seconds
  const GLOBAL_DAILY_LIMIT = ethers.parseEther("10000000"); // 10M OMTHB
  const SUSPICIOUS_THRESHOLD = ethers.parseEther("1000000"); // 1M OMTHB

  if (!PROXY_ADDRESS) {
    throw new Error("Please set OMTHB_PROXY_ADDRESS in environment variables");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Get the V3 contract factory
  const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");

  console.log("Current proxy address:", PROXY_ADDRESS);
  console.log("\nUpgrade parameters:");
  console.log("- Timelock delay:", TIMELOCK_DELAY, "seconds (2 days)");
  console.log("- Global daily limit:", ethers.formatEther(GLOBAL_DAILY_LIMIT), "OMTHB");
  console.log("- Suspicious threshold:", ethers.formatEther(SUSPICIOUS_THRESHOLD), "OMTHB");

  // Perform the upgrade
  console.log("\nUpgrading contract...");
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, OMTHBTokenV3, {
    call: {
      fn: "initializeV3",
      args: [TIMELOCK_DELAY, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
    }
  });

  await upgraded.waitForDeployment();
  console.log("OMTHBToken V3 upgraded successfully!");

  // Verify the upgrade
  const implementation = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("New implementation address:", implementation);

  // Post-upgrade setup recommendations
  console.log("\n=== POST-UPGRADE SETUP ===");
  console.log("1. Grant TIMELOCK_ADMIN_ROLE to appropriate addresses");
  console.log("2. Add guardians using addGuardian()");
  console.log("3. Schedule migration of existing minters through timelock");
  console.log("4. Set individual minter daily limits");
  console.log("5. Consider adjusting global daily limit based on needs");
  console.log("6. Monitor the first few minting operations");

  // Example setup commands
  console.log("\nExample setup commands:");
  console.log(`
  // Grant timelock admin role
  await token.grantRole(TIMELOCK_ADMIN_ROLE, timelockAdmin);
  
  // Add guardians
  await token.addGuardian(guardian1);
  await token.addGuardian(guardian2);
  
  // Schedule adding minters with limits
  await token.scheduleAddMinter(minterAddress, ethers.parseEther("100000"));
  
  // After 2 days, execute the scheduled action
  await token.executeAction(actionId);
  `);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });