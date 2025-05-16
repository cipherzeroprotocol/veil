import React, { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import Select from './common/Select';
import LoadingSpinner from './common/LoadingSpinner';
// Import types properly from relayerService
import { RelayerService, RelayerInfo } from '../services/relayerService';

// Helper function to truncate public keys for display
const truncateKey = (key: string, startLength = 6, endLength = 4) => {
  if (!key) return '';
  return `${key.substring(0, startLength)}...${key.substring(key.length - endLength)}`;
};

interface RelayerSelectorProps {
  onChange: (relayer?: { address: PublicKey; fee: number }) => void;
  disabled?: boolean;
  showNoRelayer?: boolean;
  rpcEndpoint: string;
  apiKey?: string;
}

type SortOption = 'fee' | 'reliability' | 'speed' | 'volume';

/**
 * RelayerSelector component for selecting a relayer to pay gas fees
 */
const RelayerSelector: React.FC<RelayerSelectorProps> = ({
  onChange,
  disabled = false,
  showNoRelayer = true,
  rpcEndpoint,
  apiKey
}) => {
  // Create a relayer service instance directly instead of using the hook
  const [relayerService] = useState(() => new RelayerService(rpcEndpoint, apiKey));
  const [relayers, setRelayers] = useState<RelayerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRelayerId, setSelectedRelayerId] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('fee');
  const [sortedRelayers, setSortedRelayers] = useState<RelayerInfo[]>([]);

  // Wrap loadRelayers in useCallback to avoid recreation on each render
  const loadRelayers = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const availableRelayers = await relayerService.getActiveRelayers(forceRefresh);
      setRelayers(availableRelayers);
      
      setLoading(false);
    } catch (err) {
      console.error('Error loading relayers:', err);
      setError((err as Error).message);
      setLoading(false);
    }
  }, [relayerService]);

  // Wrap handleRelayerSelect in useCallback to avoid recreation on each render
  const handleRelayerSelect = useCallback((address: string) => {
    setSelectedRelayerId(address);
    
    // Find the selected relayer data
    if (address === 'none') {
      // No relayer selected
      onChange(undefined);
    } else {
      const relayerData = relayers.find(relayer => relayer.address === address);
      if (relayerData) {
        onChange({
          address: new PublicKey(relayerData.address),
          fee: relayerData.fee
        });
      }
    }
  }, [relayers, onChange]);

  // Load relayers on initialization
  useEffect(() => {
    loadRelayers();
  }, [loadRelayers]); // Added loadRelayers as dependency

  // Sort relayers when the sort option or relayer list changes
  useEffect(() => {
    if (!relayers || relayers.length === 0) return;
    
    const sortRelayers = async () => {
      try {
        let sorted: RelayerInfo[] = [];
        switch (sortBy) {
          case 'fee':
            sorted = await relayerService.getLowestFeeRelayers();
            break;
          case 'reliability':
            sorted = await relayerService.getMostReliableRelayers();
            break;
          case 'speed':
            sorted = await relayerService.getFastestRelayers();
            break;
          case 'volume':
            sorted = [...relayers].sort((a, b) => b.totalRelayed - a.totalRelayed);
            break;
          default:
            sorted = [...relayers];
        }
        setSortedRelayers(sorted);
        
        // If no relayer is selected yet and we have options, select the first one
        if (!selectedRelayerId && sorted.length > 0) {
          handleRelayerSelect(sorted[0].address);
        }
      } catch (err) {
        console.error('Error sorting relayers:', err);
      }
    };
    
    sortRelayers();
  }, [sortBy, relayers, selectedRelayerId, relayerService, handleRelayerSelect]); // Added handleRelayerSelect as dependency

  // Handle sort change
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as SortOption);
  };

  // Create relayer options
  const relayerOptions = sortedRelayers.map(relayer => {
    const feeBasisPoints = relayer.fee * 100; // Convert to basis points
    const statusIndicator = relayer.isActive ? '🟢' : '🔴';
    
    return {
      value: relayer.address,
      label: `${statusIndicator} ${truncateKey(relayer.address)} - Fee: ${feeBasisPoints / 100}%`
    };
  });

  // Add a "No relayer" option if requested
  const options = [
    ...(showNoRelayer ? [{ value: 'none', label: '⚡ No relayer (pay your own gas fees)' }] : []),
    ...relayerOptions
  ];

  // Select option value
  const selectValue = selectedRelayerId || (showNoRelayer ? 'none' : '');

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-medium text-gray-700">
          Relayer (for gas-less withdrawals)
        </label>
        
        <div className="flex items-center">
          <label htmlFor="sort-by" className="text-xs text-gray-500 mr-2">Sort by:</label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={handleSortChange}
            disabled={loading || disabled}
            className="text-xs py-1 px-2 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="fee">Lowest Fee</option>
            <option value="reliability">Most Reliable</option>
            <option value="speed">Fastest</option>
            <option value="volume">Highest Volume</option>
          </select>
        </div>
      </div>
      
      <div className="flex items-center">
        <div className="flex-grow">
          <Select
            options={options}
            value={selectValue}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleRelayerSelect(e.target.value)}
            disabled={disabled || loading || relayers.length === 0}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        
        <div className="ml-2">
          <button
            type="button"
            onClick={() => loadRelayers()}
            className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            disabled={loading}
            aria-label="Refresh relayers"
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
          {error}
        </p>
      )}
      
      {selectedRelayerId && selectedRelayerId !== 'none' && (
        <div className="mt-2">
          <RelayerDetails
            relayerId={selectedRelayerId}
            relayers={relayers}
          />
        </div>
      )}
      
      {relayers.length === 0 && !loading && !error && (
        <p className="mt-1 text-sm text-amber-600">
          No relayers available. You will need to pay your own gas fees.
        </p>
      )}
    </div>
  );
};

interface RelayerDetailsProps {
  relayerId: string;
  relayers: RelayerInfo[];
}

/**
 * RelayerDetails component for displaying information about a selected relayer
 */
const RelayerDetails: React.FC<RelayerDetailsProps> = ({
  relayerId,
  relayers
}) => {
  // Find the selected relayer
  const relayer = relayers.find(r => r.address === relayerId);
  
  if (!relayer) {
    return null;
  }
  
  const feeBasisPoints = relayer.fee * 100; // Convert to basis points
  
  // Format performance metrics for display
  const successRate = relayer.successRate !== undefined 
    ? `${relayer.successRate.toFixed(1)}%` 
    : 'Unknown';
  
  const responseTime = relayer.responseTime !== undefined 
    ? `${relayer.responseTime}ms` 
    : 'Unknown';
  
  // Determine status class
  const statusClass = relayer.isActive 
    ? 'text-green-600' 
    : 'text-red-600';
  
  return (
    <div className="bg-gray-50 p-3 rounded-md">
      <div className="flex justify-between mb-1">
        <span>Relayer Address:</span>
        <span className="font-mono text-xs truncate" title={relayer.address}>
          {relayer.address.slice(0, 8)}...{relayer.address.slice(-8)}
        </span>
      </div>
      
      <div className="flex justify-between mb-1">
        <span>Fee:</span>
        <span>{feeBasisPoints / 100}% ({feeBasisPoints} bps)</span>
      </div>
      
      <div className="flex justify-between mb-1">
        <span>Status:</span>
        <span className={statusClass}>
          {relayer.isActive ? 'Online' : 'Offline'}
        </span>
      </div>
      
      <div className="border-t border-gray-200 mt-2 pt-2">
        <h4 className="text-xs font-semibold text-gray-600 mb-1">Performance Metrics</h4>
        
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-xs text-gray-500">Success Rate:</span>
            <span className="text-xs ml-1 font-medium">{successRate}</span>
          </div>
          
          <div>
            <span className="text-xs text-gray-500">Response Time:</span>
            <span className="text-xs ml-1 font-medium">{responseTime}</span>
          </div>
          
          <div>
            <span className="text-xs text-gray-500">Total Relayed:</span>
            <span className="text-xs ml-1 font-medium">{relayer.totalRelayed.toFixed(2)} SOL</span>
          </div>
          
          <div>
            <span className="text-xs text-gray-500">Total Fees:</span>
            <span className="text-xs ml-1 font-medium">{relayer.totalFees.toFixed(4)} SOL</span>
          </div>
        </div>
      </div>
      
      <div className="mt-2 text-xs text-gray-500">
        The relayer pays the gas fees for your withdrawal, and takes a small fee from
        the withdrawn amount as compensation.
      </div>
    </div>
  );
};

export default RelayerSelector;