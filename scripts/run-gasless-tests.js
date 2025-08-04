#!/usr/bin/env node

const { exec } = require('child_process');
const chalk = require('chalk');

console.log(chalk.blue.bold('\n🚀 Running Comprehensive Gasless Reimbursement Tests\n'));

const tests = [
    {
        name: 'Comprehensive Gasless Reimbursement System',
        file: 'test/ComprehensiveGaslessReimbursement.test.js',
        description: 'Full system test with 8 roles, 5-level approval, and emergency closure'
    },
    {
        name: 'Gasless Security and Edge Cases',
        file: 'test/GaslessSecurityEdgeCases.test.js',
        description: 'Security scenarios, attack vectors, and edge case handling'
    },
    {
        name: 'Existing Gasless Transactions',
        file: 'test/GaslessTransactions.test.js',
        description: 'Basic gasless transaction functionality'
    }
];

async function runTest(test) {
    return new Promise((resolve, reject) => {
        console.log(chalk.yellow(`\n📋 ${test.name}`));
        console.log(chalk.gray(`   ${test.description}`));
        console.log(chalk.gray(`   File: ${test.file}\n`));

        const startTime = Date.now();
        
        exec(`npx hardhat test ${test.file}`, (error, stdout, stderr) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            
            if (error) {
                console.log(chalk.red(`❌ ${test.name} failed (${duration}s)`));
                console.error(stderr);
                reject(error);
            } else {
                console.log(stdout);
                console.log(chalk.green(`✅ ${test.name} passed (${duration}s)`));
                resolve();
            }
        });
    });
}

async function runAllTests() {
    console.log(chalk.cyan('Starting test execution...\n'));
    
    let passed = 0;
    let failed = 0;
    const startTime = Date.now();

    for (const test of tests) {
        try {
            await runTest(test);
            passed++;
        } catch (error) {
            failed++;
        }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(chalk.blue.bold('\n📊 Test Summary'));
    console.log(chalk.blue('═'.repeat(50)));
    console.log(chalk.green(`   Passed: ${passed}`));
    console.log(chalk.red(`   Failed: ${failed}`));
    console.log(chalk.gray(`   Total Duration: ${totalDuration}s`));
    console.log(chalk.blue('═'.repeat(50)));

    if (failed > 0) {
        console.log(chalk.red.bold('\n❌ Some tests failed!'));
        process.exit(1);
    } else {
        console.log(chalk.green.bold('\n✨ All tests passed!'));
        
        console.log(chalk.cyan.bold('\n📝 Key Features Tested:'));
        console.log(chalk.white('   • Meta-transactions with zero gas fees for users'));
        console.log(chalk.white('   • Gas tank integration with refund mechanism'));
        console.log(chalk.white('   • Complete 8-role system implementation'));
        console.log(chalk.white('   • 5-level approval workflow (all gasless)'));
        console.log(chalk.white('   • Emergency closure with 3 committee + director approval'));
        console.log(chalk.white('   • Signature validation and replay protection'));
        console.log(chalk.white('   • Rate limiting and DoS protection'));
        console.log(chalk.white('   • Commit-reveal mechanism for front-running prevention'));
        console.log(chalk.white('   • Cross-contract security'));
        console.log(chalk.white('   • Edge cases and attack vector mitigation'));
        
        console.log(chalk.green.bold('\n🎉 System ready for deployment!\n'));
    }
}

// Run tests
runAllTests().catch(console.error);