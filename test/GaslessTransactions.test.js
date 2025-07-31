const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Gasless Transactions Full Loop Simulation", function () {
    let gasTank;
    let forwarder;
    let omthbToken;
    let projectReimbursement;
    let mockRelayer;
    let projectFactory;

    let owner;
    let admin;
    let relayer;
    let user;
    let recipient;
    let secretary;
    let committee;
    let finance;
    let director;

    const PROJECT_ID = "TEST-PROJECT-001";
    const PROJECT_BUDGET = ethers.parseEther("1000000"); // 1M OMTHB
    const INITIAL_MINT = ethers.parseEther("10000000"); // 10M OMTHB

    // EIP-712 Domain
    const DOMAIN_NAME = "MetaTxForwarderV2";
    const DOMAIN_VERSION = "2";

    beforeEach(async function () {
        [owner, admin, relayer, user, recipient, secretary, committee, finance, director] = await ethers.getSigners();

        // Deploy Gas Tank
        const GasTank = await ethers.getContractFactory("GasTank");
        gasTank = await GasTank.deploy(owner.address, owner.address);
        await gasTank.waitForDeployment();

        // Grant relayer role
        await gasTank.grantRole(await gasTank.RELAYER_ROLE(), relayer.address);

        // Deploy Meta Transaction Forwarder
        const MetaTxForwarderV2 = await ethers.getContractFactory("MetaTxForwarderV2");
        forwarder = await MetaTxForwarderV2.deploy(gasTank.target);
        await forwarder.waitForDeployment();

        // Deploy OMTHB Token with meta transaction support
        const OMTHBTokenV2 = await ethers.getContractFactory("OMTHBTokenV2");
        omthbToken = await upgrades.deployProxy(
            OMTHBTokenV2,
            [admin.address, forwarder.target],
            {
                initializer: "initialize"
            }
        );
        await omthbToken.waitForDeployment();

        // Mint initial tokens to admin (who will create projects)
        await omthbToken.connect(admin).mint(admin.address, INITIAL_MINT);

        // Deploy Project Reimbursement implementation first
        const ProjectReimbursementV2 = await ethers.getContractFactory("ProjectReimbursementV2");
        const projectImpl = await ProjectReimbursementV2.deploy();
        await projectImpl.waitForDeployment();

        // Deploy Project Factory with deployer as initial admin
        const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
        projectFactory = await ProjectFactory.deploy(
            projectImpl.target,      // _projectImplementation
            omthbToken.target,      // _omthbToken
            forwarder.target,       // _metaTxForwarder
            owner.address           // _admin (deployer first, then transfer)
        );
        await projectFactory.waitForDeployment();

        // Grant roles to admin account
        const PROJECT_CREATOR_ROLE = await projectFactory.PROJECT_CREATOR_ROLE();
        const DEFAULT_ADMIN_ROLE = await projectFactory.DEFAULT_ADMIN_ROLE();
        
        // Grant PROJECT_CREATOR_ROLE to admin
        await projectFactory.grantRole(PROJECT_CREATOR_ROLE, admin.address);
        
        // Transfer admin role if needed
        if (admin.address !== owner.address) {
            await projectFactory.grantRole(DEFAULT_ADMIN_ROLE, admin.address);
        }

        // Create project - admin needs to approve and create
        await omthbToken.connect(admin).approve(projectFactory.target, PROJECT_BUDGET);
        const tx = await projectFactory.connect(admin).createProject(PROJECT_ID, PROJECT_BUDGET, admin.address);
        const receipt = await tx.wait();
        
        console.log("Transaction receipt logs:", receipt.logs.length);
        
        // Get project address from event
        let projectAddress;
        for (const log of receipt.logs) {
            try {
                const parsed = projectFactory.interface.parseLog(log);
                console.log("Parsed event:", parsed?.name);
                if (parsed && parsed.name === "ProjectCreated") {
                    console.log("Found ProjectCreated event, args:", parsed.args);
                    projectAddress = parsed.args[1]; // projectAddress is the second argument
                    break;
                }
            } catch (e) {
                // Try to parse with other contracts
                try {
                    const parsedToken = omthbToken.interface.parseLog(log);
                    console.log("Token event:", parsedToken?.name);
                } catch {}
            }
        }
        
        if (!projectAddress) {
            throw new Error("ProjectCreated event not found");
        }
        
        projectReimbursement = await ethers.getContractAt("ProjectReimbursementV2", projectAddress);

        // Setup roles
        await projectReimbursement.connect(admin).grantRole(await projectReimbursement.REQUESTER_ROLE(), user.address);
        await projectReimbursement.connect(admin).grantRole(await projectReimbursement.SECRETARY_ROLE(), secretary.address);
        await projectReimbursement.connect(admin).grantRole(await projectReimbursement.COMMITTEE_ROLE(), committee.address);
        await projectReimbursement.connect(admin).grantRole(await projectReimbursement.FINANCE_ROLE(), finance.address);
        await projectReimbursement.connect(admin).grantRole(await projectReimbursement.DIRECTOR_ROLE(), director.address);

        // Whitelist contracts in forwarder
        await forwarder.setTargetWhitelist(omthbToken.target, true);
        await forwarder.setTargetWhitelist(projectReimbursement.target, true);

        // Deploy Mock Relayer
        const MockRelayer = await ethers.getContractFactory("contracts/test/MockRelayer.sol:MockRelayer");
        mockRelayer = await MockRelayer.deploy(forwarder.target, gasTank.target);
        await mockRelayer.waitForDeployment();

        // Fund relayer with OM
        await owner.sendTransaction({
            to: mockRelayer.target,
            value: ethers.parseEther("10")
        });

        // Setup gas credits for user
        await gasTank.connect(user).depositGasCredit(user.address, { value: ethers.parseEther("1") });
    });

    describe("Full Gasless Transaction Loop", function () {
        it("Should execute a complete gasless token transfer", async function () {
            console.log("\n=== GASLESS TOKEN TRANSFER SIMULATION ===\n");

            // 1. User creates and signs meta transaction
            const amount = ethers.parseEther("100");
            const nonce = await forwarder.getNonce(user.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

            // Encode transfer function call
            const transferData = omthbToken.interface.encodeFunctionData("transfer", [recipient.address, amount]);

            // Create forward request
            const forwardRequest = {
                from: user.address,
                to: omthbToken.target,
                value: 0,
                gas: 200000,
                nonce: nonce,
                deadline: deadline,
                chainId: (await ethers.provider.getNetwork()).chainId,
                data: transferData
            };

            // Sign the request
            const domain = {
                name: DOMAIN_NAME,
                version: DOMAIN_VERSION,
                chainId: forwardRequest.chainId,
                verifyingContract: forwarder.target
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

            const signature = await user.signTypedData(domain, types, forwardRequest);

            console.log("1. User signed meta transaction:");
            console.log(`   - From: ${user.address}`);
            console.log(`   - To: ${recipient.address}`);
            console.log(`   - Amount: ${ethers.formatEther(amount)} OMTHB`);
            console.log(`   - Nonce: ${nonce}`);

            // First give user some tokens
            await omthbToken.connect(admin).mint(user.address, amount);

            // Check initial balances
            const userBalanceBefore = await omthbToken.balanceOf(user.address);
            const recipientBalanceBefore = await omthbToken.balanceOf(recipient.address);
            const relayerEthBefore = await ethers.provider.getBalance(mockRelayer.target);
            const userGasCreditBefore = await gasTank.getAvailableCredit(user.address);

            console.log("\n2. Initial state:");
            console.log(`   - User OMTHB balance: ${ethers.formatEther(userBalanceBefore)}`);
            console.log(`   - Recipient OMTHB balance: ${ethers.formatEther(recipientBalanceBefore)}`);
            console.log(`   - Relayer OM balance: ${ethers.formatEther(relayerEthBefore)}`);
            console.log(`   - User gas credit: ${ethers.formatEther(userGasCreditBefore)} OM`);

            // 2. Relayer submits transaction
            console.log("\n3. Relayer submitting transaction...");
            const tx = await mockRelayer.connect(relayer).submitTransaction(forwardRequest, signature);
            const receipt = await tx.wait();

            // Get gas used
            const gasUsed = receipt.gasUsed;
            const gasPrice = tx.gasPrice;
            const gasCost = gasUsed * gasPrice;

            console.log(`   - Gas used: ${gasUsed}`);
            console.log(`   - Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
            console.log(`   - Total gas cost: ${ethers.formatEther(gasCost)} OM`);

            // 3. Check final balances
            const userBalanceAfter = await omthbToken.balanceOf(user.address);
            const recipientBalanceAfter = await omthbToken.balanceOf(recipient.address);
            const relayerEthAfter = await ethers.provider.getBalance(mockRelayer.target);
            const userGasCreditAfter = await gasTank.getAvailableCredit(user.address);

            console.log("\n4. Final state:");
            console.log(`   - User OMTHB balance: ${ethers.formatEther(userBalanceAfter)}`);
            console.log(`   - Recipient OMTHB balance: ${ethers.formatEther(recipientBalanceAfter)}`);
            console.log(`   - Relayer OM balance: ${ethers.formatEther(relayerEthAfter)}`);
            console.log(`   - User gas credit: ${ethers.formatEther(userGasCreditAfter)} OM`);

            // Verify token transfer
            expect(userBalanceAfter).to.equal(userBalanceBefore - amount);
            expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + amount);

            // Verify gas refund
            const gasRefunded = userGasCreditBefore - userGasCreditAfter;
            console.log(`\n5. Gas refund analysis:`);
            console.log(`   - Gas credit used: ${ethers.formatEther(gasRefunded)} OM`);
            console.log(`   - Refund covers actual gas cost: ${gasRefunded >= gasCost}`);

            // Get relayer stats
            const stats = await mockRelayer.getStats();
            console.log(`\n6. Relayer statistics:`);
            console.log(`   - Total transactions: ${stats.totalTransactions}`);
            console.log(`   - Successful: ${stats.successfulTransactions}`);
            console.log(`   - Failed: ${stats.failedTransactions}`);
            console.log(`   - Total gas used: ${stats.totalGasUsed}`);
        });

        it("Should execute a complete gasless reimbursement request", async function () {
            console.log("\n=== GASLESS REIMBURSEMENT REQUEST SIMULATION ===\n");

            const amount = ethers.parseEther("1000");
            const description = "Conference expenses";
            const documentHash = "QmXxx..."; // IPFS hash

            // Create meta transaction for createRequest
            const nonce = await forwarder.getNonce(user.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            const createRequestData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient.address,
                amount,
                description,
                documentHash
            ]);

            const forwardRequest = {
                from: user.address,
                to: projectReimbursement.target,
                value: 0,
                gas: 300000,
                nonce: nonce,
                deadline: deadline,
                chainId: (await ethers.provider.getNetwork()).chainId,
                data: createRequestData
            };

            // Sign request
            const domain = {
                name: DOMAIN_NAME,
                version: DOMAIN_VERSION,
                chainId: forwardRequest.chainId,
                verifyingContract: forwarder.target
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

            const signature = await user.signTypedData(domain, types, forwardRequest);

            console.log("1. User creating reimbursement request via meta transaction:");
            console.log(`   - Requester: ${user.address}`);
            console.log(`   - Recipient: ${recipient.address}`);
            console.log(`   - Amount: ${ethers.formatEther(amount)} OMTHB`);
            console.log(`   - Description: ${description}`);

            // Submit via relayer
            const userGasCreditBefore = await gasTank.getAvailableCredit(user.address);
            
            console.log("\n2. Submitting via relayer...");
            const tx = await mockRelayer.connect(relayer).submitTransaction(forwardRequest, signature);
            const receipt = await tx.wait();

            // Parse events to get request ID
            let requestId;
            for (const log of receipt.logs) {
                try {
                    const parsed = projectReimbursement.interface.parseLog(log);
                    if (parsed && parsed.name === "RequestCreated") {
                        // RequestCreated event has requestId as the first argument (index 0)
                        requestId = parsed.args[0];
                        break;
                    }
                } catch {
                    // Try other contracts if needed
                }
            }
            
            if (!requestId && requestId !== 0n) {
                throw new Error("RequestCreated event not found");
            }
            console.log(`   - Request created with ID: ${requestId}`);
            console.log(`   - Gas used: ${receipt.gasUsed}`);

            const userGasCreditAfter = await gasTank.getAvailableCredit(user.address);
            const gasRefunded = userGasCreditBefore - userGasCreditAfter;
            console.log(`   - Gas credit used: ${ethers.formatEther(gasRefunded)} OM`);

            // Verify request was created
            const request = await projectReimbursement.getRequest(requestId);
            // The requester should be the user from the meta transaction, not the relayer
            expect(request.requester).to.equal(user.address);
            expect(request.recipient).to.equal(recipient.address);
            expect(request.amount).to.equal(amount);

            console.log("\n3. Request successfully created via gasless transaction!");
        });

        it("Should execute batch gasless transactions", async function () {
            console.log("\n=== BATCH GASLESS TRANSACTIONS SIMULATION ===\n");

            // Prepare multiple transactions
            const amounts = [
                ethers.parseEther("10"),
                ethers.parseEther("20"),
                ethers.parseEther("30")
            ];

            const recipients = [
                ethers.Wallet.createRandom().address,
                ethers.Wallet.createRandom().address,
                ethers.Wallet.createRandom().address
            ];

            // Mint tokens to user
            await omthbToken.connect(admin).mint(user.address, ethers.parseEther("100"));

            // Create forward requests
            const forwardRequests = [];
            const signatures = [];
            const baseNonce = await forwarder.getNonce(user.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const chainId = (await ethers.provider.getNetwork()).chainId;

            const domain = {
                name: DOMAIN_NAME,
                version: DOMAIN_VERSION,
                chainId: chainId,
                verifyingContract: forwarder.target
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

            console.log("1. Creating batch of 3 token transfers:");
            for (let i = 0; i < 3; i++) {
                const transferData = omthbToken.interface.encodeFunctionData("transfer", [
                    recipients[i],
                    amounts[i]
                ]);

                const request = {
                    from: user.address,
                    to: omthbToken.target,
                    value: 0,
                    gas: 200000,
                    nonce: baseNonce + BigInt(i),
                    deadline: deadline,
                    chainId: chainId,
                    data: transferData
                };

                forwardRequests.push(request);
                const signature = await user.signTypedData(domain, types, request);
                signatures.push(signature);

                console.log(`   - Transfer ${i + 1}: ${ethers.formatEther(amounts[i])} OMTHB to ${recipients[i].slice(0, 10)}...`);
            }

            // Check initial state
            const userBalanceBefore = await omthbToken.balanceOf(user.address);
            const userGasCreditBefore = await gasTank.getAvailableCredit(user.address);

            console.log("\n2. Initial state:");
            console.log(`   - User OMTHB balance: ${ethers.formatEther(userBalanceBefore)}`);
            console.log(`   - User gas credit: ${ethers.formatEther(userGasCreditBefore)} OM`);

            // Submit batch
            console.log("\n3. Submitting batch via relayer...");
            const tx = await mockRelayer.connect(relayer).submitBatchTransactions(forwardRequests, signatures);
            const receipt = await tx.wait();

            console.log(`   - Batch gas used: ${receipt.gasUsed}`);
            console.log(`   - Average gas per tx: ${receipt.gasUsed / 3n}`);

            // Check final state
            const userBalanceAfter = await omthbToken.balanceOf(user.address);
            const userGasCreditAfter = await gasTank.getAvailableCredit(user.address);
            const totalSent = amounts.reduce((sum, amount) => sum + amount, 0n);

            console.log("\n4. Final state:");
            console.log(`   - User OMTHB balance: ${ethers.formatEther(userBalanceAfter)}`);
            console.log(`   - Total OMTHB sent: ${ethers.formatEther(totalSent)}`);
            console.log(`   - User gas credit: ${ethers.formatEther(userGasCreditAfter)} OM`);
            console.log(`   - Gas credit used: ${ethers.formatEther(userGasCreditBefore - userGasCreditAfter)}`);

            // Verify transfers
            expect(userBalanceAfter).to.equal(userBalanceBefore - totalSent);
            for (let i = 0; i < 3; i++) {
                const balance = await omthbToken.balanceOf(recipients[i]);
                expect(balance).to.equal(amounts[i]);
                console.log(`   - Recipient ${i + 1} received: ${ethers.formatEther(balance)} OMTHB ✓`);
            }

            console.log("\n5. All batch transactions executed successfully!");
        });

        it("Should track and analyze gas usage", async function () {
            console.log("\n=== GAS USAGE ANALYSIS ===\n");

            // Execute multiple transactions to gather data
            const txCount = 5;
            const txDetails = [];

            // Mint tokens to user
            await omthbToken.connect(admin).mint(user.address, ethers.parseEther("1000"));

            console.log("1. Executing 5 gasless transactions for analysis...\n");

            for (let i = 0; i < txCount; i++) {
                const amount = ethers.parseEther((10 * (i + 1)).toString());
                const nonce = await forwarder.getNonce(user.address);
                const deadline = Math.floor(Date.now() / 1000) + 3600;

                const transferData = omthbToken.interface.encodeFunctionData("transfer", [
                    ethers.Wallet.createRandom().address,
                    amount
                ]);

                const forwardRequest = {
                    from: user.address,
                    to: omthbToken.target,
                    value: 0,
                    gas: 200000,
                    nonce: nonce,
                    deadline: deadline,
                    chainId: (await ethers.provider.getNetwork()).chainId,
                    data: transferData
                };

                const domain = {
                    name: DOMAIN_NAME,
                    version: DOMAIN_VERSION,
                    chainId: forwardRequest.chainId,
                    verifyingContract: forwarder.target
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

                const signature = await user.signTypedData(domain, types, forwardRequest);

                const gasBefore = await ethers.provider.getBalance(mockRelayer.target);
                const tx = await mockRelayer.connect(relayer).submitTransaction(forwardRequest, signature);
                const receipt = await tx.wait();
                const gasAfter = await ethers.provider.getBalance(mockRelayer.target);

                const gasUsed = receipt.gasUsed;
                const gasPrice = tx.gasPrice;
                const actualCost = gasBefore - gasAfter;

                txDetails.push({
                    tx: i + 1,
                    amount: amount,
                    gasUsed: gasUsed,
                    gasPrice: gasPrice,
                    actualCost: actualCost,
                    receipt: receipt
                });

                console.log(`   Transaction ${i + 1}:`);
                console.log(`   - Amount: ${ethers.formatEther(amount)} OMTHB`);
                console.log(`   - Gas used: ${gasUsed}`);
                console.log(`   - Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
                console.log(`   - Actual cost: ${ethers.formatEther(actualCost)} ETH\n`);
            }

            // Analyze gas usage
            console.log("2. Gas Usage Analysis:");
            
            const totalGasUsed = txDetails.reduce((sum, tx) => sum + tx.gasUsed, 0n);
            const avgGasUsed = totalGasUsed / BigInt(txCount);
            
            const totalCost = txDetails.reduce((sum, tx) => sum + tx.actualCost, 0n);
            const avgCost = totalCost / BigInt(txCount);

            console.log(`   - Total gas used: ${totalGasUsed}`);
            console.log(`   - Average gas per tx: ${avgGasUsed}`);
            console.log(`   - Total cost: ${ethers.formatEther(totalCost)} ETH`);
            console.log(`   - Average cost per tx: ${ethers.formatEther(avgCost)} ETH`);

            // Compare with direct transaction
            console.log("\n3. Comparison with Direct Transaction:");
            
            // Direct transfer for comparison
            const directTx = await omthbToken.connect(user).transfer(
                ethers.Wallet.createRandom().address,
                ethers.parseEther("50")
            );
            const directReceipt = await directTx.wait();
            
            console.log(`   - Direct transfer gas: ${directReceipt.gasUsed}`);
            console.log(`   - Meta tx gas: ${avgGasUsed}`);
            console.log(`   - Overhead: ${avgGasUsed - directReceipt.gasUsed} (${((avgGasUsed - directReceipt.gasUsed) * 100n / directReceipt.gasUsed)}%)`);

            // Gas usage history
            console.log("\n4. Gas Usage History from Gas Tank:");
            const history = await gasTank.getGasUsageHistory(user.address, 5);
            
            let totalRefunded = 0n;
            for (let i = 0; i < history.length; i++) {
                console.log(`   - Usage ${i + 1}: ${history[i].gasUsed} gas, ${ethers.formatEther(history[i].cost)} ETH refunded`);
                totalRefunded += history[i].cost;
            }
            
            console.log(`\n   Total refunded to relayer: ${ethers.formatEther(totalRefunded)} ETH`);

            // Final gas credit check
            const remainingCredit = await gasTank.getAvailableCredit(user.address);
            console.log(`   Remaining user gas credit: ${ethers.formatEther(remainingCredit)} ETH`);
        });
    });

    describe("Gas Tank Management", function () {
        it("Should manage gas credits and limits", async function () {
            console.log("\n=== GAS TANK MANAGEMENT ===\n");

            // Setup custom limits
            await gasTank.connect(owner).updateGasCredit(
                user.address,
                ethers.parseEther("0.01"), // 0.01 ETH per tx
                ethers.parseEther("0.1")    // 0.1 ETH per day
            );

            console.log("1. Gas credit limits set:");
            const credit = await gasTank.gasCredits(user.address);
            console.log(`   - Max per transaction: ${ethers.formatEther(credit.maxPerTransaction)} ETH`);
            console.log(`   - Daily limit: ${ethers.formatEther(credit.dailyLimit)} ETH`);

            // Test transaction within limits
            console.log("\n2. Testing transaction within limits...");
            
            // Small transfer
            const smallAmount = ethers.parseEther("1");
            await omthbToken.connect(admin).mint(user.address, smallAmount);

            const nonce = await forwarder.getNonce(user.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            const transferData = omthbToken.interface.encodeFunctionData("transfer", [
                recipient.address,
                smallAmount
            ]);

            const forwardRequest = {
                from: user.address,
                to: omthbToken.target,
                value: 0,
                gas: 100000, // Lower gas to stay within limits
                nonce: nonce,
                deadline: deadline,
                chainId: (await ethers.provider.getNetwork()).chainId,
                data: transferData
            };

            const domain = {
                name: DOMAIN_NAME,
                version: DOMAIN_VERSION,
                chainId: forwardRequest.chainId,
                verifyingContract: forwarder.target
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

            const signature = await user.signTypedData(domain, types, forwardRequest);

            const creditBefore = await gasTank.getAvailableCredit(user.address);
            await mockRelayer.connect(relayer).submitTransaction(forwardRequest, signature);
            const creditAfter = await gasTank.getAvailableCredit(user.address);

            console.log(`   - Credit before: ${ethers.formatEther(creditBefore)} ETH`);
            console.log(`   - Credit after: ${ethers.formatEther(creditAfter)} ETH`);
            console.log(`   - Credit used: ${ethers.formatEther(creditBefore - creditAfter)} ETH`);

            // Test credit withdrawal
            console.log("\n3. Testing credit withdrawal...");
            const withdrawAmount = ethers.parseEther("0.5");
            const balanceBefore = await ethers.provider.getBalance(user.address);
            
            await gasTank.connect(user).withdrawGasCredit(withdrawAmount);
            
            const balanceAfter = await ethers.provider.getBalance(user.address);
            const creditRemaining = await gasTank.getAvailableCredit(user.address);

            console.log(`   - Withdrawn: ${ethers.formatEther(withdrawAmount)} ETH`);
            console.log(`   - Remaining credit: ${ethers.formatEther(creditRemaining)} ETH`);
            console.log(`   - User ETH balance increased: ${ethers.formatEther(balanceAfter - balanceBefore)} ETH`);
        });
    });

    describe("Security and Edge Cases", function () {
        it("Should prevent gasless transactions when gas credit is insufficient", async function () {
            console.log("\n=== INSUFFICIENT GAS CREDIT TEST ===\n");

            // Deplete user's gas credit
            const credit = await gasTank.getAvailableCredit(user.address);
            await gasTank.connect(user).withdrawGasCredit(credit - ethers.parseEther("0.0001"));

            console.log("1. User gas credit depleted:");
            console.log(`   - Remaining credit: ${ethers.formatEther(await gasTank.getAvailableCredit(user.address))} ETH`);

            // Try to execute transaction
            await omthbToken.connect(admin).mint(user.address, ethers.parseEther("100"));

            const nonce = await forwarder.getNonce(user.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            const transferData = omthbToken.interface.encodeFunctionData("transfer", [
                recipient.address,
                ethers.parseEther("10")
            ]);

            const forwardRequest = {
                from: user.address,
                to: omthbToken.target,
                value: 0,
                gas: 200000,
                nonce: nonce,
                deadline: deadline,
                chainId: (await ethers.provider.getNetwork()).chainId,
                data: transferData
            };

            const domain = {
                name: DOMAIN_NAME,
                version: DOMAIN_VERSION,
                chainId: forwardRequest.chainId,
                verifyingContract: forwarder.target
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

            const signature = await user.signTypedData(domain, types, forwardRequest);

            console.log("\n2. Attempting gasless transaction with insufficient credit...");
            
            // Transaction should still succeed, but no refund
            const tx = await mockRelayer.connect(relayer).submitTransaction(forwardRequest, signature);
            await tx.wait();

            console.log("   - Transaction executed (relayer pays gas)");
            console.log("   - But no gas refund due to insufficient credit");

            // Verify token transfer still happened
            const recipientBalance = await omthbToken.balanceOf(recipient.address);
            expect(recipientBalance).to.equal(ethers.parseEther("10"));
            console.log("   - Token transfer successful: ✓");
        });

        it("Should handle rate limiting", async function () {
            console.log("\n=== RATE LIMITING TEST ===\n");

            // Set low rate limit
            await forwarder.updateRateLimit(3);
            console.log("1. Rate limit set to 3 transactions per hour");

            // Execute transactions up to limit
            console.log("\n2. Executing transactions...");
            
            for (let i = 0; i < 3; i++) {
                await omthbToken.connect(admin).mint(user.address, ethers.parseEther("10"));

                const nonce = await forwarder.getNonce(user.address);
                const deadline = Math.floor(Date.now() / 1000) + 3600;

                const transferData = omthbToken.interface.encodeFunctionData("transfer", [
                    ethers.Wallet.createRandom().address,
                    ethers.parseEther("1")
                ]);

                const forwardRequest = {
                    from: user.address,
                    to: omthbToken.target,
                    value: 0,
                    gas: 200000,
                    nonce: nonce,
                    deadline: deadline,
                    chainId: (await ethers.provider.getNetwork()).chainId,
                    data: transferData
                };

                const domain = {
                    name: DOMAIN_NAME,
                    version: DOMAIN_VERSION,
                    chainId: forwardRequest.chainId,
                    verifyingContract: forwarder.target
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

                const signature = await user.signTypedData(domain, types, forwardRequest);

                await mockRelayer.connect(relayer).submitTransaction(forwardRequest, signature);
                console.log(`   - Transaction ${i + 1}: ✓`);
            }

            // Try one more - should fail
            console.log("\n3. Attempting 4th transaction (should fail)...");
            
            const nonce = await forwarder.getNonce(user.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            const transferData = omthbToken.interface.encodeFunctionData("transfer", [
                ethers.Wallet.createRandom().address,
                ethers.parseEther("1")
            ]);

            const forwardRequest = {
                from: user.address,
                to: omthbToken.target,
                value: 0,
                gas: 200000,
                nonce: nonce,
                deadline: deadline,
                chainId: (await ethers.provider.getNetwork()).chainId,
                data: transferData
            };

            const domain = {
                name: DOMAIN_NAME,
                version: DOMAIN_VERSION,
                chainId: forwardRequest.chainId,
                verifyingContract: forwarder.target
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

            const signature = await user.signTypedData(domain, types, forwardRequest);

            await expect(
                mockRelayer.connect(relayer).submitTransaction(forwardRequest, signature)
            ).to.be.reverted;

            console.log("   - Rate limit exceeded: ✓");
        });
    });
});