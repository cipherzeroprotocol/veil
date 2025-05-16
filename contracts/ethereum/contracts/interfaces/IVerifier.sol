// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SolanaVeil Cross-Chain Withdrawal Verifier
 * @notice Verifies ZK proofs for cross-chain private withdrawals
 */
interface IVerifier {
    /**
     * @notice Verifies a withdrawal proof
     * @param proof The SNARK proof bytes (encoded according to the verifier's expectation)
     * @param input Public inputs array. The order and content must match the circuit.
     *              Example: [root, nullifierHash, recipient, relayer, fee, ...]
     * @return True if the proof and public inputs are valid
     */
    function verifyProof(
        bytes memory proof,
        uint256[6] memory input // Array size must match circuit's public inputs
    ) external view returns (bool);
}
