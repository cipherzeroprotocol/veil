/**
 * Transaction monitoring module for regulatory compliance
 */

import { 
    ComplianceConfig, 
    DEFAULT_COMPLIANCE_CONFIG,
    MonitoringEntry,
    ComplianceAlert,
    AlertSeverity
  } from './types';
  
  /**
   * TransactionMonitor class for tracking transactions for compliance purposes
   */
  export class TransactionMonitor {
    public config: ComplianceConfig;
    private pendingUploads: MonitoringEntry[] = [];
    private uploadTimer: NodeJS.Timeout | null = null;
    private alertsCache: ComplianceAlert[] = [];
    
    /**
     * Create a new transaction monitor
     */
    constructor(config: ComplianceConfig) {
      this.config = {
        ...DEFAULT_COMPLIANCE_CONFIG,
        ...config
      } as ComplianceConfig;
      
      // Validate required configuration
      if (!this.config.apiKey) {
        throw new Error('Compliance API key is required');
      }
      
      if (!this.config.apiUrl) {
        throw new Error('Compliance API URL is required');
      }
    }
  
    /**
     * Log a transaction to the monitoring system
     */
    async logTransaction(txid: string, data: {
      type: 'deposit' | 'withdraw' | 'transfer';
      amount: string;
      tokenType: string;
      userAddress: string;
      poolAddress: string;
      riskScore?: number;
    }): Promise<void> {
      // Create monitoring entry
      const entry: MonitoringEntry = {
        txid,
        type: data.type,
        amount: data.amount,
        tokenType: data.tokenType,
        userAddress: data.userAddress,
        poolAddress: data.poolAddress,
        riskScore: data.riskScore,
        timestamp: Date.now()
      };
      
      // Add to pending uploads
      this.pendingUploads.push(entry);
      this.logEvent('transaction_logged', { txid, type: data.type });
      
      // Schedule upload if not already scheduled
      this.scheduleUpload();
      
      // If this is a high-value transaction, upload immediately
      if (this.isHighValueTransaction(data.amount, data.tokenType)) {
        await this.uploadPendingTransactions();
      }
    }
  
    /**
     * Schedule an upload of pending transactions
     */
    private scheduleUpload(): void {
      if (this.uploadTimer !== null) {
        return; // Upload already scheduled
      }
      
      // Schedule upload in 30 seconds
      this.uploadTimer = setTimeout(() => {
        this.uploadPendingTransactions()
          .catch(error => this.logEvent('upload_error', { error: error.message }))
          .finally(() => {
            this.uploadTimer = null;
            
            // If there are still pending uploads, schedule another upload
            if (this.pendingUploads.length > 0) {
              this.scheduleUpload();
            }
          });
      }, 30000); // 30 seconds
    }
  
    /**
     * Upload pending transactions to compliance API
     */
    async uploadPendingTransactions(): Promise<void> {
      if (this.pendingUploads.length === 0) {
        return; // Nothing to upload
      }
      
      const transactions = [...this.pendingUploads];
      this.pendingUploads = []; // Clear pending uploads
      
      this.logEvent('uploading_transactions', { count: transactions.length });
      
      try {
        const response = await fetch(`${this.config.apiUrl}/transactions/batch`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            transactions
          })
        });
        
        if (!response.ok) {
          // If upload fails, add transactions back to pending uploads
          this.pendingUploads.push(...transactions);
          throw new Error(`API error (${response.status})`);
        }
        
        const result = await response.json();
        this.logEvent('transactions_uploaded', { 
          count: transactions.length,
          uploadId: result.uploadId 
        });
        
        // Check if any alerts were triggered
        if (result.alerts && result.alerts.length > 0) {
          this.handleAlerts(result.alerts);
        }
      } catch (error) {
        this.logEvent('upload_error', { 
          error: error.message,
          count: transactions.length 
        });
        
        // Keep transactions in the pending queue
        if (!this.pendingUploads.includes(transactions[0])) {
          this.pendingUploads.push(...transactions);
        }
        
        throw error;
      }
    }
  
    /**
     * Check if a transaction is high-value
     */
    private isHighValueTransaction(amount: string, tokenType: string): boolean {
      const numAmount = parseFloat(amount);
      
      if (isNaN(numAmount)) {
        return false;
      }
      
      // Thresholds for high-value transactions
      const thresholds: Record<string, number> = {
        'SOL': 100,     // 100 SOL
        'USDC': 10000,  // 10,000 USDC
        'USDT': 10000,  // 10,000 USDT
        'BTC': 0.5,     // 0.5 BTC
        'ETH': 10       // 10 ETH
      };
      
      const threshold = thresholds[tokenType] || 10000; // Default threshold
      
      return numAmount >= threshold;
    }
  
    /**
     * Handle alerts from the compliance API
     */
    private handleAlerts(apiAlerts: any[]): void {
      const alerts: ComplianceAlert[] = apiAlerts.map(alert => ({
        id: alert.id,
        severity: alert.severity as AlertSeverity,
        title: alert.title,
        description: alert.description,
        addresses: alert.addresses || [],
        transactions: alert.transactions || [],
        timestamp: alert.timestamp || Date.now(),
        status: alert.status || 'open'
      }));
      
      // Add alerts to cache
      this.alertsCache.push(...alerts);
      
      // Trim cache to last 100 alerts
      if (this.alertsCache.length > 100) {
        this.alertsCache = this.alertsCache.slice(-100);
      }
      
      // Log alert events
      alerts.forEach(alert => {
        this.logEvent('alert_triggered', {
          id: alert.id,
          severity: alert.severity,
          title: alert.title
        });
      });
    }
  
    /**
     * Get recent compliance alerts
     */
    async getAlerts(options?: {
      limit?: number;
      offset?: number;
      severity?: AlertSeverity[];
      status?: ('open' | 'acknowledged' | 'resolved' | 'false_positive')[];
    }): Promise<ComplianceAlert[]> {
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;
      
      try {
        // Build query parameters
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString()
        });
        
        if (options?.severity && options.severity.length > 0) {
          options.severity.forEach(sev => params.append('severity', sev));
        }
        
        if (options?.status && options.status.length > 0) {
          options.status.forEach(status => params.append('status', status));
        }
        
        const response = await fetch(`${this.config.apiUrl}/alerts?${params.toString()}`, {
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
        
        // Map API response to our format
        const alerts: ComplianceAlert[] = apiResponse.alerts.map((alert: any) => ({
          id: alert.id,
          severity: alert.severity as AlertSeverity,
          title: alert.title,
          description: alert.description,
          addresses: alert.addresses || [],
          transactions: alert.transactions || [],
          timestamp: alert.timestamp,
          status: alert.status
        }));
        
        // Update our cache with the latest alerts
        this.updateAlertsCache(alerts);
        
        return alerts;
      } catch (error) {
        this.logEvent('get_alerts_error', { error: error.message });
        
        // Fall back to cached alerts
        return this.getCachedAlerts(options);
      }
    }
  
    /**
     * Get alerts from cache
     */
    private getCachedAlerts(options?: {
      limit?: number;
      offset?: number;
      severity?: AlertSeverity[];
      status?: ('open' | 'acknowledged' | 'resolved' | 'false_positive')[];
    }): ComplianceAlert[] {
      let filtered = [...this.alertsCache];
      
      // Apply severity filter
      if (options?.severity && options.severity.length > 0) {
        filtered = filtered.filter(alert => 
          options.severity!.includes(alert.severity)
        );
      }
      
      // Apply status filter
      if (options?.status && options.status.length > 0) {
        filtered = filtered.filter(alert => 
          options.status!.includes(alert.status)
        );
      }
      
      // Sort by timestamp (newest first)
      filtered.sort((a, b) => b.timestamp - a.timestamp);
      
      // Apply pagination
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;
      
      return filtered.slice(offset, offset + limit);
    }
  
    /**
     * Update alerts cache with new alerts
     */
    private updateAlertsCache(alerts: ComplianceAlert[]): void {
      // Add new alerts to cache
      for (const alert of alerts) {
        const existingIndex = this.alertsCache.findIndex(a => a.id === alert.id);
        
        if (existingIndex >= 0) {
          // Update existing alert
          this.alertsCache[existingIndex] = alert;
        } else {
          // Add new alert
          this.alertsCache.push(alert);
        }
      }
      
      // Sort by timestamp (newest first)
      this.alertsCache.sort((a, b) => b.timestamp - a.timestamp);
      
      // Trim cache to last 100 alerts
      if (this.alertsCache.length > 100) {
        this.alertsCache = this.alertsCache.slice(0, 100);
      }
    }
  
    /**
     * Update an alert status
     */
    async updateAlertStatus(
      alertId: string, 
      status: 'acknowledged' | 'resolved' | 'false_positive',
      notes?: string
    ): Promise<boolean> {
      try {
        const response = await fetch(`${this.config.apiUrl}/alerts/${alertId}/status`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            status,
            notes
          })
        });
        
        if (!response.ok) {
          throw new Error(`API error (${response.status})`);
        }
        
        // Update local cache
        const alertIndex = this.alertsCache.findIndex(a => a.id === alertId);
        if (alertIndex >= 0) {
          this.alertsCache[alertIndex].status = status;
        }
        
        this.logEvent('alert_status_updated', { alertId, status });
        
        return true;
      } catch (error) {
        this.logEvent('update_alert_status_error', { 
          alertId, 
          status, 
          error: error.message 
        });
        return false;
      }
    }
  
    /**
     * Get transaction history for an address
     */
    async getAddressTransactions(
      address: string,
      options?: {
        limit?: number;
        offset?: number;
        startTime?: number;
        endTime?: number;
      }
    ): Promise<MonitoringEntry[]> {
      try {
        // Build query parameters
        const params = new URLSearchParams({
          address,
          limit: (options?.limit || 50).toString(),
          offset: (options?.offset || 0).toString()
        });
        
        if (options?.startTime) {
          params.append('startTime', options.startTime.toString());
        }
        
        if (options?.endTime) {
          params.append('endTime', options.endTime.toString());
        }
        
        const response = await fetch(`${this.config.apiUrl}/transactions/address?${params.toString()}`, {
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
        
        // Map API response to our format
        return apiResponse.transactions.map((tx: any) => ({
          txid: tx.txid,
          type: tx.type,
          amount: tx.amount,
          tokenType: tx.tokenType,
          userAddress: tx.userAddress,
          poolAddress: tx.poolAddress,
          riskScore: tx.riskScore,
          timestamp: tx.timestamp
        }));
      } catch (error) {
        this.logEvent('get_address_transactions_error', { 
          address, 
          error: error.message 
        });
        return [];
      }
    }
  
    /**
     * Log an event if logger is configured
     */
    private logEvent(event: string, data: any): void {
      if (this.config.logger) {
        this.config.logger(`transaction_monitor:${event}`, data);
      }
    }
  }