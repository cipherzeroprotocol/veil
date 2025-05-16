// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // Corrected path
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./ZKVerifier.sol";
import "./SolanaVeilVault.sol";
// Update LayerZero imports for V2 SDK
import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-sdk-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { ILayerZeroReceiver } from "@layerzerolabs/lz-evm-sdk-v2/contracts/interfaces/ILayerZeroReceiver.sol";
import { BytesLib } from "@layerzerolabs/lz-evm-sdk-v2/contracts/vendor/BytesLib.sol"; // For slicing
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol"; // Import PythStructs
import "./interfaces/IWormhole.sol"; // Keep Core interface
import "./interfaces/IWormholeRelayer.sol"; // Add Relayer interface
import "./interfaces/IWormholeReceiver.sol"; // Add Receiver interface
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"; // For decimals check
// Import the new interface
import "./interfaces/IWormholeTokenBridge.sol";
import "./interfaces/IVerifier.sol";
import "./libraries/MerkleTree.sol"; // Assuming library exists

/**
 * @title SolanaVeilBridge
 * @notice Main contract for bridging assets between Ethereum and Solana through SolanaVeil
 * @dev Handles locking/unlocking, ZK proof verification, LayerZero messages, Pyth fees, and Wormhole messages.
 */
contract SolanaVeilBridge is Ownable, ReentrancyGuard, Pausable, ILayerZeroReceiver, IWormholeReceiver { // Inherit IWormholeReceiver
    using SafeERC20 for IERC20;
    using BytesLib for bytes; // Use BytesLib
    using MerkleTree for MerkleTree.Tree; // Use MerkleTree library

    // === Constants ===

    uint16 public constant WH_CHAIN_ID_SOLANA = 1; // Wormhole Chain ID for Solana
    uint16 public constant CHAIN_ID_ETHEREUM = 101; // Example LayerZero Chain ID for Ethereum
    uint8 public constant PRICE_DECIMALS = 8; // Pyth prices usually have 8 decimals

    // === State Variables ===

    // Verification contract for ZK proofs
    ZKVerifier public immutable verifier;

    // Vault contract for token storage
    SolanaVeilVault public immutable vault;

    // Maps to track processed transfers and nullifiers
    mapping(bytes32 => bool) public processedNullifiers; // For L1 -> L2/Solana via ZK proof
    mapping(bytes32 => bool) public processedWormholeMessages; // For Solana -> L1 via Wormhole

    // Mapping of token ID to token contract
    mapping(uint256 => address) public supportedTokens;

    // Mapping of token ID to min/max amounts
    mapping(uint256 => TokenConfig) public tokenConfigs;

    // Mapping of relayer addresses to their registered status
    mapping(address => bool) public registeredRelayers;

    // Treasury address for fee collection
    address public treasury;

    ILayerZeroEndpointV2 public lzEndpoint; // LayerZero Endpoint on L1 (Updated type)

    // Mapping L2 EVM Chain ID => L2 Adapter Address
    mapping(uint16 => address) public l2Adapters;
    // Mapping L2 EVM Chain ID => L2 LayerZero Chain ID
    mapping(uint16 => uint16) public l2LzChainIds;

    // Mapping for L2 -> L1 messages via LayerZero
    mapping(bytes32 => bool) public processedL2Nullifiers;

    IPyth public pythOracle; // Pyth Oracle contract

    // Fee target in USD cents (e.g., 100 = $1.00)
    uint256 public targetFeeUSD;

    // Mapping token ID to Pyth Price Feed ID
    mapping(uint256 => bytes32) public tokenIdToPriceId;

    IWormhole public immutable wormhole; // Renamed from wormholeCore for clarity
    address public wormholeRelayerAddress; // Address of the Wormhole Relayer contract on L1
    IWormholeTokenBridge public wormholeTokenBridge; // Wormhole Token Bridge contract

    // Mapping Wormhole Chain ID => Wormhole Emitter Address (bytes32) => registered status
    mapping(uint16 => mapping(bytes32 => bool)) public registeredWormholeSenders; // For Relayer pattern

    // Expected Solana emitter address (for Core Wormhole pattern)
    bytes32 public solanaEmitterAddress;

    // Privacy Mechanism
    IVerifier public immutable verifier; // ZK Proof Verifier contract
    mapping(bytes32 => bool) public nullifierHashes; // Tracks used nullifiers to prevent double-spending
    mapping(bytes32 => bool) public commitments; // Tracks inserted commitments (optional, tree state is primary)
    MerkleTree.Tree internal merkleTree; // Merkle tree state using the library

    // === Structs ===
    
    struct TokenConfig {
        bool enabled;
        uint256 minAmount;
        uint256 maxAmount;
    }
    
    // === Events ===
    
    event BridgeInitiated(
        address indexed sender,
        uint256 amount,
        bytes32 nullifier,
        bytes32 solanaRecipient,
        uint256 tokenId
    );
    
    event BridgeCompleted(
        bytes32 nullifier,
        address indexed recipient,
        uint256 amount,
        uint256 indexed tokenId
    );
    
    event TokenConfigured(
        uint256 indexed tokenId,
        address tokenAddress,
        uint256 minAmount,
        uint256 maxAmount,
        bool enabled
    );
    
    event RelayerRegistered(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    event TreasuryUpdated(address indexed newTreasury);
    event L2AdapterSet(uint16 indexed l2ChainId, address indexed adapterAddress, uint16 l2LzChainId);
    event MessageReceivedFromL2(uint16 sourceLzChainId, address sourceAdapterAddress, uint64 nonce, bytes payload);
    event ForwardedToL2(uint16 indexed destinationLzChainId, address indexed adapterAddress, bytes32 l1Nullifier);
    event PriceFetched(bytes32 indexed priceId, int64 price, uint64 timestamp);
    event TargetFeeSet(uint256 newTargetFeeUSD);
    event TokenPriceIdSet(uint256 indexed tokenId, bytes32 indexed priceId);
    event WormholeSenderRegistered(uint16 indexed sourceChainId, bytes32 indexed sourceAddress);
    event WormholeSenderDeregistered(uint16 indexed sourceChainId, bytes32 indexed sourceAddress);
    event WormholeRelayerSet(address indexed relayerAddress);
    event WormholeMessageProcessed(uint16 sourceChainId, bytes32 sourceAddress, uint64 sequence, bytes32 l2Nullifier); // More specific event
    event SolanaEmitterSet(bytes32 emitterAddress); // Event for setting Solana emitter
    event WormholeTokenBridgeSet(address tokenBridgeAddress); // Event for setting Token Bridge
    event CommitmentInserted(bytes32 commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address indexed recipient, address indexed relayer, uint256 fee, bytes32 nullifierHash);
    event BridgeToSolanaInitiated(address indexed sender, address indexed token, uint256 amount, bytes32 recipient, uint32 nonce, uint64 sequence);

    // === Modifiers ===
    modifier onlyWormholeRelayer() {
        require(msg.sender == wormholeRelayerAddress, "Caller is not Wormhole Relayer");
        _;
    }

    modifier isRegisteredWormholeSender(uint16 sourceChain, bytes32 sourceAddress) {
        require(registeredWormholeSenders[sourceChain][sourceAddress], "Wormhole sender not registered");
        _;
    }

    // Modifier to check if the caller is the Wormhole Core contract
    modifier onlyWormhole() {
        require(msg.sender == address(wormhole), "Caller is not Wormhole Core contract");
        _;
    }


    // === Constructor ===
    
    /**
     * @param _verifier Address of the ZK proof verifier contract
     * @param _vault Address of the token vault contract
     * @param _treasury Address for fee collection
     * @param _lzEndpoint Address of the LayerZero Endpoint on L1
     * @param _pythOracle Address of the Pyth Oracle contract on L1
     * @param _targetFeeUSD Initial target fee in USD cents
     * @param _wormhole Address of the Wormhole Core contract on L1
     * @param _wormholeTokenBridge Address of the Wormhole Token Bridge contract on L1
     * @param _solanaEmitter Address of the expected Solana bridge contract emitter (bytes32)
     */
    constructor(
        address _verifier,
        address _vault,
        address _treasury,
        address _lzEndpoint, // Add LZ Endpoint address
        address _pythOracle, // Add Pyth Oracle address
        uint256 _targetFeeUSD, // Add initial fee target
        address _wormhole, // Keep Wormhole Core
        address _wormholeTokenBridge, // Add Wormhole Token Bridge
        bytes32 _solanaEmitter, // Add expected Solana emitter
        uint32 _merkleTreeHeight // Add Merkle tree height
    ) Ownable(msg.sender) {
        require(_verifier != address(0), "Invalid verifier address");
        require(_vault != address(0), "Invalid vault address");
        require(_treasury != address(0), "Invalid treasury address");
        require(_lzEndpoint != address(0), "Invalid LZ Endpoint"); // Add check
        require(_pythOracle != address(0), "Invalid Pyth Oracle"); // Add check
        require(_wormhole != address(0), "Invalid Wormhole Core");
        require(_wormholeTokenBridge != address(0), "Invalid Wormhole Token Bridge"); // Add check
        require(_solanaEmitter != bytes32(0), "Invalid Solana Emitter"); // Add check
        require(_merkleTreeHeight > 0 && _merkleTreeHeight <= 32, "Invalid Merkle tree height"); // Example bounds

        verifier = ZKVerifier(_verifier);
        vault = SolanaVeilVault(_vault);
        treasury = _treasury;
        lzEndpoint = ILayerZeroEndpoint(_lzEndpoint); // Initialize LZ Endpoint
        pythOracle = IPyth(_pythOracle); // Initialize Pyth Oracle
        targetFeeUSD = _targetFeeUSD; // Set initial fee
        wormhole = IWormhole(_wormhole); // Assign Core
        wormholeTokenBridge = IWormholeTokenBridge(_wormholeTokenBridge); // Assign Token Bridge
        solanaEmitterAddress = _solanaEmitter; // Set Solana emitter
        // wormholeRelayerAddress is set via admin function if needed for L2 adapters

        merkleTree.initialize(_merkleTreeHeight); // Initialize Merkle tree library
    }
    
    // === External Functions ===
    
    /**
     * @notice Receive tokens from Solana through proof verification
     * @dev This handles the case where a user bridges privately FROM Solana TO Ethereum/L2
     *      It verifies the ZK proof generated by the user on the Solana side.
     * @param proof ZK proof data
     * @param nullifier Unique nullifier to prevent double spending (generated on Solana)
     * @param recipient Ethereum recipient address OR L2 Adapter address if destination is L2
     * @param amount Token amount to receive (net amount after potential fees on Solana)
     * @param tokenId ID of the token being received
     * @param destinationChainId EVM Chain ID of the final destination (0 for L1/Ethereum)
     * @param lzAdapterParams LayerZero adapter parameters (if forwarding to L2)
     */
    function receiveFromSolana(
        bytes calldata proof,
        bytes32 nullifier,
        address recipient, // Can be L1 user or L2 Adapter
        uint256 amount,
        uint256 tokenId,
        uint16 destinationChainId, // 0 for L1, otherwise L2 EVM Chain ID
        bytes calldata lzAdapterParams // For LayerZero forwarding
    ) external payable nonReentrant whenNotPaused { // Made payable for LZ fees
        // Nullifier check prevents replay attacks of the same Solana->ETH/L2 withdrawal
        require(!processedNullifiers[nullifier], "Nullifier already used");
        address tokenAddress = supportedTokens[tokenId]; // Get token address first
        require(tokenAddress != address(0), "Token not supported");
        require(tokenConfigs[tokenId].enabled, "Token not enabled");

        // Note: Amount checks (min/max) should ideally happen on the source chain (Solana)
        // before the fee is calculated and deducted. Verifying here against the
        // *net* amount might be misleading. We trust the proof contains the correct net amount.

        // Verify the ZK proof (originating from Solana)
        // The proof should bind the nullifier, recipient, amount, tokenId, and potentially the destinationChainId
        bool isValid = verifier.verifyBridgeProof(
            proof,
            nullifier,
            recipient, // Proof should commit to the recipient (L1 user or L2 Adapter)
            amount, // Verify proof against the net amount received
            tokenId,
            destinationChainId // Include destination chain in proof verification
        );
        require(isValid, "Invalid proof");

        // Mark the Solana-originated nullifier as used on Ethereum
        processedNullifiers[nullifier] = true;

        // No fee calculation here, fee was handled on the source chain (Solana).

        // Check if destination is L1 or L2
        if (destinationChainId == 0) { // Destination is L1 (Ethereum)
            require(recipient != address(0), "Invalid L1 recipient");
            // Release the NET amount from the vault
            // ASSUMPTION: Tokens corresponding to this withdrawal were previously locked
            // in the vault via a bridgeToSolanaViaWormhole or similar mechanism.
            vault.releaseTokens(recipient, tokenId, amount);
            emit BridgeCompleted(nullifier, recipient, amount, tokenId);
        } else { // Destination is an L2 chain, forward via LayerZero
            // ... (LayerZero forwarding logic remains largely the same, using the net `amount`) ...
            address adapterAddress = l2Adapters[destinationChainId];
            uint16 l2LzChainId = l2LzChainIds[destinationChainId];
            require(adapterAddress != address(0), "L2 Adapter not configured");
            require(l2LzChainId != 0, "L2 LZ Chain ID not configured");

            bytes memory payload = abi.encodePacked(
                nullifier,
                recipient,
                amount, // Forward the net amount
                tokenId
            );

            (uint nativeFee, ) = lzEndpoint.estimateFees(l2LzChainId, address(this), payload, false, lzAdapterParams);
            require(msg.value >= nativeFee, "Insufficient fee for LayerZero forwarding");

            lzEndpoint.send{value: msg.value}(
                l2LzChainId,
                abi.encodePacked(adapterAddress),
                payload,
                payable(msg.sender),
                address(0x0),
                lzAdapterParams
            );

            emit ForwardedToL2(l2LzChainId, adapterAddress, nullifier);
        }
    }
    
    /**
     * @notice Lock tokens for transfer to Solana (Standard Path - Emits event for Relayers)
     * @dev This handles the case where a user bridges FROM Ethereum TO Solana.
     *      It locks tokens, calculates fees, and emits an event for off-chain relayers
     *      to observe and initiate the process on Solana.
     * @param solanaRecipient Recipient address on Solana (bytes32 format)
     * @param amount Token amount to bridge (gross amount)
     * @param tokenId ID of the token to bridge
     * @param pythUpdateData Off-chain price update data for the token's price feed
     */
    function bridgeToSolana(
        bytes32 solanaRecipient,
        uint256 amount,
        uint256 tokenId,
        bytes[] calldata pythUpdateData // Add Pyth update data
    ) external payable nonReentrant whenNotPaused { // Make payable for Pyth fee
        address tokenAddress = supportedTokens[tokenId];
        require(tokenAddress != address(0), "Token not supported");
        require(tokenConfigs[tokenId].enabled, "Token not enabled");
        require(amount >= tokenConfigs[tokenId].minAmount, "Amount below minimum");
        require(amount <= tokenConfigs[tokenId].maxAmount, "Amount above maximum");
        require(solanaRecipient != bytes32(0), "Invalid Solana recipient");

        // --- Pyth Integration ---
        bytes32 priceId = tokenIdToPriceId[tokenId];
        require(priceId != bytes32(0), "Price feed not configured for token");

        // Pay Pyth update fee
        uint pythFee = pythOracle.getUpdateFee(pythUpdateData);
        require(msg.value >= pythFee, "Insufficient fee for Pyth update");

        // Update Pyth price on-chain
        // Forward only the Pyth fee, refund excess
        (bool success, ) = address(pythOracle).call{value: pythFee}(
            abi.encodeWithSelector(IPyth.updatePriceFeeds.selector, pythUpdateData)
        );
        require(success, "Pyth update failed");
        if (msg.value > pythFee) {
            payable(msg.sender).transfer(msg.value - pythFee); // Refund excess
        }


        // Get the latest price
        PythStructs.Price memory price = pythOracle.getPriceUnsafe(priceId);
        require(price.publishTime >= block.timestamp - 60, "Pyth price is too stale"); // Check staleness (e.g., 60 seconds)
        require(price.price > 0, "Invalid Pyth price");
        emit PriceFetched(priceId, price.price, price.publishTime);


        // Calculate fee in token terms
        uint8 tokenDecimals = IERC20Metadata(tokenAddress).decimals();
        // Fee = (TargetUSD * 10^tokenDecimals * 10^priceDecimals) / (Price * 10^2 for cents)
        uint256 feeAmount = (targetFeeUSD * (10**(uint256(tokenDecimals) + PRICE_DECIMALS - 2))) / uint256(price.price);
        require(feeAmount < amount, "Fee exceeds amount"); // Sanity check

        uint256 netAmount = amount - feeAmount;
        // --- End Pyth Integration ---

        // Generate nullifier (specific to this L1->Solana transfer)
        // Used by the relayer/user on Solana to claim the funds privately.
        bytes32 nullifier = keccak256(
            abi.encodePacked("L1->Solana", msg.sender, block.chainid, block.timestamp, amount, tokenId) // Use gross amount? Or net? Let's use gross for uniqueness.
        );

        // Transfer net amount to vault
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(vault), netAmount);

        // Transfer fee amount to treasury
        if (feeAmount > 0) {
            IERC20(tokenAddress).safeTransferFrom(msg.sender, treasury, feeAmount);
        }

        // Log the transfer for off-chain processing by relayers
        // Relayers will use this info (esp. nullifier) to help user claim on Solana
        emit BridgeInitiated(
            msg.sender,
            netAmount, // Emit net amount
            nullifier, // Emit L1 nullifier
            solanaRecipient,
            tokenId
        );
    }

    /**
     * @notice Bridge tokens from Ethereum to Solana via Wormhole Token Bridge.
     * @dev Alternative to bridgeToSolana. Uses Wormhole's Token Bridge directly.
     *      Locks tokens in the Wormhole Token Bridge contract.
     *      A commitment is generated and sent in the payload for privacy on Solana.
     * @param tokenAddress Address of the token to bridge.
     * @param amount Amount of tokens to bridge.
     * @param solanaRecipient Recipient address on Solana (bytes32 format).
     * @param nonce A unique nonce for the transfer.
     * @param wormholeFee Fee required by Wormhole (paid by caller).
     */
    function bridgeToSolanaViaWormhole(
        address tokenAddress,
        uint256 amount,
        bytes32 solanaRecipient,
        uint32 nonce,
        uint256 wormholeFee // Fee for Wormhole message, passed as msg.value
    ) external payable nonReentrant whenNotPaused {
        uint256 tokenId = 0; // Need a way to map tokenAddress back to tokenId if needed, or redesign payload
        // Basic validation
        require(tokenAddress != address(0), "Invalid token address");
        // require(supportedTokens[tokenId] == tokenAddress, "Token not supported or ID mismatch"); // Requires reverse lookup or different logic
        require(amount > 0, "Amount must be positive");
        require(solanaRecipient != bytes32(0), "Invalid Solana recipient");

        // Generate a commitment for privacy on the Solana side
        // This commitment should ideally include amount, token info, and a secret known only to the user
        // For simplicity, using a hash. A real implementation needs a proper commitment scheme.
        bytes32 commitment = keccak256(abi.encodePacked(msg.sender, amount, tokenAddress, block.timestamp, nonce));

        // Approve the Wormhole Token Bridge to spend the user's tokens
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount); // Transfer to this contract first
        IERC20(tokenAddress).approve(address(wormholeTokenBridge), amount); // Approve bridge

        // Transfer tokens via Wormhole Token Bridge with the commitment as payload
        // The payload will be received by the Solana program's `receiveWormholeMessages` counterpart.
        wormholeTokenBridge.transferTokensWithPayload{value: wormholeFee}(
            tokenAddress,
            amount,
            WH_CHAIN_ID_SOLANA, // Solana chain ID
            solanaRecipient,
            nonce,
            abi.encode(commitment) // Send commitment in payload
        );

        // Emit an event (optional, as Wormhole emits its own)
        // Note: Nullifier generation might happen differently in this flow, potentially on Solana side upon claim.
        // emit BridgeInitiated(msg.sender, amount, commitment, solanaRecipient, tokenId); // Re-evaluate event data needed
    }


    /**
     * @notice Register as a relayer for helping process cross-chain transfers
     * @dev Relayers monitor events and submit proofs to the other chain
     */
    function registerRelayer() external nonReentrant {
        require(!registeredRelayers[msg.sender], "Already registered");
        
        // In a production system, we might require a stake here
        registeredRelayers[msg.sender] = true;
        
        emit RelayerRegistered(msg.sender);
    }
    
    /**
     * @notice Called by the LayerZero Endpoint when receiving a message from an L2 Adapter
     * @dev Handles messages related to L2 -> L1 transfers via LayerZero.
     * @param _srcChainId LayerZero chain ID of the source L2 chain
     * @param _srcAddress Address of the L2 Adapter on the source chain
     * @param _nonce Unique nonce for the message
     * @param _payload The message payload sent from the L2 Adapter
     */
    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) external override nonReentrant whenNotPaused {
        require(msg.sender == address(lzEndpoint), "Caller is not LZ Endpoint");

        address sourceAdapterAddress = bytesToAddress(_srcAddress);
        emit MessageReceivedFromL2(_srcChainId, sourceAdapterAddress, _nonce, _payload);

        // Basic validation: Check if the source adapter is registered for the source LZ chain ID
        bool adapterFound = false;
        // This check is inefficient, better to map LZ Chain ID -> Adapter address directly if possible
        // Or require the L2 Adapter to include its EVM Chain ID in the payload for lookup.
        // For now, just check if the address is *any* registered adapter.
        // A more robust check is needed here based on how l2Adapters is populated.
        // require(l2Adapters[_some_evm_chain_id_corresponding_to_srcChainId] == sourceAdapterAddress, "Unknown source adapter");

        // Decode payload from L2 Adapter's bridgeToSolana
        // Expected format: functionSelector | l2Nullifier | solanaRecipient | sender | amount | tokenId
        require(_payload.length == 4 + 32 + 32 + 20 + 32 + 32, "Invalid L2 payload length");

        bytes4 functionSelector = BytesLib.toBytes4(_payload, 0);
        require(functionSelector == this.handleL2BridgeMessage.selector, "Invalid function selector");

        bytes32 l2Nullifier = BytesLib.toBytes32(_payload, 4);
        bytes32 solanaRecipient = BytesLib.toBytes32(_payload, 36); // 4 + 32
        address l2Sender = BytesLib.toAddress(_payload, 68); // 4 + 32 + 32
        uint256 amount = BytesLib.toUint256(_payload, 88); // 4 + 32 + 32 + 20
        uint256 tokenId = BytesLib.toUint256(_payload, 120); // 4 + 32 + 32 + 20 + 32

        // Process the message using a dedicated handler
        handleL2BridgeMessage(l2Nullifier, solanaRecipient, l2Sender, amount, tokenId);
    }

    /**
     * @notice Receives messages delivered by the Wormhole Core contract.
     * @dev Implements IWormholeReceiver. Handles messages originating from the registered Solana emitter.
     *      This is used for Solana -> Ethereum transfers where the payload contains the commitment.
     * @param payload The message payload bytes sent from the Solana contract.
     * @param additionalVaas An array of additional VAA bytes (potentially unused).
     * @param sourceAddress The address of the sending Solana contract, in Wormhole bytes32 format.
     * @param sourceChain The Wormhole chain ID of the source chain (should be Solana's ID).
     * @param deliveryHash A hash identifying the Wormhole message delivery.
     */
    function receiveWormholeMessages(
        bytes memory payload,
        bytes[] memory additionalVaas, // Keep param even if unused
        bytes32 sourceAddress,
        uint16 sourceChain,
        bytes32 deliveryHash
    ) external payable override onlyWormhole nonReentrant whenNotPaused {
        // Verify the source chain and address match the expected Solana bridge contract
        require(sourceChain == WH_CHAIN_ID_SOLANA, "Invalid source chain");
        require(sourceAddress == solanaEmitterAddress, "Invalid source emitter");

        // Prevent replay attacks using the deliveryHash
        require(!processedWormholeMessages[deliveryHash], "Wormhole message already processed");
        processedWormholeMessages[deliveryHash] = true;

        // Assuming the payload directly contains the commitment generated on Solana
        // A real implementation might require more complex payload parsing (e.g., amount, token, etc.)
        bytes32 commitment = bytes32(payload); // Adjust parsing based on actual Solana payload structure

        // TODO: Add the commitment to an Ethereum-side Merkle tree or equivalent state
        // This commitment will be used later when the user withdraws privately on Ethereum using `receiveFromSolana`.
        // Example: merkleTreeManager.addCommitment(commitment);

        emit CommitmentReceived(sourceChain, sourceAddress, commitment, deliveryHash);
    }

    /**
     * @notice Allows private withdrawal using a ZK proof.
     * @dev Verifies the ZK proof, checks the nullifier, and transfers tokens to the recipient.
     * @param proof The ZK proof bytes.
     * @param root The Merkle root against which the proof was generated.
     * @param nullifierHash The nullifier hash to prevent double spending.
     * @param recipient The recipient address for the withdrawn tokens.
     * @param relayer The address of the relayer submitting the transaction (can be address(0)).
     * @param fee Fee paid to the relayer in the token being withdrawn.
     * @param withdrawalToken The address of the token being withdrawn.
     * @param withdrawalAmount The amount of the token being withdrawn (must match proof).
     */
    function withdraw(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifierHash,
        address recipient,
        address relayer,
        uint256 fee,
        address withdrawalToken, // Need token info for transfer
        uint256 withdrawalAmount // Need amount info for transfer
    ) external payable nonReentrant whenNotPaused { // Payable if ETH withdrawal is supported
        require(recipient != address(0), "Invalid recipient");
        require(nullifierHash != bytes32(0), "Invalid nullifier hash");
        require(merkleTree.isKnownRoot(root), "Invalid Merkle root");
        require(!nullifierHashes[nullifierHash], "Nullifier already used");

        // Prepare public inputs for the verifier
        // Order and content MUST match the circuit's public inputs definition
        uint256[6] memory inputs = [
            uint256(root),
            uint256(nullifierHash),
            uint256(uint160(recipient)), // Cast recipient to uint256
            uint256(uint160(relayer)),   // Cast relayer to uint256
            fee,
            // The circuit likely needs withdrawalAmount and withdrawalToken (or tokenId) as public inputs too.
            // Adjust the input array size and content based on the actual circuit.
            // For now, assuming they are implicitly checked or part of the proof.
            0 // Placeholder for potential 6th input if needed by IVerifier interface
        ];

        // Verify the ZK proof
        require(verifier.verifyProof(proof, inputs), "Invalid ZK proof");

        // Mark nullifier as used
        nullifierHashes[nullifierHash] = true;

        // --- Token Transfer ---
        // This contract needs to hold the tokens deposited via `completeTransfer`.
        uint256 amountToRecipient = withdrawalAmount - fee;
        require(amountToRecipient <= withdrawalAmount, "Fee calculation error"); // Prevent underflow

        IERC20 token = IERC20(withdrawalToken);

        // Transfer net amount to recipient
        token.safeTransfer(recipient, amountToRecipient);

        // Transfer fee to relayer if applicable
        if (relayer != address(0) && fee > 0) {
            token.safeTransfer(relayer, fee);
        }

        emit Withdrawal(recipient, relayer, fee, nullifierHash);
    }

    /**
     * @notice Bridge tokens from EVM to Solana with privacy.
     * @dev Locks tokens in this contract and emits a Wormhole message containing a commitment.
     * @param token The address of the ERC20 token to bridge.
     * @param amount The amount of tokens to bridge.
     * @param solanaRecipientAddress The Solana recipient address (bytes32 format).
     * @param nonce An arbitrary value for uniqueness in the commitment.
     */
    function bridgeToSolana(
        address token,
        uint256 amount,
        bytes32 solanaRecipientAddress, // Renamed for clarity
        uint32 nonce // Used for commitment generation
    ) external payable nonReentrant whenNotPaused { // Payable for Wormhole message fee
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be positive");
        require(solanaRecipientAddress != bytes32(0), "Invalid Solana recipient");

        // 1. Transfer tokens from user to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // 2. Generate Commitment (example structure, adjust as needed)
        //    The commitment should hide recipient, amount, token, nonce, etc.
        //    Requires a secret known only to the user for later withdrawal.
        //    This part needs careful design based on the ZK circuit.
        //    Placeholder: Hash relevant data. User needs to provide secret off-chain.
        bytes32 commitment = keccak256(abi.encodePacked(
            solanaChainId, // Target chain
            solanaRecipientAddress,
            token,
            amount,
            nonce,
            block.chainid // Source chain
            // Add a secret component here derived off-chain by the user
        ));

        // 3. Publish Wormhole Message with Commitment
        uint256 cost = wormhole.messageFee();
        require(msg.value >= cost, "Insufficient fee for Wormhole message");

        // The payload sent to Solana should contain the commitment.
        bytes memory messagePayload = abi.encode(commitment);

        uint64 sequence = wormhole.publishMessage{value: cost}(
            nonce, // Use provided nonce for Wormhole message
            messagePayload,
            uint8(1) // Consistency level (e.g., 1 for finalized) - choose appropriately
        );

        emit BridgeToSolanaInitiated(msg.sender, token, amount, solanaRecipientAddress, nonce, sequence);
    }

    /**
     * @notice Completes a token transfer initiated from Solana via the Wormhole Token Bridge.
     * @dev Verifies the VAA comes from the Solana Token Bridge and calls the local Token Bridge's completeTransfer.
     *      This function allows the SolanaVeilBridge to receive bridged assets.
     * @param encodedVaa The encoded VAA containing transfer information from the Solana Token Bridge.
     */
    function completeTransfer(bytes memory encodedVaa) external payable whenNotPaused {
        // Verify the VAA is from the Solana Token Bridge
        IWormhole.VM memory parsedVaa = _verifyVaa(encodedVaa);

        // Get the emitter address of the Token Bridge on Solana
        // This needs to be fetched or configured. Assuming it's stored or derivable.
        bytes32 solanaTokenBridgeEmitter = bytes32(tokenBridge.bridgeContracts(solanaChainId)); // Get Solana TB address
        require(solanaTokenBridgeEmitter != bytes32(0), "Solana Token Bridge not registered");

        require(parsedVaa.emitterAddress == solanaTokenBridgeEmitter, "VAA not from Solana Token Bridge");
        require(parsedVaa.emitterChainId == solanaChainId, "Invalid source chain for Token Bridge VAA");

        // Call the local Wormhole Token Bridge to complete the transfer
        // The tokens will be credited to this SolanaVeilBridge contract.
        tokenBridge.completeTransfer{value: msg.value}(encodedVaa);
    }

    // === Internal/Helper Functions ===

    /**
     * @notice Internal handler for messages received from L2 Adapters (via LayerZero)
     * @dev Decodes payload and marks L2 nullifier as used.
     *      Assumes `amount` is the NET amount after fees were deducted on L2.
     */
    function handleL2BridgeMessage(
        bytes32 l2Nullifier,
        bytes32 solanaRecipient,
        address l2Sender, // Original sender on L2
        uint256 amount, // NET amount
        uint256 tokenId
    ) internal nonReentrant { // Keep internal
        require(!processedL2Nullifiers[l2Nullifier], "L2 Nullifier already used");
        address tokenAddress = supportedTokens[tokenId];
        require(tokenAddress != address(0), "Token not supported");
        // No fee calculation needed here, it was done on L2.

        processedL2Nullifiers[l2Nullifier] = true;

        // Emit event for Solana relayers
        emit BridgeInitiated(
            l2Sender, // Use original L2 sender address
            amount, // Use the net amount received from L2
            l2Nullifier, // Use the nullifier generated on L2
            solanaRecipient,
            tokenId
        );
    }

    /**
     * @notice Helper function to convert address to bytes32 format used by Wormhole.
     * @param addr The address to convert.
     * @return The address in bytes32 format.
     */
    function addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    function bytesToAddress(bytes calldata _bytes) internal pure returns (address) {
        return address(BytesLib.toUint160(BytesLib.toBytes32(_bytes, 0), 12));
    }

    /**
     * @notice Verifies a VAA using the Wormhole Core Contract.
     * @param encodedVaa The encoded VAA bytes.
     * @return parsedVaa The parsed VAA data if valid.
     */
    function _verifyVaa(bytes memory encodedVaa) internal view returns (IWormhole.VM memory parsedVaa) {
        (parsedVaa, bool valid, string memory reason) = wormhole.parseAndVerifyVM(encodedVaa);
        require(valid, reason);
        // Additional checks like guardian set index can be added here if needed
        return parsedVaa;
    }

    // === Admin Functions ===

    /**
     * @notice Configure a token for bridging
     * @param tokenId ID of the token to configure
     * @param tokenAddress Address of the ERC20 token contract
     * @param minAmount Minimum amount that can be bridged
     * @param maxAmount Maximum amount that can be bridged
     * @param enabled Whether the token is enabled for bridging
     */
    function configureToken(
        uint256 tokenId,
        address tokenAddress,
        uint256 minAmount,
        uint256 maxAmount,
        bool enabled
    ) external onlyOwner {
        require(tokenAddress != address(0), "Invalid token address");
        require(minAmount <= maxAmount, "Min amount exceeds max amount");
        
        supportedTokens[tokenId] = tokenAddress;
        tokenConfigs[tokenId] = TokenConfig({
            enabled: enabled,
            minAmount: minAmount,
            maxAmount: maxAmount
        });
        
        // Approve the vault to use this token if newly added
        if (IERC20(tokenAddress).allowance(address(this), address(vault)) == 0) {
            IERC20(tokenAddress).approve(address(vault), type(uint256).max);
        }
        
        emit TokenConfigured(tokenId, tokenAddress, minAmount, maxAmount, enabled);
    }
    
    /**
     * @notice Remove a relayer from the registered list
     * @param relayer Address of the relayer to remove
     */
    function removeRelayer(address relayer) external onlyOwner {
        require(registeredRelayers[relayer], "Not a registered relayer");
        
        registeredRelayers[relayer] = false;
        
        emit RelayerRemoved(relayer);
    }
    
    /**
     * @notice Update the treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury address");
        treasury = newTreasury;
        
        emit TreasuryUpdated(newTreasury);
    }
    
    /**
     * @notice Pause the bridge in case of emergency
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause the bridge after emergency is resolved
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Check if a nullifier has been used (for L1 -> L2/Solana proofs)
     * @param nullifier The nullifier to check
     * @return Whether the nullifier has been used
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return processedNullifiers[nullifier];
    }

    /**
     * @notice Check if a Wormhole message delivery hash has been processed (for Solana -> L1 messages)
     * @param deliveryHash The Wormhole delivery hash to check
     * @return Whether the message has been processed
     */
    function isWormholeMessageProcessed(bytes32 deliveryHash) external view returns (bool) {
        return processedWormholeMessages[deliveryHash];
    }


    /**
     * @notice Configure an L2 adapter for a specific L2 chain (LayerZero)
     * @param _l2ChainId EVM Chain ID of the L2 network
     * @param _adapterAddress Address of the LayerZeroAdapter contract on L2
     * @param _l2LzChainId LayerZero Chain ID for the L2 network
     */
    function setL2Adapter(uint16 _l2ChainId, address _adapterAddress, uint16 _l2LzChainId) external onlyOwner {
        require(_l2ChainId != 0, "Invalid L2 Chain ID");
        require(_adapterAddress != address(0), "Invalid Adapter Address");
        require(_l2LzChainId != 0, "Invalid L2 LZ Chain ID");

        l2Adapters[_l2ChainId] = _adapterAddress;
        l2LzChainIds[_l2ChainId] = _l2LzChainId;

        // Allow the L1 LZ Endpoint to call this contract
        // This might need to be done only once per endpoint
        // lzEndpoint.setReceiveVersion(1); // Or appropriate version
        // lzEndpoint.setConfig(_l2LzChainId, abi.encodePacked(_adapterAddress), 2, abi.encodePacked(uint(200000))); // Example config

        emit L2AdapterSet(_l2ChainId, _adapterAddress, _l2LzChainId);
    }

    /**
     * @notice Set the target bridging fee in USD cents.
     * @param _newTargetFeeUSD The new fee target (e.g., 150 for $1.50)
     */
    function setTargetFeeUSD(uint256 _newTargetFeeUSD) external onlyOwner {
        targetFeeUSD = _newTargetFeeUSD;
        emit TargetFeeSet(_newTargetFeeUSD);
    }

    /**
     * @notice Set the Pyth Price Feed ID for a given token ID.
     * @param _tokenId The internal token ID
     * @param _priceId The Pyth Price Feed ID (bytes32)
     */
    function setTokenPriceId(uint256 _tokenId, bytes32 _priceId) external onlyOwner {
        require(supportedTokens[_tokenId] != address(0), "Token not configured");
        tokenIdToPriceId[_tokenId] = _priceId;
        emit TokenPriceIdSet(_tokenId, _priceId);
    }

    /**
     * @notice Set the address of the Wormhole Relayer contract on L1.
     * @dev Used for L1 <-> L2 communication via Wormhole Relayer pattern (if used).
     * @param _relayerAddress The address of the IWormholeRelayer contract.
     */
    function setWormholeRelayer(address _relayerAddress) external onlyOwner {
        require(_relayerAddress != address(0), "Invalid relayer address");
        wormholeRelayerAddress = _relayerAddress;
        emit WormholeRelayerSet(_relayerAddress);
    }

    /**
     * @notice Register an L2 Adapter contract as a valid sender for Wormhole messages (Relayer Pattern).
     * @param _sourceChainId Wormhole Chain ID of the L2 network.
     * @param _sourceAddress Address of the L2 Adapter contract in bytes32 format.
     */
    function registerWormholeSender(uint16 _sourceChainId, bytes32 _sourceAddress) external onlyOwner {
        require(_sourceChainId != 0, "Invalid source chain ID");
        require(_sourceAddress != bytes32(0), "Invalid source address");
        require(!registeredWormholeSenders[_sourceChainId][_sourceAddress], "Sender already registered");

        registeredWormholeSenders[_sourceChainId][_sourceAddress] = true;
        emit WormholeSenderRegistered(_sourceChainId, _sourceAddress);
    }

    /**
     * @notice Deregister an L2 Adapter contract (Relayer Pattern).
     * @param _sourceChainId Wormhole Chain ID of the L2 network.
     * @param _sourceAddress Address of the L2 Adapter contract in bytes32 format.
     */
    function deregisterWormholeSender(uint16 _sourceChainId, bytes32 _sourceAddress) external onlyOwner {
        require(registeredWormholeSenders[_sourceChainId][_sourceAddress], "Sender not registered");

        registeredWormholeSenders[_sourceChainId][_sourceAddress] = false;
        emit WormholeSenderDeregistered(_sourceChainId, _sourceAddress);
    }

    /**
     * @notice Set the expected Solana emitter address for Wormhole messages (Core Pattern).
     * @param _emitterAddress The emitter address of the Solana bridge contract (bytes32).
     */
    function setSolanaEmitter(bytes32 _emitterAddress) external onlyOwner {
        require(_emitterAddress != bytes32(0), "Invalid emitter address");
        solanaEmitterAddress = _emitterAddress;
        emit SolanaEmitterSet(_emitterAddress);
    }

    /**
     * @notice Set the Wormhole Token Bridge contract address.
     * @param _tokenBridgeAddress The address of the IWormholeTokenBridge contract.
     */
    function setWormholeTokenBridge(address _tokenBridgeAddress) external onlyOwner {
        require(_tokenBridgeAddress != address(0), "Invalid token bridge address");
        wormholeTokenBridge = IWormholeTokenBridge(_tokenBridgeAddress);
        emit WormholeTokenBridgeSet(_tokenBridgeAddress);
    }

    // Emergency withdrawal function (use with extreme caution)
    function emergencyWithdraw(address tokenAddress, address recipient, uint256 amount) external onlyOwner nonReentrant {
         require(tokenAddress != address(0) && recipient != address(0) && amount > 0, "Invalid params");
         IERC20(tokenAddress).safeTransfer(recipient, amount);
     }

    // === View Functions ===

    function getMerkleRoot() external view returns (bytes32) {
        return merkleTree.getRoot();
    }

    function getMerkleTreeInfo() external view returns (uint32 height, uint32 filledSubtrees, uint32 currentRootIndex, uint32 nextIndex) {
        return merkleTree.getTreeInfo();
    }

    function isKnownMerkleRoot(bytes32 _root) external view returns (bool) {
        return merkleTree.isKnownRoot(_root);
    }
}