// SolanaVeil Program ID
export const PROGRAM_ID = 'SoVe11111111111111111111111111111111111111';

// Default RPC endpoint
export const DEFAULT_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';

// Helius RPC with API key placeholder (to be replaced by user's API key)
export const HELIUS_RPC_ENDPOINT = 'https://mainnet.helius-rpc.com';

// Standard denominations in SOL
export const STANDARD_DENOMINATIONS = [0.1, 1, 10, 100];

// Path to ZK circuit files
export const CIRCUIT_PATHS = {
  WASM_PATH: '/circuits/withdraw.wasm',
  ZKEY_PATH: '/circuits/withdraw.zkey',
  VERIFICATION_KEY_PATH: '/circuits/withdraw_verification_key.json'
};

// Risk score threshold
export const RISK_SCORE_THRESHOLD = 75;

// Range API endpoint
export const RANGE_API_ENDPOINT = 'https://api.range.org/v1';

// Max fee percentage allowed (5%)
export const MAX_FEE_PERCENTAGE = 5;

// Relayer settings
export const DEFAULT_RELAYER_FEE_PERCENTAGE = 1; // 1%

// Merkle tree configuration
export const MERKLE_TREE_CONSTANTS = {
  DEPTH: 20,                 // Depth of the Merkle tree
  MAX_LEAVES: 1048576,       // Maximum number of leaves (2^20)
  ZERO_VALUE: '0'.repeat(64), // Zero value for empty leaves (64 hex chars)
  HASH_FUNCTION: 'keccak256' // Hash function used for the tree
};