// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Using Solidity 0.8+ with built-in overflow protection

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MetaTxForwarder
 * @notice ERC-2771 compliant forwarder for gasless transactions
 * @dev Implements rate limiting and deadline validation for security
 */
contract MetaTxForwarder is EIP712, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    /// @notice Forward request structure
    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        uint256 nonce;
        uint256 deadline;
        uint256 chainId;
        bytes data;
    }

    /// @notice Rate limiting configuration
    struct RateLimit {
        uint256 count;
        uint256 windowStart;
    }

    /// @notice Type hash for EIP-712
    bytes32 private constant FORWARD_REQUEST_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint256 deadline,uint256 chainId,bytes data)"
    );

    /// @notice Nonces for each address
    mapping(address => uint256) private _nonces;
    
    /// @notice Used nonces to prevent replay attacks
    mapping(address => mapping(uint256 => bool)) private _usedNonces;
    
    /// @notice Minimum gas requirement for meta transactions
    uint256 public constant MIN_GAS_REQUIREMENT = 100000;

    /// @notice Rate limiting per address
    mapping(address => RateLimit) private _rateLimits;

    /// @notice Maximum transactions per time window
    uint256 public maxTxPerWindow = 100; // Increased for testing
    
    /// @notice Time window for rate limiting (1 hour)
    uint256 public constant RATE_LIMIT_WINDOW = 3600;
    
    /// @notice Whitelisted target contracts
    mapping(address => bool) public whitelistedTargets;
    
    /// @notice Call count per target for rate limiting
    mapping(address => uint256) public targetCallCounts;
    
    /// @notice Maximum calls per target
    uint256 public constant MAX_CALLS_PER_TARGET = 1000;
    
    /// @notice Maximum return data size to prevent DoS attacks
    uint256 public constant MAX_RETURN_SIZE = 10000; // 10KB limit

    /// @notice Events
    event MetaTransactionExecuted(
        address indexed from,
        address indexed to,
        uint256 value,
        uint256 nonce,
        bool success,
        bytes returnData
    );
    event RateLimitUpdated(uint256 newLimit);
    event TargetWhitelisted(address indexed target, bool whitelisted);

    /// @notice Custom errors
    error InvalidSignature();
    error ExpiredDeadline();
    error InvalidNonce();
    error RateLimitExceeded();
    error CallFailed();
    error InsufficientGas();
    error TargetNotWhitelisted();
    error InvalidTargetContract();
    error InvalidChainId();
    error ReturnDataTooLarge();

    constructor() EIP712("MetaTxForwarder", "1") Ownable(msg.sender) {}

    /**
     * @notice Execute a meta transaction
     * @param req The forward request
     * @param signature The signature of the request
     * @return success Whether the call succeeded
     * @return returnData The return data from the call
     */
    function execute(
        ForwardRequest calldata req,
        bytes calldata signature
    ) public payable nonReentrant returns (bool success, bytes memory returnData) {
        // Verify deadline
        if (block.timestamp > req.deadline) revert ExpiredDeadline();
        
        // Verify chain ID to prevent cross-chain replay attacks
        if (req.chainId != block.chainid) revert InvalidChainId();
        
        // Verify signature
        if (!verify(req, signature)) revert InvalidSignature();
        
        // Enhanced nonce validation
        if (_usedNonces[req.from][req.nonce]) revert InvalidNonce();
        if (req.nonce > _nonces[req.from] + 100) revert InvalidNonce(); // Prevent far-future nonces
        
        // Mark nonce as used
        _usedNonces[req.from][req.nonce] = true;
        
        // Update sequential nonce if appropriate
        if (req.nonce == _nonces[req.from]) {
            _nonces[req.from]++;
        }
        
        // Check rate limit
        _checkRateLimit(req.from);
        
        // CRITICAL FIX: Validate target contract and whitelist
        if (req.to.code.length == 0) revert InvalidTargetContract();
        if (!whitelistedTargets[req.to]) revert TargetNotWhitelisted();
        if (targetCallCounts[req.to] >= MAX_CALLS_PER_TARGET) revert RateLimitExceeded();
        
        // Update target call count
        targetCallCounts[req.to]++;
        
        // Enhanced gas validation
        if (req.gas < MIN_GAS_REQUIREMENT) revert InsufficientGas();
        if (gasleft() < req.gas + 50000) revert InsufficientGas(); // Reserve gas for post-execution
        
        // Execute the call
        (success, returnData) = req.to.call{gas: req.gas, value: req.value}(
            abi.encodePacked(req.data, req.from)
        );
        
        // Check return data size to prevent DoS attacks
        if (returnData.length > MAX_RETURN_SIZE) {
            // Truncate the return data to prevent DoS
            bytes memory truncatedData = new bytes(MAX_RETURN_SIZE);
            for (uint256 i = 0; i < MAX_RETURN_SIZE; i++) {
                truncatedData[i] = returnData[i];
            }
            returnData = truncatedData;
        }
        
        // Emit event regardless of success
        emit MetaTransactionExecuted(
            req.from,
            req.to,
            req.value,
            req.nonce,
            success,
            returnData
        );
        
        // Return without reverting on call failure
        return (success, returnData);
    }

    /**
     * @notice Internal execution function for batch processing
     * @param req The forward request
     * @param signature The signature of the request
     * @return success Whether the call succeeded
     * @return returnData The return data from the call
     */
    function _executeInternal(
        ForwardRequest calldata req,
        bytes calldata signature
    ) private returns (bool success, bytes memory returnData) {
        // Verify deadline
        if (block.timestamp > req.deadline) revert ExpiredDeadline();
        
        // Verify chain ID to prevent cross-chain replay attacks
        if (req.chainId != block.chainid) revert InvalidChainId();
        
        // Verify signature
        if (!verify(req, signature)) revert InvalidSignature();
        
        // Mark nonce as used (already validated in batch)
        _usedNonces[req.from][req.nonce] = true;
        
        // Update sequential nonce if appropriate
        if (req.nonce == _nonces[req.from]) {
            _nonces[req.from]++;
        }
        
        // Check rate limit
        _checkRateLimit(req.from);
        
        // CRITICAL FIX: Validate target contract and whitelist
        if (req.to.code.length == 0) revert InvalidTargetContract();
        if (!whitelistedTargets[req.to]) revert TargetNotWhitelisted();
        if (targetCallCounts[req.to] >= MAX_CALLS_PER_TARGET) revert RateLimitExceeded();
        
        // Update target call count
        targetCallCounts[req.to]++;
        
        // Enhanced gas validation
        if (req.gas < MIN_GAS_REQUIREMENT) revert InsufficientGas();
        if (gasleft() < req.gas + 50000) revert InsufficientGas(); // Reserve gas for post-execution
        
        // Execute the call
        (success, returnData) = req.to.call{gas: req.gas, value: req.value}(
            abi.encodePacked(req.data, req.from)
        );
        
        // Check return data size to prevent DoS attacks
        if (returnData.length > MAX_RETURN_SIZE) {
            // Truncate the return data to prevent DoS
            bytes memory truncatedData = new bytes(MAX_RETURN_SIZE);
            for (uint256 i = 0; i < MAX_RETURN_SIZE; i++) {
                truncatedData[i] = returnData[i];
            }
            returnData = truncatedData;
        }
        
        // Emit event regardless of success
        emit MetaTransactionExecuted(
            req.from,
            req.to,
            req.value,
            req.nonce,
            success,
            returnData
        );
        
        // Return without reverting on call failure
        return (success, returnData);
    }

    /**
     * @notice Batch execute multiple meta transactions
     * @param requests Array of forward requests
     * @param signatures Array of signatures
     * @return successes Array of success flags
     * @return returnDatas Array of return data
     */
    function batchExecute(
        ForwardRequest[] calldata requests,
        bytes[] calldata signatures
    ) external payable nonReentrant returns (bool[] memory successes, bytes[] memory returnDatas) {
        require(requests.length == signatures.length, "Length mismatch");
        require(requests.length <= 10, "Batch too large"); // Prevent gas DoS
        
        successes = new bool[](requests.length);
        returnDatas = new bytes[](requests.length);
        
        // Validate all nonces first to prevent partial execution
        for (uint256 i = 0; i < requests.length; i++) {
            if (_usedNonces[requests[i].from][requests[i].nonce]) {
                revert InvalidNonce();
            }
            // Check that nonces are sequential for same sender
            if (i > 0 && requests[i].from == requests[i-1].from) {
                if (requests[i].nonce != requests[i-1].nonce + 1) {
                    revert InvalidNonce();
                }
            }
        }
        
        // Execute all requests
        for (uint256 i = 0; i < requests.length; i++) {
            // Use internal execution to avoid double nonce validation
            (successes[i], returnDatas[i]) = _executeInternal(requests[i], signatures[i]);
        }
    }

    /**
     * @notice Verify a forward request signature
     * @param req The forward request
     * @param signature The signature to verify
     * @return valid Whether the signature is valid
     */
    function verify(
        ForwardRequest calldata req,
        bytes calldata signature
    ) public view returns (bool) {
        address signer = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    FORWARD_REQUEST_TYPEHASH,
                    req.from,
                    req.to,
                    req.value,
                    req.gas,
                    req.nonce,
                    req.deadline,
                    req.chainId,
                    keccak256(req.data)
                )
            )
        ).recover(signature);
        
        return signer == req.from;
    }

    /**
     * @notice Get the current nonce for an address
     * @param from The address to get the nonce for
     * @return nonce The current nonce
     */
    function getNonce(address from) external view returns (uint256) {
        return _nonces[from];
    }

    /**
     * @notice Update the rate limit
     * @param newLimit The new maximum transactions per window
     */
    function updateRateLimit(uint256 newLimit) external onlyOwner {
        maxTxPerWindow = newLimit;
        emit RateLimitUpdated(newLimit);
    }

    /**
     * @notice Set whitelist status for a target contract
     * @param target The target contract address
     * @param whitelisted Whether the target should be whitelisted
     * @dev Only whitelisted contracts can be called through meta transactions
     */
    function setTargetWhitelist(address target, bool whitelisted) external onlyOwner {
        if (target == address(0)) revert InvalidNonce(); // Using existing error for invalid address
        if (target.code.length == 0) revert CallFailed(); // Target must be a contract
        
        whitelistedTargets[target] = whitelisted;
        
        // Reset call count if removing from whitelist
        if (!whitelisted) {
            targetCallCounts[target] = 0;
        }
        
        emit TargetWhitelisted(target, whitelisted);
    }

    /**
     * @notice Check and update rate limit for an address
     * @param user The address to check
     */
    function _checkRateLimit(address user) private {
        RateLimit storage limit = _rateLimits[user];
        
        // Reset window if expired
        if (block.timestamp >= limit.windowStart + RATE_LIMIT_WINDOW) {
            limit.windowStart = block.timestamp;
            limit.count = 0;
        }
        
        // Check limit
        if (limit.count >= maxTxPerWindow) revert RateLimitExceeded();
        
        // Increment count
        limit.count++;
    }

    /**
     * @notice Check if a target is whitelisted
     * @param target The target address to check
     * @return Whether the target is whitelisted
     */
    function isTargetWhitelisted(address target) external view returns (bool) {
        return whitelistedTargets[target];
    }

    /**
     * @notice ERC-2771 context functions
     */
    function isTrustedForwarder(address forwarder) public view returns (bool) {
        return forwarder == address(this);
    }

}