pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

/*
 * Helper template to compute a commitment hash
 * Commitment = Poseidon(secret, amount, tokenId, sourceChainId)
 */
template CommitmentHasher() {
    signal input secret;
    signal input amount;
    signal input tokenId;
    signal input sourceChainId;
    signal output commitment;
    
    component hasher = Poseidon(4);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== amount;
    hasher.inputs[2] <== tokenId;
    hasher.inputs[3] <== sourceChainId;
    
    commitment <== hasher.out;
}

/*
 * Helper template to compute a nullifier hash
 * Nullifier = Poseidon(secret, sourceChainId)
 */
template NullifierHasher() {
    signal input secret;
    signal input sourceChainId;
    signal output out;
    
    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== sourceChainId;
    
    out <== hasher.out;
}

/*
 * Validates destination chain ID
 * 1 = Ethereum
 * 10 = Optimism
 * 42161 = Arbitrum
 * 8453 = Base
 * 1 = Solana (Our custom assignment)
 */
template ChainValidator() {
    signal input destinationChainId;
    signal input sourceChainId;
    
    // Ensure the destination chain is different from the source chain
    component differentChain = IsEqual();
    differentChain.in[0] <== destinationChainId;
    differentChain.in[1] <== sourceChainId;
    
    // Output 1 if chains are equal, so we check if not equal to 1
    component notEqual = IsZero();
    notEqual.in <== differentChain.out;
    
    // Must be not equal (output should be 1)
    notEqual.out === 1;
    
    // Verify it's a supported chain ID
    component isEthereum = IsEqual();
    isEthereum.in[0] <== destinationChainId;
    isEthereum.in[1] <== 1;
    
    component isOptimism = IsEqual();
    isOptimism.in[0] <== destinationChainId;
    isOptimism.in[1] <== 10;
    
    component isArbitrum = IsEqual();
    isArbitrum.in[0] <== destinationChainId;
    isArbitrum.in[1] <== 42161;
    
    component isBase = IsEqual();
    isBase.in[0] <== destinationChainId;
    isBase.in[1] <== 8453;
    
    component isSolana = IsEqual();
    isSolana.in[0] <== destinationChainId;
    isSolana.in[1] <== 1;
    
    // At least one of these should be true (sum should be > 0)
    signal validChain;
    validChain <== isEthereum.out + isOptimism.out + isArbitrum.out + isBase.out + isSolana.out;
    
    component validChainCheck = GreaterThan(3); // 3 bits are enough for 0-7
    validChainCheck.in[0] <== validChain;
    validChainCheck.in[1] <== 0;
    
    // Must be a valid chain (output should be 1)
    validChainCheck.out === 1;
}

/*
 * Validates that an address is properly formatted:
 * - For Ethereum/L2s: 20 bytes, first bits conform to EIP-55
 * - For Solana: 32 bytes, pubkey format
 */
template AddressValidator() {
    signal input recipientAddress[256];
    
    // This is a simplified validator for demonstration
    // In a real implementation, you would add additional checks
    // such as EIP-55 checksum for Ethereum addresses

    // Check that at least one bit is set (not all zeros)
    signal sum;
    var tempSum = 0;
    
    for (var i = 0; i < 256; i++) {
        tempSum += recipientAddress[i];
    }
    sum <== tempSum;
    
    component nonZero = GreaterThan(9); // 9 bits sufficient for sum of 256 bits
    nonZero.in[0] <== sum;
    nonZero.in[1] <== 0;
    
    // Address must not be all zeros
    nonZero.out === 1;
    
    // Additional checks could be added here for specific address formats
    // e.g., Ethereum addresses are 160 bits, so bits 160-255 should be 0
}

/*
 * Anti-replay protection to ensure a nullifier can't be reused 
 * across different destination chains
 */
template ReplayProtection() {
    signal input nullifier;
    signal input destinationChainId;
    
    // In a real circuit, we would integrate with on-chain storage
    // to ensure this nullifier hasn't been used for this destination chain
    
    // Here we're just demonstrating the concept
    // This would be enforced through the smart contract
    
    // The combination of (nullifier, destinationChainId) must be unique
    component chainSpecificNullifier = Poseidon(2);
    chainSpecificNullifier.inputs[0] <== nullifier;
    chainSpecificNullifier.inputs[1] <== destinationChainId;
    
    // The output would be checked against a nullifier set in the contract
    // This is just a placeholder in the circuit
    signal output chainSpecificNullifierHash;
    chainSpecificNullifierHash <== chainSpecificNullifier.out;
}

/*
 * Validates that the amount is positive (> 0)
 */
template PositiveAmountValidator() {
    signal input amount;
    
    component isPositive = GreaterThan(252); // 252 bits is enough for large amounts
    isPositive.in[0] <== amount;
    isPositive.in[1] <== 0;
    
    // Amount must be positive
    isPositive.out === 1;
}