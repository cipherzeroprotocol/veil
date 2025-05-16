/**
 * Risk assessment module for regulatory compliance
 */

import { PublicKey } from '@solana/web3.js';
import { 
  ComplianceConfig, 
  DEFAULT_COMPLIANCE_CONFIG, 
  RiskAssessmentResult,
  RiskFactor 
} from './types';

/**
 * RiskAssessment class for evaluating address risk
 */
export class RiskAssessment {
  public config: ComplianceConfig;
  private cache: Map<string, { result: RiskAssessmentResult, timestamp: number }>;
  private fetchQueue: Map<string, Promise<RiskAssessmentResult>>;

  /**
   * Create a new risk assessment instance
   */
  constructor(config: ComplianceConfig) {
    this.config = {
      ...DEFAULT_COMPLIANCE_CONFIG,
      ...config
    } as ComplianceConfig;
    
    this.cache = new Map();
    this.fetchQueue = new Map();
    
    // Validate required configuration
    if (!this.config.apiKey) {
      throw new Error('Compliance API key is required');
    }
    
    if (!this.config.apiUrl) {
      throw new Error('Compliance API URL is required');
    }
  }

  /**
   * Assess the risk of an address
   */
  async assessAddress(address: PublicKey | string): Promise<RiskAssessmentResult> {
    const addressStr = typeof address === 'string' ? address : address.toBase58();
    
    // Check if we have a cached result that's not expired
    if (this.config.cacheResults) {
      const cached = this.cache.get(addressStr);
      if (cached && Date.now() - cached.timestamp < (this.config.cacheDuration || 3600000)) {
        this.logEvent('cache_hit', { address: addressStr });
        return cached.result;
      }
    }
    
    // Check if there's already a fetch in progress for this address
    if (this.fetchQueue.has(addressStr)) {
      this.logEvent('fetch_queue_hit', { address: addressStr });
      return this.fetchQueue.get(addressStr)!;
    }
    
    // Start a new fetch
    const fetchPromise = this.fetchRiskData(addressStr);
    this.fetchQueue.set(addressStr, fetchPromise);
    
    try {
      const result = await fetchPromise;
      
      // Cache the result
      if (this.config.cacheResults) {
        this.cache.set(addressStr, { 
          result, 
          timestamp: Date.now() 
        });
      }
      
      // Trigger high risk callback if configured
      if (result.score > this.config.maxRiskScore && this.config.onHighRiskDetected && result.highestRiskFactor) {
        await this.config.onHighRiskDetected(
          addressStr, 
          result.score, 
          result.highestRiskFactor.reason
        );
      }
      
      return result;
    } finally {
      // Remove from fetch queue regardless of success/failure
      this.fetchQueue.delete(addressStr);
    }
  }

  /**
   * Fetch risk data from API
   */
  private async fetchRiskData(address: string): Promise<RiskAssessmentResult> {
    this.logEvent('fetch_risk_data', { address });
    
    try {
      // Build query parameters
      const params = new URLSearchParams({
        address,
        includeAml: this.config.enableAmlChecks ? 'true' : 'false',
        includeSanctions: this.config.enableSanctionsChecks ? 'true' : 'false'
      });
      
      // Make API request
      const response = await fetch(`${this.config.apiUrl}/address/risk?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
      
      const apiResponse = await response.json();
      
      // Transform API response to our format
      const result: RiskAssessmentResult = {
        score: apiResponse.overallRisk || 0,
        categories: {
          aml: apiResponse.riskCategories?.aml || 0,
          sanctions: apiResponse.riskCategories?.sanctions || 0,
          fraud: apiResponse.riskCategories?.fraud || 0,
          highRisk: apiResponse.riskCategories?.highRisk || 0
        },
        addressInfo: {
          firstSeen: apiResponse.addressInfo?.firstSeen,
          cluster: apiResponse.addressInfo?.cluster,
          tags: apiResponse.addressInfo?.tags || []
        },
        timestamp: Date.now()
      };
      
      // Find the highest risk factor
      if (apiResponse.riskFactors && apiResponse.riskFactors.length > 0) {
        const highestFactor = apiResponse.riskFactors.reduce(
          (highest: any, current: any) => 
            current.score > highest.score ? current : highest,
          apiResponse.riskFactors[0]
        );
        
        result.highestRiskFactor = {
          category: highestFactor.category,
          score: highestFactor.score,
          reason: highestFactor.reason
        };
      }
      
      // Add transaction stats if available
      if (apiResponse.transactionStats) {
        result.transactionStats = {
          txCount: apiResponse.transactionStats.count || 0,
          totalVolume: apiResponse.transactionStats.volume || '0',
          distinctAddresses: apiResponse.transactionStats.distinctAddresses || 0,
          distinctTokens: apiResponse.transactionStats.distinctTokens || 0
        };
      }
      
      return result;
    } catch (error) {
      this.logEvent('risk_api_error', { address, error: error.message });
      
      // Return a safe default with high risk score on error
      return {
        score: 85, // High risk by default on errors
        categories: {
          aml: 0,
          sanctions: 0,
          fraud: 0,
          highRisk: 85
        },
        addressInfo: {
          tags: ['api_error']
        },
        highestRiskFactor: {
          category: 'api_error',
          score: 85,
          reason: 'Unable to assess risk: API error'
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Check if an address passes compliance checks
   */
  async checkCompliance(address: PublicKey | string): Promise<{
    passed: boolean;
    reason?: string;
    score: number;
  }> {
    const assessment = await this.assessAddress(address);
    const passed = assessment.score <= this.config.maxRiskScore;
    
    return {
      passed,
      reason: passed ? undefined : assessment.highestRiskFactor?.reason,
      score: assessment.score
    };
  }

  /**
   * Check if an address is sanctioned
   */
  async isSanctioned(address: PublicKey | string): Promise<boolean> {
    if (!this.config.enableSanctionsChecks) {
      return false;
    }
    
    const assessment = await this.assessAddress(address);
    return assessment.categories.sanctions > 80; // High sanctions score threshold
  }

  /**
   * Get detailed risk factors for an address
   */
  async getRiskFactors(address: PublicKey | string): Promise<RiskFactor[]> {
    const addressStr = typeof address === 'string' ? address : address.toBase58();
    
    try {
      const response = await fetch(`${this.config.apiUrl}/address/risk-factors?address=${addressStr}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error (${response.status})`);
      }
      
      const apiResponse = await response.json();
      
      // Transform API response to our format
      return (apiResponse.riskFactors || []).map((factor: any) => ({
        category: factor.category,
        score: factor.score,
        reason: factor.reason,
        evidence: factor.evidence
      }));
    } catch (error) {
      this.logEvent('risk_factors_api_error', { address: addressStr, error: error.message });
      return [];
    }
  }

  /**
   * Clear the risk assessment cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logEvent('cache_cleared', {});
  }

  /**
   * Log an event if logger is configured
   */
  private logEvent(event: string, data: any): void {
    if (this.config.logger) {
      this.config.logger(`risk_assessment:${event}`, data);
    }
  }
}