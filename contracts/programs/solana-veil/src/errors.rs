use anchor_lang::prelude::*;

#[error_code]
pub enum SolanaVeilError {
    #[msg("Insufficient funds for deposit")]
    InsufficientFunds,
    
    #[msg("Invalid proof")]
    InvalidProof,
    
    #[msg("Nullifier has already been spent")]
    NullifierAlreadySpent,
    
    #[msg("Invalid merkle root")]
    InvalidMerkleRoot,
    
    #[msg("Invalid denomination")]
    InvalidDenomination,
    
    #[msg("Pool is inactive")]
    PoolInactive,
    
    #[msg("Invalid fee amount")]
    InvalidFeeAmount,
    
    #[msg("Fee too high")]
    FeeTooHigh,
    
    #[msg("Invalid recipient")]
    InvalidRecipient,
    
    #[msg("Invalid tree depth")]
    InvalidTreeDepth,
    
    #[msg("Withdrawal amount below minimum")]
    WithdrawalAmountTooLow,
    
    #[msg("Pool already exists for this denomination")]
    PoolAlreadyExists,
    
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("Invalid relayer")]
    InvalidRelayer,
    
    #[msg("Relayer is inactive")]
    RelayerInactive,
    
    #[msg("Pool creation disabled")]
    PoolCreationDisabled,
    
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    
    #[msg("Token account does not match mint")]
    TokenAccountMintMismatch,
    
    #[msg("Invalid merkle tree account")]
    InvalidMerkleTree,
    
    #[msg("Calculation error")]
    CalculationError,
    
    #[msg("Zero-knowledge proof verification failed")]
    ZkProofVerificationFailed,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid proof provided")]
    InvalidProof,
    #[msg("Nullifier has already been used")]
    NullifierAlreadyUsed,
    #[msg("Root does not exist in the tree history")]
    InvalidRoot,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid fee")]
    InvalidFee,
    #[msg("Invalid refund amount")]
    InvalidRefund,
    #[msg("Invalid Merkle tree height")]
    InvalidTreeHeight,
    #[msg("Merkle tree is full")]
    MerkleTreeFull,
    #[msg("Pool is paused")]
    PoolPaused,
    #[msg("Invalid pool parameters")]
    InvalidPoolParams,
    #[msg("Relayer not registered")]
    RelayerNotRegistered,
    #[msg("Insufficient stake")]
    InsufficientStake,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    // Bridge specific errors
    #[msg("Bridge is paused")]
    BridgePaused,
    #[msg("Chain is not supported")]
    ChainNotSupported,
    #[msg("Token is not supported for this chain")]
    TokenNotSupported,
    #[msg("Token bridging is not enabled")]
    TokenNotEnabled,
    #[msg("Too many chains configured")]
    TooManyChains,
    #[msg("Chain ID already supported")]
    ChainAlreadySupported,
    #[msg("Too many tokens configured for this chain")]
    TooManyTokens,
    #[msg("Token already supported for this chain")]
    TokenAlreadySupported,
    #[msg("Bridge module has not been initialized")]
    BridgeNotInitialized,
    #[msg("Message received from an invalid or untrusted external emitter")]
    InvalidExternalEmitter,
    #[msg("Target chain is not configured for transfers")]
    UnsupportedChain,
    #[msg("Received malformed VAA or invalid message structure")]
    InvalidWormholeMessage,
    #[msg("The referenced bridge transfer was not found")]
    BridgeTransferNotFound,
    #[msg("The bridge transfer has already been processed")]
    TransferAlreadyProcessed,
    #[msg("The provided commitment is invalid or failed validation")]
    InvalidCommitment,
}