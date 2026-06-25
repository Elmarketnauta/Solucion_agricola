// ============================================================================
// Yunta-Agro — MidagriService: KYC sin fricción vía Padrón de Productores
// Agrarios (PPA) del MIDAGRI.
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// En vez de pedir documentos y verificarlos a mano, consultamos el PPA por DNI:
// estar en el padrón = identidad + tenencia de tierra verificada en una sola
// llamada. Resuelve el cuello de botella regulatorio (KYC) del onboarding rural.
//
// La API real del PPA requiere convenio institucional con MIDAGRI. Mientras no
// esté disponible, este adaptador corre en modo STUB determinista (conmutable
// por env var), de modo que el resto del sistema se desarrolla y prueba contra
// un contrato estable. Patrón idéntico al de cualquier integración externa que
// aún no tiene credenciales (igual que el webhook BCRP del MVP, que hoy se
// simula con HMAC local).
// ============================================================================

export interface PadronResult {
  exists: boolean;       // true si el DNI aparece en el PPA
  ppaCode?: string;      // código de productor en el padrón
  fullName?: string;     // nombre del titular (se usa para conciliar, no se persiste on-chain)
  hectares?: number;     // tenencia verificada — proxy de capacidad productiva
  region?: string;       // departamento/provincia
  mainCrop?: string;     // cultivo principal declarado
}

// Endpoint real (placeholder hasta el convenio). En producción saldría de env.
const PPA_API_URL = process.env.MIDAGRI_PPA_API_URL ?? 'https://api.midagri.gob.pe/ppa/v1';
const PPA_API_KEY = process.env.MIDAGRI_PPA_API_KEY ?? '';
// Por defecto STUB hasta tener convenio. Poner MIDAGRI_PPA_MODE=live para usar la API real.
const MODE = process.env.MIDAGRI_PPA_MODE ?? 'stub';

export class MidagriService {
  /**
   * Consulta el PPA por DNI. Devuelve siempre un PadronResult (nunca lanza por
   * "no encontrado": un DNI ausente es un resultado válido `{ exists: false }`,
   * no un error). Solo lanza ante fallo de red/credenciales en modo live.
   */
  static async lookupPadron(dni: string): Promise<PadronResult> {
    if (!/^\d{8}$/.test(dni)) {
      throw new Error('DNI inválido: debe tener 8 dígitos');
    }

    if (MODE === 'live') {
      return this.lookupLive(dni);
    }
    return this.lookupStub(dni);
  }

  // ── Modo producción (requiere convenio MIDAGRI) ───────────────────────────
  private static async lookupLive(dni: string): Promise<PadronResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(`${PPA_API_URL}/productores/${dni}`, {
        headers: { Authorization: `Bearer ${PPA_API_KEY}` },
        signal: controller.signal,
      });

      if (res.status === 404) return { exists: false };
      if (!res.ok) throw new Error(`PPA respondió ${res.status}`);

      const data = await res.json();
      return {
        exists: true,
        ppaCode: data.codigoProductor,
        fullName: data.nombreCompleto,
        hectares: Number(data.hectareas ?? 0),
        region: data.departamento,
        mainCrop: data.cultivoPrincipal,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('El PPA tardó demasiado en responder');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Modo STUB determinista (desarrollo sin convenio) ──────────────────────
  // Deriva un resultado estable del DNI para que las pruebas sean reproducibles:
  // ~75% de los DNIs "existen" en el padrón; los terminados en 0/1 no, simulando
  // productores aún no registrados (que deberán formalizarse).
  private static async lookupStub(dni: string): Promise<PadronResult> {
    const lastDigit = Number(dni[7]);
    if (lastDigit <= 1) {
      return { exists: false };
    }

    // Hectáreas pseudo-aleatorias pero deterministas: 0.5–8 ha (minifundio).
    const seed = Number(dni.slice(-4));
    const hectares = Math.round(((seed % 76) / 10 + 0.5) * 10) / 10;
    const regions = ['Cusco', 'Puno', 'Cajamarca', 'San Martín', 'Junín', 'Ayacucho'];
    const crops = ['Papa', 'Café', 'Quinua', 'Cacao', 'Maíz amiláceo', 'Palta'];

    return {
      exists: true,
      ppaCode: `PPA-${dni.slice(-6)}`,
      fullName: `Productor ${dni.slice(-4)}`,
      hectares,
      region: regions[seed % regions.length],
      mainCrop: crops[seed % crops.length],
    };
  }
}
