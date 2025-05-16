// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"; // For decimals
import "../interfaces/IWormholeTokenBridge.sol"; // Assuming interface definition exists
import "../interfaces/IWormholeRelayer.sol"; // Import Relayer interface
import "../interfaces/IWormhole.sol"; // Import Core Bridge interface (for messageFee)

/**
 * @title WormholeAdapter
 * @notice Adapter for bridging from L2 to Solana via L1 using Wormhole Relayer pattern.
 * @dev Resides on L2. Uses Wormhole Relayer SDK concepts and Pyth fees.
 */
contract WormholeAdapter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // === Constants ===
    uint16 public constant WH_CHAIN_ID_SOLANA = 1;
    uint16 public constant WH_CHAIN_ID_ETHEREUM = 2; // Wormhole Chain ID for L1 Ethereum
    uint8 public constant PRICE_DECIMALS = 8; // Pyth prices usually have 8 decimals
    uint256 public constant GAS_LIMIT = 250_000; // Default gas limit for delivery

    // === State Variables ===
    IWormholeTokenBridge public immutable whTokenBridge; // Keep for potential direct interaction? Or remove if only using Relayer? Keep for now.
    IWormholeRelayer public immutable wormholeRelayer; // Wormhole Relayer contract
    IWormhole public immutable wormhole; // Wormhole Core contract (for messageFee)
    address public immutable mainnetBridge; // Address of SolanaVeilBridge on L1
    IPyth public pythOracle; // Pyth Oracle contract on L2

    // Fee target in USD cents (e.g., 100 = $1.00) - Should match L1's target
    uint256 public targetFeeUSD;

    // Token mappings (L2 specific)
    mapping(address => uint256) public l2TokenToId;
    mapping(uint256 => address) public idToL2Token;
    mapping(uint256 => bytes32) public tokenIdToPriceId; // Pyth Price Feed ID

    // Treasury address on L2 (optional, if fees collected here)
    address public l2Treasury;

    // Nullifier tracking for messages received FROM L1 (if applicable via Wormhole)
    mapping(bytes32 => bool) public processedL1Nullifiers;

    // === Events ===
    event TokenConfigured(uint256 indexed tokenId, address l2TokenAddress);
    event BridgeToSolanaInitiated(address indexed sender, uint256 netAmount, bytes32 l2Nullifier, bytes32 solanaRecipient, uint256 tokenId, uint64 sequence); // Added sequence
    event BridgeFromSolanaFinalized(bytes32 l1Nullifier, address indexed recipient, uint256 amount, uint256 indexed tokenId); // Keep for potential L1->L2 flow
    event TargetFeeSet(uint256 newTargetFeeUSD);
    event TokenPriceIdSet(uint256 indexed tokenId, bytes32 indexed priceId);
    event L2TreasurySet(address indexed newTreasury);

    /**
     * @param _whTokenBridge Address of the Wormhole Token Bridge on this L2
     * @param _wormholeRelayer Address of the Wormhole Relayer contract on this L2
     * @param _wormhole Address of the Wormhole Core contract on this L2
     * @param _mainnetBridge Address of SolanaVeilBridge on L1
     * @param _pythOracle Address of Pyth Oracle on this L2
     * @param _targetFeeUSD Initial target fee in USD cents (should match L1)
     * @param _l2Treasury Address for fee collection on L2 (optional)
     */
    constructor(
        address _whTokenBridge,
        address _wormholeRelayer, // Add Relayer
        address _wormhole,        // Add Core
        address _mainnetBridge,
        address _pythOracle,
        uint256 _targetFeeUSD,
        address _l2Treasury
    ) Ownable(msg.sender) {
        require(_whTokenBridge != address(0), "Invalid WH Token Bridge");
        require(_wormholeRelayer != address(0), "Invalid WH Relayer"); // Add check
        require(_wormhole != address(0), "Invalid WH Core");           // Add check
        require(_mainnetBridge != address(0), "Invalid mainnet bridge");
        require(_pythOracle != address(0), "Invalid Pyth Oracle");

        whTokenBridge = IWormholeTokenBridge(_whTokenBridge);
        wormholeRelayer = IWormholeRelayer(_wormholeRelayer); // Initialize Relayer
        wormhole = IWormhole(_wormhole);                     // Initialize Core
        mainnetBridge = _mainnetBridge;
        pythOracle = IPyth(_pythOracle);
        targetFeeUSD = _targetFeeUSD;
        if (_l2Treasury != address(0)) {
            l2Treasury = _l2Treasury;
        }
    }

    /**
     * @notice Estimate the total cost (native currency) for bridging tokens via Wormhole Relayer.
     * @param targetChain Wormhole Chain ID of the target chain (L1 Ethereum).
     * @return cost Total estimated cost in native currency.
     */
    function quoteCrossChainDeposit(
        uint16 targetChain
    ) public view returns (uint256 cost) {
        // Quote the EVM delivery price using the relayer
        (uint256 deliveryCost, ) = wormholeRelayer.quoteEVMDeliveryPrice(
            targetChain,
            0, // receiverValue - L1 bridge doesn't need value attached in receiveWormholeMessages
            GAS_LIMIT
        );

        // Get the Wormhole message publication fee
        uint256 messageFee = wormhole.messageFee();

        // Total cost is delivery cost + message fee
        cost = deliveryCost + messageFee;
    }


    /**
     * @notice Bridge tokens from this L2 to Solana via L1 using Wormhole Relayer.
     * @param solanaRecipient Recipient address on Solana (bytes32)
     * @param amount Gross amount of tokens to bridge (before Pyth fees)
     * @param tokenId ID of the token
     * @param pythUpdateData Off-chain price update data for the token's price feed
     * @param nonce DEPRECATED - Nonce is handled by the relayer/token bridge sequence. Remove if not needed elsewhere.
     */
    function bridgeToSolana(
        bytes32 solanaRecipient,
        uint256 amount,
        uint256 tokenId,
        bytes[] calldata pythUpdateData
        // uint32 nonce // Remove nonce if using relayer sequence
    ) external payable nonReentrant {
        address l2Token = idToL2Token[tokenId];
        require(l2Token != address(0), "Token not supported");
        require(amount > 0, "Amount must be > 0");

        // --- Pyth Fee Calculation ---
        // ... (Pyth fee calculation logic remains the same) ...
        bytes32 priceId = tokenIdToPriceId[tokenId];
        require(priceId != bytes32(0), "Price feed not configured");
        uint pythFee = pythOracle.getUpdateFee(pythUpdateData);
        // Note: msg.value needs to cover BOTH Pyth fee AND Wormhole Relayer cost
        // We calculate Wormhole cost later.

        pythOracle.updatePriceFeeds{value: pythFee}(pythUpdateData); // Pay Pyth fee first

        PythStructs.Price memory price = pythOracle.getPriceUnsafe(priceId);
        require(price.publishTime >= block.timestamp - 60, "Pyth price stale");
        require(price.price > 0, "Invalid Pyth price");
        uint8 tokenDecimals = IERC20Metadata(l2Token).decimals();
        uint256 feeAmount = (targetFeeUSD * (10**(uint256(tokenDecimals) + PRICE_DECIMALS - 2))) / uint256(price.price);
        require(feeAmount < amount, "Fee exceeds amount");
        uint256 netAmount = amount - feeAmount;
        // --- End Pyth Fee Calculation ---

        // --- Wormhole Relayer Fee Calculation ---
        uint256 wormholeCost = quoteCrossChainDeposit(WH_CHAIN_ID_ETHEREUM);
        require(msg.value >= pythFee + wormholeCost, "Insufficient fee for Pyth and Wormhole");
        // --- End Wormhole Relayer Fee Calculation ---

        // Generate L2 Nullifier
        bytes32 l2Nullifier = keccak256(abi.encodePacked("L2->L1", msg.sender, block.chainid, block.timestamp, netAmount, tokenId));

        // Transfer NET amount from user to this contract
        IERC20(l2Token).safeTransferFrom(msg.sender, address(this), netAmount);

        // Transfer Pyth FEE amount
        if (feeAmount > 0 && l2Treasury != address(0)) {
            IERC20(l2Token).safeTransferFrom(msg.sender, l2Treasury, feeAmount);
        } else if (feeAmount > 0) {
            IERC20(l2Token).safeTransferFrom(msg.sender, address(this), feeAmount);
        }

        // Approve the Wormhole Relayer contract to spend the NET tokens
        // The relayer contract will internally call the token bridge.
        IERC20(l2Token).approve(address(wormholeRelayer), netAmount);

        // Prepare payload for L1 SolanaVeilBridge (receiveWormholeMessages)
        // Format: l2Nullifier | solanaRecipient | l2Sender | netAmount | tokenId
        bytes memory bridgePayload = abi.encode(
            l2Nullifier,
            solanaRecipient,
            msg.sender, // Original L2 sender
            netAmount,
            tokenId
        );

        // Initiate Wormhole transfer via the Relayer
        // This handles token locking via Token Bridge and message publication.
        // Pass the wormholeCost as msg.value to the relayer call.
        uint64 sequence = wormholeRelayer.sendTokenWithPayloadToEvm{value: wormholeCost}(
            WH_CHAIN_ID_ETHEREUM, // Target Chain: L1 Ethereum
            mainnetBridge,        // Target Address: L1 SolanaVeilBridge
            bridgePayload,        // Payload for the L1 bridge's receiveWormholeMessages
            0,                    // receiverValue for L1 bridge (not needed)
            GAS_LIMIT,            // Gas limit for L1 execution
            l2Token,              // Token address on this L2
            netAmount             // Net amount to transfer
        );

        emit BridgeToSolanaInitiated(msg.sender, netAmount, l2Nullifier, solanaRecipient, tokenId, sequence);
    }

    /**
     * @notice Finalize bridge from Solana (via L1 Wormhole message)
     * @dev This function would be called after verifying a VAA originating from L1.
     *      Requires a mechanism to receive and verify VAAs on L2.
     * @param l1Nullifier Nullifier from the L1->L2 message
     * @param recipient Final recipient on L2
     * @param amount Net amount transferred
     * @param tokenId Token ID
     */
    function finalizeFromSolana(
        bytes32 l1Nullifier,
        address recipient,
        uint256 amount,
        uint256 tokenId
        // bytes calldata encodedVaa // VAA would likely be passed here
    ) external nonReentrant onlyOwner { // Restrict access (e.g., only owner or authorized relayer)
        // TODO: Implement VAA verification using L2 Wormhole Core Bridge if needed for L1->L2 flow

        require(!processedL1Nullifiers[l1Nullifier], "L1 Nullifier already used");
        address l2Token = idToL2Token[tokenId];
        require(l2Token != address(0), "Token not supported");
        require(amount > 0, "Amount must be > 0");

        processedL1Nullifiers[l1Nullifier] = true;

        // Assumes tokens were deposited via Wormhole's completeTransfer mechanism
        // This contract might need to call completeTransfer or hold the tokens.
        // Assuming this contract holds the tokens for simplicity:
        IERC20(l2Token).safeTransfer(recipient, amount);

        emit BridgeFromSolanaFinalized(l1Nullifier, recipient, amount, tokenId);
    }

    // === Admin Functions ===
    function configureToken(uint256 tokenId, address l2TokenAddress) external onlyOwner {
        require(l2TokenAddress != address(0), "Invalid L2 token");
        l2TokenToId[l2TokenAddress] = tokenId;
        idToL2Token[tokenId] = l2TokenAddress;
        emit TokenConfigured(tokenId, l2TokenAddress);
    }

    function setTargetFeeUSD(uint256 _newTargetFeeUSD) external onlyOwner {
        targetFeeUSD = _newTargetFeeUSD;
        emit TargetFeeSet(_newTargetFeeUSD);
    }

    function setTokenPriceId(uint256 _tokenId, bytes32 _priceId) external onlyOwner {
        require(idToL2Token[_tokenId] != address(0), "Token not configured");
        tokenIdToPriceId[_tokenId] = _priceId;
        emit TokenPriceIdSet(_tokenId, _priceId);
    }

    function setL2Treasury(address _newTreasury) external onlyOwner {
        l2Treasury = _newTreasury;
        emit L2TreasurySet(_newTreasury);
    }

    function emergencyWithdraw(address tokenAddress, address recipient, uint256 amount) external onlyOwner nonReentrant {
        require(tokenAddress != address(0) && recipient != address(0) && amount > 0, "Invalid params");
        IERC20(tokenAddress).safeTransfer(recipient, amount);
    }
}
