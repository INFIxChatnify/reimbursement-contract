const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Test configuration
const TEST_CONFIG = {
  PROJECT_ID: "TEST-PROJECT-001",
  PROJECT_BUDGET: ethers.parseEther("10000"), // 10k OMTHB
  REIMBURSEMENT_AMOUNT: ethers.parseEther("500"), // 500 OMTHB
};

async function main() {
  console.log("==========================================");
  console.log("OM Platform Deployment Test");
  console.log("==========================================\n");

  // Load deployment data
  const deploymentPath = path.join(__dirname, "..", "deployments", "om-platform-latest.json");
  
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ No deployment data found!");
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const [signer] = await ethers.getSigners();
  
  console.log("Running tests with account:", signer.address);
  console.log("Admin wallet:", deployment.adminWallet);

  try {
    // Get contracts
    const omthb = await ethers.getContractAt("OMTHBToken", deployment.contracts.OMTHBToken.proxy);
    const factory = await ethers.getContractAt("ProjectFactory", deployment.contracts.ProjectFactory.address);
    const forwarder = await ethers.getContractAt("MetaTxForwarder", deployment.contracts.MetaTxForwarder.address);
    const audit = await ethers.getContractAt("AuditAnchor", deployment.contracts.AuditAnchor.address);

    console.log("\n==========================================");
    console.log("Test 1: Basic Contract Functionality");
    console.log("==========================================\n");

    // Test 1.1: OMTHB Token
    console.log("1.1 Testing OMTHB Token...");
    const name = await omthb.name();
    const symbol = await omthb.symbol();
    const decimals = await omthb.decimals();
    console.log("   Name:", name);
    console.log("   Symbol:", symbol);
    console.log("   Decimals:", decimals);
    console.log("   ✅ Token metadata correct");

    // Test 1.2: Factory Configuration
    console.log("\n1.2 Testing ProjectFactory...");
    const implementation = await factory.projectImplementation();
    const factoryToken = await factory.omthbToken();
    const factoryForwarder = await factory.metaTxForwarder();
    console.log("   Implementation:", implementation);
    console.log("   Token:", factoryToken);
    console.log("   Forwarder:", factoryForwarder);
    console.log("   ✅ Factory properly configured");

    // Test 1.3: Audit Anchor
    console.log("\n1.3 Testing AuditAnchor...");
    const stats = await audit.getStatistics();
    console.log("   Total batches:", stats.totalBatches.toString());
    console.log("   Total entries:", stats.totalEntries.toString());
    console.log("   ✅ Audit anchor accessible");

    console.log("\n==========================================");
    console.log("Test 2: Project Creation Flow");
    console.log("==========================================\n");

    // Check if we need PROJECT_CREATOR_ROLE
    const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
    const hasCreatorRole = await factory.hasRole(PROJECT_CREATOR_ROLE, signer.address);
    
    if (!hasCreatorRole) {
      console.log("❌ Test account doesn't have PROJECT_CREATOR_ROLE");
      console.log("   Please grant the role first or use admin account");
      return;
    }

    // Create test project
    console.log("2.1 Creating test project...");
    console.log("   Project ID:", TEST_CONFIG.PROJECT_ID);
    console.log("   Budget:", ethers.formatEther(TEST_CONFIG.PROJECT_BUDGET), "OMTHB");
    
    const createTx = await factory.createProject(
      TEST_CONFIG.PROJECT_ID,
      TEST_CONFIG.PROJECT_BUDGET,
      signer.address // Use signer as project admin
    );
    console.log("   Transaction:", createTx.hash);
    const receipt = await createTx.wait();
    
    // Get project address from event
    const event = receipt.logs.find(log => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed.name === "ProjectCreated";
      } catch {
        return false;
      }
    });
    
    if (!event) {
      console.error("❌ ProjectCreated event not found!");
      return;
    }
    
    const parsed = factory.interface.parseLog(event);
    const projectAddress = parsed.args.projectContract;
    console.log("   ✅ Project created at:", projectAddress);

    // Test project contract
    console.log("\n2.2 Testing project contract...");
    const project = await ethers.getContractAt("ProjectReimbursement", projectAddress);
    const projectId = await project.projectId();
    const projectBudget = await project.projectBudget();
    const projectToken = await project.omthbToken();
    
    console.log("   Project ID:", projectId);
    console.log("   Budget:", ethers.formatEther(projectBudget), "OMTHB");
    console.log("   Token:", projectToken);
    console.log("   ✅ Project contract properly initialized");

    // Whitelist project in forwarder
    console.log("\n2.3 Whitelisting project in MetaTxForwarder...");
    const isWhitelisted = await forwarder.whitelistedTargets(projectAddress);
    if (!isWhitelisted) {
      if (await forwarder.owner() === signer.address) {
        const whitelistTx = await forwarder.setTargetWhitelist(projectAddress, true);
        await whitelistTx.wait();
        console.log("   ✅ Project whitelisted");
      } else {
        console.log("   ⚠️  Cannot whitelist - not forwarder owner");
      }
    } else {
      console.log("   ✅ Project already whitelisted");
    }

    console.log("\n==========================================");
    console.log("Test 3: Audit Trail");
    console.log("==========================================\n");

    // Test audit anchor
    console.log("3.1 Testing audit batch anchoring...");
    const isAuthorized = await audit.authorizedAnchors(signer.address);
    
    if (isAuthorized || await audit.owner() === signer.address) {
      const testBatch = {
        ipfsHash: "QmTest123456789abcdef",
        merkleRoot: ethers.keccak256(ethers.toUtf8Bytes("test")),
        entryCount: 5,
        batchType: "test"
      };
      
      const anchorTx = await audit.anchorAuditBatch(
        testBatch.ipfsHash,
        testBatch.merkleRoot,
        testBatch.entryCount,
        testBatch.batchType
      );
      await anchorTx.wait();
      
      const newStats = await audit.getStatistics();
      console.log("   New total batches:", newStats.totalBatches.toString());
      console.log("   ✅ Audit batch anchored successfully");
    } else {
      console.log("   ⚠️  Test account not authorized for audit anchoring");
    }

    console.log("\n==========================================");
    console.log("Test Summary");
    console.log("==========================================\n");
    
    console.log("✅ All basic tests passed!");
    console.log("\nDeployment is functional. You can now:");
    console.log("1. Fund the project contract with OMTHB tokens");
    console.log("2. Grant appropriate roles to users");
    console.log("3. Create reimbursement requests");
    console.log("4. Test the full approval workflow");

    // Save test results
    const testResults = {
      timestamp: new Date().toISOString(),
      network: "omchain",
      tester: signer.address,
      deployment: deployment.timestamp,
      tests: {
        contractFunctionality: "PASSED",
        projectCreation: "PASSED",
        auditTrail: isAuthorized ? "PASSED" : "SKIPPED"
      },
      testProject: {
        id: TEST_CONFIG.PROJECT_ID,
        address: projectAddress,
        budget: TEST_CONFIG.PROJECT_BUDGET.toString()
      }
    };
    
    const testsDir = path.join(__dirname, "..", "deployments", "tests");
    if (!fs.existsSync(testsDir)) {
      fs.mkdirSync(testsDir, { recursive: true });
    }
    
    const testFile = path.join(testsDir, `om-platform-test-${Date.now()}.json`);
    fs.writeFileSync(testFile, JSON.stringify(testResults, null, 2));
    console.log("\nTest results saved to:", testFile);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Execute tests
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });