// Developed by Marketnauta
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface UseBalanceReturn {
  balance: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useBalance(): UseBalanceReturn {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getDashboard();
      setBalance(data.balance);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar balance';
      setError(errorMessage);
      console.error('useBalance error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  return {
    balance,
    loading,
    error,
    refetch: fetchBalance
  };
}
