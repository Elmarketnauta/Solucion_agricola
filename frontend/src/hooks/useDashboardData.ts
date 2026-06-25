// Developed by Marketnauta
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface DashboardData {
  ownerName: string;
  businessName: string;
  balance: number;
  creditLimit: number;
  alternativeScore: number;
  phoneNumber: string;
}

interface Transaction {
  id: number;
  senderPhone: string | null;
  receiverPhone: string | null;
  senderName: string | null;
  receiverName: string | null;
  amount: number;
  type: string;
  interoperableSource: string;
  status: string;
  createdAt: string;
}

interface UseDashboardDataReturn {
  data: DashboardData | null;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Module-level cache: survives hook unmount/remount in the same browser session.
// Cleared on logout (401 → window.location.href = '/login' reloads the module).
let _cache: { data: DashboardData | null; transactions: Transaction[] } = {
  data: null,
  transactions: [],
};

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise(res => setTimeout(res, 1000 * 2 ** i)); // 1s, 2s, 4s
      }
    }
  }
  throw lastErr;
}

export function useDashboardData(limit = 5): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData | null>(_cache.data);
  const [transactions, setTransactions] = useState<Transaction[]>(_cache.transactions);
  // Only show full skeleton on first load (no cache). Refreshes keep stale data visible.
  const [loading, setLoading] = useState(!_cache.data);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      if (!_cache.data) setLoading(true);
      setError(null);
      const [dash, txData] = await Promise.all([
        withRetry(() => api.getDashboard()),
        withRetry(() => api.getTransactions(1, limit)),
      ]);
      _cache = { data: dash, transactions: txData.transactions };
      setData(dash);
      setTransactions(txData.transactions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar datos';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refetch when the device recovers network connectivity.
  useEffect(() => {
    window.addEventListener('online', fetchData);
    return () => window.removeEventListener('online', fetchData);
  }, [fetchData]);

  return { data, transactions, loading, error, refetch: fetchData };
}
