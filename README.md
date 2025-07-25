# SolanaVeil 🛡️

<div align="center">

![Solana](https://img.shields.io/badge/Solana-black?style=for-the-badge&logo=solana)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)

**A privacy-preserving mixer for Solana leveraging ZK Compression technology**

[Architecture](#architecture) •
[Features](#key-features) •
[Installation](#installation) •
[Documentation](#documentation) •
[Contributing](#contributing)

</div>

## 🌟 Overview

SolanaVeil is a decentralized privacy solution that allows users to break the on-chain link between source and destination addresses. It leverages zero-knowledge proofs and ZK Compression to provide privacy while minimizing storage costs on Solana.

By using fixed denomination pools and zero-knowledge proofs, SolanaVeil ensures that transactions cannot be traced, while maintaining a strong focus on compliance and preventing illicit usage.

## 🔑 Key Features

- **Complete Privacy** - Break the link between source and destination addresses
- **ZK Compression Integration** - Store merkle trees and proof data at a fraction of traditional on-chain costs (~95% reduction)
- **Risk Scoring & Compliance** - Built-in safeguards against illicit fund movement
- **Cross-Chain Privacy** - Support for shielding transfers across multiple blockchains
- **Auditable Privacy** - Optional disclosure keys for regulatory compliance
- **Multiple Denominations** - Fixed pools for SOL (0.1, 1, 10, 100) and USDC (0.1, 1, 10, 100, 1000)

## 🏗️ Architecture

SolanaVeil consists of five main components:

1. **Smart Contract Layer** - Secure Rust/Anchor contracts handling pool management, deposits, withdrawals, ZK verification, and fee processing
2. **ZK Compression Layer** - Utilizes Helius ZK Compression for efficient storage of Merkle trees and nullifier sets
3. **Zero-Knowledge Circuit Layer** - Circom/SnarkJS circuits for verifiable proofs of withdrawal validity
4. **SDK Components** - TypeScript libraries for client integration and compliance tools
5. **Frontend Layer** - React-based user interfaces for deposits and withdrawals

<p align="center">
  <img src="docs/images/architecture.png" alt="SolanaVeil Architecture" width="750">
</p>

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/username/solana-veil.git
cd solana-veil

# Install dependencies
npm install

# Build the project
npm run build

# Start the development server
npm run dev
```

## 📚 Documentation

- [Architecture Overview](docs/architecture.md) - Detailed system design
- [ZK Compression](docs/zk-compression.md) - How SolanaVeil uses ZK compression
- [API Reference](docs/api-reference.md) - SDK documentation
- [Smart Contracts](docs/smart-contracts.md) - Contract architecture and functions
- [Getting Started](docs/getting-started.md) - Quick setup guide

## 📘 Usage Example

```typescript
import { SolanaVeil, PoolType } from "@solanaveil/sdk";

// Initialize SolanaVeil client
const veil = new SolanaVeil({
  connection,
  wallet,
});

// Deposit SOL to privacy pool
await veil.deposit({
  amount: 1, // 1 SOL
  poolType: PoolType.SOL,
});

// Generate withdrawal proof
const proof = await veil.generateProof({
  note: "your-deposit-note",
  recipient: recipientAddress,
});

// Withdraw funds
await veil.withdraw({
  proof,
  recipient: recipientAddress,
});
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💼 Responsible Usage Statement

SolanaVeil is designed to enable legitimate privacy use cases while implementing safeguards against illicit activity. Privacy is a fundamental right in the digital age, and this tool enables:

- Business transaction confidentiality
- Protection against targeted attacks
- Financial privacy for vulnerable individuals
- Protection against dusting attacks and address poisoning

---

<div align="center">
  <sub>Built with ❤️ for the Solana ecosystem</sub>
</div>#   v e i l  
 