import { 
  Connection, 
  TransactionSignature, 
  ParsedTransactionWithMeta, 
  TransactionResponse,
  PublicKey,
  LAMPORTS_PER_SOL, 
  ParsedMessageAccount,
  SystemProgram
} from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { PROGRAM_ID } from '../constants';

export interface DepositEventData {
  leafIndex?: number;
  commitmentHash?: string; // Original field
  commitment?: string;     // Light Protocol field
  poolId?: string;
  merkleTree?: PublicKey;  // Light Protocol field
  timestamp?: number;
  amount?: number;
  type?: string;
  status?: 'success' | 'error';
  errorMessage?: string;
  treeId?: string;
  nullifier?: string;     // Added from Light Protocol version
}

export interface WithdrawEventData {
  nullifierHash: string;
  recipient: string;
  relayer?: string;
  fee?: number;
  poolId: string;
  timestamp: number;
  amount?: number;
  type?: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface TransactionDetails {
  signature: string;
  timestamp: number;
  fee: number;
  type: 'deposit' | 'withdraw' | 'unknown';
  status: 'success' | 'error';
  events: (DepositEventData | WithdrawEventData)[];
  blockHeight?: number;
  errorMessage?: string;
  raw: ParsedTransactionWithMeta | TransactionResponse;
}

export interface TransactionHistoryDetails {
  signature: string;
  timestamp: number;
  blockTime: number;
  slot: number;
  fee: number;
  type: 'deposit' | 'withdraw' | 'unknown' | 'Transfer' | 'Interaction' | 'System' | 'PrivateOp';
  status: 'success' | 'error';
  involvedParties: string[];
  amount: number;
  rawInstructions: ParsedInstructionInfo[];
  isPrivate: boolean;
  errorMessage?: string;
}

export interface ParsedInstructionInfo {
  programId: string;
  program: string;
  type: string;
  details: any;
  accounts: string[];
  data?: string;
}

type TransactionType = TransactionHistoryDetails['type'];

/**
 * Utility class for parsing Solana transaction data
 */
export class TransactionParser {
  private program?: Program;
  private programId: PublicKey;

  /**
   * Initialize with a Solana program if available
   */
  constructor(programId: string = PROGRAM_ID) {
    this.programId = new PublicKey(programId);
  }
  
  /**
   * Set the Anchor program instance for more detailed parsing
   */
  setProgram(program: Program): void {
    this.program = program;
  }
  
  /**
   * Parse a transaction and extract relevant details
   */
  async parseTransaction(
    connection: Connection, 
    signature: TransactionSignature
  ): Promise<TransactionDetails> {
    try {
      // Get the transaction with parsed data
      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!tx) {
        throw new Error('Transaction not found');
      }
      
      // Get basic transaction details
      const timestamp = tx.blockTime || Math.floor(Date.now() / 1000);
      const fee = tx.meta?.fee || 0;
      const status = tx.meta?.err ? 'error' : 'success';
      const blockHeight = tx.slot;
      
      // Determine transaction type
      const type = this.determineTransactionType(tx);
      
      // Extract events based on transaction type
      let events: (DepositEventData | WithdrawEventData)[] = [];
      if (type === 'deposit') {
        const depositEvent = await this.extractDepositEvent(tx);
        if (depositEvent) events.push(depositEvent);
      } else if (type === 'withdraw') {
        const withdrawEvent = await this.extractWithdrawEvent(tx);
        if (withdrawEvent) events.push(withdrawEvent);
      }
      
      // Get error message if transaction failed
      let errorMessage: string | undefined;
      if (status === 'error' && tx.meta?.err) {
        errorMessage = this.formatErrorMessage(tx.meta.err);
      }
      
      return {
        signature,
        timestamp,
        fee,
        type,
        status,
        events,
        blockHeight,
        errorMessage,
        raw: tx
      };
    } catch (error) {
      console.error('Error parsing transaction:', error);
      return {
        signature,
        timestamp: Math.floor(Date.now() / 1000),
        fee: 0,
        type: 'unknown',
        status: 'error',
        events: [],
        errorMessage: `Failed to parse transaction: ${(error as Error).message}`,
        raw: {} as any
      };
    }
  }
  
  /**
   * Determine the type of transaction based on its content
   */
  private determineTransactionType(tx: ParsedTransactionWithMeta): 'deposit' | 'withdraw' | 'unknown' {
    if (!tx.meta?.logMessages) {
      return 'unknown';
    }
    
    const logs = tx.meta.logMessages;
    
    // Check for deposit indicators
    const isDeposit = logs.some(log => 
      log.includes('insert_compressed_leaf') || 
      log.includes('deposit') || 
      log.includes('DepositEvent')
    );
    
    if (isDeposit) {
      return 'deposit';
    }
    
    // Check for withdraw indicators
    const isWithdraw = logs.some(log => 
      log.includes('verify_compressed_nullifier') || 
      log.includes('withdraw') || 
      log.includes('WithdrawEvent')
    );
    
    if (isWithdraw) {
      return 'withdraw';
    }
    
    return 'unknown';
  }

  /**
   * Extracts the deposit event data from transaction logs
   */
  async extractDepositEvent(tx: ParsedTransactionWithMeta): Promise<DepositEventData | null> {
    try {
      if (!tx.meta?.logMessages) {
        return null;
      }
      
      const logs = tx.meta.logMessages;
      
      // Find the deposit event log
      // Check different log patterns in order of specificity
      const depositLogPattern = /insert_compressed_leaf:.*"leaf_index":(\d+).*"leaf":"([^"]+)/;
      const programLogPattern = /Program data: DepositEvent.*leaf_index: (\d+).*commitment: \[([^\]]+)/;
      const compressionLogPattern = /insert_compressed_leaf:.*"tree_id":"([^"]+)".*"leaf_index":(\d+).*"leaf":"([^"]+)"/;
      
      // Extract poolId, either from programId or specific log mentions
      let poolId = '';
      const poolIdPattern = /pool: ([a-zA-Z0-9]+)/;
      for (const log of logs) {
        const poolMatch = log.match(poolIdPattern);
        if (poolMatch) {
          poolId = poolMatch[1];
          break;
        }
      }
      
      // Try to find logs matching any of the patterns
      for (const log of logs) {
        // Try standard deposit pattern
        let match = log.match(depositLogPattern);
        if (match) {
          return {
            leafIndex: parseInt(match[1], 10),
            commitmentHash: match[2],
            poolId: poolId || 'unknown',
            timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
            status: 'success'
          };
        }
        
        // Try program log pattern
        match = log.match(programLogPattern);
        if (match) {
          return {
            leafIndex: parseInt(match[1], 10),
            commitmentHash: match[2],
            poolId: poolId || 'unknown',
            timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
            status: 'success'
          };
        }
        
        // Try compression log pattern
        match = log.match(compressionLogPattern);
        if (match) {
          return {
            treeId: match[1],
            leafIndex: parseInt(match[2], 10),
            commitmentHash: match[3],
            poolId: poolId || match[1], // Use treeId as poolId if poolId not found
            timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
            status: 'success'
          };
        }
      }
      
      // If we got here, we couldn't find detailed information, but we know it's a deposit
      // Extract whatever information we can
      const ammountPattern = /Transfer (\d+) lamports/;
      let amount;
      
      for (const log of logs) {
        const amountMatch = log.match(ammountPattern);
        if (amountMatch) {
          amount = parseInt(amountMatch[1], 10);
          break;
        }
      }
      
      return {
        leafIndex: -1, // Unknown
        commitmentHash: 'unknown',
        poolId: poolId || 'unknown',
        timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
        amount: amount,
        status: 'success'
      };
    } catch (error) {
      console.error('Error extracting deposit event:', error);
      return {
        leafIndex: -1,
        commitmentHash: 'error',
        poolId: 'unknown',
        timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
        status: 'error',
        errorMessage: (error as Error).message
      };
    }
  }

  /**
   * Extracts the withdraw event data from transaction logs
   */
  async extractWithdrawEvent(tx: ParsedTransactionWithMeta): Promise<WithdrawEventData | null> {
    try {
      if (!tx.meta?.logMessages) {
        return null;
      }
      
      const logs = tx.meta.logMessages;
      
      // Find the withdraw event log
      // Check different log patterns in order of specificity
      const withdrawLogPattern = /Program data: WithdrawEvent.*pool: ([a-zA-Z0-9]+).*nullifier_hash: \[([^\]]+)\].*recipient: ([a-zA-Z0-9]+)/;
      const nullifierLogPattern = /verify_compressed_nullifier:.*"nullifier":"([^"]+)".*"tree_id":"([^"]+)"/;
      
      // Extract recipient address
      let recipient = '';
      const recipientPattern = /Transfer: (\w+) lamports to (\w+)/;
      for (const log of logs) {
        const recipientMatch = log.match(recipientPattern);
        if (recipientMatch) {
          recipient = recipientMatch[2]; // Second capture group is recipient
          break;
        }
      }
      
      // Extract relayer and fee information
      let relayer;
      let fee;
      
      const relayerPattern = /relayer: ([a-zA-Z0-9]+)/;
      const feePattern = /fee: (\d+)/;
      
      for (const log of logs) {
        const relayerMatch = log.match(relayerPattern);
        if (relayerMatch) {
          relayer = relayerMatch[1];
        }
        
        const feeMatch = log.match(feePattern);
        if (feeMatch) {
          fee = parseInt(feeMatch[1], 10);
        }
      }
      
      // Find poolId
      let poolId = '';
      const poolIdPattern = /pool: ([a-zA-Z0-9]+)/;
      for (const log of logs) {
        const poolMatch = log.match(poolIdPattern);
        if (poolMatch) {
          poolId = poolMatch[1];
          break;
        }
      }
      
      // Check for nullifierHash
      let nullifierHash = '';
      
      // Try each pattern to find the data we need
      for (const log of logs) {
        // Try standard withdraw pattern
        let match = log.match(withdrawLogPattern);
        if (match) {
          return {
            poolId: match[1],
            nullifierHash: match[2],
            recipient: match[3],
            relayer,
            fee,
            timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
            status: 'success'
          };
        }
        
        // Try nullifier pattern
        match = log.match(nullifierLogPattern);
        if (match) {
          nullifierHash = match[1];
          poolId = poolId || match[2];
        }
      }
      
      // If we have at least nullifierHash and recipient, we can return a partial event
      if (nullifierHash && recipient) {
        return {
          nullifierHash,
          recipient,
          poolId: poolId || 'unknown',
          relayer,
          fee,
          timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
          status: 'success'
        };
      }
      
      // Extract amount if possible
      const amountPattern = /Transfer (\d+) lamports/;
      let amount;
      
      for (const log of logs) {
        const amountMatch = log.match(amountPattern);
        if (amountMatch) {
          amount = parseInt(amountMatch[1], 10);
          break;
        }
      }
      
      // Return whatever information we have
      return {
        nullifierHash: nullifierHash || 'unknown',
        recipient: recipient || 'unknown',
        poolId: poolId || 'unknown',
        timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
        amount,
        status: 'success'
      };
    } catch (error) {
      console.error('Error extracting withdraw event:', error);
      return {
        nullifierHash: 'error',
        recipient: 'unknown',
        poolId: 'unknown',
        timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
        status: 'error',
        errorMessage: (error as Error).message
      };
    }
  }

  /**
   * Format error messages from transaction errors
   */
  // Make this public so it can be accessed outside the class
  public formatErrorMessage(err: any): string {
    if (typeof err === 'string') {
      return err;
    }
    if (err.InstructionError) {
      const instructionIndex = err.InstructionError[0];
      const error = err.InstructionError[1];
      if (typeof error === 'string') {
        return `Instruction ${instructionIndex} failed: ${error}`;
      } else if (error.Custom !== undefined) {
        return `Instruction ${instructionIndex} failed with custom error: ${error.Custom}`;
      } else {
        return `Instruction ${instructionIndex} failed: ${JSON.stringify(error)}`;
      }
    }
    return JSON.stringify(err);
  }

  /**
   * Formats transaction logs for debugging
   */
  formatTransactionLogs(logs: string[]): string {
    return logs.map((log, index) => `[${index}] ${log}`).join('\n');
  }
  
  /**
   * Extract all events from a transaction
   */
  async extractEvents(tx: ParsedTransactionWithMeta): Promise<(DepositEventData | WithdrawEventData)[]> {
    const events: (DepositEventData | WithdrawEventData)[] = [];
    
    const txType = this.determineTransactionType(tx);
    
    if (txType === 'deposit') {
      const depositEvent = await this.extractDepositEvent(tx);
      if (depositEvent) events.push(depositEvent);
    } else if (txType === 'withdraw') {
      const withdrawEvent = await this.extractWithdrawEvent(tx);
      if (withdrawEvent) events.push(withdrawEvent);
    }
    
    return events;
  }

  /**
   * Parse multiple transactions in batch
   */
  async parseMultipleTransactions(
    connection: Connection,
    signatures: TransactionSignature[]
  ): Promise<TransactionDetails[]> {
    const results: TransactionDetails[] = [];
    
    for (const signature of signatures) {
      try {
        const parsed = await this.parseTransaction(connection, signature);
        results.push(parsed);
      } catch (error) {
        console.error(`Error parsing transaction ${signature}:`, error);
        // Add a placeholder result with error information
        results.push({
          signature,
          timestamp: Math.floor(Date.now() / 1000),
          fee: 0,
          type: 'unknown',
          status: 'error',
          events: [],
          errorMessage: `Failed to parse: ${(error as Error).message}`,
          raw: {} as any
        });
      }
    }
    
    return results;
  }
}

// Export singleton instance for convenience
export const transactionParser = new TransactionParser();

// Keep compatibility with existing code that uses these functions directly
export const parseDepositEvent = async (signature: string, connection: Connection): Promise<DepositEventData | null> => {
  try {
    // Fetch the transaction details
    const tx = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!tx) {
      return null;
    }
    
    // Get both the TransactionParser implementation and the Light Protocol implementation
    const classicEventData = await transactionParser.extractDepositEvent(tx);
    let lightProtocolEventData: DepositEventData = {};
    
    // Try Light Protocol specific parsing if transaction has logs
    if (tx.meta?.logMessages) {
      // Try to find deposit event logs from Light Protocol system program
      const depositLogs = tx.meta.logMessages.filter(
        log => log.includes('Deposit') && 
              (log.includes('leaf_index') || log.includes('merkle_tree'))
      );

      if (depositLogs.length > 0) {
        // Parse logs for relevant data
        for (const log of depositLogs) {
          // Extract leaf index
          const leafIndexMatch = log.match(/leaf_index: (\d+)/);
          if (leafIndexMatch && leafIndexMatch[1]) {
            lightProtocolEventData.leafIndex = parseInt(leafIndexMatch[1], 10);
          }
          
          // Extract merkle tree
          const merkleTreeMatch = log.match(/merkle_tree: ([A-Za-z0-9]{32,})/);
          if (merkleTreeMatch && merkleTreeMatch[1]) {
            lightProtocolEventData.merkleTree = new PublicKey(merkleTreeMatch[1]);
          }
          
          // Extract commitment (if present)
          const commitmentMatch = log.match(/commitment: ([A-Fa-f0-9]+)/);
          if (commitmentMatch && commitmentMatch[1]) {
            lightProtocolEventData.commitment = commitmentMatch[1];
          }
          
          // Extract amount
          const amountMatch = log.match(/amount: (\d+)/);
          if (amountMatch && amountMatch[1]) {
            lightProtocolEventData.amount = parseInt(amountMatch[1], 10);
          }
        }
        
        // If we couldn't find explicit data in logs, try finding it in the instructions
        if (!lightProtocolEventData.leafIndex || !lightProtocolEventData.merkleTree) {
          // This would require more complex parsing based on the specific
          // structure of Light Protocol's transaction inner instructions
          console.debug("Attempting to extract data from inner instructions...");
        }
        
        // Add timestamp if available from blockTime
        if (tx.blockTime) {
          lightProtocolEventData.timestamp = tx.blockTime;
        }
      }
    }
    
    // Merge the two event data objects, preferring Light Protocol data when available
    const mergedEventData: DepositEventData = {
      ...classicEventData || {},
      ...Object.fromEntries(
        Object.entries(lightProtocolEventData).filter(([_, v]) => v !== undefined)
      )
    };
    
    // If we have meaningful data, return it
    if (Object.keys(mergedEventData).length > 0) {
      return mergedEventData;
    }
    
    return classicEventData; // Fall back to classic event data
  } catch (error) {
    console.error('Error parsing deposit event:', error);
    return null;
  }
};

export const parseWithdrawEventData = async (signature: string, connection: Connection): Promise<WithdrawEventData | null> => {
  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed'
  });
  
  if (!tx) {
    return null;
  }
  
  return await transactionParser.extractWithdrawEvent(tx);
};

export function formatTransactionLogs(logs: string[]): string {
  return transactionParser.formatTransactionLogs(logs);
}

export const getTransactionHistory = async (
  connection: Connection,
  address: PublicKey,
  limit: number = 10
): Promise<TransactionHistoryDetails[]> => {
  try {
    const signatures = await connection.getSignaturesForAddress(address, { limit });
    
    if (!signatures || signatures.length === 0) {
      return [];
    }

    const signatureStrings = signatures.map(sigInfo => sigInfo.signature);
    
    // Fetch parsed transactions
    const transactions = await connection.getParsedTransactions(
      signatureStrings, 
      { maxSupportedTransactionVersion: 0 } // Ensure compatibility
    );

    const detailedHistory: TransactionHistoryDetails[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const sigInfo = signatures[i]; // Get corresponding sigInfo

      if (tx) {
        const details = parseTransactionDetails(tx, address.toBase58()) as Omit<TransactionHistoryDetails, 'signature' | 'blockTime' | 'slot' | 'status' | 'fee'>;
        detailedHistory.push({
          ...details,
          signature: sigInfo.signature,
          blockTime: sigInfo.blockTime || 0,
          slot: sigInfo.slot,
          status: tx.meta?.err ? 'error' : 'success',
          fee: tx.meta?.fee ? tx.meta.fee / LAMPORTS_PER_SOL : 0,
        });
      } else {
         console.warn(`Failed to fetch parsed transaction for signature: ${sigInfo.signature}`);
         // Optionally add a placeholder or skip
         detailedHistory.push({
           signature: sigInfo.signature,
           blockTime: sigInfo.blockTime || 0,
           slot: sigInfo.slot,
           status: 'error', // Indicate fetch failure
           type: 'unknown',
           amount: 0,
           fee: 0,
           involvedParties: [],
           timestamp: (sigInfo.blockTime || 0) * 1000,
           rawInstructions: [],
           isPrivate: false,
           errorMessage: 'Failed to fetch transaction details',
         });
      }
    }

    return detailedHistory.sort((a, b) => b.timestamp - a.timestamp);

  } catch (error) {
    console.error("Error fetching transaction history:", error);
    throw error; // Re-throw or handle as needed
  }
};

export const getPendingTransactions = async (
  connection: Connection,
  address: PublicKey
): Promise<TransactionHistoryDetails[]> => {
   try {
    // Note: Solana doesn't have a reliable mempool query like Ethereum.
    // This often relies on heuristics or specific RPC methods if available.
    // A common approach is to look for recent signatures that haven't finalized.
    // However, getSignaturesForAddress typically only returns confirmed signatures.
    // This function might need a different strategy depending on the RPC provider
    // or could be adapted to monitor websocket subscriptions for pending txs involving the address.

    // Placeholder: Fetch recent confirmed transactions and assume some might appear "pending" briefly
    // In a real app, you'd likely use WebSocket subscriptions (`signatureSubscribe`)
    const signatures = await connection.getSignaturesForAddress(address, { limit: 5 }); // Check last 5

    if (!signatures || signatures.length === 0) {
      return [];
    }
    
    const signatureStrings = signatures.map(sigInfo => sigInfo.signature);
    const transactions = await connection.getParsedTransactions(
        signatureStrings, 
        { maxSupportedTransactionVersion: 0 }
    );

    const pendingTxs: TransactionHistoryDetails[] = [];

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const sigInfo = signatures[i];

        // Simple heuristic: If blockTime is very recent or null, consider it potentially pending
        // A better check would involve confirmation status if available
        const isPotentiallyPending = !sigInfo.blockTime || (Date.now() / 1000 - sigInfo.blockTime < 30); 

        if (tx && isPotentiallyPending && !tx.meta?.err) { // Only consider successful-looking ones
            const details = parseTransactionDetails(tx, address.toBase58()) as Omit<TransactionHistoryDetails, 'signature' | 'blockTime' | 'slot' | 'status' | 'fee'>;
            pendingTxs.push({
                ...details,
                signature: sigInfo.signature,
                blockTime: sigInfo.blockTime || 0,
                slot: sigInfo.slot,
                status: 'success', // Mark as pending based on heuristic
                fee: tx.meta?.fee ? tx.meta.fee / LAMPORTS_PER_SOL : 0,
            });
        }
    }
    
    return pendingTxs;

  } catch (error) {
    console.error("Error fetching pending transactions:", error);
    // Depending on the cause, might return empty or throw
    if (error instanceof Error && error.message.includes("WebSocket")) {
        console.warn("WebSocket connection issue, cannot reliably fetch pending transactions.");
        return [];
    }
    // For other errors, re-throw might be appropriate
    throw error; 
  }
};


// Helper function to safely get base58 string from account key
const getAccountKeyString = (accountKey: ParsedMessageAccount | PublicKey | string | undefined | null): string => {
  if (!accountKey) return 'Unknown';
  
  if (typeof accountKey === 'string') {
    return accountKey;
  }
  
  if (typeof accountKey === 'object') {
    // Check for ParsedMessageAccount structure
    if ('pubkey' in accountKey && accountKey.pubkey instanceof PublicKey) {
      return accountKey.pubkey.toBase58();
    }
    // Check if it's a PublicKey instance or behaves like one
    if (accountKey instanceof PublicKey) {
      return accountKey.toBase58();
    }
    // Fallback for objects that might have toBase58 directly (less common)
    if ('toBase58' in accountKey && typeof (accountKey as any).toBase58 === 'function') {
       try {
         return (accountKey as any).toBase58();
       } catch (e) {
         // Ignore errors if toBase58 exists but fails
       }
    }
  }
  
  return 'Unknown';
};

// Helper function to parse transaction details from ParsedTransactionWithMeta
const parseTransactionDetails = (
  tx: ParsedTransactionWithMeta, // Expect ParsedTransactionWithMeta
  userAddress: string
): Omit<TransactionHistoryDetails, 'signature' | 'blockTime' | 'slot' | 'status' | 'fee'> => {
  
  const instructions = parseTransactionInstructions(tx); // This function now receives the correct type
  const involvedParties = new Set<string>();
  let amount = 0;
  let type: TransactionType = 'unknown';
  let isPrivate = false;

  // Fix: Only use .pubkey if it exists (ParsedMessageAccount), otherwise skip
  tx.transaction.message.accountKeys.forEach(acc => {
    const pubkey = 
      // Case 1: ParsedMessageAccount
      ('pubkey' in acc && acc.pubkey instanceof PublicKey) ? acc.pubkey :
      // Case 2: PublicKey directly
      (acc instanceof PublicKey) ? acc :
      // Case 3: Unknown format, try to handle as PublicKey
      (typeof acc === 'string') ? new PublicKey(acc) : null;

    if (pubkey) {
      involvedParties.add(pubkey.toBase58());
    }
  });

  instructions.forEach(inst => {
    involvedParties.add(inst.programId);
    inst.accounts.forEach((acc: string) => involvedParties.add(acc));
    // Fix: Use string comparison for PROGRAM_ID
    if (inst.programId === SystemProgram.programId.toBase58() && inst.type === 'transfer') {
      type = 'Transfer';
      if (inst.details.lamports) {
        if (inst.details.source === userAddress) {
          amount -= inst.details.lamports / LAMPORTS_PER_SOL;
        }
        if (inst.details.destination === userAddress) {
          amount += inst.details.lamports / LAMPORTS_PER_SOL;
        }
      }
    } else if (inst.programId === PROGRAM_ID) {
      type = 'PrivateOp';
      isPrivate = true;
    }
  });

  if (type === 'unknown' && instructions.length > 0) {
    type = 'Interaction';
  } else if (instructions.length === 0) {
    type = 'System';
  }

  return {
    type,
    amount: Math.abs(amount),
    involvedParties: Array.from(involvedParties).filter(p => p !== userAddress),
    timestamp: (tx.blockTime || 0) * 1000,
    rawInstructions: instructions,
    isPrivate,
    errorMessage: tx.meta?.err ? transactionParser.formatErrorMessage(tx.meta.err) : undefined,
  };
};

// Helper function to parse instructions from ParsedTransactionWithMeta
const parseTransactionInstructions = (
  tx: ParsedTransactionWithMeta // Expect ParsedTransactionWithMeta
): ParsedInstructionInfo[] => {
  const message = tx.transaction.message;
  const meta = tx.meta;

  if (!message.instructions || !meta) {
    return [];
  }

  return message.instructions.map((inst: any, index): ParsedInstructionInfo => {
    // Use safer approach - check for properties directly instead of type guards
    const programIdIndex = inst.programIdIndex !== undefined ? inst.programIdIndex : -1;
    const isParsed = 'parsed' in inst;
    
    // Handle program ID safely using the helper function
    let programIdStr = 'Unknown';
    if (programIdIndex >= 0 && programIdIndex < message.accountKeys.length) {
      programIdStr = getAccountKeyString(message.accountKeys[programIdIndex]);
    }
    
    // Handle accounts safely - could be array of numbers (indices) or already resolved
    let accountPubkeys: string[] = [];
    if (Array.isArray(inst.accounts)) {
      // Check if first element is a number (index)
      if (inst.accounts.length > 0 && typeof inst.accounts[0] === 'number') {
        // Convert account indices to pubkeys using the helper
        accountPubkeys = inst.accounts.map((idx: number) => {
          if (idx >= 0 && idx < message.accountKeys.length) {
            return getAccountKeyString(message.accountKeys[idx]);
          }
          return 'Unknown';
        });
      } else {
        // Accounts are already resolved, just convert to strings if needed using the helper
        accountPubkeys = inst.accounts.map((acc: any) => getAccountKeyString(acc));
      }
    }
    
    // Rest of the function remains the same
    if (isParsed) {
      const parsedInfo = inst.parsed;
      // Use SystemProgram.programId.toBase58() for comparison
      let programName = programIdStr === SystemProgram.programId.toBase58() ? 'system' : 'Unknown';
      
      // Add specific program name checks if needed, e.g., for your PROGRAM_ID
      if (programIdStr === PROGRAM_ID) {
         programName = 'SolanaVeil'; // Or your program's name
      }

      return {
        programId: programIdStr,
        program: programName,
        type: typeof parsedInfo === 'object' && parsedInfo?.type ? parsedInfo.type : 'Unknown',
        details: typeof parsedInfo === 'object' && parsedInfo?.info ? parsedInfo.info : parsedInfo || {},
        accounts: accountPubkeys,
        data: undefined
      };
    } else {
      // Not parsed (PartiallyDecodedInstruction)
      return {
        programId: programIdStr,
        program: 'Unknown', // Could try to resolve name based on ID if needed
        type: 'Unknown',
        details: {},
        accounts: accountPubkeys,
        data: inst.data
      };
    }
  });
};