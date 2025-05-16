import { createRpc, Rpc, CompressedAccountWithMerkleContext } from '@lightprotocol/stateless.js';
import BN from 'bn.js';

// Define a type that represents our custom methods
type CustomRpcMethods = {
  getCompressedMerkleProof: (treeId: BN, leafIndex: BN) => Promise<any>;
  getCompressedNullifier: (hash: BN) => Promise<any>;
  insertCompressedLeaf: (treeId: BN, leaf: BN, leafIndex?: BN) => Promise<void>;
};

// Create a merged type instead of extending incompatible interfaces
export type ExtendedRpc = Rpc & CustomRpcMethods;

/**
 * Create an extended RPC client with additional methods
 */
export function createExtendedRpc(url: string): ExtendedRpc {
  // Create base RPC
  const rpc = createRpc(url, url, url);
  
  // Properly extend the RPC object by modifying its prototype
  // This approach preserves all original methods and properties
  const extendedRpc = Object.create(rpc) as ExtendedRpc;
  
  // Add our custom methods directly to the object
  extendedRpc.getCompressedMerkleProof = async (treeId: BN, leafIndex: BN) => {
    // Implementation would use direct HTTP request or other available methods
    throw new Error('Not implemented');
  };
  
  extendedRpc.getCompressedNullifier = async (hash: BN) => {
    throw new Error('Not implemented');
  };
  
  extendedRpc.insertCompressedLeaf = async (treeId: BN, leaf: BN, leafIndex?: BN) => {
    throw new Error('Not implemented');
  };
  
  return extendedRpc;
}
