import React, { useState, useEffect } from 'react';
import LoadingSpinner from './common/LoadingSpinner';

// Update TransactionStatus type to include 'error'
export type TransactionStatusType = 'pending' | 'confirming' | 'confirmed' | 'error' | 'failed';

interface TransactionStatusProps {
  txHash: string;
  status: TransactionStatusType;
  errorMessage?: string;
  progress?: number; // 0-100 progress percentage
  steps?: string[]; // Array of step descriptions for multi-step processes
  currentStep?: number; // Current step index
  estimatedTime?: number; // Estimated time in seconds
  onRetry?: () => void;
  onClose?: () => void;
}

const TransactionStatus: React.FC<TransactionStatusProps> = ({ 
  txHash, 
  status, 
  errorMessage,
  progress = 0,
  steps,
  currentStep = 0,
  estimatedTime,
  onRetry,
  onClose
}) => {
  const [remainingTime, setRemainingTime] = useState<number | null>(estimatedTime || null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Handle countdown timer for estimated time
  useEffect(() => {
    if (status === 'pending' || status === 'confirming') {
      if (estimatedTime && estimatedTime > 0) {
        setRemainingTime(estimatedTime);
        const interval = setInterval(() => {
          setRemainingTime(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        return () => clearInterval(interval);
      }
    } else {
      setRemainingTime(null);
    }
  }, [status, estimatedTime]);

  // Handle success animation
  useEffect(() => {
    if (status === 'confirmed') {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Get explorer URL based on environment
  const getExplorerUrl = () => {
    // Check if we're on devnet or mainnet (simplified)
    const isDevnet = window.location.hostname === 'localhost' || 
                    window.location.hostname.includes('dev');
    const cluster = isDevnet ? 'devnet' : 'mainnet-beta';
    
    return `https://explorer.solana.com/tx/${txHash}?cluster=${cluster}`;
  };

  // Format remaining time as mm:ss
  const formatRemainingTime = () => {
    if (remainingTime === null) return '';
    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className={`p-4 rounded-md transition-all duration-300 ${
      status === 'confirmed' ? 'bg-green-50 border border-green-200' :
      status === 'failed' ? 'bg-red-50 border border-red-200' : 
      status === 'confirming' ? 'bg-blue-50 border border-blue-200' :
      'bg-yellow-50 border border-yellow-200'
    } ${showSuccess ? 'scale-105 shadow-md' : ''}`}>
      <div className="flex items-start">
        {/* Status Icons */}
        <div className="mt-0.5">
          {(status === 'pending' || status === 'confirming') && 
            <LoadingSpinner size="sm" color={status === 'confirming' ? 'primary' : 'gray'} />
          }
          {status === 'confirmed' && (
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-green-500 ${showSuccess ? 'animate-pulse' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {showSuccess && (
                <div className="absolute -top-1 -right-1 h-2 w-2 bg-green-400 rounded-full animate-ping" />
              )}
            </div>
          )}
          {status === 'failed' && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        
        <div className="ml-3 flex-grow">
          {/* Status Title */}
          <div className="flex justify-between items-center">
            <h3 className={`text-sm font-medium ${
              status === 'confirmed' ? 'text-green-800' :
              status === 'failed' ? 'text-red-800' : 
              status === 'confirming' ? 'text-blue-800' :
              'text-yellow-800'
            }`}>
              {status === 'confirmed' && 'Transaction Successful!'}
              {status === 'pending' && 'Transaction Processing...'}
              {status === 'confirming' && 'Confirming Transaction...'}
              {status === 'failed' && 'Transaction Failed'}
            </h3>
            
            {/* Close button if provided */}
            {onClose && (
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          
          {/* Error Message */}
          {status === 'failed' && errorMessage && (
            <p className="text-red-700 text-sm mt-1">{errorMessage}</p>
          )}
          
          {/* Transaction Hash */}
          <div className="text-xs font-mono truncate mt-1">
            {txHash}
          </div>
          
          {/* Transaction Actions */}
          <div className="flex items-center mt-2">
            <a 
              href={getExplorerUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 inline-block mr-4"
            >
              View on Explorer
            </a>
            
            {status === 'failed' && onRetry && (
              <button
                onClick={onRetry}
                className="text-xs text-rose-600 hover:text-rose-800 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry
              </button>
            )}
          </div>
          
          {/* Progress Indicator for multi-step processes */}
          {(status === 'pending' || status === 'confirming') && progress > 0 && (
            <div className="mt-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-500">Progress</span>
                {remainingTime !== null && (
                  <span className="text-xs text-gray-500">
                    Estimated time: {formatRemainingTime()}
                  </span>
                )}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    status === 'confirming' ? 'bg-blue-500' : 'bg-yellow-500'
                  }`} 
                  style={{ width: `${progress}%` }} 
                />
              </div>
              
              {/* Steps display */}
              {steps && steps.length > 0 && (
                <div className="mt-2">
                  <ol className="text-xs">
                    {steps.map((step, index) => (
                      <li key={index} className={`flex items-center ${
                        index === currentStep ? 'text-blue-600 font-medium' : 
                        index < currentStep ? 'text-gray-500 line-through' : 'text-gray-400'
                      }`}>
                        {index === currentStep && (
                          <span className="mr-1">→</span>
                        )}
                        {index < currentStep && (
                          <svg className="w-3 h-3 mr-1 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {index > currentStep && (
                          <span className="w-3 mr-1"></span>
                        )}
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionStatus;