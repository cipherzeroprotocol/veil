pragma circom 2.0.0;

include "./merkle.circom";
include "./helpers/bridge_helpers.circom";

/*
 * Circuit for bridging tokens between Solana and Ethereum/L2s
 * This circuit verifies:
 * 1. The user knows the secret key for a commitment in the source chain Merkle tree
 * 2. The commitment was correctly formed (amount, nullifier, etc.) - Implicitly via Merkle proof
 * 3. The nullifier is correctly derived from the secret
 * 4. The recipient on the destination chain is correctly encoded/committed to
 * 5. The Merkle proof is valid against the provided root
 *
 * Used for Solana -> EVM and EVM -> Solana private withdrawals.
 */
template BridgeProof(merkleTreeDepth) {
    // Public inputs
    signal input root;                        // Root of the source chain Merkle tree
    signal input nullifierHash;               // Hash of the nullifier (Poseidon(secret))
    signal input recipientHash;               // Hash of the recipient address (Poseidon(recipientAddress))
    signal input destinationChainId;          // Wormhole/LZ Chain ID of the destination chain
    signal input amount;                      // Amount being transferred (net amount)
    signal input tokenId;                     // ID of the token being transferred

    // Private inputs
    signal input secret;                      // Secret value only known to the user
    signal input pathElements[merkleTreeDepth]; // Merkle proof path elements (sibling nodes)
    signal input pathIndices[merkleTreeDepth];  // Merkle proof path indices (0 or 1)
    // Optional private inputs if needed for commitment verification inside circuit:
    // signal input recipientAddress; // Actual recipient address if needed to compute recipientHash inside

    // 1. Verify Nullifier Hash
    // Hash the secret to get the nullifier hash
    signal computedNullifierHash <== Poseidon(1)([secret]);
    // Ensure the computed nullifier hash matches the public input
    computedNullifierHash === nullifierHash;

    // 2. Verify Merkle Proof
    // Compute the commitment hash based on private inputs (secret, amount, tokenId, etc.)
    // The exact composition depends on how commitments are defined in SolanaVeil
    // Example: commitment = Poseidon([secret, amount, tokenId, recipientHash])
    signal commitmentHash <== Poseidon(4)([secret, amount, tokenId, recipientHash]); // Example commitment

    // Verify the Merkle proof using the computed commitment hash
    component merkleProof = MerkleProofChecker(merkleTreeDepth);
    merkleProof.leaf <== commitmentHash;
    for (var i = 0; i < merkleTreeDepth; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }
    // Ensure the computed root matches the public input root
    merkleProof.root === root;

    // 3. (Optional) Recipient Hash Verification (if recipientAddress is private input)
    // signal computedRecipientHash <== Poseidon(1)([recipientAddress]);
    // computedRecipientHash === recipientHash;

    // Ensure public inputs are constrained (prevents malleability if not done elsewhere)
    // These lines ensure the public inputs used in the proof match the ones declared.
    // Often redundant if the verification contract uses them directly.
    // destinationChainId === destinationChainId;
    // amount === amount;
    // tokenId === tokenId;
}

// Example instantiation (adjust depth as needed)
// component main {public [root, nullifierHash, recipientHash, destinationChainId, amount, tokenId]} = BridgeProof(20);