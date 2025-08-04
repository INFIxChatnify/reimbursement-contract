const { ethers } = require("hardhat");

async function main() {
    console.log("\n" + "=".repeat(80));
    console.log("SIMPLE REIMBURSEMENT SYSTEM DEMO");
    console.log("=".repeat(80) + "\n");

    // Get signers
    const [admin, user1, user2, recipient] = await ethers.getSigners();
    console.log("Admin:", admin.address);
    console.log("User1:", user1.address);
    console.log("User2:", user2.address);
    console.log("Recipient:", recipient.address);

    // Deploy MockOMTHB token
    console.log("\n1. DEPLOYING MOCK OMTHB TOKEN");
    console.log("-".repeat(40));
    const MockToken = await ethers.getContractFactory("MockOMTHB");
    const token = await MockToken.deploy();
    await token.waitForDeployment();
    console.log("✓ Token deployed at:", await token.getAddress());

    // Check initial balance
    const adminBalance = await token.balanceOf(admin.address);
    console.log("✓ Admin initial balance:", ethers.formatEther(adminBalance), "OMTHB");

    // Transfer tokens
    console.log("\n2. TRANSFERRING TOKENS");
    console.log("-".repeat(40));
    await token.transfer(user1.address, ethers.parseEther("1000"));
    await token.transfer(user2.address, ethers.parseEther("500"));
    console.log("✓ Transferred 1000 OMTHB to User1");
    console.log("✓ Transferred 500 OMTHB to User2");

    // Display balances
    console.log("\n3. CHECKING BALANCES");
    console.log("-".repeat(40));
    console.log("User1 balance:", ethers.formatEther(await token.balanceOf(user1.address)), "OMTHB");
    console.log("User2 balance:", ethers.formatEther(await token.balanceOf(user2.address)), "OMTHB");

    // Deploy AuditAnchor
    console.log("\n4. DEPLOYING AUDIT ANCHOR");
    console.log("-".repeat(40));
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy();
    await auditAnchor.waitForDeployment();
    console.log("✓ AuditAnchor deployed at:", await auditAnchor.getAddress());

    // Create audit batch
    console.log("\n5. CREATING AUDIT BATCH");
    console.log("-".repeat(40));
    const ipfsHash = "QmTest" + Math.random().toString(36).substring(7);
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test audit data"));
    const entryCount = 10;
    const batchType = "PAYMENT_DEMO";

    const tx = await auditAnchor.anchorAuditBatch(ipfsHash, merkleRoot, entryCount, batchType);
    const receipt = await tx.wait();
    console.log("✓ Audit batch created with", entryCount, "entries");
    console.log("  IPFS Hash:", ipfsHash);
    console.log("  Merkle Root:", merkleRoot);

    // Check statistics
    const [batchesAnchored, isAuthorized] = await auditAnchor.getAnchorStatistics(admin.address);
    console.log("\n6. AUDIT STATISTICS");
    console.log("-".repeat(40));
    console.log("Batches anchored by admin:", batchesAnchored.toString());
    console.log("Admin is authorized:", isAuthorized);

    // Simulate payment flow
    console.log("\n7. SIMULATING PAYMENT FLOW");
    console.log("-".repeat(40));
    console.log("✓ User1 initiates payment request for 100 OMTHB to recipient");
    await token.connect(user1).transfer(recipient.address, ethers.parseEther("100"));
    
    const recipientBalance = await token.balanceOf(recipient.address);
    console.log("✓ Payment completed. Recipient balance:", ethers.formatEther(recipientBalance), "OMTHB");

    // Final balances
    console.log("\n8. FINAL BALANCES");
    console.log("-".repeat(40));
    console.log("Admin:", ethers.formatEther(await token.balanceOf(admin.address)), "OMTHB");
    console.log("User1:", ethers.formatEther(await token.balanceOf(user1.address)), "OMTHB");
    console.log("User2:", ethers.formatEther(await token.balanceOf(user2.address)), "OMTHB");
    console.log("Recipient:", ethers.formatEther(await token.balanceOf(recipient.address)), "OMTHB");

    console.log("\n" + "=".repeat(80));
    console.log("DEMO COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(80) + "\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });