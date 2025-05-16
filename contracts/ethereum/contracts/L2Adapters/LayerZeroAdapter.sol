// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// Update LayerZero imports for V2 SDK
import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-sdk-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { ILayerZeroReceiver } from "@layerzerolabs/lz-evm-sdk-v2/contracts/interfaces/ILayerZeroReceiver.sol"; // To receive messages
import { BytesLib } from "@layerzerolabs/lz-evm-sdk-v2/contracts/vendor/BytesLib.sol"; // For slicing

/**
 * @title LayerZeroAdapter
 * @notice Adapter for bridging between Solana and an L2 via LayerZero
 * @dev Resides on L2 (e.g., Arbitrum, Optimism, Base). Handles sending messages to L1 SolanaVeilBridge
 *      and receiving messages from L1 SolanaVeilBridge via LayerZero.
 */
contract LayerZeroAdapter is Ownable, ReentrancyGuard, ILayerZeroReceiver {
    using SafeERC20 for IERC20;
    using BytesLib for bytes;

    // === Constants ===
    uint16 public constant CHAIN_ID_SOLANA = 1; // Wormhole Chain ID for Solana
    uint16 public immutable L1_LZ_CHAIN_ID; // LayerZero Chain ID for L1 (e.g., Ethereum/Sepolia)

    // === State Variables ===
    ILayerZeroEndpointV2 public immutable lzEndpoint; // Updated type
    address public immutable mainnetBridge; // Address of SolanaVeilBridge on L1

    // Token mappings (L2 specific)
    mapping(address => uint256) public l2TokenToId;
    mapping(uint256 => address) public idToL2Token;
    mapping(uint256 => address) public idToL1Token; // L1 token needed for context? Maybe not for LZ send.

    // Nullifier tracking for messages received FROM L1
    mapping(bytes32 => bool) public processedL1Nullifiers;

    // === Events ===
    event TokenConfigured(uint256 indexed tokenId, address l2TokenAddress, address l1TokenAddress);
    event BridgeToSolanaInitiated(address indexed sender, uint256 amount, bytes32 l2Nullifier, bytes32 solanaRecipient, uint256 tokenId);
    event BridgeFromSolanaFinalized(bytes32 l1Nullifier, address indexed recipient, uint256 amount, uint256 indexed tokenId);
    event MessageReceived(uint16 sourceChainId, address sourceAddress, uint64 nonce, bytes payload);

    /**
     * @param _lzEndpoint Address of the LayerZero Endpoint on this L2 chain
     * @param _mainnetBridge Address of SolanaVeilBridge on L1
     * @param _l1LzChainId LayerZero Chain ID for the L1 network (e.g., Ethereum/Sepolia)
     */
    constructor(
        address _lzEndpoint,
        address _mainnetBridge,
        uint16 _l1LzChainId // Note: LayerZero V2 uses uint32 for endpoint IDs (eid)
    ) Ownable(msg.sender) {
        require(_lzEndpoint != address(0), "Invalid LZ Endpoint");
        require(_mainnetBridge != address(0), "Invalid mainnet bridge");
        require(_l1LzChainId != 0, "Invalid L1 LZ Chain ID"); // Keep as uint16 for now if used elsewhere, but be aware of V2 uint32 eids

        lzEndpoint = ILayerZeroEndpointV2(_lzEndpoint); // Updated type cast
        mainnetBridge = _mainnetBridge;
        L1_LZ_CHAIN_ID = _l1LzChainId;
    }

    /**
     * @notice Bridge tokens from this L2 to Solana via L1
     * @param solanaRecipient Recipient address on Solana (bytes32)
     * @param amount Amount of tokens to bridge
     * @param tokenId ID of the token
     * @param options LayerZero adapter parameters (e.g., for specifying relayer, executor) - V2 uses Options struct/bytes
     */
    function bridgeToSolana(
        bytes32 solanaRecipient,
        uint256 amount,
        uint256 tokenId,
        bytes calldata options // Add V2 options parameter
    ) external payable nonReentrant {
        address l2Token = idToL2Token[tokenId];
        require(l2Token != address(0), "Token not supported");
        require(amount > 0, "Amount must be > 0");

        // Generate a unique nullifier for this L2 -> L1 transfer leg
        bytes32 l2Nullifier = keccak256(abi.encodePacked("L2->L1", msg.sender, block.chainid, block.timestamp, amount, tokenId));

        // Transfer tokens from user to this contract
        IERC20(l2Token).safeTransferFrom(msg.sender, address(this), amount);

        // Prepare payload for the L1 SolanaVeilBridge
        // Format: functionSelector | l2Nullifier | solanaRecipient | sender | amount | tokenId
        // Assuming L1 SolanaVeilBridge has a function like handleL2BridgeMessage
        // bytes4 handleSelector = SolanaVeilBridge(mainnetBridge).handleL2BridgeMessage.selector; // Need L1 interface or hardcode selector
        bytes4 handleSelector = 0xabcdef12; // Placeholder: Replace with actual selector from L1 bridge
        bytes memory payload = abi.encodePacked(
            handleSelector, // Function selector on SolanaVeilBridge
            l2Nullifier,
            solanaRecipient,
            msg.sender, // Original sender on L2
            amount,
            tokenId
        );

        // Quote LayerZero fees using V2 endpoint
        // V2 uses endpoint IDs (eid) which are uint32
        uint32 destinationEid = uint32(L1_LZ_CHAIN_ID); // Convert L1 chain ID to V2 eid
        // V2 options are encoded bytes. User needs to construct these off-chain.
        // bytes memory options = lzAdapterParams; // Assuming user passes encoded options

        SendParam memory sendParam = SendParam({
            dstEid: destinationEid,
            to: abi.encodePacked(mainnetBridge), // Destination address on L1 (SolanaVeilBridge)
            message: payload,
            extraOptions: options, // Encoded V2 options
            refundAddress: payable(msg.sender), // Refund address
            nativeAmount: 0 // Native amount to send with message (usually 0)
        });

        MessagingFee memory fee = lzEndpoint.quote(sendParam, false); // false = don't pay in ZRO

        // Require user to pay the estimated fee
        require(msg.value >= fee.nativeFee, "Insufficient fee for LayerZero");

        // Send the message via LayerZero Endpoint V2
        lzEndpoint.send{value: msg.value}(
            sendParam,
            fee, // Pass the quoted fee structure
            payable(msg.sender) // Refund address (also in sendParam, redundant?)
        );

        emit BridgeToSolanaInitiated(msg.sender, amount, l2Nullifier, solanaRecipient, tokenId);
    }

    /**
     * @notice Called by the LayerZero Endpoint when receiving a message from L1 SolanaVeilBridge
     * @param _origin Information about the source message (eid, sender address, nonce)
     * @param _dstEid Destination endpoint ID (should match this L2's eid)
     * @param _receiver Address of this contract
     * @param _guid Globally unique identifier for the message
     * @param _message The message payload sent from L1
     * @param _extraOptions Extra options provided by the sender
     */
    function lzReceive(
        Origin calldata _origin, // V2 struct
        uint32 _dstEid,
        address _receiver,
        bytes32 _guid,
        bytes calldata _message, // Renamed from _payload
        bytes calldata _extraOptions
    ) external override nonReentrant {
        // Ensure the message comes from the LayerZero Endpoint
        require(msg.sender == address(lzEndpoint), "Caller is not LZ Endpoint");
        // Ensure the message comes from the configured L1 chain and SolanaVeilBridge address
        require(_origin.eid == uint32(L1_LZ_CHAIN_ID), "Invalid source eid"); // Check eid
        require(bytesToAddress(_origin.sender) == mainnetBridge, "Invalid source address"); // Check sender address

        emit MessageReceived(uint16(_origin.eid), bytesToAddress(_origin.sender), _origin.nonce, _message); // Adapt event emission

        // Decode the payload sent by SolanaVeilBridge.forwardToL2Adapter
        // Expected format: l1Nullifier | recipient | amount | tokenId
        require(_message.length == 32 + 20 + 32 + 32, "Invalid payload length");

        bytes32 l1Nullifier = BytesLib.toBytes32(_message, 0);
        address recipient = BytesLib.toAddress(_message, 32);
        uint256 amount = BytesLib.toUint256(_message, 52); // 32 + 20
        uint256 tokenId = BytesLib.toUint256(_message, 84); // 32 + 20 + 32

        // Verify the L1 nullifier hasn't been used for this L2 finalization
        require(!processedL1Nullifiers[l1Nullifier], "L1 Nullifier already used on L2");

        address l2Token = idToL2Token[tokenId];
        require(l2Token != address(0), "Token not supported on L2");
        require(amount > 0, "Amount must be > 0");

        // Mark L1 nullifier as processed on this L2
        processedL1Nullifiers[l1Nullifier] = true;

        // Transfer tokens to the final recipient on L2
        IERC20(l2Token).safeTransfer(recipient, amount);

        emit BridgeFromSolanaFinalized(l1Nullifier, recipient, amount, tokenId);
    }

    // === Admin Functions ===
    function configureToken(uint256 tokenId, address l2TokenAddress, address l1TokenAddress) external onlyOwner {
        require(l2TokenAddress != address(0), "Invalid L2 token");
        // l1TokenAddress might not be strictly needed here but good for reference
        l2TokenToId[l2TokenAddress] = tokenId;
        idToL2Token[tokenId] = l2TokenAddress;
        idToL1Token[tokenId] = l1TokenAddress;
        emit TokenConfigured(tokenId, l2TokenAddress, l1TokenAddress);
    }

    function emergencyWithdraw(address tokenAddress, address recipient, uint256 amount) external onlyOwner nonReentrant {
        require(tokenAddress != address(0) && recipient != address(0) && amount > 0, "Invalid params");
        IERC20(tokenAddress).safeTransfer(recipient, amount);
    }

    // === Internal/Helper Functions ===
    function bytesToAddress(bytes calldata _bytes) internal pure returns (address) {
        // LayerZero V2 sender is bytes32, address is right-padded
        return address(uint160(bytes20(_bytes)));
    }

    // Required by ILayerZeroReceiver but might not be needed if not using non-blocking receive
    function lzReceiveNonBlocking(
        Origin calldata _origin,
        uint32 _dstEid,
        address _receiver,
        bytes32 _guid,
        bytes calldata _message,
        bytes calldata _extraOptions
    ) external virtual override {
        revert("NonBlocking receive not implemented");
    }

    // Required by ILayerZeroReceiver but might not be needed if not using blocking receive failure handling
    function lzReceiveBlocking(
        Origin calldata _origin,
        uint32 _dstEid,
        address _receiver,
        bytes32 _guid,
        bytes calldata _message,
        bytes calldata _extraOptions
    ) external virtual override {
         // Default implementation calls lzReceive
        this.lzReceive(_origin, _dstEid, _receiver, _guid, _message, _extraOptions);
    }
}
