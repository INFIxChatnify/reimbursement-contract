// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SimpleProjectReimbursement.sol";
import "../ERC2771Context.sol";

/**
 * @title GaslessProjectReimbursement
 * @notice Gasless version of SimpleProjectReimbursement using meta transactions
 */
contract GaslessProjectReimbursement is SimpleProjectReimbursement, ERC2771Context {
    /**
     * @notice Constructor
     * @param _trustedForwarder The trusted forwarder address for meta transactions
     */
    constructor(address _trustedForwarder) 
        SimpleProjectReimbursement()
        ERC2771Context(_trustedForwarder) 
    {}
    
    /**
     * @notice Override _msgSender to support meta transactions
     */
    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }
    
    /**
     * @notice Override _msgData to support meta transactions
     */
    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
