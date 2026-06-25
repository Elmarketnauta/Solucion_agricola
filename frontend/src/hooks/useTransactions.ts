// Developed by Marketnauta
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

export interface Transaction {
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

interface UseTransactionsReturn {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

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

export function useTransactions(initialLimit = 20): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Track whether a fetch is in flight to prevent concurrent loadMore calls.
  const fetching = useRef(false);

  const fetchTransactions = useCallback(async (pageNum = 1, isLoadMore = false) => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      if (!isLoadMore) setLoading(true);
      setError(null);
      const data = await withRetry(() => api.getTransactions(pageNum, initialLimit));

      setTransactions(prev => isLoadMore ? [...prev, ...data.transactions] : data.transactions);
      setPage(pageNum);
      setTotalPages(data.totalPages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar transacciones';
      setError(msg);
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  }, [initialLimit]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Auto-refetch when network is restored.
  useEffect(() => {
    const onOnline = () => fetchTransactions(1, false);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [fetchTransactions]);

  const loadMore = useCallback(async () => {
    if (page < totalPages) await fetchTransactions(page + 1, true);
  }, [fetchTransactions, page, totalPages]);

  return {
    transactions,
    loading,
    error,
    page,
    totalPages,
    loadMore,
    refetch: useCallback(() => fetchTransactions(1, false), [fetchTransactions]),
  };
}
