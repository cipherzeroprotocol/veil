import { createRpc, Rpc } from '@lightprotocol/stateless.js';
import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/**
 * Client for interacting with Light Protocol compressed data
 */
export class LightProtocolClient {
  private rpc: Rpc;
  private endpoint: string;
  
  /**
   * Create a new Light Protocol client
   * @param endpoint RPC endpoint URL
   * @param apiKey Optional API key for the RPC endpoint
   */
  constructor(endpoint: string, apiKey?: string) {
    this.endpoint = apiKey ? `${endpoint}?api-key=${apiKey}` : endpoint;
    this.rpc = createRpc(this.endpoint, this.endpoint, this.endpoint);
  }
  
  /**
   * Get the underlying RPC connection
   */
  getConnection(): Rpc {
    return this.rpc;
  }
  
  /**
   * Send a JSON-RPC request to the endpoint
   * @param method The RPC method name
   * @param params Array of parameters for the method
   */
  private async sendJsonRpcRequest(method: string, params: any[]): Promise<any> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
      }
      
      return data.result;
    } catch (error) {
      console.error(`Error sending RPC request to ${method}:`, error);
      throw error;
    }
  }
  
  /**
   * Get merkle proof for a leaf in a compressed account
   * @param treeId Tree identifier
   * @param leafIndex Index of the leaf in the tree
   */
  async getCompressedMerkleProof(treeId: string, leafIndex: number): Promise<{
    root: string;
    proof: string[];
  }> {
    try {
      const result = await this.sendJsonRpcRequest(
        'light_getCompressedAccountProof',
        [treeId, leafIndex]
      );
      
      if (!result || !result.root) { 
        throw new Error(`Failed to get proof for leaf ${leafIndex} in tree ${treeId}`);
      }
      
      return {
        root: result.root,
        proof: result.proof || []
      };
    } catch (error) {
      console.error('Error getting merkle proof:', error);
      throw new Error(`Failed to get merkle proof: ${error}`);
    }
  }
  
  /**
   * Check if a nullifier exists (has been spent)
   * @param nullifierHash Hex string of the nullifier hash
   */
  async checkNullifier(nullifierHash: string): Promise<boolean> {
    try {
      const result = await this.sendJsonRpcRequest(
        'light_getCompressedNullifier',
        [nullifierHash]
      );
      
      // If a nullifier is found, it's been spent
      return !!result;
    } catch (error) {
      // If the error indicates the nullifier doesn't exist, it hasn't been spent
      if (error && error.toString().toLowerCase().includes('not found')) {
        return false;
      }
      console.error('Error checking nullifier status:', error);
      throw error;
    }
  }
  
  /**
   * Insert a leaf into a compressed merkle tree
   * @param treeId Tree identifier
   * @param leaf Hex string of the leaf data
   * @param leafIndex Optional index for the leaf
   */
  async insertCompressedLeaf(treeId: string, leaf: string, leafIndex?: number): Promise<void> {
    try {
      // Prepare params based on whether leafIndex is provided
      const params = leafIndex !== undefined 
        ? [treeId, leaf, leafIndex] 
        : [treeId, leaf];
      
      await this.sendJsonRpcRequest('light_insertCompressedLeaf', params);
    } catch (error) {
      console.error('Error inserting compressed leaf:', error);
      throw new Error(`Failed to insert leaf: ${error}`);
    }
  }
  
  /**
   * Get data for a compressed account
   * @param treeId Tree identifier
   */
  async getCompressedAccount(treeId: string): Promise<{
    data: { dataHash: string };
    leafCount: number;
  }> {
    try {
      const result = await this.sendJsonRpcRequest(
        'light_getCompressedAccount',
        [treeId]
      );
      
      if (!result) {
        throw new Error(`Compressed account not found for ${treeId}`);
      }
      
      // Format response to match expected structure
      return {
        data: { 
          dataHash: result.dataHash || result.root || ''
        },
        leafCount: result.leafCount || 0
      };
    } catch (error) {
      console.error('Error getting compressed account:', error);
      throw new Error(`Failed to get compressed account: ${error}`);
    }
  }
}
