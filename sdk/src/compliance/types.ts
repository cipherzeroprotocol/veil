/**
 * Type definitions for the compliance module
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Configuration for the compliance module
 */
export interface ComplianceConfig {
  /**
   * Whether to check recipient addresses (default: true)
   */
  checkRecipient: boolean;
  
  /**
   * Maximum allowed risk score from 0-100 (default: 75)
   */
  maxRiskScore: number;
  
  /**
   * Enable AML (Anti-Money Laundering) checks (default: true)
   */
  enableAmlChecks: boolean;
  
  /**
   * Enable sanctions screening (default: true)
   */
  enableSanctionsChecks: boolean;
  
  /**
   * API key for compliance service (required)
   */
  apiKey: string;
  
  /**
   * Base URL for compliance API service
   */
  apiUrl: string;
  
  /**
   * Whether to cache risk scores (default: true)
   */
  cacheResults?: boolean;
  
  /**
   * Duration to cache results in milliseconds (default: 1 hour)
   */
  cacheDuration?: number;
  
  /**
   * Optional logging callback for compliance events
   */
  logger?: (event: string, data: any) => void;
  
  /**
   * Optional callback to run when high-risk addresses are detected
   */
  onHighRiskDetected?: (address: string, score: number, reason: string) => Promise<void>;
}

/**
 * Default compliance configuration
 */
export const DEFAULT_COMPLIANCE_CONFIG: Partial<ComplianceConfig> = {
  checkRecipient: true,
  maxRiskScore: 75,
  enableAmlChecks: true,
  enableSanctionsChecks: true,
  cacheResults: true,
  cacheDuration: 60 * 60 * 1000, // 1 hour
};

/**
 * Risk assessment result for an address
 */
export interface RiskAssessmentResult {
  /**
   * Overall risk score (0-100)
   */
  score: number;
  
  /**
   * Individual risk category scores
   */
  categories: {
    aml: number;
    sanctions: number;
    fraud: number;
    highRisk: number;
  };
  
  /**
   * Address information
   */
  addressInfo: {
    firstSeen?: number;
    cluster?: string;
    tags: string[];
  };
  
  /**
   * The highest risk factor that influenced the score
   */
  highestRiskFactor?: {
    category: string;
    score: number;
    reason: string;
  };
  
  /**
   * Transaction statistics
   */
  transactionStats?: {
    txCount: number;
    totalVolume: string;
    distinctAddresses: number;
    distinctTokens: number;
  };
  
  /**
   * When the assessment was performed
   */
  timestamp: number;
}

/**
 * Risk factor that contributes to an overall risk score
 */
export interface RiskFactor {
  /**
   * The risk category (e.g., "aml", "sanctions")
   */
  category: string;
  
  /**
   * The risk score contribution (0-100)
   */
  score: number;
  
  /**
   * Description of the risk factor
   */
  reason: string;
  
  /**
   * Evidence supporting the risk assessment
   */
  evidence?: any;
}

/**
 * Transaction monitoring entry
 */
export interface MonitoringEntry {
  /**
   * Transaction ID
   */
  txid: string;
  
  /**
   * Transaction type
   */
  type: 'deposit' | 'withdraw' | 'transfer';
  
  /**
   * Transaction amount
   */
  amount: string;
  
  /**
   * Token type
   */
  tokenType: string;
  
  /**
   * User address
   */
  userAddress: string;
  
  /**
   * Pool address
   */
  poolAddress: string;
  
  /**
   * Risk score of the address at transaction time
   */
  riskScore?: number;
  
  /**
   * Timestamp of the transaction
   */
  timestamp: number;
}

/**
 * Monitoring alert severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Monitoring alert
 */
export interface ComplianceAlert {
  /**
   * Alert ID
   */
  id: string;
  
  /**
   * Alert severity
   */
  severity: AlertSeverity;
  
  /**
   * Alert title
   */
  title: string;
  
  /**
   * Detailed description
   */
  description: string;
  
  /**
   * Addresses involved
   */
  addresses: string[];
  
  /**
   * Related transactions
   */
  transactions: string[];
  
  /**
   * When the alert was triggered
   */
  timestamp: number;
  
  /**
   * Alert status
   */
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
}