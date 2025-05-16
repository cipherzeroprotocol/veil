import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';

// Import pages
import HomePage from './pages/HomePage';
import DepositPage from './pages/DepositPage';
import WithdrawPage from './pages/WithdrawPage';

// Import layout components
import Layout from './components/layout/Layout';

// Import global styles
import '@solana/wallet-adapter-react-ui/styles.css';
import './styles/global.css';

// Import constants
import { HELIUS_RPC_ENDPOINT } from './constants';

const App: React.FC = () => {
  // Get API key from localStorage
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('helius_api_key') || '');
  
  // Set up wallet adapters
  const wallets = [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter()
  ];
  
  // Determine endpoint based on API key
  const endpoint = apiKey 
    ? `${HELIUS_RPC_ENDPOINT}?api-key=${apiKey}` 
    : HELIUS_RPC_ENDPOINT;
    
  // Listen for API key changes in localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const newApiKey = localStorage.getItem('helius_api_key') || '';
      if (newApiKey !== apiKey) {
        setApiKey(newApiKey);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [apiKey]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Router>
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/deposit" element={<DepositPage />} />
                <Route path="/withdraw" element={<WithdrawPage />} />
              </Routes>
            </Layout>
          </Router>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default App;