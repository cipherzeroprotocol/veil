// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWormholeRelayer {
    // Struct for receiving tokens via the relayer
    struct TokenReceived {
        address tokenAddress; // Address of the token received on the target chain
        uint256 amount;       // Amount received
    }

    // Function to quote delivery price
    function quoteEVMDeliveryPrice(
        uint16 targetChain,
        uint256 receiverValue,
        uint256 gasLimit
    ) external view returns (uint256 nativePriceQuote, uint256 targetChainRefundPerGasUnused);

    // Function to send payload only
    function sendPayloadToEvm(
        uint16 targetChain,
        address targetAddress,
        bytes memory payload,
        uint256 receiverValue,
        uint256 gasLimit
    ) external payable returns (uint64 sequence);

    // Function to send tokens with payload (simplified conceptual representation)
    // The actual SDK might use different internal functions or require specific encoding.
    // This function signature is based on the tutorial's `sendTokenWithPayloadToEvm` concept.
    function sendTokenWithPayloadToEvm(
        uint16 targetChain,
        address targetAddress, // The IWormholeReceiver contract on the target chain
        bytes memory payload,
        uint256 receiverValue,
        uint256 gasLimit,
        address token,       // Token being sent
        uint256 amount       // Amount being sent
    ) external payable returns (uint64 sequence);

    // Add other functions from the interface as needed
}
