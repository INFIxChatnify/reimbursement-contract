# Frontend Integration Guide

This guide provides practical code examples for integrating with the reimbursement smart contract system using Web3.js and Ethers.js.

## Table of Contents

1. [Setup and Configuration](#setup-and-configuration)
2. [Contract Initialization](#contract-initialization)
3. [Creating Reimbursement Requests](#creating-reimbursement-requests)
4. [Approval Workflow](#approval-workflow)
5. [Event Listening](#event-listening)
6. [Error Handling](#error-handling)
7. [Role Management](#role-management)
8. [Transaction Patterns](#transaction-patterns)
9. [Best Practices](#best-practices)

## Setup and Configuration

### Web3.js Setup

```javascript
import Web3 from 'web3';

// Initialize Web3
const web3 = new Web3(window.ethereum || 'https://rpc.omchain.io');

// Request account access (MetaMask)
async function requestAccounts() {
    try {
        const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
        });
        return accounts;
    } catch (error) {
        console.error('User denied account access');
        throw error;
    }
}

// Check and switch to OM Chain
async function ensureOmChain() {
    const chainId = await web3.eth.getChainId();
    if (chainId !== 1246) {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x4de' }], // 1246 in hex
            });
        } catch (error) {
            // Chain not added, add it
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: '0x4de',
                    chainName: 'OM Chain',
                    nativeCurrency: {
                        name: 'OMTHB',
                        symbol: 'OMTHB',
                        decimals: 18
                    },
                    rpcUrls: ['https://rpc.omchain.io'],
                    blockExplorerUrls: ['https://explorer.omchain.io']
                }]
            });
        }
    }
}
```

### Ethers.js Setup

```javascript
import { ethers } from 'ethers';

// Initialize provider
let provider;
let signer;

async function initializeEthers() {
    if (window.ethereum) {
        // MetaMask or similar
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        
        // Ensure correct network
        const network = await provider.getNetwork();
        if (network.chainId !== 1246n) {
            throw new Error('Please switch to OM Chain');
        }
    } else {
        // Fallback to read-only
        provider = new ethers.JsonRpcProvider('https://rpc.omchain.io');
    }
    
    return { provider, signer };
}
```

## Contract Initialization

### Contract Addresses and ABIs

```javascript
const CONTRACTS = {
    OMTHB_TOKEN: '0xb69c9a0998AC337fd7101D5eE710176030b186b1',
    PROJECT_FACTORY: '0xeF26c2c6E107f04c8137d1ee67177fA058a12C7F',
    META_TX_FORWARDER: '0x66aC00B6bE5F7992B86862405740266a49deca44'
};

// Import ABIs (stored separately)
import OMTHBTokenABI from './abis/OMTHBTokenV3.json';
import ProjectFactoryABI from './abis/ProjectFactoryV3.json';
import ProjectReimbursementABI from './abis/ProjectReimbursementV3.json';
```

### Web3.js Contract Instances

```javascript
// Initialize contracts
const omthbToken = new web3.eth.Contract(OMTHBTokenABI, CONTRACTS.OMTHB_TOKEN);
const projectFactory = new web3.eth.Contract(ProjectFactoryABI, CONTRACTS.PROJECT_FACTORY);

// Get project contract instance
async function getProjectContract(projectId) {
    const projectInfo = await projectFactory.methods.projects(projectId).call();
    if (projectInfo.projectContract === '0x0000000000000000000000000000000000000000') {
        throw new Error('Project not found');
    }
    return new web3.eth.Contract(ProjectReimbursementABI, projectInfo.projectContract);
}
```

### Ethers.js Contract Instances

```javascript
// Initialize contracts
const omthbToken = new ethers.Contract(CONTRACTS.OMTHB_TOKEN, OMTHBTokenABI, signer);
const projectFactory = new ethers.Contract(CONTRACTS.PROJECT_FACTORY, ProjectFactoryABI, signer);

// Get project contract instance
async function getProjectContract(projectId) {
    const projectInfo = await projectFactory.projects(projectId);
    if (projectInfo.projectContract === ethers.ZeroAddress) {
        throw new Error('Project not found');
    }
    return new ethers.Contract(projectInfo.projectContract, ProjectReimbursementABI, signer);
}
```

## Creating Reimbursement Requests

### Single Recipient Request (Web3.js)

```javascript
async function createSingleRequest(projectId, recipient, amount, description, documentHash) {
    try {
        const project = await getProjectContract(projectId);
        const accounts = await web3.eth.getAccounts();
        
        // Convert amount to wei
        const amountWei = web3.utils.toWei(amount.toString(), 'ether');
        
        // Estimate gas
        const gasEstimate = await project.methods
            .createRequest(recipient, amountWei, description, documentHash)
            .estimateGas({ from: accounts[0] });
        
        // Send transaction
        const tx = await project.methods
            .createRequest(recipient, amountWei, description, documentHash)
            .send({ 
                from: accounts[0],
                gas: Math.floor(gasEstimate * 1.2) // 20% buffer
            });
        
        // Get request ID from event
        const requestId = tx.events.RequestCreated.returnValues.requestId;
        
        return {
            success: true,
            requestId,
            transactionHash: tx.transactionHash
        };
    } catch (error) {
        console.error('Error creating request:', error);
        throw error;
    }
}
```

### Multiple Recipients Request (Ethers.js)

```javascript
async function createMultipleRequest(
    projectId, 
    recipients, 
    amounts, 
    description, 
    documentHash,
    virtualPayer = ethers.ZeroAddress
) {
    try {
        const project = await getProjectContract(projectId);
        
        // Convert amounts to wei
        const amountsWei = amounts.map(amount => 
            ethers.parseEther(amount.toString())
        );
        
        // Validate inputs
        if (recipients.length !== amountsWei.length) {
            throw new Error('Recipients and amounts length mismatch');
        }
        
        if (recipients.length > 10) {
            throw new Error('Maximum 10 recipients allowed');
        }
        
        // Create request
        const tx = await project.createRequestMultiple(
            recipients,
            amountsWei,
            description,
            documentHash,
            virtualPayer
        );
        
        const receipt = await tx.wait();
        
        // Parse event to get request ID
        const event = receipt.logs.find(
            log => log.fragment?.name === 'RequestCreated'
        );
        
        const requestId = event.args.requestId;
        
        return {
            success: true,
            requestId: requestId.toString(),
            transactionHash: receipt.hash,
            gasUsed: receipt.gasUsed.toString()
        };
    } catch (error) {
        console.error('Error creating multi-request:', error);
        throw parseContractError(error);
    }
}
```

## Approval Workflow

### Commit-Reveal Implementation

```javascript
class ApprovalManager {
    constructor(projectContract, signer) {
        this.project = projectContract;
        this.signer = signer;
        this.commitments = new Map(); // Store locally or in secure storage
    }
    
    // Step 1: Generate and commit
    async commitApproval(requestId) {
        try {
            // Generate random nonce
            const nonce = ethers.hexlify(ethers.randomBytes(32));
            
            // Get signer address and chain ID
            const signerAddress = await this.signer.getAddress();
            const network = await this.signer.provider.getNetwork();
            const chainId = network.chainId;
            
            // Create commitment
            const commitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [signerAddress, requestId, chainId, nonce]
                )
            );
            
            // Send commitment transaction
            const tx = await this.project.commitApproval(requestId, commitment);
            await tx.wait();
            
            // Store nonce for later reveal
            const storageKey = `approval_${requestId}_${signerAddress}`;
            this.commitments.set(storageKey, {
                nonce,
                commitment,
                timestamp: Date.now(),
                requestId
            });
            
            // Also store in localStorage for persistence
            localStorage.setItem(storageKey, JSON.stringify({
                nonce,
                commitment,
                timestamp: Date.now()
            }));
            
            return {
                success: true,
                commitment,
                revealTime: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
            };
        } catch (error) {
            console.error('Error committing approval:', error);
            throw error;
        }
    }
    
    // Step 2: Reveal approval based on role
    async revealApproval(requestId, role) {
        try {
            const signerAddress = await this.signer.getAddress();
            const storageKey = `approval_${requestId}_${signerAddress}`;
            
            // Retrieve stored nonce
            let commitmentData = this.commitments.get(storageKey);
            if (!commitmentData) {
                // Try localStorage
                const stored = localStorage.getItem(storageKey);
                if (stored) {
                    commitmentData = JSON.parse(stored);
                } else {
                    throw new Error('No commitment found for this request');
                }
            }
            
            // Check if reveal window has passed
            const timePassed = Date.now() - commitmentData.timestamp;
            if (timePassed < 30 * 60 * 1000) {
                const remainingTime = 30 * 60 * 1000 - timePassed;
                throw new Error(`Must wait ${Math.ceil(remainingTime / 60000)} more minutes`);
            }
            
            // Get request status to determine approval function
            const request = await this.project.getRequest(requestId);
            let tx;
            
            switch (request.status) {
                case 0n: // Pending
                    if (role !== 'SECRETARY') throw new Error('Only secretary can approve at this stage');
                    tx = await this.project.approveBySecretary(requestId, commitmentData.nonce);
                    break;
                    
                case 1n: // SecretaryApproved
                    if (role !== 'COMMITTEE') throw new Error('Only committee can approve at this stage');
                    tx = await this.project.approveByCommittee(requestId, commitmentData.nonce);
                    break;
                    
                case 2n: // CommitteeApproved
                    if (role !== 'FINANCE') throw new Error('Only finance can approve at this stage');
                    tx = await this.project.approveByFinance(requestId, commitmentData.nonce);
                    break;
                    
                case 3n: // FinanceApproved
                    const additionalApprovers = await this.project.getCommitteeAdditionalApprovers(requestId);
                    if (additionalApprovers.length < 3) {
                        if (role !== 'COMMITTEE') throw new Error('Need committee approval');
                        tx = await this.project.approveByCommitteeAdditional(requestId, commitmentData.nonce);
                    } else {
                        if (role !== 'DIRECTOR') throw new Error('Only director can approve at this stage');
                        tx = await this.project.approveByDirector(requestId, commitmentData.nonce);
                    }
                    break;
                    
                default:
                    throw new Error('Request cannot be approved in current status');
            }
            
            const receipt = await tx.wait();
            
            // Clean up stored commitment
            this.commitments.delete(storageKey);
            localStorage.removeItem(storageKey);
            
            return {
                success: true,
                transactionHash: receipt.hash,
                newStatus: request.status
            };
        } catch (error) {
            console.error('Error revealing approval:', error);
            throw error;
        }
    }
}
```

## Event Listening

### Real-time Event Monitoring

```javascript
class EventMonitor {
    constructor(projectContract) {
        this.project = projectContract;
        this.listeners = new Map();
    }
    
    // Listen for request creation
    onRequestCreated(callback) {
        const filter = this.project.filters.RequestCreated();
        const listener = (requestId, requester, recipients, amounts, totalAmount, description, virtualPayer, event) => {
            callback({
                requestId: requestId.toString(),
                requester,
                recipients,
                amounts: amounts.map(a => ethers.formatEther(a)),
                totalAmount: ethers.formatEther(totalAmount),
                description,
                virtualPayer,
                transactionHash: event.log.transactionHash,
                blockNumber: event.log.blockNumber
            });
        };
        
        this.project.on(filter, listener);
        this.listeners.set('RequestCreated', listener);
    }
    
    // Listen for approvals
    onRequestApproved(callback) {
        const filter = this.project.filters.RequestApproved();
        const listener = (requestId, newStatus, approver, event) => {
            const statusNames = [
                'Pending',
                'SecretaryApproved',
                'CommitteeApproved',
                'FinanceApproved',
                'DirectorApproved',
                'Distributed',
                'Cancelled'
            ];
            
            callback({
                requestId: requestId.toString(),
                newStatus: statusNames[Number(newStatus)],
                newStatusCode: Number(newStatus),
                approver,
                transactionHash: event.log.transactionHash
            });
        };
        
        this.project.on(filter, listener);
        this.listeners.set('RequestApproved', listener);
    }
    
    // Listen for fund distribution
    onFundsDistributed(callback) {
        const filter = this.project.filters.FundsDistributed();
        const listener = (requestId, recipients, amounts, totalAmount, virtualPayer, event) => {
            callback({
                requestId: requestId.toString(),
                distributions: recipients.map((recipient, i) => ({
                    recipient,
                    amount: ethers.formatEther(amounts[i])
                })),
                totalAmount: ethers.formatEther(totalAmount),
                virtualPayer,
                transactionHash: event.log.transactionHash
            });
        };
        
        this.project.on(filter, listener);
        this.listeners.set('FundsDistributed', listener);
    }
    
    // Historical event queries
    async getRequestHistory(requestId) {
        const filter = this.project.filters.RequestApproved(requestId);
        const events = await this.project.queryFilter(filter);
        
        return events.map(event => ({
            status: Number(event.args.newStatus),
            approver: event.args.approver,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash
        }));
    }
    
    // Clean up listeners
    removeAllListeners() {
        for (const [event, listener] of this.listeners) {
            this.project.off(event, listener);
        }
        this.listeners.clear();
    }
}
```

## Error Handling

### Comprehensive Error Parser

```javascript
function parseContractError(error) {
    // Common contract errors
    const errorMessages = {
        'InvalidAmount': 'Invalid amount provided',
        'InvalidAddress': 'Invalid address provided',
        'InvalidStatus': 'Operation not allowed in current status',
        'RequestNotFound': 'Request ID does not exist',
        'InsufficientBudget': 'Request exceeds project budget',
        'InsufficientAvailableBalance': 'Not enough available balance (check locked funds)',
        'AlreadyApproved': 'Already approved at this level',
        'UnauthorizedApprover': 'You do not have the required role',
        'TransferFailed': 'Token transfer failed',
        'InvalidCommitment': 'Invalid commitment or reveal data',
        'RevealTooEarly': 'Must wait 30 minutes after commitment',
        'TooManyRecipients': 'Maximum 10 recipients allowed',
        'EmptyRecipientList': 'No recipients provided',
        'ArrayLengthMismatch': 'Recipients and amounts arrays must match',
        'AmountTooLow': 'Amount must be at least 100 OMTHB',
        'AmountTooHigh': 'Amount exceeds maximum of 1M OMTHB',
        'MaxLockedPercentageExceeded': 'Would lock more than 80% of funds',
        'RequestNotStale': 'Request is not stale enough to unlock',
        'RequestNotAbandoned': 'Request is not abandoned (15+ days required)'
    };
    
    // Extract error reason
    let reason = 'Unknown error';
    
    if (error.reason) {
        reason = error.reason;
    } else if (error.data?.message) {
        reason = error.data.message;
    } else if (error.message) {
        // Try to extract custom error from message
        const match = error.message.match(/reverted with custom error '(\w+)'/);
        if (match) {
            reason = match[1];
        }
    }
    
    // Map to user-friendly message
    const userMessage = errorMessages[reason] || reason;
    
    return {
        code: error.code,
        reason,
        message: userMessage,
        transaction: error.transaction,
        receipt: error.receipt
    };
}

// Usage example
async function safeCreateRequest(...args) {
    try {
        return await createMultipleRequest(...args);
    } catch (error) {
        const parsed = parseContractError(error);
        
        // Handle specific errors
        if (parsed.reason === 'InsufficientAvailableBalance') {
            // Show available balance
            const available = await project.getAvailableBalance();
            console.error(`Insufficient balance. Available: ${ethers.formatEther(available)} OMTHB`);
        } else if (parsed.reason === 'RevealTooEarly') {
            console.error('Please wait 30 minutes after commitment before revealing');
        }
        
        throw parsed;
    }
}
```

## Role Management

### Role Checking and Management

```javascript
class RoleManager {
    constructor(projectContract, signer) {
        this.project = projectContract;
        this.signer = signer;
        
        // Role constants
        this.ROLES = {
            SECRETARY: ethers.keccak256(ethers.toUtf8Bytes('SECRETARY_ROLE')),
            COMMITTEE: ethers.keccak256(ethers.toUtf8Bytes('COMMITTEE_ROLE')),
            FINANCE: ethers.keccak256(ethers.toUtf8Bytes('FINANCE_ROLE')),
            DIRECTOR: ethers.keccak256(ethers.toUtf8Bytes('DIRECTOR_ROLE')),
            REQUESTER: ethers.keccak256(ethers.toUtf8Bytes('REQUESTER_ROLE')),
            ADMIN: ethers.ZeroHash // DEFAULT_ADMIN_ROLE
        };
    }
    
    // Check user's roles
    async getUserRoles(address) {
        const roles = [];
        
        for (const [name, hash] of Object.entries(this.ROLES)) {
            const hasRole = await this.project.hasRole(hash, address);
            if (hasRole) {
                roles.push(name);
            }
        }
        
        return roles;
    }
    
    // Check if user can approve at current stage
    async canApproveRequest(requestId, userAddress) {
        const request = await this.project.getRequest(requestId);
        const status = Number(request.status);
        
        switch (status) {
            case 0: // Pending
                return await this.project.hasRole(this.ROLES.SECRETARY, userAddress);
            
            case 1: // SecretaryApproved
                return await this.project.hasRole(this.ROLES.COMMITTEE, userAddress);
            
            case 2: // CommitteeApproved
                return await this.project.hasRole(this.ROLES.FINANCE, userAddress);
            
            case 3: // FinanceApproved
                const additionalApprovers = await this.project.getCommitteeAdditionalApprovers(requestId);
                if (additionalApprovers.length < 3) {
                    // Need more committee approvers
                    const isCommittee = await this.project.hasRole(this.ROLES.COMMITTEE, userAddress);
                    const alreadyApproved = additionalApprovers.includes(userAddress) || 
                                          request.approvalInfo.committeeApprover === userAddress;
                    return isCommittee && !alreadyApproved;
                } else {
                    // Ready for director
                    return await this.project.hasRole(this.ROLES.DIRECTOR, userAddress);
                }
            
            default:
                return false;
        }
    }
    
    // Get next required approval
    async getNextApprovalRequired(requestId) {
        const request = await this.project.getRequest(requestId);
        const status = Number(request.status);
        
        const approvalSteps = {
            0: 'Secretary approval required',
            1: 'Committee approval required',
            2: 'Finance approval required',
            3: 'Additional committee or director approval required',
            4: 'Ready for distribution',
            5: 'Already distributed',
            6: 'Cancelled'
        };
        
        if (status === 3) {
            const additionalApprovers = await this.project.getCommitteeAdditionalApprovers(requestId);
            if (additionalApprovers.length < 3) {
                return `${3 - additionalApprovers.length} more committee approvals required`;
            } else {
                return 'Director approval required';
            }
        }
        
        return approvalSteps[status];
    }
}
```

## Transaction Patterns

### Gas Optimization

```javascript
class TransactionManager {
    constructor(provider) {
        this.provider = provider;
    }
    
    // Estimate gas with safety margin
    async estimateGasWithBuffer(contract, method, params, from) {
        try {
            const estimate = await contract[method].estimateGas(...params, { from });
            return estimate * 120n / 100n; // 20% buffer
        } catch (error) {
            console.error('Gas estimation failed:', error);
            // Return default based on operation type
            const defaults = {
                createRequest: 300000n,
                createRequestMultiple: 500000n,
                commitApproval: 100000n,
                approveBySecretary: 200000n,
                approveByDirector: 400000n
            };
            return defaults[method] || 300000n;
        }
    }
    
    // Get current gas price with priority options
    async getGasPrice(priority = 'standard') {
        const feeData = await this.provider.getFeeData();
        
        const multipliers = {
            slow: 90n,
            standard: 100n,
            fast: 110n,
            instant: 125n
        };
        
        const multiplier = multipliers[priority] || 100n;
        return feeData.gasPrice * multiplier / 100n;
    }
    
    // Send transaction with retry logic
    async sendTransactionWithRetry(contract, method, params, options = {}) {
        const maxRetries = options.maxRetries || 3;
        const retryDelay = options.retryDelay || 2000;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                const gasLimit = await this.estimateGasWithBuffer(
                    contract, 
                    method, 
                    params, 
                    options.from
                );
                
                const gasPrice = await this.getGasPrice(options.priority || 'standard');
                
                const tx = await contract[method](...params, {
                    ...options,
                    gasLimit,
                    gasPrice
                });
                
                const receipt = await tx.wait();
                
                if (receipt.status === 0) {
                    throw new Error('Transaction reverted');
                }
                
                return receipt;
            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error);
                
                if (i === maxRetries - 1) {
                    throw error;
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }
}
```

### Batch Operations

```javascript
// Batch approval checker
async function checkMultipleApprovals(project, requestIds, userAddress) {
    const results = await Promise.all(
        requestIds.map(async (requestId) => {
            const request = await project.getRequest(requestId);
            const roleManager = new RoleManager(project, null);
            const canApprove = await roleManager.canApproveRequest(requestId, userAddress);
            
            return {
                requestId,
                status: Number(request.status),
                totalAmount: ethers.formatEther(request.totalAmount),
                canApprove,
                description: request.description
            };
        })
    );
    
    return results.filter(r => r.canApprove);
}

// Batch status checker
async function getRequestStatuses(project, requestIds) {
    const multicallData = requestIds.map(id => ({
        target: project.address,
        allowFailure: true,
        callData: project.interface.encodeFunctionData('getRequest', [id])
    }));
    
    // Use multicall for efficiency (if available)
    // Otherwise fall back to individual calls
    const results = await Promise.all(
        requestIds.map(id => project.getRequest(id))
    );
    
    return results.map((request, i) => ({
        requestId: requestIds[i],
        status: Number(request.status),
        totalAmount: ethers.formatEther(request.totalAmount)
    }));
}
```

## Best Practices

### 1. State Management

```javascript
// React example with hooks
import { useState, useEffect, useCallback } from 'react';

function useReimbursementContract(projectId) {
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    useEffect(() => {
        async function loadContract() {
            try {
                setLoading(true);
                const { signer } = await initializeEthers();
                const projectContract = await getProjectContract(projectId);
                setContract(projectContract);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        
        loadContract();
    }, [projectId]);
    
    const createRequest = useCallback(async (recipients, amounts, description, documentHash) => {
        if (!contract) throw new Error('Contract not loaded');
        
        try {
            const tx = await contract.createRequestMultiple(
                recipients,
                amounts.map(a => ethers.parseEther(a.toString())),
                description,
                documentHash,
                ethers.ZeroAddress
            );
            
            const receipt = await tx.wait();
            return receipt;
        } catch (err) {
            throw parseContractError(err);
        }
    }, [contract]);
    
    return { contract, loading, error, createRequest };
}
```

### 2. User Experience

```javascript
// Loading states and feedback
function RequestCreationForm() {
    const [status, setStatus] = useState('idle');
    const [txHash, setTxHash] = useState(null);
    const [requestId, setRequestId] = useState(null);
    
    const handleSubmit = async (formData) => {
        try {
            setStatus('checking');
            
            // Check if deposit needed
            const needsDeposit = await project.needsDeposit();
            if (needsDeposit) {
                setStatus('deposit-required');
                return;
            }
            
            setStatus('signing');
            const tx = await createRequest(formData);
            setTxHash(tx.hash);
            
            setStatus('confirming');
            const receipt = await tx.wait();
            
            setStatus('success');
            setRequestId(receipt.logs[0].args.requestId);
        } catch (error) {
            setStatus('error');
            console.error(error);
        }
    };
    
    return (
        <div>
            {status === 'checking' && <p>Checking project balance...</p>}
            {status === 'deposit-required' && <p>Project needs OMTHB deposit first</p>}
            {status === 'signing' && <p>Please sign the transaction...</p>}
            {status === 'confirming' && <p>Transaction submitted. Waiting for confirmation...</p>}
            {status === 'success' && <p>Request created successfully! ID: {requestId}</p>}
            {status === 'error' && <p>Error creating request. Please try again.</p>}
            
            {txHash && (
                <a href={`https://explorer.omchain.io/tx/${txHash}`} target="_blank">
                    View transaction
                </a>
            )}
        </div>
    );
}
```

### 3. Security Considerations

```javascript
// Input validation
function validateRequestInputs(recipients, amounts, description, documentHash) {
    // Check arrays
    if (!Array.isArray(recipients) || !Array.isArray(amounts)) {
        throw new Error('Recipients and amounts must be arrays');
    }
    
    if (recipients.length !== amounts.length) {
        throw new Error('Recipients and amounts must have same length');
    }
    
    if (recipients.length === 0) {
        throw new Error('At least one recipient required');
    }
    
    if (recipients.length > 10) {
        throw new Error('Maximum 10 recipients allowed');
    }
    
    // Validate addresses
    for (const recipient of recipients) {
        if (!ethers.isAddress(recipient)) {
            throw new Error(`Invalid address: ${recipient}`);
        }
    }
    
    // Validate amounts
    for (const amount of amounts) {
        const amountBN = ethers.parseEther(amount.toString());
        if (amountBN < ethers.parseEther('100')) {
            throw new Error('Minimum amount is 100 OMTHB');
        }
        if (amountBN > ethers.parseEther('1000000')) {
            throw new Error('Maximum amount is 1,000,000 OMTHB');
        }
    }
    
    // Validate strings
    if (!description || description.length === 0) {
        throw new Error('Description required');
    }
    
    if (description.length > 1000) {
        throw new Error('Description too long (max 1000 chars)');
    }
    
    if (!documentHash || documentHash.length === 0) {
        throw new Error('Document hash required');
    }
    
    if (documentHash.length > 100) {
        throw new Error('Document hash too long (max 100 chars)');
    }
    
    // Check for IPFS hash format (optional)
    if (!documentHash.startsWith('Qm') || documentHash.length !== 46) {
        console.warn('Document hash does not appear to be a valid IPFS hash');
    }
    
    return true;
}
```

### 4. Monitoring and Analytics

```javascript
// Track contract metrics
class ContractAnalytics {
    constructor(project) {
        this.project = project;
    }
    
    async getProjectMetrics() {
        const [
            totalBalance,
            availableBalance,
            lockedAmount,
            totalDistributed,
            budget,
            activeRequests
        ] = await Promise.all([
            this.project.getTotalBalance(),
            this.project.getAvailableBalance(),
            this.project.getLockedAmount(),
            this.project.totalDistributed(),
            this.project.projectBudget(),
            this.project.getActiveRequests()
        ]);
        
        return {
            totalBalance: ethers.formatEther(totalBalance),
            availableBalance: ethers.formatEther(availableBalance),
            lockedAmount: ethers.formatEther(lockedAmount),
            totalDistributed: ethers.formatEther(totalDistributed),
            budget: ethers.formatEther(budget),
            utilizationRate: (Number(totalDistributed) / Number(budget) * 100).toFixed(2),
            activeRequestCount: activeRequests.length,
            healthScore: this.calculateHealthScore({
                availableBalance,
                lockedAmount,
                totalBalance
            })
        };
    }
    
    calculateHealthScore({ availableBalance, lockedAmount, totalBalance }) {
        if (totalBalance === 0n) return 0;
        
        const lockedPercentage = Number(lockedAmount * 100n / totalBalance);
        const availablePercentage = Number(availableBalance * 100n / totalBalance);
        
        if (lockedPercentage > 80) return 1; // Critical
        if (lockedPercentage > 60) return 2; // Warning
        if (availablePercentage < 10) return 2; // Warning
        return 3; // Healthy
    }
}
```