import { useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PoolService, Pool } from '../services/poolService';

interface UsePoolOptions {
  rpcEndpoint: string;
  apiKey: string;
  programId: string;
  autoLoad?: boolean;
}

/**
 * Hook for managing SolanaVeil pool operations
 */
export function usePool(options: UsePoolOptions) {
  const { connection } = useConnection();
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize the pool service
  const poolService = new PoolService(
    options.rpcEndpoint,
    options.apiKey,
    options.programId
  );
  
  // Load pools on initialization if autoLoad is true
  useEffect(() => {
    if (options.autoLoad) {
      loadPools();
    }
  }, [options.rpcEndpoint, options.apiKey, options.programId]);
  
  /**
   * Load all available pools
   */
  const loadPools = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const availablePools = await poolService.getPools();
      setPools(availablePools);
      
      // Automatically select the first active pool if there are any
      const activePools = availablePools.filter(p => p.active);
      if (activePools.length > 0 && !selectedPool) {
        setSelectedPool(activePools[0]);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error loading pools:', err);
      setError((err as Error).message);
      setLoading(false);
    }
  };
  
  /**
   * Get details for a specific pool
   * @param poolId Pool ID
   */
  const getPool = async (poolId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const pool = await poolService.getPool(poolId);
      
      if (pool) {
        setSelectedPool(pool);
      } else {
        setError(`Pool ${poolId} not found`);
      }
      
      setLoading(false);
      return pool;
    } catch (err) {
      console.error(`Error getting pool ${poolId}:`, err);
      setError((err as Error).message);
      setLoading(false);
      return null;
    }
  };
  
  /**
   * Get the current state of a merkle tree
   * @param treeId Tree ID
   */
  const getTreeState = async (treeId: string) => {
    try {
      return await poolService.getTreeState(treeId);
    } catch (err) {
      console.error(`Error getting tree state for ${treeId}:`, err);
      setError((err as Error).message);
      throw err;
    }
  };
  
  /**
   * Check if a pool is available
   * @param poolId Pool ID
   */
  const isPoolAvailable = async (poolId: string) => {
    try {
      return await poolService.isPoolAvailable(poolId);
    } catch (err) {
      console.error(`Error checking pool availability for ${poolId}:`, err);
      setError((err as Error).message);
      return false;
    }
  };
  
  return {
    pools,
    selectedPool,
    setSelectedPool,
    loading,
    error,
    loadPools,
    getPool,
    getTreeState,
    isPoolAvailable
  };
}