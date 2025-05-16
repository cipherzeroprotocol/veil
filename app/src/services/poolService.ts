import { 
  Connection, 
  PublicKey, 
  LAMPORTS_PER_SOL,
  GetProgramAccountsFilter
} from '@solana/web3.js';
import { createRpc, Rpc } from '@lightprotocol/stateless.js';
import { PROGRAM_ID } from '../constants';
import BN from 'bn.js';
import { LightProtocolClient } from '../utils/lightProtocolClient';
import axios from 'axios';

export interface Pool {
  id: string;
  label: string;
  denomination: number;
  denominationFormatted: string;
  treeId: string;
  totalDeposits: number;
  leafCount: number;
  active: boolean;
  type: 'standard' | 'raydium';
  lpToken?: string;
  feePercent?: number;
}

export interface TreeState {
  root: string;
  leafCount: number;
}

// Raydium API interfaces
export interface RaydiumPool {
  id: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  lpDecimals: number;
  version: number;
  programId: string;
  authority: string;
  openOrders: string;
  targetOrders: string;
  baseVault: string;
  quoteVault: string;
  withdrawQueue: string;
  lpVault: string;
  marketVersion: number;
  marketProgramId: string;
  marketId: string;
  marketAuthority: string;
  marketBaseVault: string;
  marketQuoteVault: string;
  marketBids: string;
  marketAsks: string;
  marketEventQueue: string;
  lookupTableAccount: string;
  liquidity: number;
  apr: number;
  fee: number; // Fee percentage
}

/**
 * Service for interacting with SolanaVeil pools
 */
export class PoolService {
  private lightClient: LightProtocolClient;
  private connection: Rpc;
  private traditionalConnection: Connection;
  private programId: PublicKey;
  private poolCache: Map<string, {pool: Pool, timestamp: number}> = new Map();
  private allPoolsCache: {pools: Pool[], timestamp: number} | null = null;
  private cacheDuration = 60 * 1000; // 1 minute cache
  private raydiumApiBase = 'https://api.raydium.io/v2';
  
  constructor(
    endpoint: string, 
    apiKey: string, 
    programId: string = PROGRAM_ID
  ) {
    // Create Light Protocol client
    this.lightClient = new LightProtocolClient(endpoint, apiKey);
    this.connection = this.lightClient.getConnection();
    
    // Create traditional connection for regular Solana RPC calls
    const rpcUrl = apiKey ? `${endpoint}?api-key=${apiKey}` : endpoint;
    this.traditionalConnection = new Connection(rpcUrl);
    this.programId = new PublicKey(programId);
  }
  
  /**
   * Fetch all available pools from the program and Raydium
   * @param forceRefresh Force refresh cache
   * @returns List of pools
   */
  async getPools(forceRefresh = false): Promise<Pool[]> {
    // Check cache first unless force refresh is requested
    if (!forceRefresh && this.allPoolsCache && 
        (Date.now() - this.allPoolsCache.timestamp) < this.cacheDuration) {
      return this.allPoolsCache.pools;
    }
    
    try {
      // Get all program pools from our contract
      const standardPools = await this.getStandardPools();
      
      // Get Raydium pools through their API
      const raydiumPools = await this.fetchRaydiumPools();
      
      // Combine both pools
      const allPools = [...standardPools, ...raydiumPools];
      
      // Update cache
      this.allPoolsCache = {
        pools: allPools, 
        timestamp: Date.now()
      };
      
      return allPools;
    } catch (error) {
      console.error('Error fetching pools:', error);
      
      // Return cached data if available
      if (this.allPoolsCache) {
        console.warn('Returning cached pool data due to error');
        return this.allPoolsCache.pools;
      }
      
      throw new Error(`Failed to fetch pools: ${(error as Error).message}`);
    }
  }

  /**
   * Get standard pools from our protocol
   */
  async getStandardPools(): Promise<Pool[]> {
    try {
      // Define filters for finding pool accounts
      const accounts = await this.traditionalConnection.getProgramAccounts(
        this.programId,
        {
          filters: [
            { dataSize: 128 }, // Approximate size of a Pool account
          ],
        }
      );
      
      // Parse account data into Pool objects
      const pools: Pool[] = [];
      
      for (const { pubkey, account } of accounts) {
        try {
          // Parse the binary data
          const data = account.data;
          const denomination = new DataView(data.buffer, data.byteOffset + 8, 8).getBigUint64(0, true);
          const treeIdOffset = 16;
          const treeId = new PublicKey(data.slice(treeIdOffset, treeIdOffset + 32));
          const isActive = data[48] === 1;
          const totalDepositsOffset = 49;
          const totalDeposits = new DataView(data.buffer, data.byteOffset + totalDepositsOffset, 8).getBigUint64(0, true);
          
          // Get tree state to get leaf count
          let leafCount = 0;
          try {
            const treeState = await this.getTreeState(treeId.toString());
            leafCount = treeState.leafCount;
          } catch (e) {
            console.warn(`Could not get leaf count for tree ${treeId.toString()}: ${e}`);
          }
          
          const poolData: Pool = {
            id: pubkey.toBase58(),
            label: `${Number(denomination) / LAMPORTS_PER_SOL} SOL`,
            denomination: Number(denomination),
            denominationFormatted: `${(Number(denomination) / LAMPORTS_PER_SOL).toLocaleString()} SOL`,
            treeId: treeId.toBase58(),
            totalDeposits: Number(totalDeposits),
            leafCount,
            active: isActive,
            type: 'standard'
          };
          
          pools.push(poolData);
          
          // Update individual pool cache
          this.poolCache.set(poolData.id, {
            pool: poolData,
            timestamp: Date.now()
          });
        } catch (err) {
          console.warn(`Error parsing pool account ${pubkey.toBase58()}:`, err);
        }
      }
      
      return pools;
    } catch (error) {
      console.error('Error fetching standard pools:', error);
      throw error;
    }
  }

  /**
   * Fetch available Raydium pools using Raydium's API
   */
  async fetchRaydiumPools(): Promise<Pool[]> {
    try {
      // Call Raydium's API to get pool information
      // Define the expected response structure
      interface RaydiumPoolsResponse {
        data: RaydiumPool[];
      }
      const response = await axios.get<RaydiumPoolsResponse>(`${this.raydiumApiBase}/main/pools`);
      
      if (!response.data || !response.data.data) {
        throw new Error('Invalid response from Raydium API');
      }
      
      // Filter to commonly used pools
      const popularPools = response.data.data.filter(pool => 
        // Filter for SOL-based pools with high liquidity
        pool.baseMint === 'So11111111111111111111111111111111111111112' && 
        pool.liquidity > 100000 // Minimum liquidity threshold
      );
      
      // Take top 5 pools by liquidity
      const topPools = popularPools
        .sort((a, b) => b.liquidity - a.liquidity)
        .slice(0, 5);
      
      // Convert Raydium pool format to our Pool format
      const raydiumPools: Pool[] = await Promise.all(topPools.map(async (pool) => {
        // Get pool token names for better labels
        const quoteTokenInfo = await this.getTokenMetadata(pool.quoteMint);
        const quoteTokenSymbol = quoteTokenInfo?.symbol || 'UNKNOWN';
        
        // Calculate a reasonable SOL denomination for privacy pools
        // Based on liquidity and common values (0.1, 0.5, 1 SOL)
        const liquidity = pool.liquidity;
        let denomination = 0.1 * LAMPORTS_PER_SOL; // Default to 0.1 SOL
        
        if (liquidity > 1000000) denomination = 1 * LAMPORTS_PER_SOL;
        else if (liquidity > 500000) denomination = 0.5 * LAMPORTS_PER_SOL;
        
        return {
          id: `raydium_${pool.id}`,
          label: `Raydium SOL-${quoteTokenSymbol}`,
          denomination: denomination,
          denominationFormatted: `${denomination / LAMPORTS_PER_SOL} SOL (SOL-${quoteTokenSymbol})`,
          treeId: pool.lpMint, // Use LP mint as tree ID
          totalDeposits: pool.liquidity / 100000, // Scaled for display
          leafCount: Math.floor(pool.liquidity / 10000), // Synthetic leaf count based on liquidity
          active: true,
          type: 'raydium',
          lpToken: pool.lpMint,
          feePercent: pool.fee * 100 // Convert to percentage
        };
      }));
      
      return raydiumPools;
    } catch (error) {
      console.error('Error fetching Raydium pools:', error);
      return []; // Return empty array on error to not block standard pools
    }
  }
  
  /**
   * Get token metadata from Solana token registry or Raydium API
   */
  private async getTokenMetadata(mint: string): Promise<{name: string; symbol: string} | null> {
    try {
      // Define the expected response structure
      interface TokenInfoResponse {
        data: {
          name?: string;
          symbol?: string;
        } | null;
      }
      // Try to get from Raydium's token info API
      const response = await axios.get<TokenInfoResponse>(`${this.raydiumApiBase}/main/token-info?mint=${mint}`);
      
      if (response.data && response.data.data) {
        return {
          name: response.data.data.name || 'Unknown',
          symbol: response.data.data.symbol || 'UNKNOWN'
        };
      }
      
      return null;
    } catch (error) {
      console.warn(`Could not get token metadata for ${mint}:`, error);
      return null;
    }
  }
  
  /**
   * Get a specific pool by ID
   */
  async getPool(poolId: string, forceRefresh = false): Promise<Pool | null> {
    // Check if this is a Raydium pool ID
    const isRaydiumPool = poolId.startsWith('raydium_');
    
    if (isRaydiumPool) {
      const raydiumId = poolId.replace('raydium_', '');
      
      try {
        // Define the expected response structure
        interface RaydiumPoolResponse {
          data: RaydiumPool | null;
        }
        // Get pool directly from Raydium API
        const response = await axios.get<RaydiumPoolResponse>(`${this.raydiumApiBase}/main/pool/${raydiumId}`);
        
        if (response.data && response.data.data) {
          const pool = response.data.data;
          const quoteTokenInfo = await this.getTokenMetadata(pool.quoteMint);
          const quoteTokenSymbol = quoteTokenInfo?.symbol || 'UNKNOWN';
          
          // Use the same conversion logic as in fetchRaydiumPools
          // TODO: Consider fetching the actual denomination if available or needed
          const denomination = 0.1 * LAMPORTS_PER_SOL; 
          
          return {
            id: `raydium_${pool.id}`,
            label: `Raydium SOL-${quoteTokenSymbol}`,
            denomination: denomination,
            denominationFormatted: `${denomination / LAMPORTS_PER_SOL} SOL (SOL-${quoteTokenSymbol})`,
            treeId: pool.lpMint,
            totalDeposits: pool.liquidity / 100000, // Example scaling
            leafCount: Math.floor(pool.liquidity / 10000), // Example scaling
            active: true, // Assume active if fetched successfully
            type: 'raydium',
            lpToken: pool.lpMint,
            feePercent: pool.fee * 100
          };
        }
      } catch (error) {
        console.error(`Error fetching Raydium pool ${raydiumId}:`, error);
        // Fall through to standard pool logic if Raydium fetch fails
      }
    }
    
    // For standard pools or if Raydium fetch failed, use standard logic
    const cachedPool = this.poolCache.get(poolId);
    if (!forceRefresh && cachedPool && (Date.now() - cachedPool.timestamp) < this.cacheDuration) {
      return cachedPool.pool;
    }
    
    try {
      // Try to get pool from current cache to avoid fetching all pools
      if (this.allPoolsCache && 
          (Date.now() - this.allPoolsCache.timestamp) < this.cacheDuration) {
        const pool = this.allPoolsCache.pools.find(p => p.id === poolId);
        if (pool) return pool;
      }
      
      // If not found or cache expired, get all pools (which will update cache)
      // Ensure standard pools are fetched if needed
      await this.getStandardPools(); // This updates the cache via getPools if necessary
      
      // Check cache again after potential update
      if (this.allPoolsCache) {
          const pool = this.allPoolsCache.pools.find(p => p.id === poolId);
          if (pool) return pool;
      }

      // If still not found, it doesn't exist or there was an error
      return null; 
    } catch (error) {
      console.error(`Error fetching pool ${poolId}:`, error);
      
      // Return cached data if available
      if (cachedPool) {
        console.warn('Returning cached pool data due to error');
        return cachedPool.pool;
      }
      
      throw new Error(`Failed to fetch pool: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get the current state of a merkle tree
   */
  async getTreeState(treeId: string): Promise<TreeState> {
    // For Raydium "trees", simulate tree state
    // Check if it looks like a base58 mint address (43 or 44 chars)
    if (treeId.length === 44 || treeId.length === 43) { 
      try {
        // Check if this might be a token mint (Raydium LP token)
        const tokenSupplyResult = await this.traditionalConnection.getTokenSupply(new PublicKey(treeId));
        if (tokenSupplyResult.value) {
          // Simulate tree state based on token supply
          const supply = tokenSupplyResult.value.uiAmount || 0;
          return {
            root: treeId, // Use mint as root for Raydium pools
            leafCount: Math.floor(supply * 100) // Scale for leaf count, adjust as needed
          };
        }
      } catch (e) {
        // Not a token mint or error fetching supply, continue to standard logic
        console.warn(`Could not get token supply for ${treeId}, assuming standard tree: ${e}`);
      }
    }
    
    try {
      // Use our light client for standard trees
      const treeAccount = await this.lightClient.getCompressedAccount(treeId);
      
      if (!treeAccount || !treeAccount.data) {
        // Check if it's just not initialized yet
        if (treeAccount && treeAccount.leafCount === 0) {
            return {
                root: '', // Or a default empty root hash if applicable
                leafCount: 0
            };
        }
        throw new Error(`Tree account not found or has no data: ${treeId}`);
      }
      
      return {
        root: treeAccount.data.dataHash,
        leafCount: treeAccount.leafCount
      };
    } catch (error) {
      console.error(`Error fetching tree state for ${treeId}:`, error);
      throw new Error(`Failed to fetch tree state: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get Raydium APR and fee information for a pool
   */
  async getRaydiumPoolStats(poolId: string): Promise<{
    apr: number;
    fee: number;
    volume24h: number;
    liquidity: number;
  } | null> {
    if (!poolId.startsWith('raydium_')) {
      return null; // Not a Raydium pool
    }
    
    try {
      const raydiumId = poolId.replace('raydium_', '');
      // Define the expected response structure
      interface RaydiumStatsResponse {
        data: {
          apr?: number;
          fee?: number;
          volume24h?: number;
          liquidity?: number;
        } | null;
      }
      const response = await axios.get<RaydiumStatsResponse>(`${this.raydiumApiBase}/main/pool/${raydiumId}/stats`);
      
      if (response.data && response.data.data) {
        return {
          apr: response.data.data.apr || 0,
          fee: response.data.data.fee || 0,
          volume24h: response.data.data.volume24h || 0,
          liquidity: response.data.data.liquidity || 0
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching Raydium pool stats for ${poolId}:`, error);
      return null;
    }
  }
  
  /**
   * Check if a pool is available and active
   */
  async isPoolAvailable(poolId: string): Promise<boolean> {
    try {
      const pool = await this.getPool(poolId);
      return !!pool && pool.active;
    } catch (error) {
      console.error(`Error checking pool availability ${poolId}:`, error);
      return false;
    }
  }
  
  /**
   * Clear the pool cache
   */
  clearCache(): void {
    this.poolCache.clear();
    this.allPoolsCache = null;
  }
}