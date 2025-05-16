// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// Import from the correct Bedrock package name
import { IL2StandardBridge } from "@eth-optimism/contracts-bedrock/src/L2/L2StandardBridge.sol";

/**
 * @title BaseAdapter
 * @notice Adapter for bridging between Solana and Base (using Bedrock contracts)
 * @dev Handles the Base-specific bridging logic using the Base L2 bridge (OP Stack based)
 */
contract BaseAdapter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // === Constants ===
    
    uint16 public constant CHAIN_ID_SOLANA = 1;
    uint16 public constant CHAIN_ID_BASE = 8453;
    
    // === State Variables ===
    
    // Address of Base's L2 standard bridge (using Bedrock interface)
    IL2StandardBridge public immutable l2Bridge; // Changed type to IL2StandardBridge
    
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
    
    // === Constructor ===
    
    /**
     * @param _l2Bridge Address of Base's L2 standard bridge
     * @param _mainnetBridge Address of SolanaVeilBridge on mainnet
     */
    constructor(
        address _l2Bridge,
        address _mainnetBridge
    ) Ownable(msg.sender) {
        require(_l2Bridge != address(0), "Invalid L2 bridge address");
        require(_mainnetBridge != address(0), "Invalid mainnet bridge address");
        
        // The standard L2 bridge address on Base (mainnet and testnet) is:
        // 0x4200000000000000000000000000000000000010
        // This address is a predeploy and is the same on all OP Stack chains
        l2Bridge = IL2StandardBridge(_l2Bridge);
        mainnetBridge = _mainnetBridge;
    }
    
    // === External Functions ===
    
    /**
     * @notice Bridge tokens from Base to Solana
     * @param solanaRecipient Recipient address on Solana
     * @param amount Amount of tokens to bridge
     * @param tokenId ID of the token to bridge
     */
    function bridgeToSolana(
        bytes32 solanaRecipient,
        uint256 amount,
        uint256 tokenId
    ) external nonReentrant {
        // Check token is supported
        address l2Token = idToL2Token[tokenId];
        address l1Token = idToL1Token[tokenId];
        
        require(l2Token != address(0), "Token not supported");
        require(l1Token != address(0), "L1 token not configured");
        require(amount > 0, "Amount must be greater than zero");
        
        // Generate a unique nullifier
        bytes32 nullifier = keccak256(
            abi.encodePacked(msg.sender, block.timestamp, amount, tokenId)
        );
        
        // Transfer tokens from user to this contract
        IERC20(l2Token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Approve L2 bridge to spend tokens
        IERC20(l2Token).approve(address(l2Bridge), amount);
        
        // IMPORTANT: When bridging from Base (L2) to Ethereum (L1), there is a 7-day challenge period
        // before the tokens are available on L1. This means there will be a significant delay
        // before the tokens can be further bridged from Ethereum to Solana.
        l2Bridge.withdrawTo(
            l2Token,           // L2 Token Address
            mainnetBridge,     // L1 recipient (SolanaVeilBridge)
            amount,            // Amount
            1_000_000,         // L1 Gas Limit
            bytes("")          // Extra Data
        );
        
        // Emit event for relayers
        emit BridgeToSolana(
            msg.sender,
            amount,
            nullifier,
            solanaRecipient,
            tokenId
        );
    }
    
    /**
     * @notice Process incoming transfer from Solana to Base
     * @dev For Base, funds will arrive through the L2 bridge from L1
     * @param nullifier Unique nullifier from Solana
     * @param recipient Address to receive tokens
     * @param amount Amount of tokens to receive
     * @param tokenId ID of the token
     */
    function finalizeFromSolana(
        bytes32 nullifier,
        address recipient,
        uint256 amount,
        uint256 tokenId
    ) external nonReentrant onlyOwner {
        // Verify the nullifier hasn't been used
        require(!processedNullifiers[nullifier], "Nullifier already used");
        
        // Check token is supported
        address l2Token = idToL2Token[tokenId];
        require(l2Token != address(0), "Token not supported");
        require(amount > 0, "Amount must be greater than zero");
        
        // Mark nullifier as used
        processedNullifiers[nullifier] = true;
        
        // Transfer tokens to recipient
        IERC20(l2Token).safeTransfer(recipient, amount);
        
        emit BridgeFromSolana(nullifier, recipient, amount, tokenId);
    }
    
    // === Admin Functions ===
    
    /**
     * @notice Configure a token for bridging
     * @param tokenId ID of the token to configure
     * @param l2TokenAddress Address of the token on Base
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