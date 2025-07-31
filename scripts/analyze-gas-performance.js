const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ANSI color codes for better output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    red: "\x1b[31m",
    cyan: "\x1b[36m"
};

async function main() {
    console.log(`${colors.bright}${colors.blue}🔍 Gas Performance Analysis Tool${colors.reset}\n`);
    
    // Load deployment data
    const network = await ethers.provider.getNetwork();
    const deploymentFile = path.join(__dirname, `../deployments/${network.chainId}-gasless-deployments.json`);
    
    if (!fs.existsSync(deploymentFile)) {
        console.error(`${colors.red}❌ Deployment file not found. Please run deploy-gasless-system.js first.${colors.reset}`);
        return;
    }
    
    const deploymentData = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    console.log(`${colors.cyan}📋 Analyzing deployment from: ${deploymentData.deployedAt}${colors.reset}\n`);
    
    // Get contracts
    const metaTxForwarder = await ethers.getContractAt("MetaTxForwarder", deploymentData.contracts.MetaTxForwarder);
    const gasTank = await ethers.getContractAt("GasTank", deploymentData.contracts.GasTank);
    const omthbToken = await ethers.getContractAt("OMTHBToken", deploymentData.contracts.OMTHBToken);
    const projectFactory = await ethers.getContractAt("ProjectFactory", deploymentData.contracts.ProjectFactory);
    
    // Get signers
    const [admin, user1, user2, relayer] = await ethers.getSigners();
    
    // Analysis results
    const results = {
        directTransactions: {},
        metaTransactions: {},
        comparisons: {}
    };
    
    console.log(`${colors.bright}1. Setting up test environment...${colors.reset}`);
    
    // Setup gas credits
    await gasTank.connect(user1).depositGasCredit(user1.address, { value: ethers.parseEther("0.5") });
    await gasTank.connect(user2).depositGasCredit(user2.address, { value: ethers.parseEther("0.5") });
    await gasTank.grantRole(await gasTank.RELAYER_ROLE(), relayer.address);
    
    // Mint tokens for testing
    await omthbToken.connect(admin).mint(user1.address, ethers.parseEther("10000"));
    await omthbToken.connect(admin).mint(user2.address, ethers.parseEther("10000"));
    
    console.log(`${colors.green}✅ Test environment ready${colors.reset}\n`);
    
    // Test 1: Token Transfer
    console.log(`${colors.bright}2. Analyzing Token Transfer...${colors.reset}`);
    
    // Direct transfer
    const directTransferTx = await omthbToken.connect(user1).transfer(user2.address, ethers.parseEther("100"));
    const directTransferReceipt = await directTransferTx.wait();
    results.directTransactions.transfer = {
        gasUsed: directTransferReceipt.gasUsed,
        gasPrice: directTransferReceipt.gasPrice,
        totalCost: directTransferReceipt.gasUsed * directTransferReceipt.gasPrice
    };
    
    // Meta transaction transfer
    const transferData = omthbToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);
    const nonce = await metaTxForwarder.getNonce(user1.address);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const chainId = network.chainId;
    
    const request = {
        from: user1.address,
        to: await omthbToken.getAddress(),
        value: 0,
        gas: 500000,
        nonce: nonce,
        deadline: deadline,
        chainId: chainId,
        data: transferData
    };
    
    const domain = {
        name: "MetaTxForwarder",
        version: "1",
        chainId: chainId,
        verifyingContract: await metaTxForwarder.getAddress()
    };
    
    const types = {
        ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "gas", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "chainId", type: "uint256" },
            { name: "data", type: "bytes" }
        ]
    };
    
    const signature = await user1.signTypedData(domain, types, request);
    const metaTransferTx = await metaTxForwarder.connect(relayer).execute(request, signature);
    const metaTransferReceipt = await metaTransferTx.wait();
    
    results.metaTransactions.transfer = {
        gasUsed: metaTransferReceipt.gasUsed,
        gasPrice: metaTransferReceipt.gasPrice,
        totalCost: metaTransferReceipt.gasUsed * metaTransferReceipt.gasPrice
    };
    
    // Calculate comparison
    const transferOverhead = ((metaTransferReceipt.gasUsed - directTransferReceipt.gasUsed) * 100n) / directTransferReceipt.gasUsed;
    results.comparisons.transfer = {
        overhead: transferOverhead,
        additionalGas: metaTransferReceipt.gasUsed - directTransferReceipt.gasUsed
    };
    
    console.log(`  ${colors.green}Direct Transfer:${colors.reset} ${directTransferReceipt.gasUsed} gas`);
    console.log(`  ${colors.yellow}Meta Transfer:${colors.reset} ${metaTransferReceipt.gasUsed} gas`);
    console.log(`  ${colors.cyan}Overhead:${colors.reset} ${transferOverhead}%\n`);
    
    // Test 2: Project Creation
    console.log(`${colors.bright}3. Analyzing Project Creation...${colors.reset}`);
    
    // Grant role for testing
    await projectFactory.grantRole(await projectFactory.PROJECT_CREATOR_ROLE(), user1.address);
    
    // Direct project creation
    const timestamp = Date.now();
    const directCreateTx = await projectFactory.connect(user1).createProject(
        `DIRECT-PROJECT-${timestamp}`,
        ethers.parseEther("100000"),
        user1.address
    );
    const directCreateReceipt = await directCreateTx.wait();
    results.directTransactions.createProject = {
        gasUsed: directCreateReceipt.gasUsed,
        gasPrice: directCreateReceipt.gasPrice,
        totalCost: directCreateReceipt.gasUsed * directCreateReceipt.gasPrice
    };
    
    // Meta transaction project creation
    const createData = projectFactory.interface.encodeFunctionData("createProject", [
        `META-PROJECT-${timestamp}`,
        ethers.parseEther("100000"),
        user1.address
    ]);
    
    const createRequest = {
        from: user1.address,
        to: await projectFactory.getAddress(),
        value: 0,
        gas: 1000000,
        nonce: await metaTxForwarder.getNonce(user1.address),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        chainId: chainId,
        data: createData
    };
    
    const createSignature = await user1.signTypedData(domain, types, createRequest);
    const metaCreateTx = await metaTxForwarder.connect(relayer).execute(createRequest, createSignature);
    const metaCreateReceipt = await metaCreateTx.wait();
    
    results.metaTransactions.createProject = {
        gasUsed: metaCreateReceipt.gasUsed,
        gasPrice: metaCreateReceipt.gasPrice,
        totalCost: metaCreateReceipt.gasUsed * metaCreateReceipt.gasPrice
    };
    
    const createOverhead = ((metaCreateReceipt.gasUsed - directCreateReceipt.gasUsed) * 100n) / directCreateReceipt.gasUsed;
    results.comparisons.createProject = {
        overhead: createOverhead,
        additionalGas: metaCreateReceipt.gasUsed - directCreateReceipt.gasUsed
    };
    
    console.log(`  ${colors.green}Direct Creation:${colors.reset} ${directCreateReceipt.gasUsed} gas`);
    console.log(`  ${colors.yellow}Meta Creation:${colors.reset} ${metaCreateReceipt.gasUsed} gas`);
    console.log(`  ${colors.cyan}Overhead:${colors.reset} ${createOverhead}%\n`);
    
    // Test 3: Batch Operations
    console.log(`${colors.bright}4. Analyzing Batch Operations...${colors.reset}`);
    
    const batchSize = 5;
    const batchRequests = [];
    const batchSignatures = [];
    
    for (let i = 0; i < batchSize; i++) {
        const batchTransferData = omthbToken.interface.encodeFunctionData("transfer", [
            user2.address,
            ethers.parseEther("10")
        ]);
        
        const batchRequest = {
            from: user1.address,
            to: await omthbToken.getAddress(),
            value: 0,
            gas: 100000,
            nonce: (await metaTxForwarder.getNonce(user1.address)) + BigInt(i),
            deadline: Math.floor(Date.now() / 1000) + 3600,
            chainId: chainId,
            data: batchTransferData
        };
        
        const batchSignature = await user1.signTypedData(domain, types, batchRequest);
        batchRequests.push(batchRequest);
        batchSignatures.push(batchSignature);
    }
    
    const batchTx = await metaTxForwarder.connect(relayer).batchExecute(batchRequests, batchSignatures);
    const batchReceipt = await batchTx.wait();
    
    const avgGasPerBatchTx = batchReceipt.gasUsed / BigInt(batchSize);
    const batchEfficiency = ((directTransferReceipt.gasUsed * BigInt(batchSize) - batchReceipt.gasUsed) * 100n) / 
                           (directTransferReceipt.gasUsed * BigInt(batchSize));
    
    console.log(`  ${colors.green}Batch Size:${colors.reset} ${batchSize} transactions`);
    console.log(`  ${colors.yellow}Total Gas:${colors.reset} ${batchReceipt.gasUsed}`);
    console.log(`  ${colors.cyan}Avg Gas per Tx:${colors.reset} ${avgGasPerBatchTx}`);
    console.log(`  ${colors.bright}${colors.green}Batch Efficiency:${colors.reset} ${batchEfficiency}% savings\n`);
    
    // Test 4: Gas Tank Analysis
    console.log(`${colors.bright}5. Analyzing Gas Tank Efficiency...${colors.reset}`);
    
    const tankBalance = await ethers.provider.getBalance(await gasTank.getAddress());
    const totalDeposited = await gasTank.totalDeposited();
    const totalRefunded = await gasTank.totalRefunded();
    const user1Credit = await gasTank.getAvailableCredit(user1.address);
    const user2Credit = await gasTank.getAvailableCredit(user2.address);
    
    console.log(`  ${colors.green}Tank Balance:${colors.reset} ${ethers.formatEther(tankBalance)} ETH`);
    console.log(`  ${colors.yellow}Total Deposited:${colors.reset} ${ethers.formatEther(totalDeposited)} ETH`);
    console.log(`  ${colors.cyan}Total Refunded:${colors.reset} ${ethers.formatEther(totalRefunded)} ETH`);
    console.log(`  ${colors.blue}User1 Credit:${colors.reset} ${ethers.formatEther(user1Credit)} ETH`);
    console.log(`  ${colors.blue}User2 Credit:${colors.reset} ${ethers.formatEther(user2Credit)} ETH\n`);
    
    // Generate Report
    console.log(`${colors.bright}${colors.green}📊 PERFORMANCE SUMMARY${colors.reset}`);
    console.log("=".repeat(60));
    
    console.log(`\n${colors.bright}Operation Comparison:${colors.reset}`);
    console.log(`${"Operation".padEnd(20)} ${"Direct Gas".padEnd(15)} ${"Meta Gas".padEnd(15)} ${"Overhead".padEnd(10)}`);
    console.log("-".repeat(60));
    
    Object.entries(results.comparisons).forEach(([operation, data]) => {
        const direct = results.directTransactions[operation].gasUsed;
        const meta = results.metaTransactions[operation].gasUsed;
        console.log(
            `${operation.padEnd(20)} ${direct.toString().padEnd(15)} ${meta.toString().padEnd(15)} ${data.overhead.toString()}%`
        );
    });
    
    console.log(`\n${colors.bright}Cost Analysis (at 20 gwei):${colors.reset}`);
    const gasPrice = ethers.parseUnits("20", "gwei");
    
    Object.entries(results.directTransactions).forEach(([operation, data]) => {
        const directCost = data.gasUsed * gasPrice;
        const metaCost = results.metaTransactions[operation].gasUsed * gasPrice;
        const savings = directCost; // User saves 100% with meta tx
        
        console.log(`\n${operation}:`);
        console.log(`  Direct cost: ${ethers.formatEther(directCost)} ETH`);
        console.log(`  Meta cost to relayer: ${ethers.formatEther(metaCost)} ETH`);
        console.log(`  ${colors.green}User savings: ${ethers.formatEther(savings)} ETH (100%)${colors.reset}`);
    });
    
    // Save analysis results
    const analysisPath = path.join(__dirname, "../deployments");
    const analysisFile = path.join(analysisPath, `${network.chainId}-gas-analysis.json`);
    
    const analysisData = {
        timestamp: new Date().toISOString(),
        network: {
            name: network.name,
            chainId: network.chainId.toString()
        },
        results: results,
        gasTank: {
            balance: ethers.formatEther(tankBalance),
            totalDeposited: ethers.formatEther(totalDeposited),
            totalRefunded: ethers.formatEther(totalRefunded)
        },
        recommendations: [
            "Consider implementing gas price oracles for dynamic pricing",
            "Monitor gas tank balance and implement auto-refill mechanisms",
            "Optimize batch sizes based on network congestion",
            "Implement tiered gas credits based on user activity"
        ]
    };
    
    fs.writeFileSync(analysisFile, JSON.stringify(analysisData, null, 2));
    console.log(`\n${colors.cyan}📁 Analysis saved to: ${analysisFile}${colors.reset}`);
    
    console.log(`\n${colors.bright}${colors.green}✨ Analysis complete!${colors.reset}\n`);
}

// Execute analysis
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });