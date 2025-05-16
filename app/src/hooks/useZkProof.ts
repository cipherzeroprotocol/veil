import { useState, useRef, useCallback, useEffect } from 'react';
import { CircuitManager, WithdrawCircuitInput, ProofOutput } from '../services/circuitManager';

interface UseZkProofOptions {
  wasmPath: string;
  zkeyPath: string;
  verificationKeyPath: string;
  enableCaching?: boolean;
}

interface ProofStatus {
  stage: 'idle' | 'setup' | 'constraints' | 'witness' | 'proving' | 'verifying' | 'complete' | 'error';
  progress: number;
  detail: string;
}

/**
 * Hook for managing ZK proof operations with enhanced features
 */
export function useZkProof(options: UseZkProofOptions) {
  // States for managing proof generation progress and results
  const [status, setStatus] = useState<ProofStatus>({
    stage: 'idle',
    progress: 0,
    detail: 'Ready'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  
  // References for caching and abort control
  const proofCache = useRef<Map<string, ProofOutput>>(new Map());
  const abortController = useRef<AbortController | null>(null);
  
  // Initialize the circuit manager
  const circuitManager = useRef<CircuitManager>(new CircuitManager());
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Abort any ongoing proof generation if component unmounts
      abortProofGeneration();
    };
  }, []);
  
  // Calculate estimated time based on device performance
  useEffect(() => {
    // Simple benchmark to estimate proof generation time
    const runBenchmark = async () => {
      // Start with a baseline estimate
      let baselineEstimate = 45; // 45 seconds as default estimate
      
      try {
        // Measure time to perform a simple calculation that correlates with ZK proof speed
        const startTime = performance.now();
        
        // Do some sample calculations to gauge device performance
        // (Similar operations to what ZK proofs do but much simpler)
        let result = 0;
        for (let i = 0; i < 1000000; i++) {
          result += Math.pow(i % 100, 2) % 13;
        }
        
        const duration = (performance.now() - startTime) / 1000; // in seconds
        
        // Adjust estimate based on benchmark performance
        // Faster devices will have shorter duration
        const performanceFactor = duration / 0.2; // 0.2s is a reference point
        
        // Adjust baseline estimate based on performance factor
        // Higher performance factor means slower device, so increase time estimate
        baselineEstimate = Math.max(15, Math.min(120, baselineEstimate * performanceFactor));
        
        console.log(`Performance benchmark: ${duration.toFixed(2)}s, Estimated proof time: ${baselineEstimate.toFixed(0)}s`);
        
        setEstimatedTime(Math.round(baselineEstimate));
      } catch (err) {
        console.warn("Failed to run performance benchmark, using default estimate");
        setEstimatedTime(baselineEstimate);
      }
    };
    
    runBenchmark();
  }, []);
  
  /**
   * Calculate a cache key for a given input
   */
  const calculateCacheKey = (input: WithdrawCircuitInput): string => {
    try {
      // Create a deterministic string representation of input for caching
      const keyParts = [
        input.nullifier.join(','),
        input.secret.join(','),
        input.pathIndices.join(','),
        input.root.join(','),
        input.recipient.join(','),
        input.relayer.join(','),
        input.fee.toString()
      ];
      
      return keyParts.join('|');
    } catch (err) {
      console.warn('Failed to generate cache key:', err);
      // Return a timestamp as fallback to avoid errors (but won't enable caching)
      return Date.now().toString();
    }
  };
  
  /**
   * Abort any ongoing proof generation
   */
  const abortProofGeneration = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
      setLoading(false);
      setStatus(prev => ({
        ...prev,
        stage: 'idle',
        detail: 'Proof generation aborted'
      }));
    }
  }, []);
  
  /**
   * Generate a proof for a given circuit input
   */
  const generateProof = useCallback(async (
    input: WithdrawCircuitInput, 
    skipCache = false
  ): Promise<ProofOutput | null> => {
    try {
      // Reset state
      setLoading(true);
      setError(null);
      setStatus({
        stage: 'setup',
        progress: 0,
        detail: 'Setting up proof generation...'
      });
      
      // Check cache if enabled and not explicitly skipped
      const cacheKey = calculateCacheKey(input);
      if (options.enableCaching && !skipCache && proofCache.current.has(cacheKey)) {
        const cachedProof = proofCache.current.get(cacheKey);
        console.log('Using cached proof');
        
        setStatus({
          stage: 'complete',
          progress: 100,
          detail: 'Loaded proof from cache'
        });
        
        setLoading(false);
        return cachedProof!;
      }
      
      // Create new abort controller
      abortController.current = new AbortController();
      
      // Setup detailed progress tracking
      const onProgress = (stageProgress: number, stage?: string) => {
        let currentStage: ProofStatus['stage'] = 'proving';
        let detail = 'Generating proof...';
        
        // Parse stage information if provided
        if (stage) {
          if (stage.includes('constraint')) {
            currentStage = 'constraints';
            detail = 'Building constraint system...';
          } else if (stage.includes('witness')) {
            currentStage = 'witness';
            detail = 'Generating witness...';
          } else if (stage.includes('setup')) {
            currentStage = 'setup';
            detail = 'Setting up prover...';
          } else if (stage.includes('proof')) {
            currentStage = 'proving';
            detail = 'Generating proof...';
          }
        }
        
        setStatus({
          stage: currentStage,
          progress: Math.floor(stageProgress * 100),
          detail
        });
      };
      
      // Generate the proof with abort signal
      const proof = await circuitManager.current.generateProof(
        input,
        options.wasmPath,
        options.zkeyPath,
        onProgress,
        abortController.current.signal
      );
      
      // Cache the proof if caching is enabled
      if (options.enableCaching && proof) {
        proofCache.current.set(cacheKey, proof);
      }
      
      setStatus({
        stage: 'complete',
        progress: 100,
        detail: 'Proof generated successfully'
      });
      
      setLoading(false);
      return proof;
    } catch (err: any) {
      // Don't treat aborted proofs as errors
      if (err.name === 'AbortError') {
        console.log('Proof generation was aborted');
        setLoading(false);
        return null;
      }
      
      console.error('Error generating proof:', err);
      setError(err.message || 'Failed to generate proof');
      setStatus({
        stage: 'error',
        progress: 0,
        detail: `Error: ${err.message || 'Unknown error'}`
      });
      setLoading(false);
      return null;
    } finally {
      // Clear abort controller reference
      abortController.current = null;
    }
  }, [options.wasmPath, options.zkeyPath, options.enableCaching]);
  
  /**
   * Verify a proof against public signals
   */
  const verifyProof = useCallback(async (
    proof: any, 
    publicSignals: string[]
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      setStatus({
        stage: 'verifying',
        progress: 50,
        detail: 'Verifying proof...'
      });
      
      // Verify the proof
      const isValid = await circuitManager.current.verifyProof(
        proof,
        publicSignals,
        options.verificationKeyPath
      );
      
      setStatus({
        stage: isValid ? 'complete' : 'error',
        progress: 100,
        detail: isValid ? 'Proof verified successfully' : 'Proof verification failed'
      });
      
      if (!isValid) {
        setError('Proof verification failed');
      }
      
      setLoading(false);
      return isValid;
    } catch (err: any) {
      console.error('Error verifying proof:', err);
      setError(err.message || 'Failed to verify proof');
      setStatus({
        stage: 'error',
        progress: 0,
        detail: `Error verifying proof: ${err.message || 'Unknown error'}`
      });
      setLoading(false);
      return false;
    }
  }, [options.verificationKeyPath]);
  
  /**
   * Clear the proof cache
   */
  const clearCache = useCallback(() => {
    proofCache.current.clear();
    console.log('Proof cache cleared');
  }, []);
  
  /**
   * Reset the state of the hook
   */
  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setStatus({
      stage: 'idle',
      progress: 0,
      detail: 'Ready'
    });
    // Do not clear the cache by default - only when explicitly requested
  }, []);
  
  return {
    // Core functionality
    generateProof,
    verifyProof,
    
    // Control functions
    abortProofGeneration,
    clearCache,
    reset,
    
    // Status information
    loading,
    error,
    status,
    progress: status.progress,
    stage: status.stage,
    detail: status.detail,
    isGenerating: loading && ['setup', 'constraints', 'witness', 'proving'].includes(status.stage),
    isVerifying: loading && status.stage === 'verifying',
    isComplete: status.stage === 'complete',
    hasError: status.stage === 'error' || !!error,
    estimatedTime // Now included in the return type
  };
}