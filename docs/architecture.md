# SolanaVeil Architecture Overview

<div align="center">
<img src="images/architecture-header.png" alt="Architecture Header" width="800">
</div>

## System Architecture

SolanaVeil implements a layered architecture designed for security, efficiency, and scalability. Each layer serves a specific purpose in the privacy system, working together to provide secure, cost-effective transaction privacy.

### Complete System Overview

The SolanaVeil architecture consists of five primary layers:

```
┌─────────────────────────────────────────────────────────────┐
│                SolanaVeil Smart Contracts                    │
├─────────┬─────────┬──────────┬─────────────┬───────────────┤
│  Pool   │ Deposit │ Withdraw │ ZK Verify   │ Fee           │
│ Manager │ Module  │ Module   │ Module      │ Module        │
└─────────┴─────────┴──────────┴─────────────┴───────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 ZK Compression Layer                         │
├───────────────┬─────────────┬────────────┬─────────────────┤
│ Compressed    │ Compressed  │ Photon     │ Light Protocol  │
│ Merkle Tree   │ Nullifier   │ Indexer    │ Compression     │
└───────────────┴─────────────┴────────────┴─────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Zero-Knowledge Circuit Layer                    │
├───────────────┬─────────────┬────────────┬─────────────────┤
│ Withdrawal    │ Merkle      │ HashTo     │ On-chain        │
│ Proving       │ Inclusion   │ Field      │ Verification    │
│ Circuit       │ Circuit     │ Circuit    │ Circuit         │
└───────────────┴─────────────┴────────────┴─────────────────┘
                  ▼                           ▼
┌────────────────────────┐      ┌──────────────────────────┐
│     SDK Components     │      │   Frontend Components    │
├────────────┬───────────┤      ├─────────────┬────────────┤
│ Core Client │Compliance │      │ Deposit     │ Withdrawal │
│ Library     │ Module    │ ──► │ Interface   │ Interface  │
└────────────┴───────────┘      └─────────────┴────────────┘
```

## Layer Details

### 1. Smart Contract Layer

The Smart Contract Layer forms the foundation of SolanaVeil, implemented in Rust using the Anchor framework.

**Components:**

- **Pool Management Module**: Handles pool initialization, configuration, and administration. Each pool represents a fixed denomination (like 1 SOL, 10 SOL, etc.)
- **Deposit Module**: Manages the deposit process, including leaf creation and merkle tree updates
- **Withdraw Module**: Processes withdrawals, verifies proofs, and prevents double-spending
- **ZK Verify Module**: On-chain verification of zero-knowledge proofs
- **Fee Module**: Handles relayer fees and protocol fee distribution

**Key Features:**

- Secure by design with comprehensive testing
- Optimized for minimal gas costs
- Event-driven architecture for front-end integration
- Role-based access control

### 2. ZK Compression Layer

This innovative layer leverages Helius's ZK Compression to minimize on-chain storage costs.

**Components:**

- **Compressed Merkle Tree**: Stores deposit commitments efficiently
- **Compressed Nullifier Set**: Prevents double-spending with minimal storage
- **Photon Indexer**: Indexes and serves the compressed state
- **Light Protocol Compression**: Additional compression optimizations

**Benefits:**

- ~95% reduction in storage costs
- Support for larger Merkle trees (20+ levels deep)
- Lower transaction fees
- Improved scalability

### 3. Zero-Knowledge Circuit Layer

This layer handles the cryptographic proof generation and verification using Circom/SnarkJS.

**Components:**

- **Withdrawal Proving Circuit**: Generates proofs of valid withdrawals
- **Merkle Inclusion Circuit**: Verifies leaf inclusion in the merkle tree
- **HashToField Circuit**: Converts inputs to field elements
- **On-chain Verification Circuit**: Efficient on-chain verification of ZK proofs

**Technical Specifications:**

- Uses Groth16 ZK-SNARKs for efficient proof generation
- Proof generation occurs client-side for enhanced privacy
- Verification occurs on-chain for security
- Trusted setup using multi-party computation

### 4. SDK Components

The SDK provides developer tools for interacting with SolanaVeil.

**Components:**

- **Core Client Library**: Primary interface for developers
- **Compliance Module**: Risk scoring and compliance tools

**Features:**

- TypeScript integration
- Comprehensive documentation
- Wallet integration
- Error handling

### 5. Frontend Components

The Frontend provides a user-friendly interface for interacting with SolanaVeil.

**Components:**

- **Deposit Interface**: User interface for making deposits
- **Withdrawal Interface**: User interface for withdrawals

**Features:**

- Responsive design
- Wallet integration
- Transaction status tracking
- Intuitive UI/UX

## Data Flow

1. **Deposit Process**:
   - User selects pool and amount
   - Client generates commitment and nullifier
   - Deposit transaction is submitted
   - ZK Compression records the deposit with reduced storage cost
   - User receives a deposit note

2. **Withdrawal Process**:
   - User inputs deposit note
   - Client generates ZK proof locally
   - Proof is submitted to contract
   - Contract verifies proof and processes withdrawal
   - Funds are sent to recipient
   - Nullifier is marked as spent in the compressed nullifier set

## Security Considerations

SolanaVeil implements multiple security measures:

- **Nullifier Protection**: Prevents double-spending
- **On-chain Verification**: Ensures validity of all withdrawals
- **No Admin Backdoors**: Fully decentralized system
- **Formal Verification**: Critical components formally verified
- **Auditable Design**: Optional viewing keys for compliance

## System Requirements

- **Blockchain**: Solana Mainnet or Testnet
- **Client**: Modern web browser with wallet extension
- **Minimum Hardware (Client)**:
  - 8GB RAM
  - Modern CPU with at least 4 cores
  - 100MB free storage
- **Recommended Hardware (Relayer)**:
  - 16GB RAM
  - Modern CPU with at least 8 cores
  - 1GB free storage

## Scalability

SolanaVeil is designed for scalability:

- ZK Compression reduces storage requirements by ~95%
- Efficient proof verification minimizes computational load
- Stateless client architecture
- Horizontally scalable relayer network

## Advanced Technical Architecture

<div align="center">
<img src="images/advanced-architecture.png" alt="Advanced Architecture" width="800">
</div>

The image above illustrates the complete system architecture with all components and their interactions.

---

<div align="center">
<p><strong>SolanaVeil</strong> • Privacy-Preserving Mixer with ZK Compression</p>
</div>