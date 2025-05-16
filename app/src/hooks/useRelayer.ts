import { useState, useEffect, useCallback } from 'react';
import { RelayerService, RelayerInfo, RelayerFilter } from '../services/relayerService';

interface UseRelayerOptions {
  rpcEndpoint: string;
  apiKey?: string;
  autoLoad?: boolean;
  maxFee?: number;
  minReliability?: number;
}

/**
 * Hook for managing relayer operations
 */
export function useRelayer(options: UseRelayerOptions) {
  const [relayers, setRelayers] = useState<RelayerInfo[]>([]);
  const [selectedRelayer, setSelectedRelayer] = useState<RelayerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Create relayer service instance
  const relayerService = new RelayerService(
    options.rpcEndpoint,
    options.apiKey
  );
  
  /**
   * Load all available relayers
   */
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
  
  /**
   * Get relayers with lowest fees
   */
  const getLowestFeeRelayers = useCallback(async (limit = 5) => {
    try {
      const filter: RelayerFilter = {};
      if (options.maxFee !== undefined) {
        filter.maxFee = options.maxFee;
      }
      
      return await relayerService.getLowestFeeRelayers(limit, filter);
    } catch (err) {
      console.error('Error fetching lowest fee relayers:', err);
      setError((err as Error).message);
      return [];
    }
  }, [relayerService, options.maxFee]);
  
  /**
   * Get most reliable relayers
   */
  const getMostReliableRelayers = useCallback(async (limit = 5) => {
    try {
      const filter: RelayerFilter = {};
      if (options.minReliability !== undefined) {
        filter.minSuccessRate = options.minReliability;
      }
      
      return await relayerService.getMostReliableRelayers(limit, filter);
    } catch (err) {
      console.error('Error fetching reliable relayers:', err);
      setError((err as Error).message);
      return [];
    }
  }, [relayerService, options.minReliability]);
  
  /**
   * Get fastest relayers
   */
  const getFastestRelayers = useCallback(async (limit = 5) => {
    try {
      return await relayerService.getFastestRelayers(limit);
    } catch (err) {
      console.error('Error fetching fastest relayers:', err);
      setError((err as Error).message);
      return [];
    }
  }, [relayerService]);
  
  /**
   * Get the "best" relayer based on fee, reliability, and speed
   */
  const getBestRelayer = useCallback(async () => {
    try {
      const filter: RelayerFilter = {};
      if (options.maxFee !== undefined) {
        filter.maxFee = options.maxFee;
      }
      if (options.minReliability !== undefined) {
        filter.minSuccessRate = options.minReliability;
      }
      
      const bestRelayer = await relayerService.getBestRelayer(filter);
      if (bestRelayer) {
        setSelectedRelayer(bestRelayer);
      }
      return bestRelayer;
    } catch (err) {
      console.error('Error fetching best relayer:', err);
      setError((err as Error).message);
      return null;
    }
  }, [relayerService, options.maxFee, options.minReliability]);
  
  /**
   * Get a specific relayer by address
   */
  const getRelayer = useCallback(async (address: string) => {
    try {
      return await relayerService.getRelayer(address);
    } catch (err) {
      console.error(`Error fetching relayer ${address}:`, err);
      setError((err as Error).message);
      return null;
    }
  }, [relayerService]);
  
  /**
   * Check if a relayer is responsive by pinging it
   */
  const pingRelayer = useCallback(async (address: string) => {
    try {
      return await relayerService.pingRelayer(address);
    } catch (err) {
      console.error(`Error pinging relayer ${address}:`, err);
      setError((err as Error).message);
      return null;
    }
  }, [relayerService]);
  
  // Load relayers on initialization if autoLoad is true
  useEffect(() => {
    if (options.autoLoad) {
      loadRelayers();
    }
  }, [options.autoLoad, loadRelayers]);
  
  return {
    relayers,
    selectedRelayer,
    setSelectedRelayer,
    loading,
    error,
    loadRelayers,
    getRelayer,
    pingRelayer,
    getLowestFeeRelayers,
    getMostReliableRelayers,
    getFastestRelayers,
    getBestRelayer
  };
}
