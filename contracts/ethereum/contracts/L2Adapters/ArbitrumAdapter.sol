// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@arbitrum/nitro-contracts/src/bridge/IOutbox.sol";
import "@arbitrum/nitro-contracts/src/bridge/IBridge.sol";
import "@arbitrum/nitro-contracts/src/bridge/IInbox.sol";

/**
 * @title ArbitrumAdapter
 * @notice Adapter for bridging between Solana and Arbitrum
 * @dev Handles the Arbitrum-specific bridging logic using the Arbitrum L2 bridge
 */
contract ArbitrumAdapter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // === Constants ===
    
    uint16 public constant CHAIN_ID_SOLANA = 1;
    uint16 public constant CHAIN_ID_ARBITRUM = 42161;
    
    // === State Variables ===
    
    // L2 to L1 message sender for Arbitrum
    address public immutable l2Gateway;
    
    // Address of L1 inbox contract
    address public immutable l1Inbox;
    
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
     * @param _l2Gateway Address of Arbitrum's L2 token gateway
     * @param _l1Inbox Address of Arbitrum's L1 inbox
     * @param _mainnetBridge Address of SolanaVeilBridge on mainnet
     */
    constructor(
        address _l2Gateway,
        address _l1Inbox,
        address _mainnetBridge
    ) Ownable(msg.sender) {
        require(_l2Gateway != address(0), "Invalid L2 gateway address");
        require(_l1Inbox != address(0), "Invalid L1 inbox address");
        require(_mainnetBridge != address(0), "Invalid mainnet bridge address");
        
        // Arbitrum One L2 Gateway Router: 0x5288c571Fd7aD117BeA99bF60FE0846C4E84F933
        // Arbitrum Sepolia L2 Gateway Router: 0x9fDD1735197450A394453473489E5C43C7443C7
        l2Gateway = _l2Gateway;
        l1Inbox = _l1Inbox;
        mainnetBridge = _mainnetBridge;
    }
    
    // === External Functions ===
    
    /**
     * @notice Bridge tokens from Arbitrum to Solana
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
        
        // For Arbitrum, we need to send a message through the standard gateway
        // This is a simplified example - in production you would use the correct token gateway
        
        // Withdraw tokens to the L1 bridge
        // Note: In a real implementation, you would use the specific token gateway for the token
        // For standard ERC20, this would be the L2StandardERC20Gateway
        
        // Approve the gateway to spend tokens
        IERC20(l2Token).approve(l2Gateway, amount);
        
        // Call the gateway to withdraw to L1
        // This is a simplified example - in production use the actual gateway interface
        // l2Gateway.withdraw(l2Token, amount, 0, bytes(""));
        
        // Here we would call the token-specific gateway. For example:
        // IL2StandardERC20Gateway(l2Gateway).withdraw(l2Token, amount, 0, bytes(""));
        
        // Since this is an example, we're showing the call pattern but not executing
        // The actual implementation depends on the specific token gateway
        
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
     * @notice Process incoming transfer from Solana to Arbitrum
     * @dev For Arbitrum, funds will arrive through the L2 message from L1
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
    
    /**
     * @notice Submit a message to Ethereum L1
     * @param destination L1 destination address
     * @param data Message data
     * @return Message sequence number
     */
    function sendTxToL1(
        address destination,
        bytes calldata data
    ) external payable onlyOwner returns (uint256) {
        // This is how you would send a message from Arbitrum to Ethereum
        // This requires gas payment for the L1 portion of the transaction
        
        // Access Arbitrum's ArbSys precompile
        address arbSys = address(100);
        
        // Call the sendTxToL1 function on ArbSys
        (bool success, bytes memory returnData) = arbSys.call{value: msg.value}(
            abi.encodeWithSelector(
                bytes4(keccak256("sendTxToL1(address,bytes)")),
                destination,
                data
            )
        );
        
        require(success, "Failed to send message to L1");
        
        return abi.decode(returnData, (uint256));
    }
    
    // === Admin Functions ===
    
    /**
     * @notice Configure a token for bridging
     * @param tokenId ID of the token to configure
     * @param l2TokenAddress Address of the token on Arbitrum
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