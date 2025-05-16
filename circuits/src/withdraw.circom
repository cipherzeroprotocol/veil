pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./merkle.circom";

// Main circuit for SolanaVeil withdrawal
// Proves:
// 1. The prover knows a valid nullifier and secret for a commitment in the tree
// 2. The commitment is in the merkle tree at the specified position
// 3. The nullifier hash is correctly computed to prevent double spending
template Withdraw(levels) {
    // Private inputs
    signal input nullifier;      // Secret nullifier
    signal input secret;         // Secret random value
    signal input pathElements[levels]; // Merkle proof path elements
    signal input pathIndices[levels];  // Merkle proof indices (0 = left, 1 = right)
    
    // Public inputs
    signal input root;           // Merkle root
    signal input poolId;         // Pool ID to prevent cross-pool double spending
    signal input recipient;      // Recipient address
    signal input relayer;        // Address of relayer (for fees)
    signal input fee;            // Fee paid to relayer
    signal input denomination;   // Pool denomination amount
    
    // Public outputs
    signal output nullifierHash; // Nullifier hash to prevent double spending
    
    // Optional recipient component (0 = no specified recipient)
    signal input hasRecipient;   // 1 if there's a specified recipient, 0 otherwise
    
    // 1. Compute the commitment
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    commitmentHasher.inputs[2] <== recipient * hasRecipient; // If no recipient specified, use 0
    signal commitment;
    commitment <== commitmentHasher.out;
    
    // 2. Verify the commitment exists in the merkle tree
    component merkleProof = MerkleProof(levels);
    merkleProof.leaf <== commitment;
    merkleProof.root <== root;
    for (var i = 0; i < levels; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }
    
    // 3. Compute nullifier hash (prevents double spending)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.inputs[1] <== poolId;
    nullifierHash <== nullifierHasher.out;
    
    // 4. Check recipient constraints - Logic implicitly handled by commitment calculation and Merkle proof
    // If hasRecipient = 1, the commitment includes the recipient. The Merkle proof verifies this commitment.
    // If hasRecipient = 0, the commitment uses 0 for the recipient part.
    
    // 5. Check fee constraints
    // Fee must be less than or equal to denomination
    component lte = LessEqThan(64);
    lte.in[0] <== fee;
    lte.in[1] <== denomination;
    lte.out === 1;
}

// Create a component with 20 levels (supports ~1 million deposits)
component main { public [root, poolId, recipient, relayer, fee, denomination] } = Withdraw(20);