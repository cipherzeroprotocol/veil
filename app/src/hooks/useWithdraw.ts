import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WithdrawService, WithdrawNote } from '../services/withdrawService';
import { RelayerService } from '../services/relayerService';
import { useWalletAdapter } from '../utils/walletAdapter';
import { parseWithdrawEventData } from '../utils/transactionParser';

interface UseWithdrawOptions {
  rpcEndpoint: string;
  apiKey: string;
  programId: string;
  wasmPath: string;
  zkeyPath: string;
}

/**
 * Hook for managing SolanaVeil withdrawal operations
 */
export function useWithdraw(options: UseWithdrawOptions) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { signAndSendTransaction } = useWalletAdapter();
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'generating' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [parsedNote, setParsedNote] = useState<WithdrawNote | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  
  // Initialize services with Light Protocol RPC
  const withdrawService = new WithdrawService(
    options.rpcEndpoint,
    options.apiKey
  );
  
  const relayerService = new RelayerService(
    options.rpcEndpoint,
    options.apiKey
  );
  
  /**
   * Parse a withdrawal note
   * @param noteString Base64-encoded note string
   */
  const parseNote = async (noteString: string) => {
    try {
      setStatus('parsing');
      setLoading(true);
      setError(null);
      
      // Parse the note
      const parsedNote = await withdrawService.parseNote(noteString);
      
      // Check if nullifier has been spent using Light Protocol RPC
      const isSpent = await withdrawService.isNullifierSpent(parsedNote.nullifier);
      
      if (isSpent) {
        throw new Error('These funds have already been withdrawn');
      }
      
      setParsedNote(parsedNote);
      setStatus('idle');
      setLoading(false);
      
      return parsedNote;
    } catch (err) {
      console.error('Error parsing note:', err);
      setParsedNote(null);
      setStatus('error');
      setLoading(false);
      setError((err as Error).message);
      return null;
    }
  };
  
  /**
   * Get relayers for a specific denomination
   */
  const getRelayers = async () => {
    try {
      return await relayerService.getActiveRelayers();
    } catch (err) {
      console.error('Error fetching relayers:', err);
      setError((err as Error).message);
      return [];
    }
  };
  
  /**
   * Perform a withdrawal operation
   * @param params Withdrawal parameters
   */
  const withdraw = async (params: {
    note: WithdrawNote;
    recipient?: string;
    relayerAddress?: string;
  }) => {
    if (!publicKey) {
      setError('Wallet not connected');
      return null;
    }
    
    if (!params.note) {
      setError('No withdrawal note provided');
      return null;
    }
    
    try {
      setStatus('generating');
      setLoading(true);
      setProgress(0);
      setError(null);
      setTxHash(null);
      
      // Get recipient public key
      const recipientPubkey = params.recipient 
        ? new PublicKey(params.recipient)
        : publicKey;
      
      // Get relayer if specified
      let relayerPubkey: PublicKey | undefined = undefined;
      let relayerFee = 0;
      
      if (params.relayerAddress) {
        const relayer = await relayerService.getRelayer(params.relayerAddress);
        if (relayer) {
          relayerPubkey = new PublicKey(relayer.address);
          relayerFee = relayer.fee * LAMPORTS_PER_SOL / 100; // Convert percentage to lamports
        }
      }
      
      // Progress update
      setProgress(10);
      
      // Step 1: Get the merkle proof for the note using Light Protocol
      const merkleProof = await withdrawService.getMerkleProof({
        treeId: params.note.poolId,
        leafIndex: params.note.leafIndex
      });
      
      // Progress update
      setProgress(30);
      
      // Step 2: Convert denomination to lamports for the proof
      const denominationLamports = parseFloat(params.note.denomination) * LAMPORTS_PER_SOL;
      
      // Step 3: Generate the zero-knowledge proof with Light Protocol
      const { proof, publicSignals } = await withdrawService.generateWithdrawalProof({
        nullifier: params.note.nullifier,
        secret: params.note.secret,
        merkleRoot: merkleProof.root,
        pathElements: merkleProof.pathElements,
        pathIndices: merkleProof.pathIndices,
        recipient: recipientPubkey,
        relayer: relayerPubkey,
        fee: relayerFee,
        poolId: params.note.poolId,
        denomination: denominationLamports,
        wasmPath: options.wasmPath,
        zkeyPath: options.zkeyPath
      });
      
      // Progress update
      setProgress(70);
      
      // Step 4: Create withdrawal transaction with the generated proof
      const transaction = await withdrawService.createWithdrawTransaction({
        payer: publicKey,
        poolId: params.note.poolId,
        proof,
        merkleRoot: merkleProof.root,
        nullifierHash: Buffer.from(publicSignals.nullifierHash),
        recipient: recipientPubkey,
        fee: relayerFee,
        relayer: relayerPubkey
      });
      
      // Progress update
      setProgress(85);
      
      // Sign and send transaction
      const signature = await signAndSendTransaction(transaction);
      
      // Get transaction details
      const txDetails = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (!txDetails || !txDetails.meta) {
        throw new Error('Failed to fetch transaction details');
      }
      
      // Parse the transaction logs
      const withdrawEvent = await parseWithdrawEventData(signature, connection);
      
      // Complete!
      setTxHash(signature);
      setStatus('success');
      setLoading(false);
      setProgress(100);
      
      return {
        txHash: signature,
        recipient: recipientPubkey.toString()
      };
    } catch (err) {
      console.error('Error withdrawing funds:', err);
      setStatus('error');
      setLoading(false);
      setError((err as Error).message);
      return null;
    }
  };
  
  return {
    parseNote,
    withdraw,
    getRelayers,
    loading,
    status,
    progress,
    error,
    parsedNote,
    txHash,
    reset: () => {
      setStatus('idle');
      setProgress(0);
      setError(null);
      setParsedNote(null);
      setTxHash(null);
    }
  };
}