// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MaliciousOMTHB {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;
    uint256 public failTransferIndex;
    uint256 public transferCount;
    
    string public constant name = "Malicious OMTHB";
    string public constant symbol = "MOMTHB";
    uint8 public constant decimals = 18;
    
    function mint(address to, uint256 amount) external {
        _balances[to] += amount;
        _totalSupply += amount;
    }
    
    function setFailTransferIndex(uint256 index) external {
        failTransferIndex = index;
        transferCount = 0;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        transferCount++;
        if (failTransferIndex > 0 && transferCount == failTransferIndex) {
            return false;
        }
        
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        _balances[msg.sender] -= amount;
        _balances[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(_allowances[from][msg.sender] >= amount, "Insufficient allowance");
        require(_balances[from] >= amount, "Insufficient balance");
        
        _allowances[from][msg.sender] -= amount;
        _balances[from] -= amount;
        _balances[to] += amount;
        return true;
    }
    
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }
    
    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }
    
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }
}