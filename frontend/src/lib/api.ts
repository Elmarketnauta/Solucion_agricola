const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include', // browser sends httpOnly cookie automatically
        signal: controller.signal,
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // Soft logout: let AuthContext react via event instead of hard redirect,
          // preserving React state and avoiding SPA breakage.
          window.dispatchEvent(new CustomEvent('yunta:unauthorized'));
        }
        throw new Error(data.error || 'Error del servidor');
      }
      return data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('La red tardó demasiado. Verifica tu conexión.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Auth
  register(data: { businessName: string; ownerName: string; phoneNumber: string; pin: string }) {
    return this.request<{ success: boolean; merchant: any }>('/api/auth/register', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  login(data: { phoneNumber: string; pin: string }) {
    return this.request<{ success: boolean; merchant: any }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  logout() {
    return this.request<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
  }

  // Dashboard
  getDashboard() {
    return this.request<{ ownerName: string; businessName: string; phoneNumber: string; balance: number; creditLimit: number; alternativeScore: number; status: string }>('/api/merchant/dashboard');
  }

  // Transactions
  getTransactions(page = 1, limit = 20) {
    return this.request<{ transactions: any[]; total: number; page: number; totalPages: number }>(`/api/merchant/transactions?page=${page}&limit=${limit}`);
  }

  // Transfer
  validateRecipient(phoneNumber: string) {
    return this.request<{ exists: boolean; businessName: string; ownerName: string }>('/api/transfer/validate', {
      method: 'POST', body: JSON.stringify({ phoneNumber }),
    });
  }

  transfer(data: { receiverPhone: string; amount: number; pin: string }, idempotencyKey: string) {
    return this.request<{ success: boolean; txId: number; amount: number; receiverPhone: string; newBalance: number; timestamp: string }>('/api/transfer', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
