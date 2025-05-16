import { Connection, PublicKey } from '@solana/web3.js';
import { LightProtocolClient } from '../utils/lightProtocolClient';
import { PROGRAM_ID } from '../constants';

export interface Relayer {
  address: string;
  fee: number;         // Fee percentage (e.g., 1.5 means 1.5%)
  isActive: boolean;
  totalRelayed: number; // In SOL
  totalFees: number;    // In SOL
  successRate?: number; // Percentage of successful transactions
  responseTime?: number; // Average response time in ms
}

// Properly export the RelayerInfo interface for use in other components
export interface RelayerInfo {
  address: string;
  fee: number;         // Fee percentage (e.g., 1.5 means 1.5%)
  isActive: boolean;
  totalRelayed: number; // In SOL
  totalFees: number;    // In SOL
  successRate?: number; // Percentage of successful transactions
  responseTime?: number; // Average response time in ms
}

export interface RelayerFilter {
  maxFee?: number;      // Maximum fee percentage
  minSuccessRate?: number; // Minimum success rate percentage
  maxResponseTime?: number; // Maximum average response time in ms
}

/**
 * Service for interacting with SolanaVeil relayers
 */
export class RelayerService {
  private lightClient: LightProtocolClient;
  private cachedRelayers: Map<string, {relayer: Relayer, timestamp: number}> = new Map();
  private allRelayersCache: {relayers: Relayer[], timestamp: number} | null = null;
  private cacheDuration = 60 * 1000; // 1 minute cache
  
  constructor(endpoint: string, apiKey?: string) {
    this.lightClient = new LightProtocolClient(endpoint, apiKey);
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.cachedRelayers.clear();
    this.allRelayersCache = null;
  }

  /**
   * Set cache duration in milliseconds
   */
  public setCacheDuration(durationMs: number): void {
    this.cacheDuration = durationMs;
  }

  /**
   * Fetch all active relayers
   * @param forceRefresh Force a cache refresh
   * @returns Array of relayers
   */
  async getActiveRelayers(forceRefresh = false): Promise<Relayer[]> {
    // Check cache first unless force refresh is requested
    if (!forceRefresh && this.allRelayersCache && 
        (Date.now() - this.allRelayersCache.timestamp) < this.cacheDuration) {
      return this.allRelayersCache.relayers;
    }
    
    try {
      // Get connection from light client
      const connection = this.lightClient.getConnection();
      
      // Query all relayer accounts owned by our program
      const accounts = await connection.getProgramAccounts(new PublicKey(PROGRAM_ID), {
        filters: [
          {
            memcmp: {
              offset: 0, // Account type identifier at offset 0
              bytes: "2", // 2 is the discriminator for Relayer accounts
            }
          },
          {
            dataSize: 80, // Size of Relayer account data structure
          }
        ],
      });

      // Parse relayer account data
      const relayers = accounts
        .map(({ pubkey, account }) => {
          const data = account.data;
          
          // Parse the binary data according to our Relayer layout
          const isActive = data[32] === 1; // Boolean flag
          const feeBasisPoints = new DataView(data.buffer, data.byteOffset).getUint16(34, true);
          const totalRelayed = new DataView(data.buffer, data.byteOffset).getBigUint64(36, true);
          const totalFees = new DataView(data.buffer, data.byteOffset).getBigUint64(44, true);
          const successRateValue = new DataView(data.buffer, data.byteOffset).getUint16(52, true);
          const responseTimeValue = new DataView(data.buffer, data.byteOffset).getUint16(54, true);
          
          // Convert basis points to percentage (1 basis point = 0.01%)
          const feePercentage = feeBasisPoints / 100;
          
          const relayer = {
            address: pubkey.toString(),
            fee: feePercentage,
            isActive,
            totalRelayed: Number(totalRelayed) / 1_000_000_000, // Convert lamports to SOL
            totalFees: Number(totalFees) / 1_000_000_000, // Convert lamports to SOL
            successRate: successRateValue / 100, // Convert to percentage
            responseTime: responseTimeValue // in ms
          };
          
          // Update the individual relayer cache
          this.cachedRelayers.set(relayer.address, {
            relayer,
            timestamp: Date.now()
          });
          
          return relayer;
        })
        .filter(relayer => relayer.isActive); // Only return active relayers
      
      // Update the cache
      this.allRelayersCache = {
        relayers,
        timestamp: Date.now()
      };
      
      return relayers;
    } catch (error) {
      console.error('Failed to fetch relayers:', error);
      
      // Return cached data if available, even if it's stale
      if (this.allRelayersCache) {
        console.warn('Returning stale cached relayers data due to error');
        return this.allRelayersCache.relayers;
      }
      
      throw new Error(`Failed to fetch relayers: ${error}`);
    }
  }

  /**
   * Get a specific relayer by address
   * @param relayerAddress Relayer address
   * @param forceRefresh Force a cache refresh
   * @returns Relayer information
   */
  async getRelayer(relayerAddress: string, forceRefresh = false): Promise<Relayer> {
    // Check cache first
    const cached = this.cachedRelayers.get(relayerAddress);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < this.cacheDuration) {
      return cached.relayer;
    }
    
    try {
      // Get connection from light client
      const connection = this.lightClient.getConnection();
      
      const account = await connection.getAccountInfo(new PublicKey(relayerAddress));
      
      if (!account) {
        throw new Error(`Relayer not found: ${relayerAddress}`);
      }
      
      const data = account.data;
      
      // Parse the binary data according to our Relayer layout
      const isActive = data[32] === 1;
      const feeBasisPoints = new DataView(data.buffer, data.byteOffset).getUint16(34, true);
      const totalRelayed = new DataView(data.buffer, data.byteOffset).getBigUint64(36, true);
      const totalFees = new DataView(data.buffer, data.byteOffset).getBigUint64(44, true);
      const successRateValue = new DataView(data.buffer, data.byteOffset).getUint16(52, true);
      const responseTimeValue = new DataView(data.buffer, data.byteOffset).getUint16(54, true);
      
      // Convert basis points to percentage
      const feePercentage = feeBasisPoints / 100;
      
      const relayer = {
        address: relayerAddress,
        fee: feePercentage,
        isActive,
        totalRelayed: Number(totalRelayed) / 1_000_000_000,
        totalFees: Number(totalFees) / 1_000_000_000,
        successRate: successRateValue / 100, // Convert to percentage
        responseTime: responseTimeValue // in ms
      };
      
      // Update the cache
      this.cachedRelayers.set(relayerAddress, {
        relayer,
        timestamp: Date.now()
      });
      
      return relayer;
    } catch (error) {
      console.error(`Failed to fetch relayer ${relayerAddress}:`, error);
      
      // Return cached data if available, even if it's stale
      if (cached) {
        console.warn('Returning stale cached relayer data due to error');
        return cached.relayer;
      }
      
      throw new Error(`Failed to fetch relayer: ${error}`);
    }
  }

  /**
   * Get relayers based on filtering criteria
   * @param filter Filter criteria
   * @returns Filtered relayers
   */
  async getFilteredRelayers(filter: RelayerFilter = {}): Promise<Relayer[]> {
    const relayers = await this.getActiveRelayers();
    
    return relayers.filter(relayer => {
      // Apply fee filter if specified
      if (filter.maxFee !== undefined && relayer.fee > filter.maxFee) {
        return false;
      }
      
      // Apply success rate filter if specified
      if (filter.minSuccessRate !== undefined && 
          (relayer.successRate === undefined || relayer.successRate < filter.minSuccessRate)) {
        return false;
      }
      
      // Apply response time filter if specified
      if (filter.maxResponseTime !== undefined && 
          (relayer.responseTime === undefined || relayer.responseTime > filter.maxResponseTime)) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Get relayers sorted by lowest fee
   * @param limit Maximum number of relayers to return
   * @param filter Additional filter criteria
   * @returns Sorted relayers
   */
  async getLowestFeeRelayers(limit = 5, filter: RelayerFilter = {}): Promise<Relayer[]> {
    const relayers = await this.getFilteredRelayers(filter);
    
    // Sort by fee (ascending)
    return relayers
      .sort((a, b) => a.fee - b.fee)
      .slice(0, limit);
  }

  /**
   * Get relayers sorted by highest volume
   * @param limit Maximum number of relayers to return
   * @param filter Additional filter criteria
   * @returns Sorted relayers
   */
  async getHighestVolumeRelayers(limit = 5, filter: RelayerFilter = {}): Promise<Relayer[]> {
    const relayers = await this.getFilteredRelayers(filter);
    
    // Sort by total relayed volume (descending)
    return relayers
      .sort((a, b) => b.totalRelayed - a.totalRelayed)
      .slice(0, limit);
  }

  /**
   * Get relayers sorted by highest success rate
   * @param limit Maximum number of relayers to return
   * @param filter Additional filter criteria
   * @returns Sorted relayers
   */
  async getMostReliableRelayers(limit = 5, filter: RelayerFilter = {}): Promise<Relayer[]> {
    const relayers = await this.getFilteredRelayers(filter);
    
    // Sort by success rate (descending)
    return relayers
      .sort((a, b) => {
        const aRate = a.successRate ?? 0;
        const bRate = b.successRate ?? 0;
        return bRate - aRate;
      })
      .slice(0, limit);
  }

  /**
   * Get relayers sorted by fastest response time
   * @param limit Maximum number of relayers to return
   * @param filter Additional filter criteria
   * @returns Sorted relayers
   */
  async getFastestRelayers(limit = 5, filter: RelayerFilter = {}): Promise<Relayer[]> {
    const relayers = await this.getFilteredRelayers(filter);
    
    // Sort by response time (ascending)
    return relayers
      .sort((a, b) => {
        const aTime = a.responseTime ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.responseTime ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, limit);
  }

  /**
   * Get the "best" relayer based on a weighted scoring algorithm
   * that balances fee, reliability, and speed
   * @param filter Additional filter criteria
   * @returns The optimal relayer or null if none found
   */
  async getBestRelayer(filter: RelayerFilter = {}): Promise<Relayer | null> {
    const relayers = await this.getFilteredRelayers(filter);
    
    if (relayers.length === 0) {
      return null;
    }
    
    // Calculate a score for each relayer (higher is better)
    const scoredRelayers = relayers.map(relayer => {
      // Start with a base score
      let score = 100;
      
      // Deduct points based on fee (higher fee = lower score)
      // Each 1% fee deducts 10 points
      score -= (relayer.fee * 10);
      
      // Add points for reliability
      // Each 1% of success rate adds 1 point
      score += (relayer.successRate ?? 90); // Default to 90% if unknown
      
      // Deduct points for slow response time
      // Each 100ms adds 5 penalty points
      const responseTimeScore = relayer.responseTime 
        ? Math.min(50, Math.floor(relayer.responseTime / 20)) 
        : 25; // Default penalty if unknown
      
      score -= responseTimeScore;
      
      // Add a small bonus for volume (more established relayers)
      // Up to 10 points for high volume
      const volumeBonus = Math.min(10, Math.floor(relayer.totalRelayed));
      score += volumeBonus;
      
      return { relayer, score };
    });
    
    // Sort by score (descending) and return the best one
    const sorted = scoredRelayers.sort((a, b) => b.score - a.score);
    return sorted[0]?.relayer || null;
  }

  /**
   * Ping a relayer to check if it's responsive
   * @param relayerAddress Relayer address
   * @returns Response time in milliseconds or null if timeout
   */
  async pingRelayer(relayerAddress: string): Promise<number | null> {
    try {
      const start = Date.now();
      
      // Make a lightweight call to the relayer
      const relayer = await this.getRelayer(relayerAddress, true);
      
      const responseTime = Date.now() - start;
      
      // Check if the relayer is active
      if (!relayer.isActive) {
        return null;
      }
      
      return responseTime;
    } catch (error) {
      console.error(`Failed to ping relayer ${relayerAddress}:`, error);
      return null;
    }
  }
}