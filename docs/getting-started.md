# Getting Started with SolanaVeil

<div align="center">
<img src="images/getting-started-header.png" alt="Getting Started Header" width="800">
</div>

## Introduction

Welcome to SolanaVeil! This guide will help you get started with building, deploying, and integrating SolanaVeil into your applications. SolanaVeil is a privacy-preserving mixer for Solana that leverages ZK Compression technology to provide efficient and cost-effective privacy.

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v16 or later)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (v1.14 or later)
- [Anchor](https://project-serum.github.io/anchor/getting-started/installation.html) (v0.27 or later)

## Repository Setup

Clone the repository and install dependencies:

```bash
# Clone the repository
git clone https://github.com/username/solana-veil.git
cd solana-veil

# Install dependencies
npm install
```

## Project Structure

SolanaVeil follows a modular architecture:

```
solana-veil/
├── app/                             # Frontend application
├── circuits/                        # ZK circuit definitions
├── contracts/                       # Solana smart contracts
├── sdk/                             # TypeScript SDK
└── docs/                            # Documentation
```

## Building the Project

### 1. Build the ZK Circuits

```bash
# Navigate to the circuits directory
cd circuits

# Install dependencies
npm install

# Compile the circuits
npm run compile

# Setup the proving keys
npm run setup

# Export the circuits to the app
npm run export
```

This will generate the required WASM files and verification keys for the zero-knowledge proofs.

### 2. Build the Smart Contracts

```bash
# Navigate to the contracts directory
cd ../contracts

# Build the Anchor program
anchor build

# Generate TypeScript client
anchor idl parse -f programs/solana-veil/target/idl/solana_veil.json -o sdk/src/idl/
```

### 3. Build the SDK

```bash
# Navigate to the SDK directory
cd ../sdk

# Install dependencies
npm install

# Build the SDK
npm run build
```

### 4. Build the Frontend

```bash
# Navigate to the app directory
cd ../app

# Install dependencies
npm install

# Build the application
npm run build
```

## Local Development Environment

### 1. Start a Local Solana Validator

```bash
# Start a local validator
solana-test-validator

# Configure Solana CLI to use local network
solana config set --url localhost
```

### 2. Deploy the Smart Contracts

```bash
# Navigate to the contracts directory
cd contracts

# Deploy to local network
anchor deploy

# Set the program ID in your .env file
echo "REACT_APP_PROGRAM_ID=$(solana address -k target/deploy/solana_veil-keypair.json)" >> .env
```

### 3. Start the Frontend

```bash
# Navigate to the app directory
cd ../app

# Start the development server
npm start
```

Your application should now be running at http://localhost:3000.

## Key Components

### 1. ZK Circuits

SolanaVeil uses Circom for zero-knowledge circuit definitions:

- `withdraw.circom`: The main withdrawal circuit
- `merkle.circom`: Merkle tree inclusion proofs
- `helpers.circom`: Utility circuits and cryptographic primitives

### 2. Smart Contracts

The core protocol is implemented in Rust using the Anchor framework:

- Pool Management: Creating and managing privacy pools
- Deposit Module: Handling user deposits
- Withdraw Module: Processing privacy-preserving withdrawals
- ZK Verification: On-chain proof verification
- Compression Integration: ZK Compression for efficient storage

### 3. SDK

The TypeScript SDK provides a simple interface for developers:

```typescript
import { SolanaVeil } from "@solanaveil/sdk";

// Initialize SolanaVeil client
const veil = new SolanaVeil({
  connection,
  wallet,
});

// Example deposit
const result = await veil.deposit({
  amount: 1,
  token: 'SOL',
});

console.log(`Deposit note: ${result.note}`);
```

## Basic Usage Examples

### Creating a Deposit

```typescript
import { SolanaVeil, PoolToken } from "@solanaveil/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

function DepositExample() {
  const { connection } = useConnection();
  const { wallet } = useWallet();
  
  const handleDeposit = async () => {
    try {
      const veil = new SolanaVeil({ connection, wallet });
      
      // Deposit 1 SOL to the privacy pool
      const result = await veil.deposit({
        amount: 1,
        token: PoolToken.SOL,
      });
      
      // Save or display the deposit note securely
      console.log(`Your deposit note: ${result.note}`);
      console.log(`Transaction ID: ${result.transactionId}`);
      
      // IMPORTANT: Store this note securely!
      // The note is required to withdraw funds later
      
    } catch (error) {
      console.error("Deposit failed:", error);
    }
  };
  
  return (
    <button onClick={handleDeposit}>
      Deposit 1 SOL
    </button>
  );
}
```

### Making a Withdrawal

```typescript
import { SolanaVeil } from "@solanaveil/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

function WithdrawalExample() {
  const { connection } = useConnection();
  const { wallet } = useWallet();
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState("");
  
  const handleWithdraw = async () => {
    try {
      const veil = new SolanaVeil({ connection, wallet });
      
      // Generate a withdrawal proof
      const proof = await veil.generateProof({
        note,
        recipient,
      });
      
      // Submit the withdrawal transaction
      const result = await veil.withdraw({
        proof,
      });
      
      console.log(`Withdrawal successful!`);
      console.log(`Transaction ID: ${result.transactionId}`);
      console.log(`Amount: ${result.amount} ${result.token}`);
      
    } catch (error) {
      console.error("Withdrawal failed:", error);
    }
  };
  
  return (
    <div>
      <input
        placeholder="Enter your deposit note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <input
        placeholder="Recipient address"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
      />
      <button onClick={handleWithdraw}>
        Withdraw
      </button>
    </div>
  );
}
```

### Using a Relayer for Gas-less Withdrawals

```typescript
import { SolanaVeil } from "@solanaveil/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

function RelayerWithdrawalExample() {
  const { connection } = useConnection();
  const { wallet } = useWallet();
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState("");
  
  const handleRelayedWithdraw = async () => {
    try {
      const veil = new SolanaVeil({ connection, wallet });
      
      // Submit a relayed withdrawal
      const result = await veil.withdrawWithRelayer({
        note,
        recipient,
      });
      
      console.log(`Relayed withdrawal successful!`);
      console.log(`Transaction ID: ${result.transactionId}`);
      console.log(`Amount received: ${result.amount} ${result.token}`);
      console.log(`Fee paid: ${result.fee}`);
      
    } catch (error) {
      console.error("Relayed withdrawal failed:", error);
    }
  };
  
  return (
    <div>
      <input
        placeholder="Enter your deposit note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <input
        placeholder="Recipient address"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
      />
      <button onClick={handleRelayedWithdraw}>
        Withdraw (Gas-less)
      </button>
    </div>
  );
}
```

## Advanced Configuration

### Setting Up a Custom Provider

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@project-serum/anchor";
import { SolanaVeil } from "@solanaveil/sdk";

// Create a custom connection
const connection = new Connection("https://api.mainnet-beta.solana.com");

// Create a custom wallet adapter
const keypair = Keypair.fromSecretKey(/* your secret key */);
const wallet = new Wallet(keypair);

// Create an Anchor provider
const provider = new AnchorProvider(connection, wallet, {});

// Initialize SolanaVeil with custom provider
const veil = new SolanaVeil({
  provider,
  options: {
    rpcEndpoint: "https://api.mainnet-beta.solana.com",
    photonEndpoint: "https://photon-api.helius.xyz",
    compliance: {
      checkRecipient: true,
      maxRiskScore: 75,
    }
  }
});
```

### Customizing Compliance Settings

```typescript
import { SolanaVeil } from "@solanaveil/sdk";

const veil = new SolanaVeil({
  connection,
  wallet,
  options: {
    compliance: {
      // Enable address risk checks
      checkRecipient: true,
      
      // Set maximum allowed risk score (0-100)
      maxRiskScore: 75,
      
      // Enable specific compliance checks
      enableAmlChecks: true,
      enableSanctionsChecks: true,
      
      // Customize RPC endpoint for compliance
      customRpcEndpoint: "https://your-compliance-rpc.com",
    }
  }
});
```

## Integrating with a React Application

### Setting Up SolanaVeil Context

```typescript
// SolanaVeilContext.tsx
import React, { createContext, useContext, useMemo } from "react";
import { SolanaVeil } from "@solanaveil/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

interface SolanaVeilContextType {
  veil: SolanaVeil | null;
  isInitialized: boolean;
}

const SolanaVeilContext = createContext<SolanaVeilContextType>({
  veil: null,
  isInitialized: false,
});

export const useSolanaVeil = () => useContext(SolanaVeilContext);

export const SolanaVeilProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  const veil = useMemo(() => {
    if (!connection || !wallet || !wallet.publicKey) {
      return null;
    }
    
    return new SolanaVeil({
      connection,
      wallet,
      options: {
        // Custom options here
      }
    });
  }, [connection, wallet]);
  
  return (
    <SolanaVeilContext.Provider
      value={{
        veil,
        isInitialized: !!veil,
      }}
    >
      {children}
    </SolanaVeilContext.Provider>
  );
};
```

### Using the Context in Components

```typescript
// App.tsx
import { SolanaVeilProvider } from "./SolanaVeilContext";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

const App: React.FC = () => {
  const wallets = [new PhantomWalletAdapter()];
  
  return (
    <ConnectionProvider endpoint="https://api.mainnet-beta.solana.com">
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SolanaVeilProvider>
            {/* Your app components */}
          </SolanaVeilProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

// YourComponent.tsx
import { useSolanaVeil } from "./SolanaVeilContext";

const YourComponent: React.FC = () => {
  const { veil, isInitialized } = useSolanaVeil();
  
  const handleAction = async () => {
    if (!isInitialized) {
      return;
    }
    
    try {
      // Use veil methods here
      const result = await veil.deposit({ /* ... */ });
      console.log(result);
    } catch (error) {
      console.error(error);
    }
  };
  
  return (
    <button onClick={handleAction} disabled={!isInitialized}>
      Perform Action
    </button>
  );
};
```

## Testing

### Unit Testing Smart Contracts

```bash
# Navigate to the contracts directory
cd contracts

# Run tests
anchor test
```

### Testing the SDK

```bash
# Navigate to the SDK directory
cd sdk

# Run tests
npm test
```

### End-to-End Testing

```bash
# Navigate to the app directory
cd app

# Run E2E tests
npm run test:e2e
```

## Deployment

### Deploying to Solana Devnet

```bash
# Set Solana CLI to devnet
solana config set --url devnet

# Airdrop some SOL for deployment
solana airdrop 2

# Deploy the program
cd contracts
anchor deploy --provider.cluster devnet
```

### Deploying to Solana Mainnet

```bash
# Set Solana CLI to mainnet
solana config set --url mainnet-beta

# Deploy the program
cd contracts
anchor deploy --provider.cluster mainnet
```

## Troubleshooting

### Common Issues

#### 1. Transaction Simulation Failed

This error often occurs when trying to execute a transaction that would fail on-chain:

**Solution**: Check that:
- Your wallet has sufficient SOL for the transaction and gas
- You're using the correct pool denomination
- The program ID is correctly set

#### 2. Proof Generation Fails

If generating a withdrawal proof fails:

**Solution**:
- Ensure the deposit note is valid and correctly formatted
- Verify that the Merkle tree has been properly indexed
- Check browser console for detailed error messages

#### 3. Invalid Nullifier Error

This error occurs when attempting to withdraw with a note that has already been used:

**Solution**:
- Each deposit note can only be used once
- If you're certain this is a new withdrawal, check that you're connecting to the correct network

## Additional Resources

- [Full API Documentation](./api-reference.md)
- [Smart Contract Details](./smart-contracts.md)
- [ZK Compression Overview](./zk-compression.md)
- [Architecture Documentation](./architecture.md)



---

<div align="center">
<p><strong>SolanaVeil</strong> • Privacy-Preserving Mixer with ZK Compression</p>
</div>