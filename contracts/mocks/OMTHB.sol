// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IOMTHB.sol";

contract OMTHB is IOMTHB {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    mapping(address => bool) private _blacklisted;
    uint256 private _totalSupply;
    bool private _paused;
    
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    
    modifier whenNotPaused() {
        require(!_paused, "Token is paused");
        _;
    }
    
    modifier notBlacklisted(address account) {
        require(!_blacklisted[account], "Account is blacklisted");
        _;
    }
    
    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        _totalSupply = _initialSupply;
        _balances[msg.sender] = _initialSupply;
        emit Transfer(address(0), msg.sender, _initialSupply);
    }
    
    function transfer(address to, uint256 amount) external override whenNotPaused notBlacklisted(msg.sender) notBlacklisted(to) returns (bool) {
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        _balances[msg.sender] -= amount;
        _balances[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external override whenNotPaused notBlacklisted(from) notBlacklisted(to) returns (bool) {
        require(_allowances[from][msg.sender] >= amount, "Insufficient allowance");
        require(_balances[from] >= amount, "Insufficient balance");
        
        _allowances[from][msg.sender] -= amount;
        _balances[from] -= amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
    
    function approve(address spender, uint256 amount) external override whenNotPaused notBlacklisted(msg.sender) notBlacklisted(spender) returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }
    
    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }
    
    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }
    
    // IOMTHB specific functions
    function mint(address to, uint256 amount) external override {
        _balances[to] += amount;
        _totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }
    
    function burn(uint256 amount) external override {
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        _balances[msg.sender] -= amount;
        _totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
    
    function burnFrom(address account, uint256 amount) external override {
        require(_allowances[account][msg.sender] >= amount, "Insufficient allowance");
        require(_balances[account] >= amount, "Insufficient balance");
        
        _allowances[account][msg.sender] -= amount;
        _balances[account] -= amount;
        _totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }
    
    function pause() external override {
        _paused = true;
    }
    
    function unpause() external override {
        _paused = false;
    }
    
    function blacklist(address account) external override {
        _blacklisted[account] = true;
    }
    
    function unBlacklist(address account) external override {
        _blacklisted[account] = false;
    }
    
    function isBlacklisted(address account) external view override returns (bool) {
        return _blacklisted[account];
    }
}