// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IOMTHB.sol";

/**
 * @title IOMTHBSecure Interface
 * @notice Extended interface for secure OMTHB token operations
 */
interface IOMTHBSecure is IOMTHB {
    /// @notice Check if an address has sufficient balance for transfer
    function hasBalance(address account, uint256 amount) external view returns (bool);
    
    /// @notice Get available balance (excluding locked amounts)
    function availableBalanceOf(address account) external view returns (uint256);
    
    /// @notice Safe transfer with additional checks
    function safeTransfer(address to, uint256 amount) external returns (bool);
    
    /// @notice Batch transfer to multiple recipients
    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external returns (bool);
}