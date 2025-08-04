// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../MetaTxForwarder.sol";
import "../GasTank.sol";

/**
 * @title MockRelayer
 * @notice Mock relayer contract for testing gasless transactions
 */
contract MockRelayer {
    MetaTxForwarder public immutable forwarder;
    GasTank public immutable gasTank;
    
    struct RelayerStats {
        uint256 totalTransactions;
        uint256 successfulTransactions;
        uint256 failedTransactions;
        uint256 totalGasUsed;
    }
    
    RelayerStats public stats;
    
    event TransactionRelayed(
        address indexed from,
        address indexed to,
        bool success,
        uint256 gasUsed,
        bytes returnData
    );
    
    constructor(address _forwarder, address payable _gasTank) {
        forwarder = MetaTxForwarder(_forwarder);
        gasTank = GasTank(_gasTank);
    }
    
    /**
     * @notice Submit a meta transaction
     * @param req The forward request
     * @param signature The signature
     * @return success Whether the transaction succeeded
     * @return returnData The return data
     */
    function submitTransaction(
        MetaTxForwarder.ForwardRequest calldata req,
        bytes calldata signature
    ) external returns (bool success, bytes memory returnData) {
        uint256 gasStart = gasleft();
        
        // Execute via forwarder
        (success, returnData) = forwarder.execute(req, signature);
        
        uint256 gasUsed = gasStart - gasleft();
        
        // Update stats
        stats.totalTransactions++;
        if (success) {
            stats.successfulTransactions++;
        } else {
            stats.failedTransactions++;
        }
        stats.totalGasUsed += gasUsed;
        
        // Request gas refund
        if (address(gasTank) != address(0)) {
            try gasTank.requestGasRefund(
                req.from,
                gasUsed,
                tx.gasprice,
                keccak256(abi.encode(req, block.timestamp))
            ) {} catch {}
        }
        
        emit TransactionRelayed(req.from, req.to, success, gasUsed, returnData);
        
        return (success, returnData);
    }
    
    /**
     * @notice Submit multiple meta transactions in a batch
     * @param reqs Array of forward requests
     * @param signatures Array of signatures
     * @return successes Array of success flags
     * @return returnDatas Array of return data
     */
    function submitBatchTransactions(
        MetaTxForwarder.ForwardRequest[] calldata reqs,
        bytes[] calldata signatures
    ) external returns (bool[] memory successes, bytes[] memory returnDatas) {
        require(reqs.length == signatures.length, "MockRelayer: mismatched arrays");
        require(reqs.length > 0, "MockRelayer: empty batch");
        
        successes = new bool[](reqs.length);
        returnDatas = new bytes[](reqs.length);
        
        for (uint256 i = 0; i < reqs.length; i++) {
            (successes[i], returnDatas[i]) = this.submitTransaction(reqs[i], signatures[i]);
        }
        
        return (successes, returnDatas);
    }
    
    /**
     * @notice Get relayer statistics
     * @return The relayer stats
     */
    function getStats() external view returns (RelayerStats memory) {
        return stats;
    }
    
    /**
     * @notice Receive OM to pay for gas
     */
    receive() external payable {}
}