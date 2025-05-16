/**
 * SolanaVeil Bridge SDK
 * Enables cross-chain private transfers between Solana and Ethereum/L2s
 */

import { SolanaBridge } from './solana';
import { EthereumBridge } from './ethereum';
import { L2Bridge, L2BridgeFactory } from './l2';
import { generateBridgeProof, verifyBridgeProof } from './proof';
import { initializeL2BridgeFactory } from './utils/factoryInitializer';

// Re-export all bridge components
export {
  SolanaBridge,
  EthereumBridge,
  L2Bridge,
  L2BridgeFactory,
  generateBridgeProof,
  verifyBridgeProof,
  initializeL2BridgeFactory
};

// Chain ID constants
export enum ChainId {
  Solana = 1,
  Ethereum = 2,
  Optimism = 10,
  Arbitrum = 42161,
  Base = 8453
}

// Bridge transfer status
export enum BridgeTransferStatus {
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed',
  Claimed = 'claimed'
}

// Bridge transfer direction
export enum BridgeDirection {
  SolanaToEthereum = 'solana-to-ethereum',
  EthereumToSolana = 'ethereum-to-solana',
  SolanaToL2 = 'solana-to-l2',
  L2ToSolana = 'l2-to-solana'
}

// Bridge transfer details
export interface BridgeTransferDetails {
  id: string;
  sourceChain: ChainId;
  destinationChain: ChainId;
  amount: string;
  tokenId: number;
  sender: string;
  recipient: string;
  nullifier: string;
  status: BridgeTransferStatus;
  timestamp: number;
  txHash?: string;
  claimTxHash?: string;
  direction: BridgeDirection;
}

// Bridge secrets for private transfers
export interface BridgeSecrets {
  secret: Uint8Array;
  nullifier: string;
  commitment: string;
}

// Transfer initiation parameters
export interface BridgeTransferParams {
  sourceChain: ChainId;
  destinationChain: ChainId;
  amount: string;
  tokenId: number;
  recipient: string;
}

// Bridge proof data structure
export interface BridgeProofData {
  proof: Uint8Array;
  publicInputs: {
    destinationChainId: ChainId;
    recipientAddress: string;
    amount: string;
    tokenId: number;
    nullifier: string;
    root: string;
  };
}

/**
 * Main SolanaVeil Bridge client that coordinates cross-chain transfers
 */
export class SolanaVeilBridge {
  private solanaBridge: SolanaBridge;
  private ethereumBridge: EthereumBridge;
  private l2BridgeFactory: L2BridgeFactory;

  /**
   * Create a new SolanaVeil Bridge client
   * @param solanaBridge Solana bridge instance
   * @param ethereumBridge Ethereum bridge instance
   * @param l2BridgeFactory L2 bridge factory
   */
  constructor(
    solanaBridge: SolanaBridge,
    ethereumBridge: EthereumBridge,
    l2BridgeFactory: L2BridgeFactory
  ) {
    this.solanaBridge = solanaBridge;
    this.ethereumBridge = ethereumBridge;
    this.l2BridgeFactory = l2BridgeFactory;
  }

  /**
   * Transfer tokens from Solana to Ethereum or L2
   * @param params Transfer parameters
   * @returns Bridge transfer details and secrets
   */
  async transferFromSolana(
    params: BridgeTransferParams
  ): Promise<{
    transfer: BridgeTransferDetails;
    secrets: BridgeSecrets;
  }> {
    const { sourceChain, destinationChain, amount, tokenId, recipient } = params;

    // Verify source chain is Solana
    if (sourceChain !== ChainId.Solana) {
      throw new Error('Source chain must be Solana for transferFromSolana');
    }

    // Determine target network and direction
    let direction: BridgeDirection;
    if (destinationChain === ChainId.Ethereum) {
      direction = BridgeDirection.SolanaToEthereum;
    } else {
      direction = BridgeDirection.SolanaToL2;
    }

    // Execute the transfer on Solana
    const result = await this.solanaBridge.bridgeToEthereum({
      amount,
      tokenId,
      destinationChain,
      recipient
    });

    // Return transfer details and secrets
    return {
      transfer: {
        id: result.transferId,
        sourceChain,
        destinationChain,
        amount,
        tokenId,
        sender: result.sender,
        recipient,
        nullifier: result.secrets.nullifier,
        status: BridgeTransferStatus.Pending,
        timestamp: Date.now(),
        txHash: result.txHash,
        direction
      },
      secrets: result.secrets
    };
  }

  /**
   * Transfer tokens from Ethereum or L2 to Solana
   * @param params Transfer parameters
   * @returns Bridge transfer details
   */
  async transferToSolana(
    params: BridgeTransferParams
  ): Promise<{
    transfer: BridgeTransferDetails;
  }> {
    const { sourceChain, destinationChain, amount, tokenId, recipient } = params;

    // Verify destination chain is Solana
    if (destinationChain !== ChainId.Solana) {
      throw new Error('Destination chain must be Solana for transferToSolana');
    }

    // Determine source network and direction
    let direction: BridgeDirection;
    let result: { transferId: string; sender: string; txHash?: string };

    if (sourceChain === ChainId.Ethereum) {
      direction = BridgeDirection.EthereumToSolana;
      result = await this.ethereumBridge.bridgeToSolana({
        amount,
        tokenId,
        recipient
      });
    } else {
      direction = BridgeDirection.L2ToSolana;
      const l2Bridge = this.l2BridgeFactory.getBridgeForChain(sourceChain);
      result = await l2Bridge.bridgeToSolana({
        amount,
        tokenId,
        recipient
      });
    }

    // Return transfer details
    return {
      transfer: {
        id: result.transferId,
        sourceChain,
        destinationChain,
        amount,
        tokenId,
        sender: result.sender,
        recipient,
        nullifier: '', // No nullifier needed for this direction
        status: BridgeTransferStatus.Pending,
        timestamp: Date.now(),
        txHash: result.txHash,
        direction
      }
    };
  }

  /**
   * Claim tokens that were bridged from another chain
   * @param transferId ID of the transfer to claim
   * @param secrets Secrets for the transfer (for Ethereum/L2 -> Solana)
   * @returns Updated bridge transfer details
   */
  async claimBridgedTokens(
    transferId: string,
    proofData?: BridgeProofData,
    secrets?: BridgeSecrets
  ): Promise<{
    transfer: BridgeTransferDetails;
  }> {
    // Implementation depends on the direction of the transfer
    // This is a simplified version

    // For demo purposes, we'll assume we can look up the transfer
    const transfer = await this.getTransferDetails(transferId);

    if (
      transfer.direction === BridgeDirection.SolanaToEthereum ||
      transfer.direction === BridgeDirection.SolanaToL2
    ) {
      // Claiming on Ethereum or L2
      if (!proofData) {
        throw new Error('Proof data is required for claiming on Ethereum/L2');
      }

      if (transfer.destinationChain === ChainId.Ethereum) {
        await this.ethereumBridge.claimFromSolana({
          proofData,
          recipient: transfer.recipient
        });
      } else {
        const l2Bridge = this.l2BridgeFactory.getBridgeForChain(transfer.destinationChain);
        await l2Bridge.claimFromSolana({
          proofData,
          recipient: transfer.recipient
        });
      }
    } else {
      // Claiming on Solana
      if (!secrets) {
        throw new Error('Secrets are required for claiming on Solana');
      }

      await this.solanaBridge.claimFromEthereum({
        transferId,
        secrets,
        amount: transfer.amount,
        tokenId: transfer.tokenId
      });
    }

    // Return updated transfer details
    return {
      transfer: {
        ...transfer,
        status: BridgeTransferStatus.Completed
      }
    };
  }

  /**
   * Get details for a specific transfer
   * @param transferId ID of the transfer
   * @returns Bridge transfer details
   */
  async getTransferDetails(transferId: string): Promise<BridgeTransferDetails> {
    // In a real implementation, this would query a database or the blockchain
    // For this example, we'll return a mock transfer
    return {
      id: transferId,
      sourceChain: ChainId.Solana,
      destinationChain: ChainId.Ethereum,
      amount: '1000000000',
      tokenId: 1,
      sender: 'solana_sender_address',
      recipient: 'ethereum_recipient_address',
      nullifier: 'nullifier_hash',
      status: BridgeTransferStatus.Pending,
      timestamp: Date.now() - 3600000, // 1 hour ago
      txHash: 'tx_hash',
      direction: BridgeDirection.SolanaToEthereum
    };
  }

  /**
   * Get all transfers for a specific address
   * @param address Address to get transfers for
   * @returns Array of bridge transfer details
   */
  async getTransfersForAddress(address: string): Promise<BridgeTransferDetails[]> {
    // In a real implementation, this would query a database or the blockchain
    // For this example, we'll return a mock transfer list
    return [
      {
        id: 'transfer_1',
        sourceChain: ChainId.Solana,
        destinationChain: ChainId.Ethereum,
        amount: '1000000000',
        tokenId: 1,
        sender: address,
        recipient: 'ethereum_recipient_address',
        nullifier: 'nullifier_hash_1',
        status: BridgeTransferStatus.Completed,
        timestamp: Date.now() - 86400000, // 1 day ago
        txHash: 'tx_hash_1',
        direction: BridgeDirection.SolanaToEthereum
      },
      {
        id: 'transfer_2',
        sourceChain: ChainId.Ethereum,
        destinationChain: ChainId.Solana,
        amount: '500000000',
        tokenId: 1,
        sender: 'ethereum_sender_address',
        recipient: address,
        nullifier: 'nullifier_hash_2',
        status: BridgeTransferStatus.Pending,
        timestamp: Date.now() - 3600000, // 1 hour ago
        txHash: 'tx_hash_2',
        direction: BridgeDirection.EthereumToSolana
      }
    ];
  }
}