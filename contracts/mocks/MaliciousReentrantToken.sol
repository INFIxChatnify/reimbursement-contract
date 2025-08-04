// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MaliciousReentrantToken
 * @notice Mock token that attempts reentrancy attacks
 * @dev For testing purposes only
 */
contract MaliciousReentrantToken is ERC20 {
    address public targetContract;
    bool public attackEnabled;
    
    constructor() ERC20("Malicious Token", "MAL") {
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    function setTarget(address _target) external {
        targetContract = _target;
    }
    
    function enableAttack() external {
        attackEnabled = true;
    }
    
    function disableAttack() external {
        attackEnabled = false;
    }
    
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override returns (bool) {
        // Attempt reentrancy if attack is enabled
        if (attackEnabled && targetContract != address(0)) {
            // Try to call depositOMTHB again
            (bool success, ) = targetContract.call(
                abi.encodeWithSignature("depositOMTHB(uint256)", amount)
            );
            // Ignore result, continue with transfer
        }
        
        return super.transferFrom(from, to, amount);
    }
}