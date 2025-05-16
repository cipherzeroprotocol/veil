import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWeb3React } from '@web3-react/core';
import { Web3Provider } from '@ethersproject/providers';
import { 
  bridgeService, 
  BridgeTokensParams, 
  BridgeTransferResult, 
  BridgeTransferDetails,
  ChainId,
  SupportedToken
} from '../services/bridgeService';

interface UseBridgeProps {
  autoConnect?: boolean;
}

interface UseBridgeResult {
  // Status
  isInitialized: boolean;
  isSolanaConnected: boolean;
  isEthereumConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Bridge functionality
  bridgeTokens: (params: BridgeTokensParams) => Promise<BridgeTransferResult>;
  claimTokens: (transferId: string) => Promise<string>;
  
  // Transfers
  transfers: BridgeTransferDetails[];
  refreshTransfers: () => Promise<void>;
  
  // Tokens
  supportedTokens: Record<ChainId, SupportedToken[]>;
  
  // Wallets
  solanaWallet: string | null;
  ethereumWallet: string | null;
  connectEthereum: () => Promise<void>;
}

export function useBridge({ autoConnect = true }: UseBridgeProps = {}): UseBridgeResult {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<BridgeTransferDetails[]>([]);
  const [supportedTokens, setSupportedTokens] = useState<Record<ChainId, SupportedToken[]>>({});
  
  // Wallet connections
  const { connection } = useConnection();
  const solanaWalletAdapter = useWallet();
  const { 
    library: ethereumProvider, 
    account: ethereumAccount,
    activate
  } = useWeb3React<Web3Provider>();
  
  // Initialize bridge service
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        await bridgeService.initialize();
        setIsInitialized(true);
        setError(null);
      } catch (err) {
        console.error('Failed to initialize bridge service:', err);
        setError(`Failed to initialize bridge: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    init();
  }, []);
  
  // Connect Solana wallet when adapter is ready
  useEffect(() => {
    if (solanaWalletAdapter.publicKey && isInitialized) {
      bridgeService.connectSolanaWallet(solanaWalletAdapter.publicKey);
      refreshTransfers();
    }
  }, [solanaWalletAdapter.publicKey, isInitialized]);
  
  // Connect Ethereum wallet when provider is ready
  useEffect(() => {
    if (ethereumProvider && isInitialized) {
      bridgeService.connectEthereumWallet(ethereumProvider);
      refreshTransfers();
    }
  }, [ethereumProvider, isInitialized]);
  
  // Load supported tokens for each chain
  useEffect(() => {
    if (isInitialized) {
      loadSupportedTokens();
    }
  }, [isInitialized]);
  
  // Load supported tokens for all chains
  const loadSupportedTokens = useCallback(async () => {
    try {
      const chains = [
        ChainId.Solana,
        ChainId.Ethereum,
        ChainId.Optimism,
        ChainId.Arbitrum,
        ChainId.Base
      ];
      
      const tokenMap: Record<ChainId, SupportedToken[]> = {};
      
      for (const chainId of chains) {
        const tokens = await bridgeService.getSupportedTokens(chainId);
        tokenMap[chainId] = tokens;
      }
      
      setSupportedTokens(tokenMap);
    } catch (err) {
      console.error('Failed to load supported tokens:', err);
      setError(`Failed to load supported tokens: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [isInitialized]);
  
  // Refresh transfer list
  const refreshTransfers = useCallback(async () => {
    try {
      setIsLoading(true);
      
      let transfersList: BridgeTransferDetails[] = [];
      
      // Get transfers for Solana address
      if (solanaWalletAdapter.publicKey) {
        const solanaTransfers = await bridgeService.getTransfersForAddress(
          solanaWalletAdapter.publicKey.toString()
        );
        transfersList = [...transfersList, ...solanaTransfers];
      }
      
      // Get transfers for Ethereum address
      if (ethereumAccount) {
        const ethereumTransfers = await bridgeService.getTransfersForAddress(
          ethereumAccount
        );
        
        // Merge transfers, avoiding duplicates
        const existingIds = new Set(transfersList.map(t => t.id));
        for (const transfer of ethereumTransfers) {
          if (!existingIds.has(transfer.id)) {
            transfersList.push(transfer);
          }
        }
      }
      
      // Sort transfers by timestamp (newest first)
      transfersList.sort((a, b) => b.timestamp - a.timestamp);
      
      setTransfers(transfersList);
      setError(null);
    } catch (err) {
      console.error('Failed to refresh transfers:', err);
      setError(`Failed to refresh transfers: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [solanaWalletAdapter.publicKey, ethereumAccount]);
  
  // Bridge tokens between chains
  const bridgeTokens = useCallback(async (params: BridgeTokensParams): Promise<BridgeTransferResult> => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Check wallet connections based on source chain
      if (params.sourceChain === ChainId.Solana && !solanaWalletAdapter.publicKey) {
        throw new Error('Solana wallet not connected');
      } else if (params.sourceChain !== ChainId.Solana && !ethereumAccount) {
        throw new Error('Ethereum wallet not connected');
      }
      
      // Execute bridge transaction
      const result = await bridgeService.bridgeTokens(params);
      
      // Refresh transfers list
      await refreshTransfers();
      
      return result;
    } catch (err) {
      console.error('Bridge transaction failed:', err);
      const errorMessage = `Failed to bridge tokens: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [solanaWalletAdapter.publicKey, ethereumAccount, refreshTransfers]);
  
  // Claim bridged tokens
  const claimTokens = useCallback(async (transferId: string): Promise<string> => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get transfer details to determine required wallet
      const transfer = await bridgeService.getTransferDetails(transferId);
      
      // Check wallet connections based on destination chain
      if (transfer.destinationChain === ChainId.Solana && !solanaWalletAdapter.publicKey) {
        throw new Error('Solana wallet not connected');
      } else if (transfer.destinationChain !== ChainId.Solana && !ethereumAccount) {
        throw new Error('Ethereum wallet not connected');
      }
      
      // Execute claim transaction
      const txHash = await bridgeService.claimTokens(transferId);
      
      // Refresh transfers list
      await refreshTransfers();
      
      return txHash;
    } catch (err) {
      console.error('Claim transaction failed:', err);
      const errorMessage = `Failed to claim tokens: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [solanaWalletAdapter.publicKey, ethereumAccount, refreshTransfers]);
  
  // Connect Ethereum wallet
  const connectEthereum = useCallback(async () => {
    if (activate) {
      try {
        // Request Ethereum wallet connection
        // This depends on your specific Web3 connector
        await activate('injected');
      } catch (err) {
        console.error('Failed to connect Ethereum wallet:', err);
        setError(`Failed to connect Ethereum wallet: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [activate]);
  
  return {
    isInitialized,
    isSolanaConnected: !!solanaWalletAdapter.publicKey,
    isEthereumConnected: !!ethereumAccount,
    isLoading,
    error,
    
    bridgeTokens,
    claimTokens,
    
    transfers,
    refreshTransfers,
    
    supportedTokens,
    
    solanaWallet: solanaWalletAdapter.publicKey?.toString() || null,
    ethereumWallet: ethereumAccount || null,
    connectEthereum
  };
}