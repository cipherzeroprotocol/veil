/**
 * Compliance module for SolanaVeil
 * 
 * This module provides risk assessment and transaction monitoring tools
 * to help meet regulatory compliance requirements.
 */

export * from './risk';
export * from './monitoring';
export * from './types';

import { RiskAssessment } from './risk';
import { TransactionMonitor } from './monitoring';
import { ComplianceConfig } from './types';
import { PublicKey } from '@solana/web3.js';

/**
 * ComplianceModule combines risk assessment and transaction monitoring
 * for comprehensive compliance management.
 */
export class ComplianceModule {
  public risk: RiskAssessment;
  public monitoring: TransactionMonitor;
  
  /**
   * Create a new compliance module with the specified configuration
   */
  constructor(config: ComplianceConfig) {
    this.risk = new RiskAssessment(config);
    this.monitoring = new TransactionMonitor(config);
  }
  
  /**
   * Quick way to check if an address passes compliance checks
   */
  async checkAddress(address: PublicKey): Promise<{
    passed: boolean;
    reason?: string;
    score?: number;
  }> {
    const assessment = await this.risk.assessAddress(address);
    const passed = assessment.score <= this.risk.config.maxRiskScore;
    
    return {
      passed,
      reason: passed ? undefined : assessment.highestRiskFactor?.reason,
      score: assessment.score
    };
  }
  
  /**
   * Log a compliant transaction to the monitoring system
   */
  async logTransaction(txid: string, data: {
    type: 'deposit' | 'withdraw';
    amount: string;
    tokenType: string;
    userAddress: string;
    poolAddress: string;
  }): Promise<void> {
    await this.monitoring.logTransaction(txid, data);
  }
}

// Re-export main components
export { RiskAssessment } from './risk';
export { TransactionMonitor } from './monitoring';
export * from './types';