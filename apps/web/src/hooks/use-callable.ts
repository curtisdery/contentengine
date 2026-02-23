'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { callFunction, ApiClientError } from '@/lib/cloud-functions';

interface UseCallableOptions {
  enabled?: boolean;
  delayMs?: number;
}

interface UseCallableResult<T> {
  data: T | null;
  isLoading: boolean;
  error: ApiClientError | null;
  refetch: () => void;
}

export function useCallable<TInput, TOutput>(
  functionName: string,
  input?: TInput,
  options: UseCallableOptions = {},
): UseCallableResult<TOutput> {
  const { enabled = true, delayMs = 0 } = options;
  const [data, setData] = useState<TOutput | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<ApiClientError | null>(null);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    const id = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (!mountedRef.current || id !== fetchIdRef.current) return;

    try {
      const result = await callFunction<TInput, TOutput>(functionName, input);
      if (mountedRef.current && id === fetchIdRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current && id === fetchIdRef.current) {
        setError(err instanceof ApiClientError ? err : new ApiClientError(500, String(err)));
      }
    } finally {
      if (mountedRef.current && id === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionName, JSON.stringify(input), enabled, delayMs]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
