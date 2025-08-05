const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Test Files Status...\n');

// Get all test files
const testDir = path.join(__dirname, '..', 'test');
const securityTestDir = path.join(testDir, 'security');

function getTestFiles(dir) {
  const files = [];
  
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach(file => {
      if (file.endsWith('.test.js') || file.endsWith('.js')) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isFile() && !file.includes('TestDepositAndLocking.sol')) {
          files.push(fullPath);
        }
      }
    });
  }
  
  return files;
}

// Get all test files
const testFiles = [
  ...getTestFiles(testDir),
  ...getTestFiles(securityTestDir)
].filter(file => !file.includes('.sol')); // Exclude Solidity files

console.log(`Found ${testFiles.length} test files\n`);

// Check which tests have errors
const errorPatterns = [
  { pattern: 'OMTHBToken"', issue: 'Looking for "OMTHBToken" (should be "OMTHBTokenV3" or "MockOMTHB")' },
  { pattern: 'OMTHBTokenV2', issue: 'Looking for "OMTHBTokenV2" (doesn\'t exist)' },
  { pattern: 'depositOMTHB', issue: 'Using depositOMTHB() function (doesn\'t exist)' },
  { pattern: 'needsDeposit', issue: 'Using needsDeposit() function (doesn\'t exist)' },
  { pattern: 'getTotalBalance', issue: 'Using getTotalBalance() function (doesn\'t exist)' },
  { pattern: 'getAvailableBalance', issue: 'Using getAvailableBalance() function (doesn\'t exist)' },
  { pattern: 'getLockedAmount', issue: 'Using getLockedAmount() function (doesn\'t exist)' },
  { pattern: 'InsufficientAvailableBalance', issue: 'Using InsufficientAvailableBalance error (doesn\'t exist)' }
];

const problematicFiles = [];
const workingFiles = [];

testFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const issues = [];
  
  errorPatterns.forEach(({ pattern, issue }) => {
    if (content.includes(pattern)) {
      issues.push(issue);
    }
  });
  
  const relPath = path.relative(path.join(__dirname, '..'), file);
  
  if (issues.length > 0) {
    problematicFiles.push({ file: relPath, issues });
  } else {
    // Check if it's our working test
    if (relPath === 'test/simple-project-test.js') {
      workingFiles.push(relPath);
    }
  }
});

console.log('✅ Working Test Files:');
if (workingFiles.length > 0) {
  workingFiles.forEach(file => {
    console.log(`   - ${file}`);
  });
} else {
  console.log('   None');
}

console.log('\n❌ Problematic Test Files:');
if (problematicFiles.length > 0) {
  problematicFiles.forEach(({ file, issues }) => {
    console.log(`\n   📄 ${file}`);
    issues.forEach(issue => {
      console.log(`      - ${issue}`);
    });
  });
} else {
  console.log('   None');
}

console.log('\n📊 Summary:');
console.log(`   - Total test files: ${testFiles.length}`);
console.log(`   - Working files: ${workingFiles.length}`);
console.log(`   - Problematic files: ${problematicFiles.length}`);

// Run the working test
if (workingFiles.length > 0) {
  console.log('\n🧪 Running working test...\n');
  try {
    execSync('npx hardhat test test/simple-project-test.js', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
  } catch (error) {
    console.error('Error running test:', error.message);
  }
}
