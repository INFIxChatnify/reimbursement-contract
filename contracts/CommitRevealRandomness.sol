// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CommitRevealRandomness
 * @notice Implements commit-reveal pattern for secure random number generation
 * @dev Prevents manipulation of randomness by miners or front-runners
 */
contract CommitRevealRandomness is Ownable, ReentrancyGuard {
    
    /// @notice Commitment structure
    struct Commitment {
        bytes32 hash;
        uint256 blockNumber;
        bool revealed;
        uint256 value;
    }
    
    /// @notice Random request structure
    struct RandomRequest {
        uint256 requestBlock;
        uint256 revealDeadline;
        uint256 participantsRequired;
        address[] participants;
        mapping(address => Commitment) commitments;
        bool fulfilled;
        uint256 randomValue;
        uint256 revealedCount;
    }
    
    /// @notice State variables
    mapping(uint256 => RandomRequest) public randomRequests;
    uint256 public nextRequestId;
    
    /// @notice Configuration
    uint256 public constant MIN_COMMIT_BLOCKS = 3;
    uint256 public constant MAX_REVEAL_BLOCKS = 100;
    uint256 public constant MIN_PARTICIPANTS = 2;
    
    /// @notice Events
    event RandomnessRequested(
        uint256 indexed requestId,
        uint256 participantsRequired,
        uint256 revealDeadline
    );
    
    event CommitmentMade(
        uint256 indexed requestId,
        address indexed participant
    );
    
    event ValueRevealed(
        uint256 indexed requestId,
        address indexed participant,
        uint256 value
    );
    
    event RandomnessGenerated(
        uint256 indexed requestId,
        uint256 randomValue
    );
    
    /// @notice Custom errors
    error InvalidParticipantCount();
    error InvalidRevealWindow();
    error RequestNotFound();
    error AlreadyCommitted();
    error NotInCommitPhase();
    error NotInRevealPhase();
    error InvalidReveal();
    error AlreadyRevealed();
    error RandomnessAlreadyGenerated();
    error InsufficientReveals();
    error NotParticipant();
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Request random number generation
     * @param participantsRequired Number of participants needed
     * @param revealBlocks Number of blocks for reveal phase
     * @return requestId The ID of the random request
     */
    function requestRandomness(
        uint256 participantsRequired,
        uint256 revealBlocks
    ) external returns (uint256) {
        if (participantsRequired < MIN_PARTICIPANTS) revert InvalidParticipantCount();
        if (revealBlocks == 0 || revealBlocks > MAX_REVEAL_BLOCKS) revert InvalidRevealWindow();
        
        uint256 requestId = nextRequestId++;
        RandomRequest storage request = randomRequests[requestId];
        
        request.requestBlock = block.number;
        request.revealDeadline = block.number + MIN_COMMIT_BLOCKS + revealBlocks;
        request.participantsRequired = participantsRequired;
        request.fulfilled = false;
        request.revealedCount = 0;
        
        emit RandomnessRequested(requestId, participantsRequired, request.revealDeadline);
        
        return requestId;
    }
    
    /**
     * @notice Commit a value for randomness generation
     * @param requestId The request ID
     * @param commitment Hash of the secret value
     */
    function commit(uint256 requestId, bytes32 commitment) external nonReentrant {
        RandomRequest storage request = randomRequests[requestId];
        if (request.requestBlock == 0) revert RequestNotFound();
        if (request.fulfilled) revert RandomnessAlreadyGenerated();
        if (block.number > request.requestBlock + MIN_COMMIT_BLOCKS) revert NotInCommitPhase();
        if (request.commitments[msg.sender].hash != bytes32(0)) revert AlreadyCommitted();
        if (request.participants.length >= request.participantsRequired) revert InvalidParticipantCount();
        
        request.commitments[msg.sender] = Commitment({
            hash: commitment,
            blockNumber: block.number,
            revealed: false,
            value: 0
        });
        
        request.participants.push(msg.sender);
        
        emit CommitmentMade(requestId, msg.sender);
    }
    
    /**
     * @notice Reveal the committed value
     * @param requestId The request ID
     * @param value The secret value
     * @param nonce The nonce used in commitment
     */
    function reveal(uint256 requestId, uint256 value, uint256 nonce) external nonReentrant {
        RandomRequest storage request = randomRequests[requestId];
        if (request.requestBlock == 0) revert RequestNotFound();
        if (request.fulfilled) revert RandomnessAlreadyGenerated();
        if (block.number <= request.requestBlock + MIN_COMMIT_BLOCKS) revert NotInRevealPhase();
        if (block.number > request.revealDeadline) revert NotInRevealPhase();
        
        Commitment storage commitment = request.commitments[msg.sender];
        if (commitment.hash == bytes32(0)) revert NotParticipant();
        if (commitment.revealed) revert AlreadyRevealed();
        
        // Verify the commitment
        bytes32 computedHash = keccak256(abi.encodePacked(value, nonce, msg.sender));
        if (computedHash != commitment.hash) revert InvalidReveal();
        
        // Store revealed value
        commitment.revealed = true;
        commitment.value = value;
        request.revealedCount++;
        
        emit ValueRevealed(requestId, msg.sender, value);
        
        // Check if we have enough reveals
        if (request.revealedCount >= request.participantsRequired) {
            _generateRandomness(requestId);
        }
    }
    
    /**
     * @notice Force generation of randomness after deadline
     * @param requestId The request ID
     * @dev Can only be called after reveal deadline
     */
    function forceGenerate(uint256 requestId) external {
        RandomRequest storage request = randomRequests[requestId];
        if (request.requestBlock == 0) revert RequestNotFound();
        if (request.fulfilled) revert RandomnessAlreadyGenerated();
        if (block.number <= request.revealDeadline) revert NotInRevealPhase();
        if (request.revealedCount < MIN_PARTICIPANTS) revert InsufficientReveals();
        
        _generateRandomness(requestId);
    }
    
    /**
     * @notice Get random value for a request
     * @param requestId The request ID
     * @return randomValue The generated random value
     * @return fulfilled Whether the request has been fulfilled
     */
    function getRandomness(uint256 requestId) external view returns (uint256, bool) {
        RandomRequest storage request = randomRequests[requestId];
        return (request.randomValue, request.fulfilled);
    }
    
    /**
     * @notice Get commitment for a participant
     * @param requestId The request ID
     * @param participant The participant address
     * @return hash The commitment hash
     * @return revealed Whether the value has been revealed
     * @return value The revealed value (0 if not revealed)
     */
    function getCommitment(
        uint256 requestId,
        address participant
    ) external view returns (bytes32, bool, uint256) {
        Commitment storage commitment = randomRequests[requestId].commitments[participant];
        return (commitment.hash, commitment.revealed, commitment.value);
    }
    
    /**
     * @notice Get request details
     * @param requestId The request ID
     * @return requestBlock Block when request was made
     * @return revealDeadline Deadline for reveals
     * @return participantsRequired Number of participants required
     * @return revealedCount Number of values revealed
     * @return fulfilled Whether randomness has been generated
     */
    function getRequestDetails(uint256 requestId) external view returns (
        uint256 requestBlock,
        uint256 revealDeadline,
        uint256 participantsRequired,
        uint256 revealedCount,
        bool fulfilled
    ) {
        RandomRequest storage request = randomRequests[requestId];
        return (
            request.requestBlock,
            request.revealDeadline,
            request.participantsRequired,
            request.revealedCount,
            request.fulfilled
        );
    }
    
    /**
     * @notice Generate randomness from revealed values
     * @param requestId The request ID
     */
    function _generateRandomness(uint256 requestId) private {
        RandomRequest storage request = randomRequests[requestId];
        
        uint256 combinedValue = 0;
        uint256 validReveals = 0;
        
        // Combine all revealed values
        for (uint256 i = 0; i < request.participants.length; i++) {
            address participant = request.participants[i];
            Commitment storage commitment = request.commitments[participant];
            
            if (commitment.revealed) {
                combinedValue ^= commitment.value;
                validReveals++;
            }
        }
        
        // Generate final random value
        request.randomValue = uint256(
            keccak256(
                abi.encodePacked(
                    combinedValue,
                    blockhash(block.number - 1),
                    block.timestamp,
                    requestId
                )
            )
        );
        
        request.fulfilled = true;
        
        emit RandomnessGenerated(requestId, request.randomValue);
    }
}