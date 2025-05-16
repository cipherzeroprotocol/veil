import React, { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useWeb3React } from '@web3-react/core';
import { Web3Provider } from '@ethersproject/providers';
import Button from './common/Button';
import Input from './common/Input';
import RelayerSelector from './RelayerSelector';
import TransactionStatus from './TransactionStatus';
import { SelectOption } from './common/Select';
import { useWithdraw } from '../hooks/useWithdraw';
import { useZkProof } from '../hooks/useZkProof';
import { usePool } from '../hooks/usePool';
import { useBridge } from '../hooks/useBridge';
import { notify } from '../utils/notifications';
import { PROGRAM_ID } from '../constants';
import { ChainId } from '../../../sdk/src';


interface WithdrawFormProps {
  config: {
    rpcEndpoint: string;
    apiKey?: string;
    enableRiskChecks: boolean;
    wasmPath?: string;
    zkeyPath?: string;
    verificationKeyPath?: string;
    programId?: string;
    supportedChains?: ChainId[];
    bridgeConfig?: {
      ethereumRpcUrl: string;
      ethereumBridgeAddress: string;
      optimismRpcUrl?: string;
      optimismBridgeAddress?: string;
      arbitrumRpcUrl?: string;
      arbitrumBridgeAddress?: string;
      baseRpcUrl?: string;
      baseBridgeAddress?: string;
    };
  };
  selectedRelayer?: {address: PublicKey; fee: number};
  onTxStatus?: (hash: string, status: 'pending' | 'confirmed' | 'error') => void;
  onSuccess?: (recipient: string, amount: number) => void;
  onChainChange?: (sourceChain: ChainId, destinationChain: ChainId) => void;
}

const WithdrawForm: React.FC<WithdrawFormProps> = ({ 
  config, 
  selectedRelayer,
  onTxStatus,
  onSuccess,
  onChainChange
}) => {
  // useConnection() is called but its return value is not used
    useConnection();
  const { publicKey } = useWallet();
  // Get Ethereum wallet
  const { account: ethAccount } = useWeb3React<Web3Provider>();
  
  // State variables for the form
  const [note, setNote] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [useSelfAddress, setUseSelfAddress] = useState(true);
  const [estimatedTxFee] = useState(0.000005); // 0.000005 SOL
  const [withdrawalAmount, setWithdrawalAmount] = useState<number | null>(null);
  const [isCrossChain, setIsCrossChain] = useState(false);
  const [sourceChain, setSourceChain] = useState<ChainId>(ChainId.Solana);
  const [destinationChain, setDestinationChain] = useState<ChainId>(ChainId.Ethereum);
  const [chainOptions, setChainOptions] = useState<SelectOption[]>([]);
  const [localSelectedRelayer, setLocalSelectedRelayer] = useState<{address: PublicKey; fee: number} | undefined>(selectedRelayer);
  const [useRelayer, setUseRelayer] = useState(!!selectedRelayer);
  
  // Steps for simple withdrawal
  const [withdrawSteps, setWithdrawSteps] = useState<string[]>([
    'Parsing withdrawal note',
    'Getting merkle proof',
    'Generating zero-knowledge proof',
    'Creating transaction',
    'Submitting to blockchain',
    'Confirming transaction'
  ]);

  // Memoized additional steps for cross-chain withdrawal
  const crossChainSteps = React.useMemo(() => [
    'Parsing withdrawal note',
    'Verifying cross-chain compatibility',
    'Getting merkle proof',
    'Generating zero-knowledge proof',
    'Creating bridge transaction',
    'Submitting to source blockchain',
    'Waiting for bridge confirmation',
    'Finalizing on destination chain'
  ], []);
  
  const [currentStep, setCurrentStep] = useState(0);
  
  // Use custom hooks
  const { 
    parseNote, 
    withdraw, 
    loading: withdrawLoading, 
    error: withdrawError, 
    status, 
    progress, 
    parsedNote, 
    txHash
  } = useWithdraw({
    rpcEndpoint: config.rpcEndpoint,
    apiKey: config.apiKey || '',
    programId: config.programId || PROGRAM_ID,
    wasmPath: config.wasmPath || '/circuits/withdraw.wasm',
    zkeyPath: config.zkeyPath || '/circuits/withdraw.zkey'
  });
  
  // Use ZK Proof hook
  const { 
    /* isGenerating not used */
    progress: zkProgress,
    estimatedTime
  } = useZkProof({
    wasmPath: config.wasmPath || '/circuits/withdraw.wasm',
    zkeyPath: config.zkeyPath || '/circuits/withdraw.zkey',
    verificationKeyPath: config.verificationKeyPath || '/circuits/verification_key.json',
    enableCaching: true
  });
  
  // Use pool hook
  const { getPool } = usePool({
    rpcEndpoint: config.rpcEndpoint,
    apiKey: config.apiKey || '',
    programId: PROGRAM_ID,
    autoLoad: false
  });
  
  // Use bridge hook for cross-chain operations
  const { 
    bridgeTokens, 
    /* claimTokens not used */
    isInitialized: isBridgeInitialized,
    isLoading: isBridgeLoading, 
    error: bridgeError,
    /* supportedTokens not used */
  } = useBridge();

  // Initialize chain options
  useEffect(() => {
    if (config.supportedChains) {
      const options = config.supportedChains.map(chainId => {
        const chainNames: Record<number, string> = {
          [ChainId.Solana]: 'Solana',
          //[ChainId.Ethereum]: 'Ethereum',
          [ChainId.Optimism]: 'Optimism',
          [ChainId.Arbitrum]: 'Arbitrum',
          [ChainId.Base]: 'Base'
        };
        
        return {
          value: chainId,
          label: chainNames[chainId] || `Chain ${chainId}`,
          icon: `/images/networks/${chainNames[chainId]?.toLowerCase() || 'unknown'}.svg`
        };
      });
      
      setChainOptions(options);
    }
  }, [config.supportedChains]);

  // Update withdrawal steps based on cross-chain status
  useEffect(() => {
    if (isCrossChain) {
      setWithdrawSteps(crossChainSteps);
    } else {
      setWithdrawSteps([
        'Parsing withdrawal note',
        'Getting merkle proof',
        'Generating zero-knowledge proof',
        'Creating transaction',
        'Submitting to blockchain',
        'Confirming transaction'
      ]);
    }
  }, [isCrossChain, crossChainSteps]);
  
  // Set initial recipient address when wallet connects
  useEffect(() => {
    if (publicKey && useSelfAddress && !isCrossChain) {
      setRecipientAddress(publicKey.toString());
    } else if (ethAccount && useSelfAddress && isCrossChain && destinationChain !== ChainId.Solana) {
      setRecipientAddress(ethAccount);
    }
  }, [publicKey, ethAccount, useSelfAddress, isCrossChain, destinationChain]);
  
  // Update transaction status callback when txHash changes
  useEffect(() => {
    if (txHash && onTxStatus) {
      onTxStatus(txHash, 'confirmed');
    }
  }, [txHash, onTxStatus]);
  
  // Update withdrawal amount when note or relayer changes
  useEffect(() => {
    const updateAmount = async () => {
      if (parsedNote) {
        try {
          // Get pool data to verify denomination
          const poolData = await getPool(parsedNote.poolId);
          if (poolData) {
            let amount = parseFloat(parsedNote.denomination);
            
            // Subtract relayer fee if applicable
            if (localSelectedRelayer) {
              const relayerFeeAmount = (amount * localSelectedRelayer.fee) / 100;
              amount -= relayerFeeAmount;
            }
            
            // If cross-chain, estimate bridge fees
            if (isCrossChain) {
              // Assume 0.5% bridge fee for demonstration
              const bridgeFee = amount * 0.005;
              amount -= bridgeFee;
            }
            
            setWithdrawalAmount(amount);
          }
        } catch (err) {
          console.error("Error getting pool data:", err);
        }
      } else {
        setWithdrawalAmount(null);
      }
    };
    
    updateAmount();
  }, [parsedNote, localSelectedRelayer, getPool, isCrossChain]);
  
  // Update current step based on withdrawal progress
  useEffect(() => {
    if (withdrawLoading) {
      // Map progress percentage to step index
      const stepIndex = Math.min(
        Math.floor((progress + zkProgress) / 2 / (100 / withdrawSteps.length)),
        withdrawSteps.length - 1
      );
      setCurrentStep(stepIndex);
    } else {
      setCurrentStep(0);
    }
  }, [progress, zkProgress, withdrawLoading, withdrawSteps.length]);

  // Notify parent about chain changes
  useEffect(() => {
    if (onChainChange && isCrossChain) {
      onChainChange(sourceChain, destinationChain);
    }
  }, [sourceChain, destinationChain, isCrossChain, onChainChange]);
  
  // Handle note input
  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(e.target.value);
    // Try to parse note on change for instant feedback
    if (e.target.value.trim() !== '') {
      parseNote(e.target.value).catch(console.error);
    }
  };
  
  // Handle recipient address input
  const handleRecipientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRecipientAddress(e.target.value);
  };
  
  // Handle self address toggle
  const handleUseSelfAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUseSelfAddress(e.target.checked);
    
    if (e.target.checked) {
      if (isCrossChain && destinationChain !== ChainId.Solana) {
        // Use Ethereum address for non-Solana destinations
        setRecipientAddress(ethAccount || '');
      } else if (publicKey) {
        // Use Solana address
        setRecipientAddress(publicKey.toString());
      }
    } else {
      setRecipientAddress('');
    }
  };

  // Handle cross-chain toggle
  const handleCrossChainToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsCrossChain(e.target.checked);
    
    // Reset destination to default when toggling
    if (e.target.checked) {
      // If source is Solana, set destination to Ethereum by default
      if (sourceChain === ChainId.Solana) {
        setDestinationChain(ChainId.Ethereum);
      } else {
        // Otherwise set destination to Solana
      setDestinationChain(ChainId.Solana);
      }
    }
  };

  // Handle source chain change
  const handleSourceChainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSourceChain = Number(e.target.value) as ChainId;
    setSourceChain(newSourceChain);
    
    // If new source equals current destination, swap them
    if (newSourceChain === destinationChain) {
      if (newSourceChain === ChainId.Solana) {
        setDestinationChain(ChainId.Ethereum);
      } else {
        setDestinationChain(ChainId.Solana);
      }
    }
  };

  // Handle destination chain change
  const handleDestinationChainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDestinationChain = Number(e.target.value) as ChainId;
    setDestinationChain(newDestinationChain);
    
    // If new destination equals current source, swap them
    if (sourceChain === newDestinationChain) {
      if (newDestinationChain === ChainId.Solana) {
        setSourceChain(ChainId.Ethereum);
      } else {
        setSourceChain(ChainId.Solana);
      }
    }

    // Update recipient based on destination chain
    if (useSelfAddress) {
      if (newDestinationChain === ChainId.Solana && publicKey) {
        setRecipientAddress(publicKey.toString());
      } else if (newDestinationChain !== ChainId.Solana && ethAccount) {
        setRecipientAddress(ethAccount);
      }
    }
  };
  
  // Validate recipient address
  const isValidRecipient = useCallback(() => {
    if (!recipientAddress.trim()) return false;
    
    try {
      if (isCrossChain && destinationChain !== ChainId.Solana) {
        // Validate Ethereum address format
        return /^0x[a-fA-F0-9]{40}$/.test(recipientAddress);
      } else {
        // Validate Solana address
        new PublicKey(recipientAddress);
        return true;
      }
    } catch (err) {
      return false;
    }
  }, [recipientAddress, isCrossChain, destinationChain]);
  
  // Handle relayer selection
  const handleRelayerSelect = useCallback((relayer?: {address: PublicKey; fee: number}) => {
    setLocalSelectedRelayer(relayer);
    
    // Update withdrawal amount to reflect relayer fee
    if (parsedNote) {
      let amount = parseFloat(parsedNote.denomination);
      
      // Subtract relayer fee if applicable
      if (relayer) {
        const relayerFeeAmount = (amount * relayer.fee) / 100;
        amount -= relayerFeeAmount;
      }
      
      // If cross-chain, apply bridge fee
      if (isCrossChain) {
        const bridgeFee = amount * 0.005;
        amount -= bridgeFee;
      }
      
      setWithdrawalAmount(amount);
    }
  }, [parsedNote, isCrossChain]);

  // Handle relayer toggle
  const handleUseRelayerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUseRelayer(e.target.checked);
    if (!e.target.checked) {
      setLocalSelectedRelayer(undefined);
    }
  };

  // Handle withdrawal submission
  const handleWithdraw = async () => {
    if ((!publicKey && sourceChain === ChainId.Solana) || 
        (!ethAccount && sourceChain !== ChainId.Solana)) {
      notify({ type: 'error', message: 'Please connect your wallet' });
      return;
    }
    
    if (!parsedNote) {
      // Try parsing note first if not already parsed
      try {
        const parsedNote = await parseNote(note);
        if (!parsedNote) {
          notify({ type: 'error', message: 'Invalid withdrawal note' });
          return;
        }
      } catch (err) {
        notify({ type: 'error', message: 'Failed to parse note: ' + (err as Error).message });
        return;
      }
    }
    
    if (!isValidRecipient()) {
      notify({ type: 'error', message: 'Invalid recipient address' });
      return;
    }
    
    try {
      // Notify about pending transaction
      if (onTxStatus) {
        onTxStatus('pending', 'pending');
      }
      
      if (isCrossChain) {
        // Handle cross-chain withdrawal using bridge
        const result = await bridgeTokens({
          sourceChain,
          destinationChain,
          amount: parsedNote!.denomination,
          tokenId: 1, // Assuming default token - this should be determined from note
          recipient: recipientAddress
        });
        
        if (result) {
          notify({ 
            type: 'success', 
            message: 'Cross-chain withdrawal initiated!',
            description: `Transaction: ${result.transfer.txHash || 'Processing'}`
          });
          
          // Notify parent component of success
          if (onSuccess && withdrawalAmount) {
            onSuccess(recipientAddress, withdrawalAmount);
          }
        }
      } else {
        // Standard withdrawal
        const result = await withdraw({
          note: parsedNote!,
          recipient: recipientAddress,
          relayerAddress: localSelectedRelayer?.address.toString()
        });
        
        if (result) {
          notify({ 
            type: 'success', 
            message: 'Withdrawal successful!',
            description: `Transaction: ${result.txHash}`
          });
          
          // Notify parent component of success
          if (onSuccess && withdrawalAmount) {
            onSuccess(recipientAddress, withdrawalAmount);
          }
        }
      }
    } catch (err) {
      console.error('Error withdrawing:', err);
      
      if (onTxStatus) {
        onTxStatus('error', 'error');
      }
      
      notify({ 
        type: 'error', 
        message: 'Withdrawal failed: ' + (err instanceof Error ? err.message : String(err))
      });
    }
  };
  
  // Calculate total costs
  const relayerFeeDisplay = localSelectedRelayer && withdrawalAmount
    ? `${((localSelectedRelayer.fee / 100) * parseFloat(parsedNote?.denomination || '0')).toFixed(4)} SOL (${localSelectedRelayer.fee}%)`
    : 'None';
  
  const txFeeDisplay = localSelectedRelayer
    ? 'Paid by relayer'
    : `~${estimatedTxFee.toFixed(6)} SOL`;

  // Calculate bridge fee if applicable
  const bridgeFeeDisplay = isCrossChain && parsedNote
    ? `${(parseFloat(parsedNote.denomination) * 0.005).toFixed(4)} SOL (0.5%)`
    : 'None';
  
  return (
    <div className="bg-white shadow-md rounded-lg p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">Withdraw</h2>
      
      {/* Withdrawal Note Input */}
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2">
          Withdrawal Note
        </label>
        <textarea
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          rows={4}
          value={note}
          onChange={handleNoteChange}
          placeholder="Paste your withdrawal note here"
          disabled={withdrawLoading || isBridgeLoading}
        />
        <p className="text-sm text-gray-500 mt-1">
          This is the note you received when you made your deposit
        </p>
        
        {parsedNote && (
          <div className="mt-2 p-2 bg-green-50 border border-green-100 rounded text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Pool ID:</span>
              <span className="font-mono">{parsedNote.poolId.substring(0, 8)}...{parsedNote.poolId.substring(parsedNote.poolId.length - 4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Amount:</span>
              <span className="font-medium">{parsedNote.denomination} SOL</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Cross-chain option */}
      {config.bridgeConfig && (
        <div className="mb-4">
          <div className="flex items-center mb-2">
            <input
              id="cross-chain"
              type="checkbox"
              className="h-4 w-4 text-purple-600 focus:ring-purple-500"
              checked={isCrossChain}
              onChange={handleCrossChainToggle}
              disabled={withdrawLoading || isBridgeLoading}
            />
            <label htmlFor="cross-chain" className="ml-2 block text-sm text-gray-700">
              Cross-chain withdrawal
            </label>
          </div>
          
          {isCrossChain && chainOptions.length > 0 && (
            <div className="p-3 bg-blue-50 rounded-md mb-3">
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Source Chain
                  </label>
                  <select
                    value={sourceChain}
                    onChange={handleSourceChainChange}
                    disabled={withdrawLoading || isBridgeLoading}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {chainOptions.map(option => (
                      <option 
                        key={option.value} 
                        value={option.value}
                        disabled={option.value === destinationChain}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Destination Chain
                  </label>
                  <select
                    value={destinationChain}
                    onChange={handleDestinationChainChange}
                    disabled={withdrawLoading || isBridgeLoading}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {chainOptions.map(option => (
                      <option 
                        key={option.value} 
                        value={option.value}
                        disabled={option.value === sourceChain}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <p className="text-xs text-gray-600">
                Cross-chain withdrawals use the SolanaVeil Bridge to securely transfer your assets 
                between networks while maintaining privacy.
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Use my wallet address checkbox */}
      <div className="mb-4">
        <div className="flex items-center mb-2">
          <input
            id="use-self-address"
            type="checkbox"
            className="h-4 w-4 text-purple-600 focus:ring-purple-500"
            checked={useSelfAddress}
            onChange={handleUseSelfAddressChange}
            disabled={withdrawLoading || isBridgeLoading}
          />
          <label htmlFor="use-self-address" className="ml-2 block text-sm text-gray-700">
            Use my wallet address
          </label>
        </div>
        
        {!useSelfAddress && (
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Recipient Address
            </label>
            <Input
              value={recipientAddress}
              onChange={handleRecipientChange}
              placeholder={
                isCrossChain && destinationChain !== ChainId.Solana 
                  ? "Ethereum address to receive funds" 
                  : "Solana address to receive funds"
              }
              disabled={withdrawLoading || isBridgeLoading}
              error={recipientAddress.trim() !== '' && !isValidRecipient() ? `Invalid ${isCrossChain && destinationChain !== ChainId.Solana ? 'Ethereum' : 'Solana'} address` : undefined}
            />
          </div>
        )}
      </div>
      
      {/* Relayer Selection */}
      {!isCrossChain && parsedNote && (
        <div className="mb-4">
          <div className="flex items-center mb-2">
            <input
              id="use-relayer"
              type="checkbox"
              className="h-4 w-4 text-purple-600 focus:ring-purple-500"
              checked={useRelayer}
              onChange={handleUseRelayerChange}
              disabled={withdrawLoading || isBridgeLoading}
            />
            <label htmlFor="use-relayer" className="ml-2 block text-sm text-gray-700">
              Use relayer (gas-less withdrawal)
            </label>
          </div>
          
          {useRelayer && (
            <div className="mt-2">
              <p className="text-sm text-gray-600 mb-2">
                Select a relayer to process your withdrawal. The relayer will pay the transaction fees for you.
              </p>
              <RelayerSelector
                onChange={handleRelayerSelect}
                disabled={withdrawLoading || isBridgeLoading}
                showNoRelayer={false}
                rpcEndpoint={config.rpcEndpoint}
                apiKey={config.apiKey}
              />
            </div>
          )}
        </div>
      )}
      
      {/* Selected Relayer Information (if any) */}
      {localSelectedRelayer && !isCrossChain && (
        <div className="mb-6">
          <div className="bg-blue-50 p-3 rounded-md">
            <h3 className="font-medium text-blue-800 mb-1">Selected Relayer</h3>
            <p className="text-sm text-gray-700">
              {localSelectedRelayer.address.toString().slice(0, 6)}...{localSelectedRelayer.address.toString().slice(-4)}
            </p>
            <p className="text-xs text-gray-600">
              Fee: {localSelectedRelayer.fee.toFixed(2)}% of withdrawal amount
            </p>
          </div>
        </div>
      )}
      
      {/* Transaction Cost Summary */}
      {parsedNote && (
        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <h3 className="font-medium text-gray-800 mb-2">Transaction Summary</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Withdrawal amount:</span>
              <span>{parsedNote.denomination} SOL</span>
            </div>
            <div className="flex justify-between">
              <span>Relayer fee:</span>
              <span>{relayerFeeDisplay}</span>
            </div>
            {isCrossChain && (
              <div className="flex justify-between">
                <span>Bridge fee:</span>
                <span>{bridgeFeeDisplay}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Network fee:</span>
              <span>{txFeeDisplay}</span>
            </div>
            <hr className="my-1 border-gray-200" />
            <div className="flex justify-between font-medium">
              <span>You receive:</span>
              <span>
                {withdrawalAmount?.toFixed(4) || '—'} SOL
                {isCrossChain && destinationChain !== ChainId.Solana && " (equivalent)"}
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Transaction Status */}
      {txHash && (
        <div className="mb-4">
          <TransactionStatus
            txHash={txHash}
            status={withdrawLoading || isBridgeLoading ? 'pending' : 'confirmed'}
            progress={(progress + zkProgress) / 2} // Average of both progresses
            steps={withdrawSteps}
            currentStep={currentStep}
            estimatedTime={estimatedTime || undefined} // Convert null to undefined
          />
        </div>
      )}
      
      {/* Withdraw Button */}
      <Button
        onClick={handleWithdraw}
        disabled={
          withdrawLoading || isBridgeLoading || 
          !parsedNote || !isValidRecipient() || 
          (sourceChain === ChainId.Solana && !publicKey) ||
          (sourceChain !== ChainId.Solana && !ethAccount) ||
          (isCrossChain && !isBridgeInitialized) ||
          (useRelayer && !localSelectedRelayer)
        }
        isLoading={withdrawLoading || isBridgeLoading}
        fullWidth
        variant="primary"
      >
        {isCrossChain ? "Bridge and Withdraw" : useRelayer ? "Withdraw via Relayer" : "Withdraw"}
      </Button>
      
      {/* Progress Display */}
      {(withdrawLoading || isBridgeLoading) && !txHash && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 text-center mb-2">
            {isCrossChain 
              ? `Preparing cross-chain transfer to ${chainOptions.find(o => o.value === destinationChain)?.label}...`
              : status === 'generating' 
                ? 'Generating zero-knowledge proof...' 
                : 'Processing withdrawal...'
            }
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(progress, zkProgress)}%` }} 
            />
          </div>
          <p className="text-xs text-gray-500 text-right">
            {Math.max(progress, zkProgress).toFixed(0)}% complete
          </p>
        </div>
      )}
      
      {/* Error Display */}
      {(withdrawError || bridgeError) && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-md">
          <p>Error: {withdrawError || bridgeError}</p>
        </div>
      )}
      
      {/* Cross-chain information */}
      {isCrossChain && (
        <div className="mt-4 p-3 bg-yellow-50 rounded-md">
          <h4 className="text-xs font-semibold text-yellow-800 mb-1">Cross-Chain Transfer Information</h4>
          <p className="text-xs text-yellow-700">
            Cross-chain transfers typically take 10-30 minutes to complete depending on network congestion.
            You'll be able to track your transfer in the transaction history once initiated.
          </p>
        </div>
      )}
    </div>
  );
};

export default WithdrawForm;