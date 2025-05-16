import React, { useState, useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWeb3React } from '@web3-react/core';
import NetworkSelector from './NetworkSelector';
import { useBridge } from '../hooks/useBridge';
import { ChainId, BridgeTransferDetails, BridgeTransferStatus } from '../services/bridgeService';

const BridgeForm: React.FC = () => {
  // Hook into wallets and bridge service
  const { publicKey: solanaPublicKey } = useWallet();
  const { account: ethereumAccount, activate } = useWeb3React();
  const {
    isInitialized,
    isLoading,
    error,
    bridgeTokens,
    supportedTokens,
    transfers,
    refreshTransfers,
    claimTokens
  } = useBridge();

  // Form state
  const [sourceChain, setSourceChain] = useState<ChainId>(ChainId.Solana);
  const [destinationChain, setDestinationChain] = useState<ChainId>(ChainId.Ethereum);
  const [amount, setAmount] = useState('');
  const [tokenId, setTokenId] = useState(1); // Default to first token
  const [recipient, setRecipient] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'bridge' | 'history'>('bridge');
  const [selectedTransfer, setSelectedTransfer] = useState<BridgeTransferDetails | null>(null);

  // Connect Ethereum wallet
  const connectEthereumWallet = async () => {
    try {
      await activate('injected');
    } catch (err) {
      console.error('Failed to connect Ethereum wallet:', err);
    }
  };

  // Update recipient when source chain changes
  useEffect(() => {
    // Auto-fill recipient with connected wallet of destination chain
    if (destinationChain === ChainId.Solana && solanaPublicKey) {
      setRecipient(solanaPublicKey.toString());
    } else if (destinationChain !== ChainId.Solana && ethereumAccount) {
      setRecipient(ethereumAccount);
    } else {
      setRecipient('');
    }
  }, [destinationChain, solanaPublicKey, ethereumAccount]);

  // Handle source chain change
  const handleSourceChainChange = (chain: ChainId) => {
    setSourceChain(chain);
    
    // If new source equals current destination, swap them
    if (chain === destinationChain) {
      setDestinationChain(sourceChain);
    }
    
    // Reset token selection since tokens differ by chain
    if (supportedTokens[chain]?.length > 0) {
      setTokenId(supportedTokens[chain][0].id);
    }
  };

  // Handle destination chain change
  const handleDestinationChainChange = (chain: ChainId) => {
    setDestinationChain(chain);
    
    // If new destination equals current source, swap them
    if (chain === sourceChain) {
      setSourceChain(destinationChain);
    }
  };

  // Get available tokens for the selected source chain
  const availableTokens = useMemo(() => {
    return supportedTokens[sourceChain] || [];
  }, [supportedTokens, sourceChain]);

  // Find current token
  const selectedToken = useMemo(() => {
    return availableTokens.find(token => token.id === tokenId);
  }, [availableTokens, tokenId]);

  // Check if form is valid
  const isFormValid = useMemo(() => {
    if (!isInitialized) return false;
    if (!amount || !recipient) return false;
    
    // Check wallet connections
    if (sourceChain === ChainId.Solana && !solanaPublicKey) return false;
    if (sourceChain !== ChainId.Solana && !ethereumAccount) return false;
    
    // Check amount is within limits
    if (selectedToken) {
      const amountNum = parseFloat(amount);
      const minAmount = parseFloat(selectedToken.minAmount);
      const maxAmount = parseFloat(selectedToken.maxAmount);
      
      if (isNaN(amountNum) || amountNum < minAmount || amountNum > maxAmount) {
        return false;
      }
    }
    
    return true;
  }, [
    isInitialized, amount, recipient, sourceChain, solanaPublicKey,
    ethereumAccount, selectedToken
  ]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    
    setSubmitError(null);
    setTxHash(null);
    
    try {
      const result = await bridgeTokens({
        sourceChain,
        destinationChain,
        amount,
        tokenId,
        recipient
      });
      
      console.log('Bridge transaction successful:', result);
      
      // Store the transaction hash
      setTxHash(result.transfer.txHash || null);
      
      // Switch to history tab to show the new transaction
      setActiveTab('history');
      
      // Reset form
      setAmount('');
    } catch (err) {
      console.error('Bridge transaction failed:', err);
      setSubmitError(`Transaction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle claim button click
  const handleClaim = async (transferId: string) => {
    try {
      const txHash = await claimTokens(transferId);
      alert(`Claim successful! Transaction hash: ${txHash}`);
      
      // Refresh transfers list
      await refreshTransfers();
    } catch (err) {
      console.error('Claim failed:', err);
      alert(`Claim failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-6 max-w-3xl mx-auto">
      <div className="flex mb-6 border-b">
        <button
          className={`px-4 py-2 font-medium ${
            activeTab === 'bridge'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('bridge')}
        >
          Bridge Tokens
        </button>
        <button
          className={`px-4 py-2 font-medium ${
            activeTab === 'history'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('history')}
        >
          Transaction History
        </button>
      </div>

      {activeTab === 'bridge' && (
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Bridge your assets securely</h2>
            
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <NetworkSelector
                  label="From"
                  selectedNetwork={sourceChain}
                  onChange={handleSourceChainChange}
                  excludeNetworks={[destinationChain]}
                />
                
                <div className="flex items-center mx-4 mt-6">
                  <button
                    type="button"
                    className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
                    onClick={() => {
                      const tempChain = sourceChain;
                      setSourceChain(destinationChain);
                      setDestinationChain(tempChain);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
                    </svg>
                  </button>
                </div>
                
                <NetworkSelector
                  label="To"
                  selectedNetwork={destinationChain}
                  onChange={handleDestinationChainChange}
                  excludeNetworks={[sourceChain]}
                  sourceNetwork={sourceChain}
                />
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-3 pr-36 sm:text-sm border-gray-300 rounded-md"
                  placeholder="0.00"
                />
                <div className="absolute inset-y-0 right-0 flex items-center">
                  <select
                    value={tokenId}
                    onChange={(e) => setTokenId(Number(e.target.value))}
                    className="focus:ring-indigo-500 focus:border-indigo-500 h-full py-0 pl-2 pr-7 border-transparent bg-transparent text-gray-500 sm:text-sm rounded-md"
                  >
                    {availableTokens.map((token) => (
                      <option key={token.id} value={token.id}>
                        {token.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedToken && (
                <p className="mt-1 text-xs text-gray-500">
                  Min: {selectedToken.minAmount} {selectedToken.symbol}, 
                  Max: {selectedToken.maxAmount} {selectedToken.symbol}
                </p>
              )}
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipient Address
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-3 pr-3 sm:text-sm border-gray-300 rounded-md"
                placeholder={
                  destinationChain === ChainId.Solana
                    ? "Solana Address"
                    : "Ethereum Address"
                }
              />
            </div>
          </div>
          
          <div className="py-4 border-t border-gray-200">
            {/* Wallet Connection Status */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
              <div className="mb-2 sm:mb-0">
                <span className="text-sm font-medium text-gray-700 mr-2">Solana:</span>
                {solanaPublicKey ? (
                  <span className="text-sm text-green-600 font-medium">
                    Connected ({solanaPublicKey.toString().slice(0, 6)}...{solanaPublicKey.toString().slice(-4)})
                  </span>
                ) : (
                  <WalletMultiButton className="!bg-indigo-600 !hover:bg-indigo-700 !text-white !font-medium !py-1 !px-3 !text-sm !rounded-md !shadow-sm">
                    Connect Solana
                  </WalletMultiButton>
                )}
              </div>
              
              <div>
                <span className="text-sm font-medium text-gray-700 mr-2">Ethereum:</span>
                {ethereumAccount ? (
                  <span className="text-sm text-green-600 font-medium">
                    Connected ({ethereumAccount.slice(0, 6)}...{ethereumAccount.slice(-4)})
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={connectEthereumWallet}
                    className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Connect Ethereum
                  </button>
                )}
              </div>
            </div>
            
            {/* Error display */}
            {(error || submitError) && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
                {error || submitError}
              </div>
            )}
            
            {/* Transaction hash display */}
            {txHash && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md">
                Transaction submitted! Hash: {txHash}
              </div>
            )}
            
            <button
              type="submit"
              disabled={!isFormValid || isLoading}
              className={`w-full inline-flex justify-center py-3 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                isFormValid && !isLoading
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-gray-400 cursor-not-allowed'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                'Bridge Tokens'
              )}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'history' && (
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4">Transaction History</h2>
          
          {transfers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transactions found. Bridge some tokens to get started!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      From → To
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transfers.map((transfer) => {
                    const getChainName = (id: number) => {
                      switch (id) {
                        case ChainId.Solana:
                          return 'Solana';
                        case ChainId.Ethereum:
                          return 'Ethereum';
                        case ChainId.Optimism:
                          return 'Optimism';
                        case ChainId.Arbitrum:
                          return 'Arbitrum';
                        case ChainId.Base:
                          return 'Base';
                        default:
                          return `Chain ${id}`;
                      }
                    };
                    
                    const getStatusColor = (status: BridgeTransferStatus) => {
                      switch (status) {
                        case BridgeTransferStatus.Completed:
                          return 'text-green-800 bg-green-100';
                        case BridgeTransferStatus.Failed:
                          return 'text-red-800 bg-red-100';
                        default:
                          return 'text-yellow-800 bg-yellow-100';
                      }
                    };
                    
                    return (
                      <tr key={transfer.id} onClick={() => setSelectedTransfer(transfer)} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(transfer.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {getChainName(transfer.sourceChain)} → {getChainName(transfer.destinationChain)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {transfer.amount} (Token ID: {transfer.tokenId})
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(transfer.status)}`}>
                            {transfer.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {transfer.status === BridgeTransferStatus.Pending && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClaim(transfer.id);
                              }}
                              className="text-indigo-600 hover:text-indigo-900 font-medium"
                            >
                              Claim
                            </button>
                          )}
                          {transfer.txHash && (
                            <a
                              href={`${
                                transfer.sourceChain === ChainId.Solana
                                  ? `https://explorer.solana.com/tx/${transfer.txHash}`
                                  : `https://etherscan.io/tx/${transfer.txHash}`
                              }`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-900 font-medium ml-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Transfer Details Modal */}
          {selectedTransfer && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Transfer Details</h3>
                  <button
                    onClick={() => setSelectedTransfer(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="mt-2">
                  <p className="text-sm text-gray-600">
                    <strong>ID:</strong> {selectedTransfer.id}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    <strong>From:</strong> {selectedTransfer.sender}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    <strong>To:</strong> {selectedTransfer.recipient}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    <strong>Amount:</strong> {selectedTransfer.amount} (Token ID: {selectedTransfer.tokenId})
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    <strong>Status:</strong> {selectedTransfer.status}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    <strong>Date:</strong> {new Date(selectedTransfer.timestamp).toLocaleString()}
                  </p>
                  {selectedTransfer.txHash && (
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Transaction:</strong>{' '}
                      <a
                        href={`${
                          selectedTransfer.sourceChain === ChainId.Solana
                            ? `https://explorer.solana.com/tx/${selectedTransfer.txHash}`
                            : `https://etherscan.io/tx/${selectedTransfer.txHash}`
                        }`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {selectedTransfer.txHash.slice(0, 10)}...{selectedTransfer.txHash.slice(-8)}
                      </a>
                    </p>
                  )}
                </div>
                
                <div className="mt-4">
                  {selectedTransfer.status === BridgeTransferStatus.Pending && (
                    <button
                      onClick={() => {
                        handleClaim(selectedTransfer.id);
                        setSelectedTransfer(null);
                      }}
                      className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Claim Tokens
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BridgeForm;