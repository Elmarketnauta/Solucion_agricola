// Developed by Marketnauta
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

  // Yunta-Agro
  agroOnboard(dni: string) {
    return this.request<{ success: boolean; producerId: number; ppaVerified: boolean; hectares: number; region: string | null; mainCrop: string | null }>('/api/agro/onboard', {
      method: 'POST', body: JSON.stringify({ dni }),
    });
  }

  agroScore() {
    return this.request<any>('/api/agro/score', { method: 'POST' });
  }

  agroProfile() {
    return this.request<any>('/api/agro/profile');
  }

  // ── Yunta-Agro · Capa AgTech (telemetría IoT, oráculo, seguros, EUDR) ──────
  agroAlerts(campaignId: number) {
    return this.request<{ success: boolean; alerts: AgroAlert[] }>(`/api/agro/telemetry/${campaignId}/alerts`);
  }

  agroSeries(campaignId: number) {
    return this.request<{ success: boolean; series: TelemetrySeries; oracle: OracleReading | null }>(
      `/api/agro/telemetry/${campaignId}/series`);
  }

  // Verificación pública del pasaporte EUDR (sin auth en backend, pero el cliente
  // usa la misma ruta). Devuelve null-safe vía 404 manejado por el caller.
  certificationVerify(certUuid: string) {
    return this.request<{ success: boolean; passport: EudrPassport }>(`/api/agro/certification/${certUuid}`);
  }

  // Emisión del pasaporte EUDR al cierre de cosecha.
  certificationIssue(data: { campaignId: number; buyerRuc: string; taxYear: number }) {
    return this.request<{ success: boolean; certUuid: string; vcHash: string; verifyUrl: string; alreadyIssued: boolean }>(
      '/api/agro/certification/issue', { method: 'POST', body: JSON.stringify(data) });
  }
}

// ── Tipos AgTech (espejo de los payloads del backend) ───────────────────────
export interface AgroAlert {
  id: number; campaignId: number; type: string; severity: string;
  message: string; metricValue: number | null; threshold: number | null;
  acknowledged: boolean; createdAt: string;
}
export interface TelemetryPoint {
  t: string; soilMoisturePct: number | null; airTempC: number | null;
  soilTempC: number | null; humidityPct: number | null; batteryPct: number | null;
}
export interface SeriesStat { min: number | null; max: number | null; avg: number | null; last: number | null; }
export interface TelemetrySeries {
  campaignId: number; count: number; latest: TelemetryPoint | null;
  stats: { soilMoisture: SeriesStat; airTemp: SeriesStat; humidity: SeriesStat };
  points: TelemetryPoint[];
}
export interface OracleReading {
  stationKey: string; date: string; tempMaxC: number; tempMinC: number; tempAvgC: number;
  precipitationMm: number; humidityPct: number | null; payloadHash: string; source: string;
}
export interface EudrPassport {
  certUuid: string; vcHash: string; integrity: 'valid' | 'tampered' | 'unknown';
  anchoredOnChain: boolean; chainTxHash: string | null;
  product: string | null; productKg: number; region: string | null;
  gps: { lat: number; lng: number } | null; ppaCode: string | null;
  buyerRuc: string; taxYear: number; issuedAt: string; status: string;
}

export const api = new ApiClient();
