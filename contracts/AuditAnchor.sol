// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title AuditAnchor
 * @notice Blockchain anchor for immutable audit trail storage
 * @dev Stores merkle roots and IPFS hashes for audit batch verification
 */
contract AuditAnchor is Ownable {
    
    // Constants for gas optimization
    uint256 public constant MAX_BATCH_SIZE = 100;
    uint256 public constant MAX_PROOF_SIZE = 50;
    
    struct AuditBatch {
        string ipfsHash;
        bytes32 merkleRoot;
        uint256 timestamp;
        address anchoredBy;
        uint256 entryCount;
        string batchType;
    }
    
    struct VerificationProof {
        uint256 batchId;
        bytes32 entryHash;
        bytes32[] merkleProof;
        string ipfsPath;
    }
    
    // Events
    event BatchAnchored(
        uint256 indexed batchId,
        string ipfsHash,
        bytes32 merkleRoot,
        uint256 timestamp,
        uint256 entryCount,
        string batchType
    );
    
    event BatchVerified(
        uint256 indexed batchId,
        address indexed verifier,
        bool valid,
        uint256 timestamp
    );
    
    event AnchorAuthorized(
        address indexed account,
        bool authorized,
        uint256 timestamp
    );
    
    // Custom errors
    error NotAuthorized();
    error InvalidIPFSHash();
    error InvalidMerkleRoot();
    error InvalidEntryCount();
    error MerkleRootAlreadyAnchored();
    error ArrayLengthMismatch();
    error BatchSizeExceedsLimit();
    error InvalidBatchId();
    error MerkleRootNotFound();
    
    // State variables
    mapping(uint256 => AuditBatch) public batches;
    mapping(address => bool) public authorizedAnchors;
    mapping(bytes32 => uint256) public merkleRootToBatch;
    mapping(string => uint256[]) public batchesByType;
    
    uint256 public nextBatchId;
    uint256 public totalEntriesAnchored;
    
    // Statistics
    mapping(address => uint256) public anchorStats;
    mapping(string => uint256) public typeStats;
    
    modifier onlyAuthorized() {
        if (!authorizedAnchors[msg.sender] && owner() != msg.sender) {
            revert NotAuthorized();
        }
        _;
    }
    
    constructor() Ownable(msg.sender) {
        authorizedAnchors[msg.sender] = true;
    }
    
    /**
     * @dev Authorize an address to anchor audit batches
     */
    function authorizeAnchor(address account, bool authorized) external onlyOwner {
        authorizedAnchors[account] = authorized;
        emit AnchorAuthorized(account, authorized, block.timestamp);
    }
    
    /**
     * @dev Anchor a batch of audit entries
     */
    function anchorAuditBatch(
        string memory ipfsHash,
        bytes32 merkleRoot,
        uint256 entryCount,
        string memory batchType
    ) external onlyAuthorized returns (uint256) {
        return _anchorAuditBatch(ipfsHash, merkleRoot, entryCount, batchType);
    }
    
    /**
     * @dev Internal function to anchor a batch of audit entries
     */
    function _anchorAuditBatch(
        string memory ipfsHash,
        bytes32 merkleRoot,
        uint256 entryCount,
        string memory batchType
    ) internal returns (uint256) {
        if (bytes(ipfsHash).length == 0) revert InvalidIPFSHash();
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (entryCount == 0) revert InvalidEntryCount();
        if (merkleRootToBatch[merkleRoot] != 0) revert MerkleRootAlreadyAnchored();
        
        uint256 batchId = nextBatchId++;
        
        batches[batchId] = AuditBatch({
            ipfsHash: ipfsHash,
            merkleRoot: merkleRoot,
            timestamp: block.timestamp,
            anchoredBy: msg.sender,
            entryCount: entryCount,
            batchType: batchType
        });
        
        merkleRootToBatch[merkleRoot] = batchId;
        batchesByType[batchType].push(batchId);
        
        // Update statistics
        totalEntriesAnchored += entryCount;
        anchorStats[msg.sender]++;
        typeStats[batchType]++;
        
        emit BatchAnchored(
            batchId,
            ipfsHash,
            merkleRoot,
            block.timestamp,
            entryCount,
            batchType
        );
        
        return batchId;
    }
    
    /**
     * @dev Anchor multiple batches in one transaction
     */
    function anchorMultipleBatches(
        string[] memory ipfsHashes,
        bytes32[] memory merkleRoots,
        uint256[] memory entryCounts,
        string[] memory batchTypes
    ) external onlyAuthorized returns (uint256[] memory) {
        if (ipfsHashes.length != merkleRoots.length ||
            ipfsHashes.length != entryCounts.length ||
            ipfsHashes.length != batchTypes.length) {
            revert ArrayLengthMismatch();
        }
        if (ipfsHashes.length > MAX_BATCH_SIZE) revert BatchSizeExceedsLimit();
        
        uint256[] memory batchIds = new uint256[](ipfsHashes.length);
        
        for (uint256 i = 0; i < ipfsHashes.length; i++) {
            batchIds[i] = _anchorAuditBatch(
                ipfsHashes[i],
                merkleRoots[i],
                entryCounts[i],
                batchTypes[i]
            );
        }
        
        return batchIds;
    }
    
    /**
     * @dev Verify an audit entry belongs to a batch
     */
    function verifyAuditEntry(
        uint256 batchId,
        bytes32 entryHash,
        bytes32[] memory proof
    ) external view returns (bool) {
        if (batchId >= nextBatchId) revert InvalidBatchId();
        
        bytes32 merkleRoot = batches[batchId].merkleRoot;
        return MerkleProof.verify(proof, merkleRoot, entryHash);
    }
    
    /**
     * @dev Batch verify multiple entries
     */
    function batchVerifyEntries(
        VerificationProof[] memory proofs
    ) external returns (bool[] memory) {
        bool[] memory results = new bool[](proofs.length);
        
        for (uint256 i = 0; i < proofs.length; i++) {
            require(proofs[i].batchId < nextBatchId, "Invalid batch ID");
            
            bytes32 merkleRoot = batches[proofs[i].batchId].merkleRoot;
            bool valid = MerkleProof.verify(
                proofs[i].merkleProof,
                merkleRoot,
                proofs[i].entryHash
            );
            
            results[i] = valid;
            
            emit BatchVerified(
                proofs[i].batchId,
                msg.sender,
                valid,
                block.timestamp
            );
        }
        
        return results;
    }
    
    /**
     * @dev Get batch details
     */
    function getBatch(uint256 batchId) external view returns (
        string memory ipfsHash,
        bytes32 merkleRoot,
        uint256 timestamp,
        address anchoredBy,
        uint256 entryCount,
        string memory batchType
    ) {
        if (batchId >= nextBatchId) revert InvalidBatchId();
        AuditBatch memory batch = batches[batchId];
        
        return (
            batch.ipfsHash,
            batch.merkleRoot,
            batch.timestamp,
            batch.anchoredBy,
            batch.entryCount,
            batch.batchType
        );
    }
    
    /**
     * @dev Get batches by type with pagination
     */
    function getBatchesByType(
        string memory batchType,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        uint256[] storage typeBatches = batchesByType[batchType];
        uint256 total = typeBatches.length;
        
        if (offset >= total) {
            return new uint256[](0);
        }
        
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        
        uint256[] memory result = new uint256[](end - offset);
        for (uint256 i = 0; i < result.length; i++) {
            result[i] = typeBatches[offset + i];
        }
        
        return result;
    }
    
    /**
     * @dev Get batch by merkle root
     */
    function getBatchByMerkleRoot(bytes32 merkleRoot) external view returns (uint256) {
        uint256 batchId = merkleRootToBatch[merkleRoot];
        if (batchId == 0 && batches[0].merkleRoot != merkleRoot) revert MerkleRootNotFound();
        return batchId;
    }
    
    /**
     * @dev Get statistics
     */
    function getStatistics() external view returns (
        uint256 totalBatches,
        uint256 totalEntries,
        uint256 contractCreationTime
    ) {
        return (
            nextBatchId,
            totalEntriesAnchored,
            block.timestamp
        );
    }
    
    /**
     * @dev Get anchor statistics for an address
     */
    function getAnchorStatistics(address anchor) external view returns (
        uint256 batchesAnchored,
        bool isAuthorized
    ) {
        return (
            anchorStats[anchor],
            authorizedAnchors[anchor]
        );
    }
    
    /**
     * @dev Generate proof data for off-chain verification
     */
    function generateProofData(
        uint256 batchId,
        bytes32 entryHash
    ) external view returns (
        string memory ipfsHash,
        bytes32 merkleRoot,
        uint256 anchorTimestamp,
        uint256 blockNumber
    ) {
        if (batchId >= nextBatchId) revert InvalidBatchId();
        AuditBatch memory batch = batches[batchId];
        
        return (
            batch.ipfsHash,
            batch.merkleRoot,
            batch.timestamp,
            block.number
        );
    }
}