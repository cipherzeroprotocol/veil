// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MerkleTree
 * @notice Implements Merkle tree functionality for privacy commitments
 * @dev This is a basic structure. A robust implementation like tornado-core's MerkleTreeWithHistory is recommended.
 */
library MerkleTree {

    struct Tree {
        uint32 height;
        mapping(uint256 => bytes32) filledSubtrees; // level => hash
        bytes32[] roots; // History of roots
        uint32 currentRootIndex;
        uint32 nextIndex;
        mapping(bytes32 => bool) knownRoots; // Quick lookup for known roots
        bytes32[] zeros; // Precomputed zero hashes
    }

    event RootAdded(bytes32 root, uint32 index);

    /**
     * @notice Initializes the Merkle tree state.
     * @param _height The height of the tree.
     */
    function initialize(Tree storage self, uint32 _height) internal {
        require(_height > 0 && _height <= 32, "Invalid height");
        self.height = _height;
        self.currentRootIndex = 0;
        self.nextIndex = 0;

        // Precompute zero hashes (replace with actual Poseidon/hash function)
        bytes32 currentZero = bytes32(0);
        self.zeros.push(currentZero);
        for (uint i = 1; i <= _height; i++) {
            // currentZero = hashLeftRight(currentZero, currentZero); // Use actual hash
            currentZero = keccak256(abi.encodePacked(currentZero, currentZero)); // Placeholder hash
            self.zeros.push(currentZero);
        }

        bytes32 initialRoot = self.zeros[_height];
        self.roots.push(initialRoot);
        self.knownRoots[initialRoot] = true;
        emit RootAdded(initialRoot, 0);
    }

    /**
     * @notice Inserts a commitment into the Merkle tree.
     * @param commitment The commitment hash to insert.
     * @return leafIndex The index where the commitment was inserted.
     */
    function insertCommitment(Tree storage self, bytes32 commitment) internal returns (uint32 leafIndex) {
        uint32 _nextIndex = self.nextIndex;
        require(_nextIndex < 2**self.height, "Merkle tree is full");

        bytes32 currentLevelHash = commitment;
        uint32 currentIndex = _nextIndex;

        for (uint32 i = 0; i < self.height; i++) {
            bytes32 sibling;
            if (currentIndex % 2 == 0) {
                // We are the left node, sibling is a zero node initially
                sibling = self.zeros[i];
                // Store hash for future sibling calculation
                self.filledSubtrees[i * (2**self.height) + currentIndex / 2] = currentLevelHash; // Simplified index
            } else {
                // We are the right node, sibling was stored previously
                sibling = self.filledSubtrees[i * (2**self.height) + (currentIndex - 1) / 2]; // Simplified index
            }

            // currentLevelHash = hashLeftRight(sibling, currentLevelHash); // Use actual hash
            if (currentIndex % 2 == 0) {
                 currentLevelHash = keccak256(abi.encodePacked(currentLevelHash, sibling)); // Placeholder hash (Left, Right)
            } else {
                 currentLevelHash = keccak256(abi.encodePacked(sibling, currentLevelHash)); // Placeholder hash (Left, Right)
            }
            currentIndex /= 2;
        }

        // Update tree state
        leafIndex = _nextIndex;
        self.nextIndex = _nextIndex + 1;
        self.currentRootIndex++;
        self.roots.push(currentLevelHash);
        self.knownRoots[currentLevelHash] = true;
        emit RootAdded(currentLevelHash, self.currentRootIndex);

        return leafIndex;
    }

    /**
     * @notice Checks if a root is known (part of the root history).
     * @param _root The root hash to check.
     * @return True if the root is known.
     */
    function isKnownRoot(Tree storage self, bytes32 _root) internal view returns (bool) {
        return self.knownRoots[_root];
    }

    /**
     * @notice Gets the current Merkle root.
     * @return The latest root hash.
     */
    function getRoot(Tree storage self) internal view returns (bytes32) {
        return self.roots[self.currentRootIndex];
    }

     /**
      * @notice Gets information about the tree state.
      */
     function getTreeInfo(Tree storage self) internal view returns (uint32 height, uint32 filledSubtreesCount, uint32 currentRootIndex, uint32 nextIndex) {
         // filledSubtreesCount is tricky to get directly from mapping, returning 0 for now
         return (self.height, 0, self.currentRootIndex, self.nextIndex);
     }

    // function hashLeftRight(bytes32 _left, bytes32 _right) internal pure returns (bytes32) {
    //     // Implement the hash function used by the ZK circuit (e.g., Poseidon)
    //     return keccak256(abi.encodePacked(_left, _right)); // Placeholder
    // }
}
