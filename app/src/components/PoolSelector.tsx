import React, { useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { usePool } from '../hooks/usePool';
import LoadingSpinner from './common/LoadingSpinner';
import Select from './common/Select';

// Define the PoolInfo interface for better typing
export interface PoolInfo {
  id: string;
  label: string;
  denomination: number;
  denominationFormatted: string;
  treeId: string;
  totalDeposits: number;
  leafCount: number;
  active: boolean;
  type?: 'standard' | 'raydium';
  lpToken?: string;
  feePercent?: number;
}

// Helper function to format SOL amounts nicely
const formatSolAmount = (lamports: number): string => {
  const sol = lamports / LAMPORTS_PER_SOL;
  return `${sol.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL`;
};

interface PoolSelectorProps {
  onChange: (poolId: string, poolData: PoolInfo) => void;
  selectedPoolId?: string;
  disabled?: boolean;
  rpcEndpoint: string;
  apiKey: string;
  programId: string;
  showRaydium?: boolean; // Option to show Raydium pools
}

/**
 * PoolSelector component for selecting privacy pools
 */
const PoolSelector: React.FC<PoolSelectorProps> = ({
  onChange,
  selectedPoolId,
  disabled = false,
  rpcEndpoint,
  apiKey,
  programId,
  showRaydium = false
}) => {
  useConnection();
  // Pass required options to usePool hook
  const { pools, loading, error, loadPools } = usePool({
    rpcEndpoint,
    apiKey,
    programId,
    autoLoad: true
  });

  const [currentPoolId, setCurrentPoolId] = useState<string | undefined>(selectedPoolId);
  const [filteredPools, setFilteredPools] = useState<PoolInfo[]>([]);

  // Handle pool selection
  const handlePoolSelect = React.useCallback((value: string) => {
    setCurrentPoolId(value);
    
    // Find the selected pool data
    const poolData = pools.find(pool => pool.id === value);
    if (poolData) {
      onChange(value, poolData);
    }
  }, [pools, onChange]);

  // Update filtered pools when pools change or when showRaydium changes
  useEffect(() => {
    if (pools && pools.length > 0) {
      // Filter pools based on showRaydium setting
      const filtered = showRaydium ? 
        pools : 
        pools.filter(pool => pool.type !== 'raydium');
      
      setFilteredPools(filtered);

      // Auto-select first pool if no pool is selected
      if (!currentPoolId && filtered.length > 0) {
        handlePoolSelect(filtered[0].id);
      }
    }
  }, [pools, showRaydium, currentPoolId, handlePoolSelect]);

  // Update local state when props change
  useEffect(() => {
    if (selectedPoolId && selectedPoolId !== currentPoolId) {
      setCurrentPoolId(selectedPoolId);
    }
  }, [selectedPoolId, currentPoolId]);

  // Create pool options
  const poolOptions = filteredPools.map(pool => ({
    value: pool.id,
    label: `${pool.denominationFormatted} - (${pool.leafCount} deposits)${pool.type === 'raydium' ? ' 🔄' : ''}`
  }));

  // Add a default option
  const options = [
    { value: '', label: 'Select a pool' },
    ...poolOptions
  ];

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Select Privacy Pool
      </label>
      
      <div className="flex items-center">
        <div className="flex-grow">
          <Select
            options={options}
            value={currentPoolId || ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement> | string) => {
              // If Select passes event, extract value; if string, use directly
              if (typeof e === 'string') {
                handlePoolSelect(e);
              } else {
                handlePoolSelect(e.target.value);
              }
            }}
            disabled={disabled || loading}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        
        <div className="ml-2">
          <button
            type="button"
            onClick={() => loadPools()}
            className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            disabled={loading}
            aria-label="Refresh pools"
          >
            {loading ? (
              <LoadingSpinner size="sm" color="gray" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
        </div>
      </div>
      
      {error && (
        <p className="mt-1 text-sm text-red-600">
          Error loading pools: {error}
        </p>
      )}
      
      {!loading && filteredPools.length === 0 && (
        <p className="mt-1 text-sm text-amber-600">
          No privacy pools available. Please check your connection.
        </p>
      )}
      
      {currentPoolId && filteredPools.length > 0 && (
        <div className="mt-2 text-sm text-gray-600">
          <PoolDetails poolId={currentPoolId} pools={filteredPools} />
        </div>
      )}
    </div>
  );
};

interface PoolDetailsProps {
  poolId: string;
  pools: PoolInfo[];
}

/**
 * PoolDetails component for displaying information about a selected pool
 */
const PoolDetails: React.FC<PoolDetailsProps> = ({ poolId, pools }) => {
  // Find the selected pool
  const pool = pools.find(p => p.id === poolId);
  
  if (!pool) {
    return null;
  }
  
  const anonymitySetSize = pool.leafCount;
  const valueLockedSol = pool.denomination * anonymitySetSize / LAMPORTS_PER_SOL;
  
  return (
    <div className="bg-gray-50 p-3 rounded-md">
      <div className="flex justify-between mb-1">
        <span>Pool ID:</span>
        <span className="font-mono text-xs truncate" title={pool.id}>
          {pool.id.slice(0, 8)}...{pool.id.slice(-8)}
        </span>
      </div>
      
      <div className="flex justify-between mb-1">
        <span>Tree ID:</span>
        <span className="font-mono text-xs truncate" title={pool.treeId}>
          {pool.treeId.slice(0, 8)}...{pool.treeId.slice(-8)}
        </span>
      </div>
      
      <div className="flex justify-between mb-1">
        <span>Anonymity Set:</span>
        <span>{anonymitySetSize.toLocaleString()} deposits</span>
      </div>
      
      <div className="flex justify-between mb-1">
        <span>Value Locked:</span>
        <span>{formatSolAmount(valueLockedSol * LAMPORTS_PER_SOL)}</span>
      </div>
      
      <div className="flex justify-between">
        <span>Denomination:</span>
        <span>{pool.denominationFormatted}</span>
      </div>
      
      {pool.type === 'raydium' && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="flex justify-between mb-1">
            <span>Pool Type:</span>
            <span>Raydium AMM</span>
          </div>
          {pool.feePercent !== undefined && (
            <div className="flex justify-between mb-1">
              <span>Fee:</span>
              <span>{pool.feePercent}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PoolSelector;