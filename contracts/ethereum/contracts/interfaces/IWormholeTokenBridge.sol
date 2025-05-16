// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IWormholeTokenBridge
 * @notice Interface for interacting with the Wormhole Token Bridge.
 * @dev Includes functions for transferring tokens and potentially other operations.
 *      This is a simplified interface based on common usage. Refer to official Wormhole docs for full interface.
 */
interface IWormholeTokenBridge {
    /**
     * @notice Transfer tokens to a recipient on another chain, optionally with a payload.
     * @param token Address of the ERC20 token contract to transfer.
     * @param amount Amount of tokens to transfer.
     * @param recipientChain Wormhole chain ID of the destination chain.
     * @param recipient Address of the recipient on the destination chain, in Wormhole bytes32 format.
     * @param arbiterFee Fee paid to the relayer (if applicable, often 0 for standard transfers).
     * @param nonce A unique nonce for the transfer.
     * @return sequence The sequence number of the Wormhole message generated.
     */
    function transferTokens(
        address token,
        uint256 amount,
        uint16 recipientChain,
        bytes32 recipient,
        uint256 arbiterFee,
        uint32 nonce
    ) external payable returns (uint64 sequence);

    /**
     * @notice Transfer tokens with a payload to a recipient contract on another chain.
     * @param token Address of the ERC20 token contract to transfer.
     * @param amount Amount of tokens to transfer.
     * @param recipientChain Wormhole chain ID of the destination chain.
     * @param recipient Address of the recipient contract on the destination chain, in Wormhole bytes32 format.
     * @param nonce A unique nonce for the transfer.
     * @param payload Arbitrary bytes payload to be delivered to the recipient contract.
     * @return sequence The sequence number of the Wormhole message generated.
     */
    function transferTokensWithPayload(
        address token,
        uint256 amount,
        uint16 recipientChain,
        bytes32 recipient,
        uint32 nonce,
        bytes memory payload
    ) external payable returns (uint64 sequence);

    /**
     * @notice Completes a transfer from another chain.
     * @dev This function is called with a VAA (Verified Action Approval) from Wormhole.
     * @param encodedVm The encoded VAA bytes.
     */
    function completeTransfer(bytes memory encodedVm) external;

    /**
     * @notice Completes a transfer with payload from another chain.
     * @dev This function is called with a VAA (Verified Action Approval) from Wormhole.
     * @param encodedVm The encoded VAA bytes.
     */
    function completeTransferWithPayload(bytes memory encodedVm) external;

    // Add other functions as needed, e.g., attestMeta, createWrapped, updateWrapped, etc.
}

