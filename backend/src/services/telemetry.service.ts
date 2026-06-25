// ============================================================================
// Yunta-Agro — Solución 1: Ingesta de telemetría IoT + evaluación de umbrales.
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Recibe ráfagas M2M (humedad de suelo, temperatura) de sensores en campo,
// las persiste ligadas a una AgroCampaign, y evalúa umbrales agronómicos para
// generar alertas (estrés hídrico/térmico, heladas) que el dashboard mostrará.
//
// Diseñado para ráfagas: acepta un array de lecturas y usa createMany (una sola
// escritura) para soportar nodos que acumulan y sincronizan en lote.
// ============================================================================
import prisma from '../db';

// Umbrales agronómicos (configurables por env; valores por defecto de cultivo andino).
const SOIL_MOISTURE_CRITICAL = Number(process.env.SOIL_MOISTURE_CRITICAL ?? 12); // % vol → estrés hídrico severo
const SOIL_MOISTURE_WARN = Number(process.env.SOIL_MOISTURE_WARN ?? 18);         // % vol → alerta temprana
const AIR_TEMP_HEAT = Number(process.env.AIR_TEMP_HEAT ?? 32);                   // °C → estrés térmico
const AIR_TEMP_FROST = Number(process.env.AIR_TEMP_FROST ?? 2);                  // °C → riesgo de helada
const BATTERY_LOW = Number(process.env.SENSOR_BATTERY_LOW ?? 15);               // % → nodo por caerse

export interface TelemetryReading {
  deviceId: string;
  soilMoisturePct?: number;
  soilTempC?: number;
  airTempC?: number;
  humidityPct?: number;
  batteryPct?: number;
  recordedAt?: string; // ISO; si falta, se usa la hora de ingesta
}

export interface IngestResult {
  ingested: number;
  alerts: { type: string; severity: string; message: string }[];
}

export class TelemetryService {
  /**
   * Ingesta una ráfaga de lecturas para una campaña. Persiste todo en una sola
   * escritura y evalúa umbrales sobre el agregado para no spamear alertas.
   */
  static async ingestBurst(campaignId: number, readings: TelemetryReading[]): Promise<IngestResult> {
    if (!Array.isArray(readings) || readings.length === 0) {
      throw new Error('Se esperaba un arreglo de lecturas no vacío');
    }

    // Verifica que la campaña exista (FK + mensaje claro al integrador IoT).
    const campaign = await prisma.agroCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaña no encontrada');

    const now = new Date();
    await prisma.ioTSensorTelemetry.createMany({
      data: readings.map(r => ({
        campaignId,
        deviceId: r.deviceId,
        soilMoisturePct: numOrNull(r.soilMoisturePct),
        soilTempC: numOrNull(r.soilTempC),
        airTempC: numOrNull(r.airTempC),
        humidityPct: numOrNull(r.humidityPct),
        batteryPct: numOrNull(r.batteryPct),
        recordedAt: r.recordedAt ? new Date(r.recordedAt) : now,
      })),
    });

    const alerts = await this.evaluateThresholds(campaignId, readings);
    return { ingested: readings.length, alerts };
  }

  /**
   * Evalúa la ráfaga contra los umbrales agronómicos y crea alertas. Usa el
   * valor más crítico de la ráfaga por métrica (peor caso) para decidir.
   */
  private static async evaluateThresholds(campaignId: number, readings: TelemetryReading[]) {
    const minSoil = min(readings.map(r => r.soilMoisturePct));
    const maxAir = max(readings.map(r => r.airTempC));
    const minAir = min(readings.map(r => r.airTempC));
    const minBattery = min(readings.map(r => r.batteryPct));

    const created: { type: string; severity: string; message: string }[] = [];

    // Estrés hídrico (humedad de suelo baja).
    if (minSoil != null && minSoil <= SOIL_MOISTURE_CRITICAL) {
      created.push(await this.raise(campaignId, 'WaterStress', 'Critical',
        `Humedad de suelo crítica: ${minSoil}% (umbral ${SOIL_MOISTURE_CRITICAL}%). Riego urgente.`,
        minSoil, SOIL_MOISTURE_CRITICAL));
    } else if (minSoil != null && minSoil <= SOIL_MOISTURE_WARN) {
      created.push(await this.raise(campaignId, 'WaterStress', 'Warning',
        `Humedad de suelo baja: ${minSoil}% (umbral ${SOIL_MOISTURE_WARN}%). Programar riego.`,
        minSoil, SOIL_MOISTURE_WARN));
    }

    // Estrés térmico (calor).
    if (maxAir != null && maxAir >= AIR_TEMP_HEAT) {
      created.push(await this.raise(campaignId, 'HeatStress', 'Warning',
        `Temperatura ambiente elevada: ${maxAir}°C (umbral ${AIR_TEMP_HEAT}°C).`,
        maxAir, AIR_TEMP_HEAT));
    }

    // Riesgo de helada (frío).
    if (minAir != null && minAir <= AIR_TEMP_FROST) {
      created.push(await this.raise(campaignId, 'FrostRisk', 'Critical',
        `Riesgo de helada: ${minAir}°C (umbral ${AIR_TEMP_FROST}°C).`,
        minAir, AIR_TEMP_FROST));
    }

    // Salud del nodo IoT.
    if (minBattery != null && minBattery <= BATTERY_LOW) {
      created.push(await this.raise(campaignId, 'DeviceOffline', 'Info',
        `Batería del sensor baja: ${minBattery}%. Revisar nodo en campo.`,
        minBattery, BATTERY_LOW));
    }

    return created;
  }

  /** Crea una alerta, evitando duplicar la misma alerta no reconocida del día. */
  private static async raise(
    campaignId: number, type: string, severity: string,
    message: string, metricValue: number, threshold: number,
  ) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const existing = await prisma.agroAlert.findFirst({
      where: { campaignId, type, acknowledged: false, createdAt: { gte: since } },
    });
    if (!existing) {
      await prisma.agroAlert.create({
        data: { campaignId, type, severity, message, metricValue, threshold },
      });
    }
    return { type, severity, message };
  }

  /** Alertas activas (no reconocidas) de una campaña, para el dashboard. */
  static async activeAlerts(campaignId: number) {
    return prisma.agroAlert.findMany({
      where: { campaignId, acknowledged: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Serie temporal de telemetría para graficar tendencias (sparklines) + la
   * última lectura y estadísticos agregados. `limit` controla cuántos puntos
   * (los más recientes), devueltos en orden cronológico ascendente para el gráfico.
   */
  static async getSeries(campaignId: number, limit = 48): Promise<TelemetrySeries> {
    const rows = await prisma.ioTSensorTelemetry.findMany({
      where: { campaignId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    // De más reciente a más antiguo → invertimos para el eje X cronológico.
    const points = rows.reverse().map(r => ({
      t: r.recordedAt.toISOString(),
      soilMoisturePct: r.soilMoisturePct,
      airTempC: r.airTempC,
      soilTempC: r.soilTempC,
      humidityPct: r.humidityPct,
      batteryPct: r.batteryPct,
    }));
    const latest = points.length ? points[points.length - 1] : null;
    return {
      campaignId,
      count: points.length,
      latest,
      stats: {
        soilMoisture: seriesStats(points.map(p => p.soilMoisturePct)),
        airTemp: seriesStats(points.map(p => p.airTempC)),
        humidity: seriesStats(points.map(p => p.humidityPct)),
      },
      points,
    };
  }
}

export interface TelemetryPoint {
  t: string;
  soilMoisturePct: number | null;
  airTempC: number | null;
  soilTempC: number | null;
  humidityPct: number | null;
  batteryPct: number | null;
}
export interface SeriesStat { min: number | null; max: number | null; avg: number | null; last: number | null; }
export interface TelemetrySeries {
  campaignId: number;
  count: number;
  latest: TelemetryPoint | null;
  stats: { soilMoisture: SeriesStat; airTemp: SeriesStat; humidity: SeriesStat };
  points: TelemetryPoint[];
}

/** Estadísticos (min/max/avg/last) de una serie, ignorando nulos. */
function seriesStats(arr: (number | null)[]): SeriesStat {
  const v = arr.filter((x): x is number => typeof x === 'number');
  if (!v.length) return { min: null, max: null, avg: null, last: null };
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  return {
    min: Math.round(Math.min(...v) * 10) / 10,
    max: Math.round(Math.max(...v) * 10) / 10,
    avg: Math.round(avg * 10) / 10,
    last: arr.filter(x => x != null).slice(-1)[0] ?? null,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────
function numOrNull(n: number | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function min(arr: (number | undefined)[]): number | null {
  const v = arr.filter((x): x is number => typeof x === 'number');
  return v.length ? Math.min(...v) : null;
}
function max(arr: (number | undefined)[]): number | null {
  const v = arr.filter((x): x is number => typeof x === 'number');
  return v.length ? Math.max(...v) : null;
}
