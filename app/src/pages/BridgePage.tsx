import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Web3ReactProvider, useWeb3React } from '@web3-react/core';
import { InjectedConnector } from '@web3-react/injected-connector';
import { Web3Provider } from '@ethersproject/providers'; // <-- fix import
import BridgeForm from '../components/BridgeForm';
import { useBridge } from '../hooks/useBridge';

// Initialize connectors for Ethereum
const injected = new InjectedConnector({
  supportedChainIds: [1, 10, 42161, 8453], // Ethereum, Optimism, Arbitrum, Base
});

// Get library from provider
const getLibrary = (provider: any): Web3Provider => {
  const library = new Web3Provider(provider);
  library.pollingInterval = 12000;
  return library;
};

// Inner component with wallet context access
const BridgePageContent: React.FC = () => {
  const { publicKey: solanaPublicKey } = useWallet();
  // Type workaround for activate/active
  const { account: ethereumAccount, activate, active } = useWeb3React<Web3Provider>() as any;
  const { isInitialized, error } = useBridge();
  const [showTutorial, setShowTutorial] = useState(false);
  
  // Handle connection initialization
  useEffect(() => {
    // Try to connect to Ethereum if user has previously connected
    const hasConnectedEthereum = localStorage.getItem('ethereumWalletConnected') === 'true';
    if (hasConnectedEthereum && !active) {
      activate(injected)
        .then(() => {
          console.log('Ethereum wallet auto-connected');
        })
        .catch((err: unknown) => {
          console.error('Failed to auto-connect Ethereum wallet:', err);
        });
    }
  }, [activate, active]);
  
  // Store Ethereum connection state
  useEffect(() => {
    if (active && ethereumAccount) {
      localStorage.setItem('ethereumWalletConnected', 'true');
    }
  }, [active, ethereumAccount]);
  
  // Handle Ethereum wallet connection
  const connectEthereumWallet = async () => {
    try {
      await activate(injected);
    } catch (err: unknown) {
      console.error('Failed to connect Ethereum wallet:', err);
    }
  };
  
  // Toggle tutorial panel
  const toggleTutorial = () => {
    setShowTutorial(!showTutorial);
  };
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
          SolanaVeil Bridge
        </h1>
        <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
          Securely bridge your assets between Solana and Ethereum with complete privacy.
        </p>
      </div>
      
      {/* Connection Status */}
      <div className="mb-8 flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-6">
        <div className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white">
          <span className="mr-2">Solana:</span>
          {solanaPublicKey ? (
            <span className="text-green-600 font-medium">
              Connected ({solanaPublicKey.toString().substring(0, 6)}...{solanaPublicKey.toString().slice(-4)})
            </span>
          ) : (
            <WalletMultiButton className="!bg-indigo-600 !hover:bg-indigo-700 !text-white !font-medium !py-1 !px-3 !text-sm !rounded-md !shadow-sm">
              Connect
            </WalletMultiButton>
          )}
        </div>
        
        <div className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white">
          <span className="mr-2">Ethereum:</span>
          {ethereumAccount ? (
            <span className="text-green-600 font-medium">
              Connected ({ethereumAccount.substring(0, 6)}...{ethereumAccount.slice(-4)})
            </span>
          ) : (
            <button
              onClick={connectEthereumWallet}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-1 px-3 text-sm rounded-md shadow-sm"
            >
              Connect
            </button>
          )}
        </div>
        
        <button
          onClick={toggleTutorial}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-indigo-600 bg-white hover:bg-indigo-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          How It Works
        </button>
      </div>
      
      {/* Initialization Status */}
      {!isInitialized && (
        <div className="max-w-md mx-auto bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Initializing bridge service</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>Please wait while we connect to the networks...</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Error Display */}
      {error && (
        <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 101.414 1.414L10 11.414l1.293 1.293a1 1 001.414-1.414L11.414 10l1.293-1.293a1 1 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Bridge initialization error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Bridge Form */}
      <BridgeForm />
      
      {/* How It Works Tutorial */}
      {showTutorial && (
        <div className="fixed inset-0 overflow-y-auto z-50 flex items-center justify-center">
          <div className="fixed inset-0 transition-opacity" onClick={toggleTutorial}>
            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
          </div>
          
          <div className="relative bg-white rounded-lg max-w-3xl mx-auto p-6 shadow-xl">
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                onClick={toggleTutorial}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  How SolanaVeil Bridge Works
                </h3>
                
                <div className="mt-2">
                  <ol className="list-decimal pl-5 space-y-4">
                    <li className="text-gray-700">
                      <span className="font-medium">Connect your wallets:</span> Begin by connecting both your Solana and Ethereum wallets.
                    </li>
                    <li className="text-gray-700">
                      <span className="font-medium">Select source and destination:</span> Choose which network you want to send from and to.
                    </li>
                    <li className="text-gray-700">
                      <span className="font-medium">Enter amount and token:</span> Specify how much you want to bridge and which token.
                    </li>
                    <li className="text-gray-700">
                      <span className="font-medium">Initiate bridge transaction:</span> When you click "Bridge Tokens", your assets will be locked in a smart contract on the source chain.
                    </li>
                    <li className="text-gray-700">
                      <span className="font-medium">Privacy-preserving transfer:</span> Your transaction details are protected by zero-knowledge proofs, making it impossible to link your source and destination addresses.
                    </li>
                    <li className="text-gray-700">
                      <span className="font-medium">Claim your tokens:</span> Once the bridge transaction is processed, you'll need to claim your tokens on the destination chain by clicking "Claim" in the transaction history.
                    </li>
                  </ol>
                  
                  <div className="mt-6 p-4 bg-indigo-50 rounded-md">
                    <h4 className="font-medium text-indigo-800 mb-2">Privacy Features</h4>
                    <ul className="list-disc pl-5 text-indigo-700">
                      <li>Zero-knowledge proofs ensure complete privacy</li>
                      <li>No on-chain link between source and destination addresses</li>
                      <li>Transfer details are encrypted and compressed</li>
                      <li>Compatible with multiple networks for enhanced privacy</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                onClick={toggleTutorial}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Wrap with Web3React provider
const BridgePage: React.FC = () => {
  return (
    // @ts-expect-error: getLibrary is the correct prop for Web3ReactProvider, but types may be outdated
    <Web3ReactProvider getLibrary={getLibrary}>
      <BridgePageContent />
    </Web3ReactProvider>
  );
};

export default BridgePage;