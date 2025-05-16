import { 
  WalletAdapterNetwork,
  WalletNotConnectedError,
  WalletSignTransactionError
} from '@solana/wallet-adapter-base';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  Keypair,
  Transaction,
  VersionedTransaction,
  Connection,
  PublicKey,
  clusterApiUrl,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage
} from '@solana/web3.js';

/**
 * Get an RPC endpoint URL for a specific network
 * @param network Solana network
 * @returns RPC endpoint URL
 */
export function getNetworkEndpoint(network: WalletAdapterNetwork): string {
  return clusterApiUrl(network);
}

/**
 * Create a derived keypair from a base keypair
 * @param baseKeypair Base keypair
 * @param path Derivation path
 * @returns Derived keypair
 */
export function deriveKeypair(baseKeypair: Keypair, path: string): Keypair {
  // This is a placeholder implementation - in a real app you would use
  // BIP32/BIP44 derivation or another appropriate method
  const seed = Buffer.from(`${baseKeypair.publicKey.toString()}-${path}`);
  return Keypair.fromSeed(seed.slice(0, 32));
}

/**
 * Signs a transaction using the connected wallet
 * @param transaction Transaction to sign (regular or versioned)
 * @param wallet Connected wallet
 * @param connection Solana connection
 * @returns Signed transaction
 */
export async function signTransaction(
  transaction: Transaction | VersionedTransaction,
  wallet: any,
  connection: Connection
): Promise<Transaction | VersionedTransaction> {
  if (!wallet.publicKey) {
    throw new WalletNotConnectedError();
  }

  try {
    // Handle regular Transaction
    if (transaction instanceof Transaction) {
      // Set recent blockhash
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;
      
      // Set fee payer
      transaction.feePayer = wallet.publicKey;
    }
    
    // Sign the transaction (works for both regular and versioned transactions)
    const signedTransaction = await wallet.signTransaction(transaction);
    return signedTransaction;
  } catch (error) {
    console.error('Error signing transaction:', error);
    throw new WalletSignTransactionError((error as Error).message);
  }
}

/**
 * Signs and sends a transaction using the connected wallet
 * @param transaction Transaction to sign and send (regular or versioned)
 * @param wallet Connected wallet
 * @param connection Solana connection
 * @returns Transaction signature
 */
export async function signAndSendTransaction(
  transaction: Transaction | VersionedTransaction,
  wallet: any,
  connection: Connection
): Promise<string> {
  if (!wallet.publicKey) {
    throw new WalletNotConnectedError();
  }

  try {
    // Handle regular Transaction
    if (transaction instanceof Transaction) {
      // Set recent blockhash
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;
      
      // Set fee payer
      transaction.feePayer = wallet.publicKey;
    }
    
    // Sign the transaction
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Send the transaction (handle both regular and versioned transactions)
    let serializedTransaction;
    if (signedTransaction instanceof VersionedTransaction) {
      serializedTransaction = signedTransaction.serialize();
    } else {
      serializedTransaction = signedTransaction.serialize();
    }
    
    const signature = await connection.sendRawTransaction(
      serializedTransaction
    );
    
    // Confirm transaction
    await connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  } catch (error) {
    console.error('Error signing and sending transaction:', error);
    throw new Error(`Failed to sign and send transaction: ${(error as Error).message}`);
  }
}

/**
 * Signs multiple transactions using the connected wallet
 * @param transactions Array of transactions to sign (can mix regular and versioned transactions)
 * @param wallet Connected wallet
 * @param connection Solana connection
 * @returns Array of signed transactions
 */
export async function signAllTransactions(
  transactions: (Transaction | VersionedTransaction)[],
  wallet: any,
  connection: Connection
): Promise<(Transaction | VersionedTransaction)[]> {
  if (!wallet.publicKey) {
    throw new WalletNotConnectedError();
  }

  try {
    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    
    // Set recent blockhash and fee payer for regular transactions
    transactions.forEach(transaction => {
      if (transaction instanceof Transaction) {
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
      }
    });
    
    // Sign all transactions
    const signedTransactions = await wallet.signAllTransactions(transactions);
    return signedTransactions;
  } catch (error) {
    console.error('Error signing multiple transactions:', error);
    throw new Error(`Failed to sign transactions: ${(error as Error).message}`);
  }
}

/**
 * Create a transaction to transfer SOL between accounts
 * @param from Source public key
 * @param to Destination public key
 * @param amount Amount in lamports
 * @param connection Solana connection
 * @returns Transaction
 */
export async function createTransferTransaction(
  from: PublicKey, 
  to: PublicKey, 
  amount: number, 
  connection: Connection
): Promise<Transaction> {
  const transaction = new Transaction();
  
  // Add a transfer instruction
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: amount
    })
  );
  
  // Set recent blockhash
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.feePayer = from;
  
  return transaction;
}

/**
 * Create a versioned transaction
 * @param instructions Transaction instructions
 * @param payer Fee payer public key
 * @param connection Solana connection
 * @returns Versioned transaction
 */
export async function createVersionedTransaction(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  connection: Connection
): Promise<VersionedTransaction> {
  // Get latest blockhash and last valid block height
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  
  // Create a message for the versioned transaction
  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions
  }).compileToV0Message();
  
  // Create versioned transaction
  return new VersionedTransaction(messageV0);
}

/**
 * Hook to use wallet adapter utilities
 * @returns Wallet adapter utilities
 */
export function useWalletAdapter() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return {
    // Basic wallet info
    publicKey: wallet.publicKey,
    connected: wallet.connected,
    
    // Network utilities
    getNetworkEndpoint: (network: WalletAdapterNetwork) => getNetworkEndpoint(network),
    currentNetwork: connection.rpcEndpoint.includes('devnet') 
      ? WalletAdapterNetwork.Devnet 
      : connection.rpcEndpoint.includes('testnet')
        ? WalletAdapterNetwork.Testnet
        : WalletAdapterNetwork.Mainnet,
    
    // Transaction signing and sending
    signTransaction: async (transaction: Transaction | VersionedTransaction) => 
      signTransaction(transaction, wallet, connection),
    signAndSendTransaction: async (transaction: Transaction | VersionedTransaction) => 
      signAndSendTransaction(transaction, wallet, connection),
    signAllTransactions: async (transactions: (Transaction | VersionedTransaction)[]) => 
      signAllTransactions(transactions, wallet, connection),
    
    // Transaction creation helpers
    createTransferTransaction: async (to: PublicKey, amount: number) => {
      if (!wallet.publicKey) throw new WalletNotConnectedError();
      return createTransferTransaction(wallet.publicKey, to, amount, connection);
    },
    
    createVersionedTransaction: async (instructions: TransactionInstruction[]) => {
      if (!wallet.publicKey) throw new WalletNotConnectedError();
      return createVersionedTransaction(instructions, wallet.publicKey, connection);
    },
    
    // Direct access to wallet and connection
    wallet,
    connection
  };
}