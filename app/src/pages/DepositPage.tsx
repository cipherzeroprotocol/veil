import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { HELIUS_RPC_ENDPOINT } from '../constants';
import DepositForm from '../components/DepositForm';
import TransactionStatus, { TransactionStatus as TransactionStatusType } from '../components/TransactionStatus';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

const DepositPage: React.FC = () => {
  const { connected } = useWallet();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('helius_api_key') || '');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TransactionStatusType | null>(null);
  
  // Determine endpoint with API key
  const endpoint = apiKey 
    ? `${HELIUS_RPC_ENDPOINT}?api-key=${apiKey}` 
    : HELIUS_RPC_ENDPOINT;
  
  // Handle transaction status updates
  const handleTxStatusUpdate = (hash: string, status: 'pending' | 'confirmed' | 'error') => {
    setTxHash(hash);
    setTxStatus(status as TransactionStatusType);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center text-purple-800">Deposit Funds</h1>
      
      {/* API Key Warning */}
      {!apiKey && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h3 className="text-yellow-700 font-bold">Helius API Key Required</h3>
          <div className="flex flex-col md:flex-row items-center gap-2 mt-2">
            <Input
              className="flex-grow"
              placeholder="Enter your Helius API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              onClick={() => {
                if (apiKey) localStorage.setItem('helius_api_key', apiKey);
              }}
              disabled={!apiKey.trim()}
            >
              Save
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Please add your Helius API key to access ZK Compression features.
          </p>
        </div>
      )}
      
      {/* Transaction Status Display */}
      {txHash && (
        <div className="mb-6">
          <TransactionStatus 
            txHash={txHash}
            status={txStatus || 'pending'}
          />
        </div>
      )}
      
      {/* Not Connected Warning */}
      {!connected ? (
        <div className="bg-white shadow-md rounded-lg p-6 text-center">
          <p className="text-gray-700 mb-4">
            Please connect your wallet to deposit funds into a privacy pool.
          </p>
          <div className="flex justify-center">
            <WalletMultiButton className="bg-purple-600 hover:bg-purple-700" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          {/* Use DepositForm and pass onTxStatus callback */}
          <DepositForm 
            config={{
              rpcEndpoint: endpoint,
              apiKey: apiKey,
              enableRiskChecks: true
            }} 
            onTxStatus={handleTxStatusUpdate}
          />
          
          {/* Information Sections */}
          <div className="bg-white shadow-md rounded-lg p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">How It Works</h2>
            <ol className="list-decimal list-inside space-y-3 text-gray-700">
              <li>
                <span className="font-medium">Select a privacy pool</span>
                <p className="ml-5 text-sm text-gray-500">
                  Choose a pool with your desired deposit amount. All deposits in a pool are the same size, which improves privacy.
                </p>
              </li>
              <li>
                <span className="font-medium">Deposit your funds</span>
                <p className="ml-5 text-sm text-gray-500">
                  Your deposit will be added to the pool and a cryptographic commitment is stored on-chain.
                </p>
              </li>
              <li>
                <span className="font-medium">Save your withdrawal note</span>
                <p className="ml-5 text-sm text-gray-500">
                  This note contains the secret values needed to withdraw your funds later. It cannot be recovered if lost.
                </p>
              </li>
              <li>
                <span className="font-medium">Withdraw anytime</span>
                <p className="ml-5 text-sm text-gray-500">
                  Use your withdrawal note to withdraw funds to any address, breaking the on-chain link between deposit and withdrawal.
                </p>
              </li>
            </ol>
          </div>
          
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">FAQ</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900">How does this preserve my privacy?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  SolanaVeil uses zero-knowledge proofs and merkle trees to break the on-chain link between your deposit and withdrawal transactions.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Are my funds safe?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Yes. The protocol is non-custodial, meaning only you have access to your funds with your withdrawal note.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Why are there fixed denominations?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Fixed amounts create an anonymity set - all deposits of the same amount look identical, enhancing privacy.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepositPage;
