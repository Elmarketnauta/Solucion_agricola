// ============================================================================
// Yunta-Agro — Solución 9: Agricultura de precisión (ingesta de drones/IA).
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Recibe payloads de drones multiespectrales / visión computacional de terceros
// (NDVI, NDRE, temperatura del dosel, detección de enfermedad, madurez de fruto).
// Persiste la lectura con hash de integridad y, si detecta estrés térmico o
// enfermedad, genera una ALERTA DE RIESGO en el perfil del productor que ajusta
// dinámicamente su evaluación crediticia (riskDelta temporal sobre el score).
// ============================================================================
import crypto from 'crypto';
import prisma from '../db';

export interface DronePayload {
  campaignId: number;
  provider: string;
  flightId: string;
  capturedAt: string; // ISO
  ndvi?: number;       // 0–1 (vigor vegetativo)
  ndre?: number;       // estrés / clorofila
  canopyTempC?: number;
  thermalStress?: boolean;
  diseaseDetected?: boolean;
  diseaseLabel?: string;
  fruitMaturityPct?: number;
  affectedAreaPct?: number;
}

// Umbrales de agricultura de precisión (configurables por env).
const NDVI_LOW = Number(process.env.DRONE_NDVI_LOW ?? 0.4);     // vigor bajo
const CANOPY_HEAT = Number(process.env.DRONE_CANOPY_HEAT ?? 30); // °C dosel → estrés

export interface DroneIngestResult {
  scanId: number;
  riskAlerts: { category: string; severity: string; riskDelta: number; message: string }[];
}

export class DroneTelemetryService {
  /** Ingesta un análisis de dron y dispara alertas de riesgo si aplica. */
  static async ingest(payload: DronePayload): Promise<DroneIngestResult> {
    const campaign = await prisma.agroCampaign.findUnique({
      where: { id: payload.campaignId }, include: { producer: true },
    });
    if (!campaign) throw new Error('Campaña no encontrada');

    const capturedAt = new Date(payload.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) throw new Error('capturedAt inválido');

    const payloadHash = this.hashPayload(payload);
    const scan = await prisma.droneTelemetryCache.create({
      data: {
        campaignId: payload.campaignId,
        provider: payload.provider,
        flightId: payload.flightId,
        ndvi: payload.ndvi ?? null,
        ndre: payload.ndre ?? null,
        canopyTempC: payload.canopyTempC ?? null,
        thermalStress: payload.thermalStress ?? false,
        diseaseDetected: payload.diseaseDetected ?? false,
        diseaseLabel: payload.diseaseLabel ?? null,
        fruitMaturityPct: payload.fruitMaturityPct ?? null,
        affectedAreaPct: payload.affectedAreaPct ?? null,
        payloadHash,
        capturedAt,
      },
    });

    const riskAlerts = await this.evaluateRisk(campaign.producerId, payload);
    return { scanId: scan.id, riskAlerts };
  }

  /**
   * Evalúa el payload y crea alertas de riesgo a nivel de productor. Cada alerta
   * lleva un `riskDelta` (impacto temporal en el score) que el motor de scoring
   * resta hasta que se resuelva.
   */
  private static async evaluateRisk(producerId: number, p: DronePayload) {
    const created: { category: string; severity: string; riskDelta: number; message: string }[] = [];

    // Estrés térmico (dosel caliente o flag explícito).
    const hotCanopy = p.canopyTempC != null && p.canopyTempC >= CANOPY_HEAT;
    if (p.thermalStress || hotCanopy) {
      created.push(await this.raise(producerId, 'ThermalStress', 'Warning', -40,
        `Estrés térmico detectado por dron${p.canopyTempC != null ? ` (dosel ${p.canopyTempC}°C)` : ''}.`));
    }

    // Enfermedad detectada (roya, etc.).
    if (p.diseaseDetected) {
      const area = p.affectedAreaPct != null ? ` en ${p.affectedAreaPct}% del área` : '';
      const sev = (p.affectedAreaPct ?? 0) > 30 ? 'Critical' : 'Warning';
      const delta = (p.affectedAreaPct ?? 0) > 30 ? -80 : -50;
      created.push(await this.raise(producerId, 'Disease', sev, delta,
        `Enfermedad detectada: ${p.diseaseLabel ?? 'no especificada'}${area}.`));
    }

    // Vigor vegetativo bajo (NDVI), señal temprana sin disparar penalización fuerte.
    if (p.ndvi != null && p.ndvi < NDVI_LOW) {
      created.push(await this.raise(producerId, 'ThermalStress', 'Info', -15,
        `Vigor vegetativo bajo (NDVI ${p.ndvi}). Revisar nutrición/riego.`));
    }

    return created;
  }

  /** Crea una alerta de riesgo (evita duplicar la misma categoría no resuelta). */
  private static async raise(producerId: number, category: string, severity: string, riskDelta: number, message: string) {
    const existing = await prisma.riskAlert.findFirst({
      where: { producerId, category, resolved: false },
    });
    if (!existing) {
      await prisma.riskAlert.create({
        data: { producerId, source: 'Drone', category, severity, riskDelta, message },
      });
    }
    return { category, severity, riskDelta, message };
  }

  /** Suma de penalizaciones de riesgo activas de un productor (para el scoring). */
  static async activeRiskDelta(producerId: number): Promise<number> {
    const alerts = await prisma.riskAlert.findMany({
      where: { producerId, resolved: false }, select: { riskDelta: true },
    });
    return alerts.reduce((acc, a) => acc + a.riskDelta, 0); // negativo o 0
  }

  static hashPayload(p: DronePayload): string {
    const canonical = JSON.stringify(p, Object.keys(p).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
}
