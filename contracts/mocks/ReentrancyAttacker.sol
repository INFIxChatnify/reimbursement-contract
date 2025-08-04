// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../ProjectReimbursementV3.sol";

contract ReentrancyAttacker {
    address public target;
    address public token;
    bool public attackOnReceive;
    uint256 public targetRequestId;
    
    constructor(address _target, address _token) {
        target = _target;
        token = _token;
    }
    
    function setAttackOnReceive(bool _attack) external {
        attackOnReceive = _attack;
    }
    
    function setTargetRequestId(uint256 _requestId) external {
        targetRequestId = _requestId;
    }
    
    function attackDuringCreate() external {
        // Attempt to create request during another create (should fail)
        ProjectReimbursementV3(target).createRequest(
            address(this),
            100 ether,
            "Attack",
            "QmAttack"
        );
    }
    
    // ERC777-like receive hook
    function tokensReceived(
        address, // operator
        address, // from
        address, // to
        uint256, // amount
        bytes calldata, // userData
        bytes calldata  // operatorData
    ) external {
        if (attackOnReceive && msg.sender == token) {
            // Attempt reentrancy
            try ProjectReimbursementV3(target).cancelRequest(targetRequestId) {
                // Attack succeeded
            } catch {
                // Attack failed (expected)
            }
        }
    }
    
    // Fallback for receiving tokens
    receive() external payable {
        if (attackOnReceive) {
            // Attempt reentrancy
            try ProjectReimbursementV3(target).cancelRequest(targetRequestId) {
                // Attack succeeded
            } catch {
                // Attack failed (expected)
            }
        }
    }
    
    // Function to receive ERC20 tokens and trigger attack
    function onTokenTransfer(address, uint256, bytes calldata) external returns (bool) {
        if (attackOnReceive && msg.sender == token) {
            // Attempt reentrancy
            try ProjectReimbursementV3(target).cancelRequest(targetRequestId) {
                // Attack succeeded
            } catch {
                // Attack failed (expected)
            }
        }
        return true;
    }
}