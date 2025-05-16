import React, { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import Button from './common/Button';
import Input from './common/Input';
import PoolSelector, { PoolInfo } from './PoolSelector';
import TransactionStatus from './TransactionStatus';
import { useDeposit } from '../hooks/useDeposit';
import { usePool } from '../hooks/usePool';
import { notify } from '../utils/notifications';
import { Pool } from '../services/poolService';
import { PROGRAM_ID } from '../constants';

interface DepositFormProps {
  config: {
    rpcEndpoint: string;
    apiKey?: string;
    compressionApiEndpoint: string;
    proverEndpoint: string;
    enableRiskChecks: boolean;
  };
  onTxStatus?: (hash: string, status: 'pending' | 'confirmed' | 'error') => void;
  onSuccess?: (note: string, poolId: string, amount: number) => void;
}

const DepositForm: React.FC<DepositFormProps> = ({ config, onTxStatus, onSuccess }) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState<number | ''>('');
  const [selectedPoolId, setSelectedPoolId] = useState('');
  const [selectedPoolData, setSelectedPoolData] = useState<Pool | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [txSteps] = useState<string[]>([
    'Preparing transaction',
    'Creating deposit commitment',
    'Submitting to blockchain',
    'Confirming transaction',
    'Generating withdrawal note'
  ]);
  const [currentStep, setCurrentStep] = useState(0);

  // Use the deposit and pool hooks
  const {
    deposit, 
    loading, 
    error, 
    depositNote, 
    txHash, 
    reset,
    progress: depositProgress
  } = useDeposit({
    rpcEndpoint: config.rpcEndpoint,
    apiKey: config.apiKey || '',
    compressionApiEndpoint: config.compressionApiEndpoint || 'http://localhost:3000',
    proverEndpoint: config.proverEndpoint || 'http://localhost:3001'
  });
  
  const {
    pools,
  } = usePool({
    rpcEndpoint: config.rpcEndpoint,
    apiKey: config.apiKey || '',
    programId: PROGRAM_ID,
    autoLoad: true
  });

  // Update transaction status callback when txHash changes
  useEffect(() => {
    if (txHash && onTxStatus) {
      onTxStatus(txHash, 'confirmed');
    }
  }, [txHash, onTxStatus]);
  
  // Check wallet balance when wallet changes
  useEffect(() => {
    const checkBalance = async () => {
      if (publicKey) {
        try {
          const balanceInLamports = await connection.getBalance(publicKey);
          setBalance(balanceInLamports / LAMPORTS_PER_SOL);
        } catch (err) {
          console.error("Error fetching balance:", err);
          setBalance(null);
        }
      } else {
        setBalance(null);
      }
    };
    
    checkBalance();
    const intervalId = setInterval(checkBalance, 30000); // Update every 30s
    
    return () => clearInterval(intervalId);
  }, [connection, publicKey]);
  
  // Filter pools based on wallet balance
  const availablePools = pools.filter(pool => {
    if (!balance) return true; // Show all if balance unknown
    
    // Add buffer for transaction fees (0.01 SOL)
    const requiredAmount = pool.denomination / LAMPORTS_PER_SOL + 0.01;
    return balance >= requiredAmount;
  });
  
  // Notify when deposit is successful
  useEffect(() => {
    if (depositNote && selectedPoolData && !loading && onSuccess) {
      onSuccess(
        depositNote,
        selectedPoolData.id,
        selectedPoolData.denomination / LAMPORTS_PER_SOL
      );
    }
  }, [depositNote, selectedPoolData, loading, onSuccess]);
  
  // Update steps based on deposit progress
  useEffect(() => {
    if (loading) {
      // Map progress percentage to step index
      const stepIndex = Math.min(
        Math.floor(depositProgress / 20),
        txSteps.length - 1
      );
      setCurrentStep(stepIndex);
    } else {
      setCurrentStep(0);
    }
  }, [depositProgress, loading, txSteps.length]);
  
  const handlePoolChange = useCallback((poolId: string, poolData: PoolInfo) => {
    console.log('Pool changed:', poolId, poolData);
    // Ensure poolData and its type are valid before setting state
    if (poolData && poolData.type) {
      setSelectedPoolId(poolId);
      // If poolData structure matches Pool after the check, cast or use directly
      const validPoolData = poolData as Pool; 
      setSelectedPoolData(validPoolData);
    } else {
      // Handle case where poolData or type is missing, maybe reset state or show error
      setSelectedPoolId('');
      setSelectedPoolData(null);
      console.warn("Selected pool data is incomplete:", poolData);
    }
  }, []);
  
  // Handle manual amount input
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      setAmount('');
      return;
    }
    
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue) && numericValue > 0) {
      setAmount(numericValue);
      
      // Find a pool that matches this denomination
      const matchingPool = pools.find(p => 
        Math.abs(p.denomination / LAMPORTS_PER_SOL - numericValue) < 0.000001
      );
      
      if (matchingPool) {
        setSelectedPoolId(matchingPool.id);
        setSelectedPoolData(matchingPool);
      } else {
        // Clear selected pool if no match
        setSelectedPoolId('');
        setSelectedPoolData(null);
      }
    }
  };
  
  // Handle deposit submission
  const handleDeposit = async () => {
    if (!publicKey) {
      notify({ type: 'error', message: 'Please connect your wallet' });
      return;
    }
    
    if (!selectedPoolData || !selectedPoolData.id) {
      notify({ type: 'error', message: 'Please select a pool' });
      return;
    }
    
    try {
      if (onTxStatus) {
        onTxStatus(txHash || 'pending', 'pending');
      }
      
      // Check if we have enough balance
      if (balance !== null) {
        const requiredAmount = selectedPoolData.denomination / LAMPORTS_PER_SOL + 0.01; // Add fee buffer
        if (balance < requiredAmount) {
          notify({
            type: 'error',
            message: `Insufficient balance. Need ${requiredAmount.toFixed(4)} SOL but have ${balance.toFixed(4)} SOL`
          });
          return;
        }
      }
      
      // Reset current step
      setCurrentStep(0);
      
      const result = await deposit({
        poolId: selectedPoolData.id,
        treeId: selectedPoolData.treeId,
        denomination: selectedPoolData.denomination,
        tokenType: selectedPoolData.type || 'SOL' // Pass token type to hook
      });
      
      if (result) {
        notify({ 
          type: 'success', 
          message: 'Deposit successful! Save your withdrawal note!',
          description: `Transaction: ${result.txHash}`
        });
      }
    } catch (error) {
      console.error('Error depositing:', error);
      if (onTxStatus) {
        onTxStatus(txHash || 'error', 'error');
      }
      notify({ 
        type: 'error', 
        message: 'Deposit failed: ' + (error instanceof Error ? error.message : String(error))
      });
    }
  };
  
  // Copy note to clipboard
  const copyNoteToClipboard = () => {
    if (depositNote) {
      navigator.clipboard.writeText(depositNote);
      setIsCopied(true);
      notify({ type: 'success', message: 'Note copied to clipboard!' });
      
      // Reset after 3 seconds
      setTimeout(() => setIsCopied(false), 3000);
    }
  };
  
  // Estimated transaction fee
  const estimatedFee = 0.000005; // 0.000005 SOL
  
  // Total cost including deposit amount and fee
  const totalCost = typeof amount === 'number' 
    ? amount + estimatedFee 
    : null;
  
  return (
    <div className="bg-white shadow-md rounded-lg p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">Deposit</h2>
      
      {/* Display available pools count to use the variable */}
      <div className="mb-2">
        <span className="text-sm text-gray-600">
          Available pools: {availablePools.length}
        </span>
      </div>
      
      {/* Balance Display */}
      {balance !== null && (
        <div className="mb-4 text-right">
          <span className="text-sm text-gray-500">
            Balance: <span className="font-medium">{balance.toFixed(4)} SOL</span>
          </span>
        </div>
      )}
      
      {/* Manual Amount Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Deposit Amount
        </label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={amount === '' ? '' : amount.toString()}
          onChange={handleAmountChange}
          placeholder="Enter amount in SOL"
          disabled={loading}
          className="w-full"
        />
        {totalCost !== null && (
          <div className="mt-1 text-xs text-gray-500 flex justify-between">
            <span>Transaction fee: ~{estimatedFee.toFixed(6)} SOL</span>
            <span>Total: {totalCost.toFixed(4)} SOL</span>
          </div>
        )}
      </div>
      
      {/* Pool Selector Component */}
      <PoolSelector
        onChange={handlePoolChange}
        selectedPoolId={selectedPoolId}
        disabled={loading}
        rpcEndpoint={config.rpcEndpoint}
        apiKey={config.apiKey || ''}
        programId={PROGRAM_ID}
      />
      
      {/* Transaction Status */}
      {txHash && (
        <div className="my-4">
          <TransactionStatus
            txHash={txHash}
            status={loading ? 'pending' : 'confirmed'}
            progress={depositProgress}
            steps={txSteps}
            currentStep={currentStep}
          />
        </div>
      )}
      
      {/* Deposit Button */}
      <Button
        onClick={handleDeposit}
        disabled={loading || !selectedPoolId || !publicKey}
        variant="primary"
        className="mt-6 w-full"
      >
        {loading ? 'Processing...' : 'Deposit'}
      </Button>
      
      {/* Note Display */}
      {depositNote && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-yellow-700">Withdrawal Note</h3>
            <Button
              onClick={copyNoteToClipboard}
              size="sm"
              variant="secondary"
            >
              {isCopied ? 'Copied!' : 'Copy Note'}
            </Button>
          </div>
          
          <div className="bg-white p-3 rounded-md border border-gray-200">
            <p className="text-xs font-mono break-all">{depositNote}</p>
          </div>
          
          <div className="mt-4 bg-red-50 p-3 rounded-md">
            <p className="text-sm text-red-700 font-bold">IMPORTANT:</p>
            <ul className="text-sm text-red-600 list-disc list-inside">
              <li>Save this note securely! It's required to withdraw your funds.</li>
              <li>This note cannot be recovered if lost.</li>
              <li>Keep this note private to maintain your anonymity.</li>
            </ul>
          </div>
          
          <Button
            onClick={reset}
            variant="outline"
            className="mt-4 w-full"
          >
            Make Another Deposit
          </Button>
        </div>
      )}
      
      {/* Error Display */}
      {error && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-md">
          <p>Error: {error}</p>
        </div>
      )}
    </div>
  );
};

export default DepositForm;