// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SignalRegistry — on-chain signal hash storage for LENITNES.
/// @notice Records keccak256(signalId + evidence + summary) with a block timestamp.
///         Deployed to Arbitrum Sepolia and Robinhood Chain for dual-chain proof.
contract SignalRegistry {
    struct SignalRecord {
        bytes32 signalHash;
        address recorder;
        uint256 timestamp;
        string metadataURI;
    }

    SignalRecord[] public signals;
    address public owner;

    event SignalRecorded(
        uint256 indexed id,
        bytes32 signalHash,
        address recorder,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function recordSignal(
        bytes32 signalHash,
        string calldata metadataURI
    ) external returns (uint256 id) {
        id = signals.length;
        signals.push(SignalRecord(signalHash, msg.sender, block.timestamp, metadataURI));
        emit SignalRecorded(id, signalHash, msg.sender, block.timestamp);
    }

    function recordSignalBatch(
        bytes32[] calldata signalHashes,
        string[] calldata metadataURIs
    ) external returns (uint256[] memory ids) {
        require(signalHashes.length == metadataURIs.length, "length mismatch");
        ids = new uint256[](signalHashes.length);
        for (uint256 i = 0; i < signalHashes.length; i++) {
            ids[i] = signals.length;
            signals.push(SignalRecord(signalHashes[i], msg.sender, block.timestamp, metadataURIs[i]));
            emit SignalRecorded(ids[i], signalHashes[i], msg.sender, block.timestamp);
        }
    }

    function getSignal(uint256 id) external view returns (SignalRecord memory) {
        return signals[id];
    }

    function signalCount() external view returns (uint256) {
        return signals.length;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }
}
