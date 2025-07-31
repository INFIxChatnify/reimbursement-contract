// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IOMTHB.sol";

interface IProjectReimbursement {
    function createRequest(
        address recipient,
        uint256 amount,
        string calldata description,
        string calldata documentHash
    ) external returns (uint256);
    
    function approveByDirector(uint256 requestId) external;
}

/**
 * @title MaliciousContract
 * @notice Contract designed to test reentrancy and other attack vectors
 */
contract MaliciousContract {
    IProjectReimbursement public target;
    IOMTHB public token;
    uint256 public attackCount;
    bool public attacking;
    address public owner;
    
    // Attack types
    enum AttackType {
        None,
        Reentrancy,
        GasGriefing,
        StorageManipulation
    }
    
    AttackType public currentAttack;
    
    event AttackAttempted(AttackType attackType, bool success);
    event TokensReceived(address from, uint256 amount);
    
    constructor(address _target) {
        target = IProjectReimbursement(_target);
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    /**
     * @dev Set attack type
     */
    function setAttackType(AttackType _type) external onlyOwner {
        currentAttack = _type;
    }
    
    /**
     * @dev Set token address for reentrancy
     */
    function setToken(address _token) external onlyOwner {
        token = IOMTHB(_token);
    }
    
    /**
     * @dev Initiate attack
     */
    function attack() external onlyOwner {
        attacking = true;
        attackCount = 0;
        
        if (currentAttack == AttackType.Reentrancy) {
            _performReentrancyAttack();
        } else if (currentAttack == AttackType.GasGriefing) {
            _performGasGriefingAttack();
        }
        
        attacking = false;
    }
    
    /**
     * @dev Perform reentrancy attack
     */
    function _performReentrancyAttack() private {
        // Create initial request
        target.createRequest(
            address(this),
            1000 ether,
            "Initial request",
            "QmAttack"
        );
    }
    
    /**
     * @dev Perform gas griefing attack
     */
    function _performGasGriefingAttack() private {
        // Create request with large arrays
        address[] memory receivers = new address[](100);
        uint256[] memory amounts = new uint256[](100);
        
        for (uint i = 0; i < 100; i++) {
            receivers[i] = address(this);
            amounts[i] = 1 ether;
        }
        
        // This should fail or consume excessive gas
        try target.createRequest(
            address(this),
            100 ether,
            "Gas griefing",
            "QmGasAttack"
        ) {
            emit AttackAttempted(AttackType.GasGriefing, true);
        } catch {
            emit AttackAttempted(AttackType.GasGriefing, false);
        }
    }
    
    /**
     * @dev ERC20 token receiver hook for reentrancy
     */
    function onERC20Received(
        address from,
        uint256 amount
    ) external returns (bytes4) {
        emit TokensReceived(from, amount);
        
        if (attacking && currentAttack == AttackType.Reentrancy && attackCount < 10) {
            attackCount++;
            
            // Try to reenter
            try target.createRequest(
                address(this),
                1000 ether,
                "Reentrant request",
                "QmReentrant"
            ) returns (uint256) {
                emit AttackAttempted(AttackType.Reentrancy, true);
            } catch {
                emit AttackAttempted(AttackType.Reentrancy, false);
            }
        }
        
        return this.onERC20Received.selector;
    }
    
    /**
     * @dev Fallback for receiving tokens
     */
    receive() external payable {
        if (attacking && currentAttack == AttackType.Reentrancy && attackCount < 10) {
            attackCount++;
            
            // Try to reenter during ETH transfer
            try target.createRequest(
                address(this),
                1000 ether,
                "Reentrant via fallback",
                "QmReentrantFallback"
            ) returns (uint256) {
                emit AttackAttempted(AttackType.Reentrancy, true);
            } catch {
                emit AttackAttempted(AttackType.Reentrancy, false);
            }
        }
    }
    
    /**
     * @dev Consume arbitrary gas
     */
    function consumeGas(uint256 iterations) external pure {
        uint256 dummy = 0;
        for (uint256 i = 0; i < iterations; i++) {
            dummy = uint256(keccak256(abi.encode(dummy, i)));
        }
    }
    
    /**
     * @dev Create large storage
     */
    mapping(uint256 => uint256) public largeStorage;
    
    function fillStorage(uint256 entries) external {
        for (uint256 i = 0; i < entries; i++) {
            largeStorage[i] = i;
        }
    }
    
    /**
     * @dev Attempt to manipulate target contract
     */
    function manipulateTarget(bytes calldata data) external onlyOwner {
        (bool success,) = address(target).call(data);
        require(success, "Manipulation failed");
    }
    
    /**
     * @dev Withdraw any tokens or ETH
     */
    function withdraw() external onlyOwner {
        if (address(token) != address(0)) {
            uint256 balance = token.balanceOf(address(this));
            if (balance > 0) {
                token.transfer(owner, balance);
            }
        }
        
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            payable(owner).transfer(ethBalance);
        }
    }
}