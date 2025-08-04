// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GasTank.sol";

/**
 * @title MetaTxForwarderV2
 * @notice Enhanced ERC-2771 forwarder with gas tank integration
 * @dev Supports gas refunds and batch transactions
 */
contract MetaTxForwarderV2 is EIP712, Ownable, ReentrancyGuard {
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
    
    /// @notice Batch forward result
    struct BatchResult {
        bool success;
        bytes returnData;
        uint256 gasUsed;
    }

    /// @notice Type hash for EIP-712
    bytes32 private constant FORWARD_REQUEST_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint256 deadline,uint256 chainId,bytes data)"
    );

    /// @notice Gas tank contract
    GasTank public immutable gasTank;
    
    /// @notice Nonces for each address
    mapping(address => uint256) private _nonces;
    
    /// @notice Used nonces to prevent replay attacks
    mapping(address => mapping(uint256 => bool)) private _usedNonces;
    
    /// @notice Minimum gas requirement for meta transactions
    uint256 public constant MIN_GAS_REQUIREMENT = 100000;
    
    /// @notice Gas overhead for meta transaction processing
    uint256 public constant META_TX_OVERHEAD = 50000;

    /// @notice Rate limiting per address
    mapping(address => RateLimit) private _rateLimits;
    
    /// @notice Rate limiting configuration
    struct RateLimit {
        uint256 count;
        uint256 windowStart;
    }

    /// @notice Maximum transactions per time window
    uint256 public maxTxPerWindow = 10;
    
    /// @notice Time window for rate limiting (1 hour)
    uint256 public constant RATE_LIMIT_WINDOW = 3600;
    
    /// @notice Whitelisted target contracts
    mapping(address => bool) public whitelistedTargets;
    
    /// @notice Maximum return data size to prevent DoS attacks
    uint256 public constant MAX_RETURN_SIZE = 10000;

    /// @notice Events
    event MetaTransactionExecuted(
        address indexed from,
        address indexed to,
        uint256 value,
        uint256 nonce,
        bool success,
        bytes returnData,
        uint256 gasUsed
    );
    event BatchExecuted(address indexed from, uint256 requestCount, uint256 successCount);
    event RateLimitUpdated(uint256 newLimit);
    event TargetWhitelisted(address indexed target, bool whitelisted);
    event GasRefundRequested(address indexed user, uint256 gasUsed, bytes32 txHash);

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
    error InvalidGasTank();
    error BatchSizeTooLarge();

    constructor(address _gasTank) EIP712("MetaTxForwarderV2", "2") Ownable(msg.sender) {
        if (_gasTank == address(0)) revert InvalidGasTank();
        gasTank = GasTank(payable(_gasTank));
    }

    /**
     * @notice Execute a meta transaction with gas refund
     * @param req The forward request
     * @param signature The signature of the request
     * @return success Whether the call succeeded
     * @return returnData The return data from the call
     */
    function execute(
        ForwardRequest calldata req,
        bytes calldata signature
    ) public nonReentrant returns (bool success, bytes memory returnData) {
        uint256 gasStart = gasleft();
        
        // Verify deadline
        if (block.timestamp > req.deadline) revert ExpiredDeadline();
        
        // Verify chain ID
        if (req.chainId != block.chainid) revert InvalidChainId();
        
        // Verify signature
        if (!verify(req, signature)) revert InvalidSignature();
        
        // Enhanced nonce validation
        if (_usedNonces[req.from][req.nonce]) revert InvalidNonce();
        if (req.nonce > _nonces[req.from] + 100) revert InvalidNonce();
        
        // Mark nonce as used
        _usedNonces[req.from][req.nonce] = true;
        
        // Update sequential nonce if appropriate
        if (req.nonce == _nonces[req.from]) {
            _nonces[req.from]++;
        }
        
        // Check rate limit
        _checkRateLimit(req.from);
        
        // Validate target contract and whitelist
        if (req.to.code.length == 0) revert InvalidTargetContract();
        if (!whitelistedTargets[req.to]) revert TargetNotWhitelisted();
        
        // Enhanced gas validation
        if (req.gas < MIN_GAS_REQUIREMENT) revert InsufficientGas();
        if (gasleft() < req.gas + META_TX_OVERHEAD) revert InsufficientGas();
        
        // Execute the call with _msgSender appended
        (success, returnData) = req.to.call{gas: req.gas, value: req.value}(
            abi.encodePacked(req.data, req.from)
        );
        
        // Truncate return data if needed
        if (returnData.length > MAX_RETURN_SIZE) {
            bytes memory truncatedData = new bytes(MAX_RETURN_SIZE);
            for (uint256 i = 0; i < MAX_RETURN_SIZE; i++) {
                truncatedData[i] = returnData[i];
            }
            returnData = truncatedData;
        }
        
        // Calculate gas used
        uint256 gasUsed = gasStart - gasleft() + META_TX_OVERHEAD;
        
        // Emit event
        emit MetaTransactionExecuted(
            req.from,
            req.to,
            req.value,
            req.nonce,
            success,
            returnData,
            gasUsed
        );
        
        // Request gas refund
        _requestGasRefund(req.from, gasUsed);
        
        return (success, returnData);
    }

    /**
     * @notice Batch execute multiple meta transactions with gas optimization
     * @param requests Array of forward requests
     * @param signatures Array of signatures
     * @return results Array of execution results
     */
    function batchExecute(
        ForwardRequest[] calldata requests,
        bytes[] calldata signatures
    ) external nonReentrant returns (BatchResult[] memory results) {
        uint256 length = requests.length;
        if (length != signatures.length) revert InvalidNonce();
        if (length > 10) revert BatchSizeTooLarge(); // Prevent gas DoS
        
        results = new BatchResult[](length);
        uint256 successCount = 0;
        uint256 totalGasUsed = 0;
        uint256 batchGasStart = gasleft();
        
        for (uint256 i = 0; i < length; i++) {
            uint256 txGasStart = gasleft();
            
            try this.execute(requests[i], signatures[i]) returns (
                bool success,
                bytes memory returnData
            ) {
                uint256 gasUsed = txGasStart - gasleft();
                results[i] = BatchResult({
                    success: success,
                    returnData: returnData,
                    gasUsed: gasUsed
                });
                
                if (success) successCount++;
                totalGasUsed += gasUsed;
            } catch {
                results[i] = BatchResult({
                    success: false,
                    returnData: "",
                    gasUsed: txGasStart - gasleft()
                });
            }
        }
        
        // Request batch gas refund
        if (length > 0 && requests[0].from != address(0)) {
            uint256 batchOverhead = (batchGasStart - gasleft() - totalGasUsed) / length;
            _requestGasRefund(requests[0].from, totalGasUsed + batchOverhead * length);
            
            emit BatchExecuted(requests[0].from, length, successCount);
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
     */
    function setTargetWhitelist(address target, bool whitelisted) external onlyOwner {
        if (target == address(0)) revert InvalidTargetContract();
        if (target.code.length == 0) revert InvalidTargetContract();
        
        whitelistedTargets[target] = whitelisted;
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
     * @notice Request gas refund from gas tank
     * @param user The user who initiated the transaction
     * @param gasUsed The amount of gas used
     */
    function _requestGasRefund(address user, uint256 gasUsed) private {
        // Calculate transaction hash for tracking
        bytes32 txHash = keccak256(abi.encodePacked(user, gasUsed, block.timestamp, block.number));
        
        // Request refund from gas tank
        try gasTank.requestGasRefund(user, gasUsed, tx.gasprice, txHash) {
            emit GasRefundRequested(user, gasUsed, txHash);
        } catch {
            // Silently fail if refund fails - transaction still succeeded
        }
    }

    /**
     * @notice Check if an address is a trusted forwarder
     * @param forwarder The address to check
     * @return trusted Whether the address is trusted
     */
    function isTrustedForwarder(address forwarder) public view returns (bool) {
        return forwarder == address(this);
    }

    /**
     * @notice Estimate gas for a meta transaction
     * @param req The forward request
     * @return estimatedGas The estimated gas needed
     */
    function estimateGas(ForwardRequest calldata req) external view returns (uint256) {
        // Basic validation
        if (req.to == address(0)) revert InvalidTargetContract();
        if (!whitelistedTargets[req.to]) revert TargetNotWhitelisted();
        
        // Estimate: requested gas + overhead + buffer
        return req.gas + META_TX_OVERHEAD + 10000;
    }
}