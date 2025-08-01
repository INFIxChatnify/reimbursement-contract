// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Implementation Code for Reimbursement System Redesign
 * @notice This file contains the code changes needed for the deposit and locking mechanism
 * @dev Copy relevant sections into the actual contracts
 */

// ============================================
// SECTION 1: NEW STATE VARIABLES FOR ProjectReimbursement.sol
// ============================================

// Add these state variables after line 184 in ProjectReimbursement.sol

    /// @notice Treasury and deposit management
    uint256 public totalDeposited;        // Total OMTHB ever deposited
    uint256 public totalLocked;           // Currently locked by approved requests
    mapping(uint256 => bool) public isRequestLocked;  // Track which requests have locked funds
    
    /// @notice Deposit tracking
    mapping(address => uint256) public depositorBalances;  // Track deposits by address
    uint256 public depositCounter;        // Counter for deposit IDs
    
    /// @notice Deposit record structure
    struct DepositRecord {
        address depositor;
        uint256 amount;
        uint256 timestamp;
    }
    
    /// @notice Deposit history
    mapping(uint256 => DepositRecord) public deposits;
    uint256[] public depositHistory;      // Array of deposit IDs for enumeration
    
    /// @notice Maximum deposit history to prevent gas issues
    uint256 public constant MAX_DEPOSIT_HISTORY = 1000;

    /// @notice Update storage gap (reduce by number of new storage slots used)
    // Original: uint256[28] private __gap;
    // New: uint256[21] private __gap;  // Reduced by 7 for new storage variables

// ============================================
// SECTION 2: NEW EVENTS
// ============================================

// Add these events after line 244 in ProjectReimbursement.sol

    event OMTHBDeposited(
        address indexed depositor, 
        uint256 amount, 
        uint256 newBalance,
        uint256 depositId
    );
    event FundsLocked(
        uint256 indexed requestId, 
        uint256 amount, 
        uint256 totalLocked
    );
    event FundsUnlocked(
        uint256 indexed requestId, 
        uint256 amount, 
        uint256 totalLocked
    );
    event AvailableBalanceUpdated(
        uint256 available, 
        uint256 locked, 
        uint256 total
    );

// ============================================
// SECTION 3: NEW ERROR DEFINITIONS
// ============================================

// Add these errors after line 285 in ProjectReimbursement.sol

    error InsufficientAvailableBalance();
    error ExceedsProjectBudget();
    error AlreadyLocked();
    error NotLocked();
    error ContractNotActive();
    error DepositTooLarge();
    error DepositHistoryFull();

// ============================================
// SECTION 4: DEPOSIT FUNCTION
// ============================================

// Add this function after the existing view functions (around line 997)

    /**
     * @notice Deposit OMTHB tokens into the project treasury
     * @param amount The amount of OMTHB to deposit
     * @dev Caller must have approved this contract for the amount
     * @return depositId The ID of the deposit record
     */
    function depositOMTHB(uint256 amount) 
        external 
        whenNotPaused 
        notEmergencyStopped 
        nonReentrant 
        returns (uint256)
    {
        // Validation
        if (amount == 0) revert InvalidAmount();
        if (amount > MAX_REIMBURSEMENT_AMOUNT) revert DepositTooLarge();
        
        // Check if project is closed
        if (_isProjectClosed()) revert ContractNotActive();
        
        // Check allowance
        uint256 allowance = omthbToken.allowance(msg.sender, address(this));
        if (allowance < amount) revert InsufficientAllowance();
        
        // Check sender balance
        uint256 senderBalance = omthbToken.balanceOf(msg.sender);
        if (senderBalance < amount) revert InsufficientBalance();
        
        // Check deposit history limit
        if (depositHistory.length >= MAX_DEPOSIT_HISTORY) revert DepositHistoryFull();
        
        // Record deposit BEFORE transfer (CEI pattern)
        uint256 depositId = depositCounter++;
        deposits[depositId] = DepositRecord({
            depositor: msg.sender,
            amount: amount,
            timestamp: block.timestamp
        });
        
        // Update balances
        depositorBalances[msg.sender] += amount;
        totalDeposited += amount;
        depositHistory.push(depositId);
        
        // Get balance before transfer
        uint256 balanceBefore = omthbToken.balanceOf(address(this));
        
        // Transfer tokens
        bool success = omthbToken.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
        
        // Verify transfer
        uint256 balanceAfter = omthbToken.balanceOf(address(this));
        if (balanceAfter != balanceBefore + amount) revert TransferFailed();
        
        emit OMTHBDeposited(msg.sender, amount, balanceAfter, depositId);
        emit AvailableBalanceUpdated(
            balanceAfter - totalLocked,
            totalLocked,
            balanceAfter
        );
        
        return depositId;
    }

// ============================================
// SECTION 5: MODIFIED BUDGET VALIDATION
// ============================================

// Replace the existing _validateBudget function (around line 485)

    function _validateBudget(uint256 amount) private view {
        // Check against available balance
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        uint256 availableBalance = currentBalance > totalLocked ? currentBalance - totalLocked : 0;
        
        if (amount > availableBalance) revert InsufficientAvailableBalance();
        
        // Check against max project budget
        uint256 projectedTotal = totalDistributed + totalLocked + amount;
        if (projectedTotal > projectBudget) revert ExceedsProjectBudget();
        
        // Sanity checks
        if (projectBudget > type(uint256).max / 2) revert InvalidAmount();
    }

// ============================================
// SECTION 6: LOCKING MECHANISM
// ============================================

// Add these internal functions after _removeFromActiveRequests (around line 1159)

    /**
     * @notice Lock funds when request is approved by director
     * @dev Called internally after director approval
     */
    function _lockRequestFunds(uint256 requestId) private {
        ReimbursementRequest storage request = requests[requestId];
        
        if (isRequestLocked[requestId]) revert AlreadyLocked();
        
        // Verify we have sufficient balance to lock
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        uint256 availableBalance = currentBalance > totalLocked ? currentBalance - totalLocked : 0;
        
        if (request.totalAmount > availableBalance) revert InsufficientAvailableBalance();
        
        // Update locked amount
        totalLocked += request.totalAmount;
        isRequestLocked[requestId] = true;
        
        emit FundsLocked(requestId, request.totalAmount, totalLocked);
        emit AvailableBalanceUpdated(
            currentBalance - totalLocked,
            totalLocked,
            currentBalance
        );
    }

    /**
     * @notice Unlock funds when distributing or cancelling
     * @dev Called internally before distribution or cancellation
     */
    function _unlockRequestFunds(uint256 requestId) private {
        ReimbursementRequest storage request = requests[requestId];
        
        if (!isRequestLocked[requestId]) return;
        
        // Update locked amount
        totalLocked = totalLocked >= request.totalAmount ? 
            totalLocked - request.totalAmount : 0;
        isRequestLocked[requestId] = false;
        
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        
        emit FundsUnlocked(requestId, request.totalAmount, totalLocked);
        emit AvailableBalanceUpdated(
            currentBalance - totalLocked,
            totalLocked,
            currentBalance
        );
    }

// ============================================
// SECTION 7: MODIFIED DIRECTOR APPROVAL
// ============================================

// Modify the approveByDirector function (line 742)
// Add after line 776 (before emit events):

        // NEW: Lock the funds
        _lockRequestFunds(requestId);

// ============================================
// SECTION 8: MODIFIED DISTRIBUTION
// ============================================

// Modify _distributeMultipleFunds function (line 1039)
// Add at the beginning of the function, after validations:

        // NEW: Unlock funds before distribution
        _unlockRequestFunds(requestId);

// ============================================
// SECTION 9: MODIFIED CANCEL REQUEST
// ============================================

// Modify cancelRequest function (line 786)
// Add after line 799 (after status update):

        // NEW: Unlock funds if request was approved by director
        if (request.status == Status.DirectorApproved && isRequestLocked[requestId]) {
            _unlockRequestFunds(requestId);
        }

// ============================================
// SECTION 10: NEW VIEW FUNCTIONS
// ============================================

// Add these functions at the end of the contract (before the closing brace)

    /**
     * @notice Get total OMTHB balance in treasury
     * @return Current OMTHB balance held by contract
     */
    function getTreasuryBalance() external view returns (uint256) {
        return omthbToken.balanceOf(address(this));
    }

    /**
     * @notice Get available balance for new requests
     * @return Amount available for new reimbursement requests
     */
    function getAvailableBalance() external view returns (uint256) {
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        if (currentBalance <= totalLocked) return 0;
        return currentBalance - totalLocked;
    }

    /**
     * @notice Get currently locked balance
     * @return Amount locked by approved but not yet distributed requests
     */
    function getLockedBalance() external view returns (uint256) {
        return totalLocked;
    }

    /**
     * @notice Check if a request of given amount can be created
     * @param amount The request amount to check
     * @return True if sufficient available balance exists
     */
    function canCreateRequest(uint256 amount) external view returns (bool) {
        if (amount == 0) return false;
        if (amount > MAX_REIMBURSEMENT_AMOUNT) return false;
        
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        uint256 availableBalance = currentBalance > totalLocked ? currentBalance - totalLocked : 0;
        
        // Check available balance
        if (amount > availableBalance) return false;
        
        // Check project budget limit
        uint256 projectedTotal = totalDistributed + totalLocked + amount;
        if (projectedTotal > projectBudget) return false;
        
        return true;
    }

    /**
     * @notice Get deposit history for an address
     * @param depositor The depositor address
     * @return Total amount deposited by address
     */
    function getDepositorBalance(address depositor) external view returns (uint256) {
        return depositorBalances[depositor];
    }

    /**
     * @notice Get deposit record by ID
     * @param depositId The deposit ID
     * @return Deposit record details
     */
    function getDepositRecord(uint256 depositId) external view returns (DepositRecord memory) {
        return deposits[depositId];
    }

    /**
     * @notice Get all deposit IDs (paginated to prevent gas issues)
     * @param offset Starting index
     * @param limit Maximum number of records to return
     * @return Array of deposit IDs
     */
    function getDepositHistory(uint256 offset, uint256 limit) 
        external 
        view 
        returns (uint256[] memory) 
    {
        if (offset >= depositHistory.length) {
            return new uint256[](0);
        }
        
        uint256 end = offset + limit;
        if (end > depositHistory.length) {
            end = depositHistory.length;
        }
        
        uint256[] memory result = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = depositHistory[i];
        }
        
        return result;
    }

    /**
     * @notice Check if request has locked funds
     * @param requestId The request ID to check
     * @return True if request has locked funds
     */
    function isRequestFundsLocked(uint256 requestId) external view returns (bool) {
        return isRequestLocked[requestId];
    }

    /**
     * @notice Helper function to check if project is closed
     * @return True if project is closed
     */
    function _isProjectClosed() private view returns (bool) {
        if (paused()) return true;
        if (emergencyStop) return true;
        
        // Check for executed emergency closure
        if (activeClosureRequestId != 0) {
            EmergencyClosureRequest storage request = closureRequests[activeClosureRequestId];
            if (request.status == ClosureStatus.Executed) return true;
        }
        
        return false;
    }

// ============================================
// SECTION 11: MODIFIED ProjectFactory.createProject()
// ============================================

// In ProjectFactory.sol, modify createProject function (line 144)
// Remove lines 157-225 (allowance check, balance check, and token transfer)
// The new implementation should look like:

    function createProject(
        string calldata projectId,
        uint256 budget,  // Now represents max budget cap, not initial deposit
        address projectAdmin
    ) external onlyRole(PROJECT_CREATOR_ROLE) nonReentrant whenNotPaused returns (address) {
        // Enhanced validation
        if (bytes(projectId).length == 0) revert InvalidProjectId();
        if (bytes(projectId).length > 100) revert InvalidProjectId();
        if (projects[projectId].projectContract != address(0)) revert ProjectExists();
        if (projectAdmin == address(0)) revert ZeroAddress();
        if (budget == 0) revert InvalidBudget();
        if (budget > 10**9 * 10**18) revert InvalidBudget(); // Max 1 billion tokens
        
        // Deploy minimal proxy
        address clone = projectImplementation.clone();
        
        // Initialize the project contract
        try ProjectReimbursement(clone).initialize(
            projectId,
            address(omthbToken),
            budget,  // This is now the maximum budget cap
            projectAdmin
        ) {} catch Error(string memory reason) {
            revert(string(abi.encodePacked("Failed to initialize project: ", reason)));
        } catch (bytes memory) {
            revert("Failed to initialize project: Unknown error");
        }
        
        // Grant initial roles
        try ProjectReimbursement(clone).grantRoleDirect(
            keccak256("REQUESTER_ROLE"),
            projectAdmin
        ) {} catch {
            // Role might already be granted or function might not exist in older versions
        }
        
        // Store project info
        projects[projectId] = ProjectInfo({
            projectId: projectId,
            projectContract: clone,
            createdAt: block.timestamp,
            isActive: true,
            creator: msg.sender
        });
        
        projectsByCreator[msg.sender].push(projectId);
        allProjectIds.push(projectId);
        
        emit ProjectCreated(projectId, clone, msg.sender, budget);
        
        return clone;
    }

// ============================================
// SECTION 12: EMERGENCY CLOSURE MODIFICATION
// ============================================

// Modify _executeEmergencyClosure to handle locked funds (line 1607)
// Add before line 1616 (getting current balance):

        // Ensure all locked funds are included in the closure
        // No need to unlock as we're returning everything