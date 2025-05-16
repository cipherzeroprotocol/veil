pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

// Verify Merkle tree inclusion proof
// pathIndices defines path positions (left or right)
template MerkleProof(levels) {
    signal input leaf;          // The leaf being proven
    signal input root;          // Expected merkle root
    signal input pathElements[levels]; // Sibling path elements
    signal input pathIndices[levels];  // Path indices (0 = left, 1 = right)

    component selectors[levels];
    component hashers[levels];

    signal computedPath[levels+1];
    computedPath[0] <== leaf;

    // Compute merkle path
    for (var i = 0; i < levels; i++) {
        // Select left or right depending on pathIndices[i]
        selectors[i] = Selector();
        selectors[i].in[0] <== computedPath[i];    // current is left input
        selectors[i].in[1] <== pathElements[i];    // sibling is right input
        selectors[i].index <== pathIndices[i];     // path index selects position

        // Poseidon hash the two inputs
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== selectors[i].out[0]; // left input
        hashers[i].inputs[1] <== selectors[i].out[1]; // right input
        
        // Set the computed path for the next level
        computedPath[i+1] <== hashers[i].out;
    }

    // Final computed root must equal the expected root
    root === computedPath[levels];
}

// Select left or right elements depending on path index
template Selector() {
    signal input in[2];    // [current, sibling]
    signal input index;    // 0 = left, 1 = right
    signal output out[2];  // [left, right]

    // index must be 0 or 1
    index * (1 - index) === 0;

    // If index is 0, current is left (out[0]) and sibling is right (out[1])
    // If index is 1, sibling is left (out[0]) and current is right (out[1])
    out[0] <== (in[0] - in[1]) * (1 - index) + in[1];
    out[1] <== (in[1] - in[0]) * (1 - index) + in[0];
}