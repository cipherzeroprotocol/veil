// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SolanaVeilVault
 * @notice Secure vault for storing bridged tokens
 * @dev Manages token deposits and withdrawals for the SolanaVeilBridge
 */
contract SolanaVeilVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // === State Variables ===
    
    // Mapping of authorized bridge contracts that can call this vault
    mapping(address => bool) public authorizedBridges;
    
    // Mapping of token ID to token contract
    mapping(uint256 => address) public supportedTokens;
    
    // === Events ===
    
    event BridgeAuthorized(address indexed bridge);
    event BridgeDeauthorized(address indexed bridge);
    event TokenConfigured(uint256 indexed tokenId, address tokenAddress);
    event TokensReleased(address indexed recipient, uint256 amount, uint256 indexed tokenId);
    event EmergencyWithdrawal(address indexed token, address indexed recipient, uint256 amount);
    
    // === Modifiers ===
    
    modifier onlyAuthorizedBridge() {
        require(authorizedBridges[msg.sender], "Caller is not an authorized bridge");
        _;
    }
    
    // === Constructor ===
    
    constructor() Ownable(msg.sender) {}
    
    // === External Functions ===
    
    /**
     * @notice Release tokens from the vault to a recipient
     * @param recipient Address to receive the tokens
     * @param tokenId ID of the token to release
     * @param amount Amount of tokens to release
     */
    function releaseTokens(
        address recipient,
        uint256 tokenId,
        uint256 amount
    ) external nonReentrant onlyAuthorizedBridge {
        require(recipient != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than zero");
        
        address tokenAddress = supportedTokens[tokenId];
        require(tokenAddress != address(0), "Token not supported");
        
        // Transfer tokens to recipient
        IERC20(tokenAddress).safeTransfer(recipient, amount);
        
        emit TokensReleased(recipient, amount, tokenId);
    }
    
    /**
     * @notice Authorize a bridge contract to interact with this vault
     * @param bridge Address of the bridge contract to authorize
     */
    function authorizeBridge(address bridge) external onlyOwner {
        require(bridge != address(0), "Invalid bridge address");
        require(!authorizedBridges[bridge], "Bridge already authorized");
        
        authorizedBridges[bridge] = true;
        
        emit BridgeAuthorized(bridge);
    }
    
    /**
     * @notice Deauthorize a bridge contract
     * @param bridge Address of the bridge contract to deauthorize
     */
    function deauthorizeBridge(address bridge) external onlyOwner {
        require(authorizedBridges[bridge], "Bridge not authorized");
        
        authorizedBridges[bridge] = false;
        
        emit BridgeDeauthorized(bridge);
    }
    
    /**
     * @notice Configure a token in the vault
     * @param tokenId ID of the token to configure
     * @param tokenAddress Address of the ERC20 token contract
     */
    function configureToken(
        uint256 tokenId,
        address tokenAddress
    ) external onlyOwner {
        require(tokenAddress != address(0), "Invalid token address");
        
        supportedTokens[tokenId] = tokenAddress;
        
        emit TokenConfigured(tokenId, tokenAddress);
    }
    
    /**
     * @notice Emergency withdrawal of tokens (for recovery)
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
        
        emit EmergencyWithdrawal(tokenAddress, recipient, amount);
    }
    
    /**
     * @notice Get the balance of a specific token in the vault
     * @param tokenId ID of the token to query
     * @return The balance of the token in the vault
     */
    function getTokenBalance(uint256 tokenId) external view returns (uint256) {
        address tokenAddress = supportedTokens[tokenId];
        require(tokenAddress != address(0), "Token not supported");
        
        return IERC20(tokenAddress).balanceOf(address(this));
    }
}