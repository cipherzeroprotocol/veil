import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { DepositService } from '../services/depositService';
import { parseDepositEvent } from '../utils/transactionParser';
import { useWalletAdapter } from '../utils/walletAdapter';
import { LightProtocolClient } from '../utils/lightProtocolClient';

interface UseDepositOptions {
  rpcEndpoint: string;
  apiKey: string;
  compressionApiEndpoint: string; // Added for SDK compatibility
  proverEndpoint: string; // Added for SDK compatibility
}

/**
 * Hook for managing SolanaVeil deposit operations
 */
export function useDeposit(options: UseDepositOptions) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { signAndSendTransaction } = useWalletAdapter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depositNote, setDepositNote] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Initialize service with all required parameters for the SDK
  const depositService = new DepositService(
    options.rpcEndpoint,
    options.apiKey,
    options.compressionApiEndpoint,
    options.proverEndpoint
  );

  const lightClient = new LightProtocolClient(options.rpcEndpoint, options.apiKey);

  /**
   * Perform a deposit operation
   * @param params Deposit parameters
   */
  const deposit = async (params: {
    // Keep original parameters for backward compatibility
    poolId: string;
    treeId: string;
    denomination: number;
    recipient?: string;
    tokenType?: string; // Added to support different token types
  }) => {
    if (!publicKey || !signTransaction) {
      setError('Wallet not connected or does not support signing');
      return null;
    }

    const walletSigner = {
      publicKey,
      signTransaction
    };

    try {
      setLoading(true);
      setProgress(10);
      setError(null);
      setDepositNote(null);
      setTxHash(null);

      // Use the SDK through the deposit service
      const { signature, note } = await depositService.depositWithSdk({
        amount: params.denomination,
        tokenType: params.tokenType || 'SOL', // Default to SOL if not specified
        payer: walletSigner,
        recipient: params.recipient ? new PublicKey(params.recipient) : undefined,
      });

      setProgress(60);
      setTxHash(signature);
      
      // Parse the transaction to extract detailed deposit event data (leaf index, etc.)
      try {
        const depositEventData = await parseDepositEvent(signature, connection);
        if (depositEventData) {
          console.log('Deposit event data:', depositEventData);
          
          // Use deposit event data to enrich the note if needed
          if (depositEventData.leafIndex !== undefined && !note.includes('leafIndex')) {
            // Parse existing note
            const noteData = JSON.parse(Buffer.from(note, 'base64').toString());
            
            // Add leaf index if not present
            if (!noteData.leafIndex) {
              noteData.leafIndex = depositEventData.leafIndex;
              
              // Re-encode the enriched note
              const enrichedNote = Buffer.from(JSON.stringify(noteData)).toString('base64');
              setDepositNote(enrichedNote);
            }
          }
        }
      } catch (parseError) {
        // Don't fail the whole transaction if just the parsing fails
        console.warn('Failed to parse deposit event data:', parseError);
      }

      setProgress(85);
      setDepositNote(note);
      
      setLoading(false);
      setProgress(100);

      return {
        txHash: signature,
        note: note
      };
    } catch (err) {
      console.error('Error making deposit:', err);
      setError((err as Error).message);
      setLoading(false);
      setProgress(0);
      return null;
    }
  };

  return {
    deposit,
    loading,
    error,
    depositNote,
    txHash,
    progress,
    reset: () => {
      setError(null);
      setDepositNote(null);
      setTxHash(null);
      setProgress(0);
    }
  };
}