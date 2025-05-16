import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { HELIUS_RPC_ENDPOINT, CIRCUIT_PATHS, PROGRAM_ID } from '../constants';
import WithdrawForm from '../components/WithdrawForm';
import RelayerSelector from '../components/RelayerSelector';
import TransactionStatus, { TransactionStatus as TxStatusType } from '../components/TransactionStatus';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { PublicKey } from '@solana/web3.js';

const WithdrawPage: React.FC = () => {
  const { connected } = useWallet();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('helius_api_key') || '');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRelayer, setSelectedRelayer] = useState<{address: PublicKey; fee: number} | undefined>();
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatusType | null>(null);
  
  // Determine endpoint with API key
  const endpoint = apiKey 
    ? `${HELIUS_RPC_ENDPOINT}?api-key=${apiKey}` 
    : HELIUS_RPC_ENDPOINT;

  // Save API key
  const saveApiKey = () => {
    if (!apiKey.trim()) return;
    
    setIsSaving(true);
    localStorage.setItem('helius_api_key', apiKey);
    
    // Simple timeout to show the saving state
    setTimeout(() => {
      setIsSaving(false);
    }, 1000);
  };
  
  // Handle transaction status updates
  const handleTxStatusUpdate = (hash: string, status: 'pending' | 'confirmed' | 'error') => {
    setTxHash(hash);
    setTxStatus(status as TxStatusType);
  };
  
  // Handle relayer selection
  const handleRelayerSelect = (relayer?: { address: PublicKey; fee: number }) => {
    setSelectedRelayer(relayer);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center text-purple-800">Withdraw Funds</h1>
      
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
              onClick={saveApiKey}
              disabled={isSaving || !apiKey.trim()}
              loading={isSaving}
              loadingText="Saving..."
            >
              Save
            </Button>
          </div>
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
            Please connect your wallet to withdraw funds from a privacy pool.
          </p>
          <div className="flex justify-center">
            <WalletMultiButton className="bg-purple-600 hover:bg-purple-700" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          {/* Relayer Selector */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Select a Relayer (Optional)</h2>
            <RelayerSelector
              onChange={handleRelayerSelect}
              rpcEndpoint={endpoint}
              apiKey={apiKey}
            />
            <p className="text-sm text-gray-500 mt-2">
              Relayers can pay for your transaction gas fees in exchange for a small fee.
            </p>
          </div>
          
          {/* Withdraw Form with selected relayer */}
          <WithdrawForm 
            config={{
              rpcEndpoint: endpoint,
              apiKey: apiKey,
              enableRiskChecks: true,
              wasmPath: CIRCUIT_PATHS.WASM_PATH,
              zkeyPath: CIRCUIT_PATHS.ZKEY_PATH,
              verificationKeyPath: CIRCUIT_PATHS.VERIFICATION_KEY_PATH,
              programId: PROGRAM_ID
            }}
            selectedRelayer={selectedRelayer}
            onTxStatus={handleTxStatusUpdate}
          />
          
          {/* Information Sections */}
          <div className="bg-white shadow-md rounded-lg p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">How Withdrawals Work</h2>
            <ol className="list-decimal list-inside space-y-3 text-gray-700">
              <li>
                <span className="font-medium">Paste your withdrawal note</span>
                <p className="ml-5 text-sm text-gray-500">
                  This is the secret note you received when you made your deposit. It contains all information needed to prove ownership of your funds.
                </p>
              </li>
              <li>
                <span className="font-medium">Enter recipient address</span>
                <p className="ml-5 text-sm text-gray-500">
                  Specify the Solana address that should receive the withdrawn funds. By default, this will be your connected wallet.
                </p>
              </li>
              <li>
                <span className="font-medium">Select a relayer (optional)</span>
                <p className="ml-5 text-sm text-gray-500">
                  Relayers can pay transaction fees for you in exchange for a small percentage of the withdrawn amount.
                </p>
              </li>
              <li>
                <span className="font-medium">Generate and submit the proof</span>
                <p className="ml-5 text-sm text-gray-500">
                  Your browser will generate a zero-knowledge proof that you are entitled to withdraw funds, without revealing which deposit they came from.
                </p>
              </li>
            </ol>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-md">
              <p className="text-sm text-blue-700">
                <span className="font-bold">Privacy Tip:</span> For enhanced privacy, wait some time between your deposit and withdrawal, and use a different wallet address than the one you used to deposit.
              </p>
            </div>
          </div>
          
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">FAQ</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900">How are withdrawals private?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  When you withdraw, you prove ownership of funds in the pool without revealing which deposit they came from, breaking the on-chain link to your deposit transaction.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Why do I need a note?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  The withdrawal note contains secret information that only the original depositor has. Without it, no one can access those funds.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">What are relayers?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Relayers are third-party services that will submit your transaction and pay gas fees in exchange for a small fee. Using a relayer can enhance privacy by removing the need to fund your withdrawal wallet.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">How long does proof generation take?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Generating the zero-knowledge proof takes 15-60 seconds depending on your device's computing power.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WithdrawPage;
