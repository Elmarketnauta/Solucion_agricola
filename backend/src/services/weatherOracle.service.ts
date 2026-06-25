// ============================================================================
// Yunta-Agro — Solución 2: Oráculo climático CENTRALIZADO (off-chain).
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Capa Precursora de un oráculo descentralizado (Chainlink). Mientras no haya
// acceso a LNET, este servicio Node.js cumple el mismo rol: consume una API
// meteorológica externa (SENAMHI/NOAA — aquí simulada de forma determinista) y
// persiste la lectura diaria en OracleWeatherDataCache. Esa tabla es la "fuente
// de verdad" inmutable que consumen los seguros paramétricos (Solución 4).
//
// Inmutabilidad simulada: cada lectura guarda un SHA-256 (payloadHash) del dato
// crudo. Reescribir el registro cambiaría el hash → manipulación detectable.
// El @@unique(stationKey, date) garantiza UN registro autoritativo por día.
//
// MIGRACIÓN A WEB3: cuando LNET entregue accesos, este servicio se convierte en
// el "feeder" que además ancla payloadHash on-chain; el contrato leerá el mismo
// dato. La interfaz (getWeatherForDate) no cambia: el consumidor (seguros) es
// agnóstico de si la verdad vive en Postgres o en la cadena.
// ============================================================================
import crypto from 'crypto';
import prisma from '../db';

export interface WeatherReading {
  stationKey: string;
  date: Date;
  tempMaxC: number;
  tempMinC: number;
  tempAvgC: number;
  precipitationMm: number;
  humidityPct: number;
}

// Estaciones de referencia del piloto (zonas agrícolas andinas/amazónicas).
const STATIONS = [
  'cusco-quispicanchi',
  'puno-azangaro',
  'cajamarca-celendin',
  'sanmartin-moyobamba',
  'junin-chanchamayo',
];

const PROVIDER_URL = process.env.WEATHER_API_URL ?? '';
const PROVIDER_KEY = process.env.WEATHER_API_KEY ?? '';
// Por defecto 'sim' (sin convenio). 'live' usa la API real (SENAMHI/NOAA/OpenWeather).
const MODE = process.env.WEATHER_ORACLE_MODE ?? 'sim';

export class WeatherOracleService {
  /** Estaciones que el oráculo refresca cada ciclo. */
  static stations(): string[] {
    return STATIONS;
  }

  /**
   * Refresca el caché para TODAS las estaciones para la fecha dada (default hoy).
   * Idempotente: si ya existe el registro (stationKey,date) lo actualiza (upsert).
   * Devuelve cuántas lecturas se persistieron.
   */
  static async refreshAll(forDate: Date = new Date()): Promise<number> {
    const day = startOfDay(forDate);
    let count = 0;
    for (const stationKey of STATIONS) {
      const reading = await this.fetchReading(stationKey, day);
      await this.persist(reading);
      count += 1;
    }
    return count;
  }

  /**
   * Lee del CACHÉ (fuente de verdad) el dato de una estación en una fecha.
   * Es lo que consume el motor de seguros — nunca llama a la API externa en
   * caliente, solo lee el dato ya validado y persistido por el cron.
   */
  static async getWeatherForDate(stationKey: string, date: Date) {
    return prisma.oracleWeatherDataCache.findUnique({
      where: { stationKey_date: { stationKey, date: startOfDay(date) } },
    });
  }

  /**
   * Última lectura cacheada de una estación (la más reciente). Si el caché está
   * vacío para esa estación, la refresca on-demand para hoy y la devuelve. Así el
   * panel siempre muestra un dato real del oráculo, nunca un placeholder.
   */
  static async latestForStation(stationKey: string) {
    const existing = await prisma.oracleWeatherDataCache.findFirst({
      where: { stationKey },
      orderBy: { date: 'desc' },
    });
    if (existing) return existing;
    // Refresco perezoso de la estación pedida (no de todas) para no bloquear.
    const reading = await this.fetchReading(stationKey, startOfDay(new Date()));
    await this.persist(reading);
    return prisma.oracleWeatherDataCache.findFirst({
      where: { stationKey }, orderBy: { date: 'desc' },
    });
  }

  // ── Obtención del dato (live vs simulado) ─────────────────────────────────
  private static async fetchReading(stationKey: string, day: Date): Promise<WeatherReading> {
    if (MODE === 'live' && PROVIDER_URL) {
      return this.fetchLive(stationKey, day);
    }
    return this.simulateReading(stationKey, day);
  }

  private static async fetchLive(stationKey: string, day: Date): Promise<WeatherReading> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = `${PROVIDER_URL}?station=${encodeURIComponent(stationKey)}&date=${day.toISOString().slice(0, 10)}`;
      const res = await fetch(url, {
        headers: PROVIDER_KEY ? { Authorization: `Bearer ${PROVIDER_KEY}` } : {},
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Proveedor meteo respondió ${res.status}`);
      const d: any = await res.json();
      return {
        stationKey,
        date: day,
        tempMaxC: Number(d.tempMax),
        tempMinC: Number(d.tempMin),
        tempAvgC: Number(d.tempAvg ?? (Number(d.tempMax) + Number(d.tempMin)) / 2),
        precipitationMm: Number(d.precipitation ?? 0),
        humidityPct: Number(d.humidity ?? 0),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Simulación DETERMINISTA: deriva el clima de (estación + día) con una semilla,
   * de modo que las pruebas y demos sean reproducibles. Inyecta de vez en cuando
   * eventos anómalos (ola de calor por El Niño, sequía) para ejercitar los seguros.
   */
  private static simulateReading(stationKey: string, day: Date): WeatherReading {
    const seed = hashToInt(`${stationKey}:${day.toISOString().slice(0, 10)}`);
    const base = 8 + (seed % 12); // 8–19 °C base andino
    const swing = 6 + (seed % 7);
    // ~1 de cada 12 días es anómalo (ola de calor): fuerza tempMax elevada.
    const heatwave = seed % 12 === 0;
    const tempMaxC = round1(heatwave ? 33 + (seed % 4) : base + swing);
    const tempMinC = round1(base - (seed % 4));
    const tempAvgC = round1((tempMaxC + tempMinC) / 2);
    // ~1 de cada 9 días es seco (sequía): precipitación cerca de 0.
    const drought = seed % 9 === 0;
    const precipitationMm = round1(drought ? seed % 2 : (seed % 25));
    const humidityPct = round1(40 + (seed % 50));
    return { stationKey, date: day, tempMaxC, tempMinC, tempAvgC, precipitationMm, humidityPct };
  }

  // ── Persistencia con hash de integridad (upsert idempotente) ──────────────
  private static async persist(r: WeatherReading) {
    const payloadHash = this.hashReading(r);
    await prisma.oracleWeatherDataCache.upsert({
      where: { stationKey_date: { stationKey: r.stationKey, date: r.date } },
      create: {
        stationKey: r.stationKey, date: r.date,
        tempMaxC: r.tempMaxC, tempMinC: r.tempMinC, tempAvgC: r.tempAvgC,
        precipitationMm: r.precipitationMm, humidityPct: r.humidityPct,
        source: MODE === 'live' ? 'SENAMHI_LIVE' : 'SENAMHI_SIM',
        payloadHash,
      },
      update: {
        tempMaxC: r.tempMaxC, tempMinC: r.tempMinC, tempAvgC: r.tempAvgC,
        precipitationMm: r.precipitationMm, humidityPct: r.humidityPct,
        payloadHash, fetchedAt: new Date(),
      },
    });
  }

  /** SHA-256 del dato canónico — "sello de integridad" del oráculo. */
  static hashReading(r: WeatherReading): string {
    const canonical = JSON.stringify({
      stationKey: r.stationKey,
      date: r.date.toISOString().slice(0, 10),
      tempMaxC: r.tempMaxC, tempMinC: r.tempMinC,
      precipitationMm: r.precipitationMm,
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function hashToInt(s: string): number {
  const h = crypto.createHash('sha256').update(s).digest();
  return h.readUInt32BE(0);
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
