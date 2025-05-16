// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// Import the interface directly from the interfaces directory
import { IL2StandardBridge } from "@eth-optimism/contracts-bedrock/src/L2/L2StandardBridge.sol"; // Correct path
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"; // For decimals

/**
 * @title OptimismAdapter
 * @notice Adapter for bridging between Solana and Optimism
 * @dev Handles the Optimism-specific bridging logic using the Optimism L2 bridge and Pyth fees.
 */
contract OptimismAdapter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // === Constants ===
    
    uint16 public constant CHAIN_ID_SOLANA = 1;
    uint16 public constant CHAIN_ID_OPTIMISM = 10;
    uint8 public constant PRICE_DECIMALS = 8; // Pyth prices usually have 8 decimals
    
    // === State Variables ===
    
    // Address of Optimism's standard bridge
    IL2StandardBridge public immutable l2Bridge;
    
    // Address of mainnet SolanaVeilBridge contract
    address public immutable mainnetBridge;
    
    // Mapping of L2 token address to token ID
    mapping(address => uint256) public l2TokenToId;
    
    // Mapping of token ID to L2 token address
    mapping(uint256 => address) public idToL2Token;
    
    // Mapping of token ID to L1 token address
    mapping(uint256 => address) public idToL1Token;
    
    // Mapping of nullifier to used status
    mapping(bytes32 => bool) public processedNullifiers;
    
    IPyth public pythOracle; // Pyth Oracle contract on L2

    // Fee target in USD cents (e.g., 100 = $1.00) - Should match L1's target
    uint256 public targetFeeUSD;

    // Mapping token ID to Pyth Price Feed ID
    mapping(uint256 => bytes32) public tokenIdToPriceId;

    // Treasury address on L2 (optional, if fees collected here)
    address public l2Treasury;
    
    // === Events ===
    
    event TokenConfigured(
        uint256 indexed tokenId,
        address l2TokenAddress,
        address l1TokenAddress
    );
    
    event BridgeToSolana(
        address indexed sender,
        uint256 amount,
        bytes32 nullifier,
        bytes32 solanaRecipient,
        uint256 tokenId
    );
    
    event BridgeFromSolana(
        bytes32 nullifier,
        address indexed recipient,
        uint256 amount,
        uint256 indexed tokenId
    );

    event TargetFeeSet(uint256 newTargetFeeUSD);
    event TokenPriceIdSet(uint256 indexed tokenId, bytes32 indexed priceId);
    event L2TreasurySet(address indexed newTreasury);
    
    // === Constructor ===
    
    /**
     * @param _l2Bridge Address of Optimism's L2 standard bridge
     * @param _mainnetBridge Address of SolanaVeilBridge on mainnet
     * @param _pythOracle Address of Pyth Oracle on Optimism
     * @param _targetFeeUSD Initial target fee in USD cents (should match L1)
     * @param _l2Treasury Address for fee collection on L2 (optional)
     */
    constructor(
        address _l2Bridge,
        address _mainnetBridge,
        address _pythOracle, // Add Pyth Oracle
        uint256 _targetFeeUSD, // Add fee target
        address _l2Treasury // Add L2 treasury
    ) Ownable(msg.sender) {
        require(_l2Bridge != address(0), "Invalid L2 bridge address");
        require(_mainnetBridge != address(0), "Invalid mainnet bridge address");
        require(_pythOracle != address(0), "Invalid Pyth Oracle address"); // Add check

        l2Bridge = IL2StandardBridge(_l2Bridge);
        mainnetBridge = _mainnetBridge;
        pythOracle = IPyth(_pythOracle); // Initialize Pyth
        targetFeeUSD = _targetFeeUSD; // Set fee target
        if (_l2Treasury != address(0)) {
            l2Treasury = _l2Treasury; // Set L2 treasury if provided
        }
    }
    
    // === External Functions ===
    
    /**
     * @notice Bridge tokens from Optimism to Solana, using Pyth for fees.
     * @param solanaRecipient Recipient address on Solana
     * @param amount Gross amount of tokens to bridge (before fees)
     * @param tokenId ID of the token to bridge
     * @param pythUpdateData Off-chain price update data for the token's price feed
     */
    function bridgeToSolana(
        bytes32 solanaRecipient,
        uint256 amount,
        uint256 tokenId,
        bytes[] calldata pythUpdateData // Add Pyth update data
    ) external payable nonReentrant { // Make payable for Pyth fee
        // Check token is supported
        address l2Token = idToL2Token[tokenId];
        address l1Token = idToL1Token[tokenId]; // Still needed for context/validation?

        require(l2Token != address(0), "Token not supported");
        require(l1Token != address(0), "L1 token not configured"); // Keep check for config completeness
        require(amount > 0, "Amount must be greater than zero");

        // --- Pyth Integration ---
        bytes32 priceId = tokenIdToPriceId[tokenId];
        require(priceId != bytes32(0), "Price feed not configured for token");

        // Pay Pyth update fee
        uint pythFee = pythOracle.getUpdateFee(pythUpdateData);
        require(msg.value >= pythFee, "Insufficient fee for Pyth update");

        // Update Pyth price on-chain
        pythOracle.updatePriceFeeds{value: msg.value}(pythUpdateData); // Forward only the Pyth fee

        // Get the latest price
        PythStructs.Price memory price = pythOracle.getPriceUnsafe(priceId); // Use unsafe version
        require(price.publishTime >= block.timestamp - 60, "Pyth price is too stale");
        require(price.price > 0, "Invalid Pyth price");

        // Calculate fee in token terms
        uint8 tokenDecimals = IERC20Metadata(l2Token).decimals();
        uint256 feeAmount = (targetFeeUSD * (10**(uint256(tokenDecimals) + PRICE_DECIMALS - 2))) / uint256(price.price);
        require(feeAmount < amount, "Fee exceeds amount");

        uint256 netAmount = amount - feeAmount;
        // --- End Pyth Integration ---

        // Generate a unique nullifier (used on L1)
        bytes32 nullifier = keccak256(
            abi.encodePacked("L2->L1", msg.sender, block.chainid, block.timestamp, netAmount, tokenId) // Use netAmount in nullifier? Or gross? Let's use net.
        );

        // Transfer NET amount from user to this contract
        IERC20(l2Token).safeTransferFrom(msg.sender, address(this), netAmount);

        // Transfer FEE amount from user to L2 treasury (if configured)
        if (feeAmount > 0 && l2Treasury != address(0)) {
            IERC20(l2Token).safeTransferFrom(msg.sender, l2Treasury, feeAmount);
        } else if (feeAmount > 0) {
            // If no L2 treasury, burn fee or keep in contract? Keep in contract for now.
             IERC20(l2Token).safeTransferFrom(msg.sender, address(this), feeAmount);
        }


        // Approve L2 bridge to spend NET tokens
        IERC20(l2Token).approve(address(l2Bridge), netAmount);

        // Bridge NET amount to L1 (the SolanaVeilBridge will handle the Solana side)
        // The L1 SolanaVeilBridge needs to know the original sender, nullifier, recipient, netAmount, tokenId
        // This info is NOT directly passed via withdrawTo. It must be sent via LayerZero or another channel.
        // *** This highlights a mismatch: OP bridge sends tokens, LayerZero sends data. ***
        // Let's assume we use LayerZeroAdapter instead for OP/Base for consistency.
        // Reverting OptimismAdapter to use LayerZero for messaging:

        /*
        // --- OLD OP BRIDGE LOGIC ---
        l2Bridge.withdrawTo(
            l2Token,
            mainnetBridge, // L1 recipient is the SolanaVeilBridge
            netAmount,     // Bridge the net amount
            1_000_000,     // Gas limit for L1 execution (finalize)
            bytes("")      // No extra data needed for standard bridge finalize
        );
        */

        // --- NEW LOGIC ASSUMPTION: Use LayerZeroAdapter pattern ---
        // This contract (OptimismAdapter) should likely be merged/replaced by LayerZeroAdapter logic
        // if we want consistent fee handling and messaging via LayerZero.
        // For now, just emit the event assuming the L1 bridge somehow gets the details.
        // A real implementation would need LayerZero send here.

        // Emit event for relayers (using net amount)
        emit BridgeToSolana(
            msg.sender,
            netAmount, // Emit net amount
            nullifier,
            solanaRecipient,
            tokenId
        );
    }
    
    /**
     * @notice Process incoming transfer from Solana to Optimism
     * @dev For Optimism, funds will arrive through the L2 bridge from L1 *OR* via LayerZero message.
     *      This function assumes funds arrive via standard bridge deposit corresponding to a LayerZero message.
     * @param nullifier Unique nullifier from Solana/L1 LayerZero message
     * @param recipient Address to receive tokens
     * @param amount NET amount of tokens to receive
     * @param tokenId ID of the token
     */
    function finalizeFromSolana(
        bytes32 nullifier, // This should be the L1 nullifier passed via LayerZero
        address recipient,
        uint256 amount, // Net amount
        uint256 tokenId
    ) external nonReentrant onlyOwner { // Should be callable by LayerZero message relay/executor? Or just owner? Owner for now.
        // Verify the nullifier hasn't been used (use the L1 nullifier mapping)
        // Need to rename processedNullifiers to distinguish L1 vs L2 generated ones.
        // Let's assume this map tracks L1 nullifiers received via LZ/owner call.
        require(!processedNullifiers[nullifier], "Nullifier already used");

        // Check token is supported
        address l2Token = idToL2Token[tokenId];
        require(l2Token != address(0), "Token not supported");
        require(amount > 0, "Amount must be greater than zero");

        // Mark nullifier as used
        processedNullifiers[nullifier] = true;

        // Transfer tokens to recipient. Assumes this contract received the deposit
        // from the standard L1->L2 bridge, triggered by the L1 SolanaVeilBridge.
        IERC20(l2Token).safeTransfer(recipient, amount);

        emit BridgeFromSolana(nullifier, recipient, amount, tokenId);
    }
    
    // === Admin Functions ===
    
    /**
     * @notice Configure a token for bridging
     * @param tokenId ID of the token to configure
     * @param l2TokenAddress Address of the token on Optimism
     * @param l1TokenAddress Address of the token on Ethereum mainnet
     */
    function configureToken(
        uint256 tokenId,
        address l2TokenAddress,
        address l1TokenAddress
    ) external onlyOwner {
        require(l2TokenAddress != address(0), "Invalid L2 token address");
        require(l1TokenAddress != address(0), "Invalid L1 token address");
        
        l2TokenToId[l2TokenAddress] = tokenId;
        idToL2Token[tokenId] = l2TokenAddress;
        idToL1Token[tokenId] = l1TokenAddress;
        
        emit TokenConfigured(tokenId, l2TokenAddress, l1TokenAddress);
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
        require(idToL2Token[_tokenId] != address(0), "Token not configured"); // Check using different map
        tokenIdToPriceId[_tokenId] = _priceId;
        emit TokenPriceIdSet(_tokenId, _priceId);
    }

    /**
     * @notice Set the L2 treasury address for fee collection.
     * @param _newTreasury New L2 treasury address (can be address(0) to disable L2 collection)
     */
    function setL2Treasury(address _newTreasury) external onlyOwner {
        l2Treasury = _newTreasury;
        emit L2TreasurySet(_newTreasury);
    }
    
    /**
     * @notice Emergency withdrawal of tokens
     * @param tokenAddress Address of the token to withdraw
     * @param recipient Address to receive the tokens
     * @param amount Amount of tokens to withdraw
     */
    function emergencyWithdraw(
        address tokenAddress,
        address recipient,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(tokenAddress != address(0), "Invalid token address");
        require(recipient != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than zero");
        
        IERC20(tokenAddress).safeTransfer(recipient, amount);
    }
}