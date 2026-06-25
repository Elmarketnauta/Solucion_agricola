// Developed by Marketnauta
// ============================================================================
// Pruebas de INTEGRACIÓN de la Capa Precursora AgTech (tocan PostgreSQL).
// Requieren la BD de pruebas (docker compose up -d → servicio postgres-test).
// Cubren las piezas con persistencia: ingesta IoT + alertas, oráculo climático,
// motor de seguros paramétricos (con liquidación atómica) y certificación EUDR.
// ============================================================================
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../src/db';
import { TelemetryService } from '../src/services/telemetry.service';
import { WeatherOracleService } from '../src/services/weatherOracle.service';
import { ParametricInsuranceService } from '../src/services/parametricInsurance.service';
import { CertificationService } from '../src/services/certification.service';
import { resetDb, createProducerWithCampaign, balanceOf } from './helpers';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Solución 1: telemetría IoT + alertas ─────────────────────────────────────
describe('TelemetryService.ingestBurst', () => {
  it('persiste una ráfaga de lecturas ligada a la campaña', async () => {
    const { campaignId } = await createProducerWithCampaign();
    const res = await TelemetryService.ingestBurst(campaignId, [
      { deviceId: 'node-1', soilMoisturePct: 25, airTempC: 20 },
      { deviceId: 'node-1', soilMoisturePct: 24, airTempC: 21 },
    ]);
    expect(res.ingested).toBe(2);
    const count = await (prisma as any).ioTSensorTelemetry.count({ where: { campaignId } });
    expect(count).toBe(2);
  });

  it('genera alerta CRÍTICA de estrés hídrico bajo el umbral', async () => {
    const { campaignId } = await createProducerWithCampaign();
    const res = await TelemetryService.ingestBurst(campaignId, [
      { deviceId: 'node-1', soilMoisturePct: 9 }, // < 12 (crítico)
    ]);
    expect(res.alerts.some(a => a.type === 'WaterStress' && a.severity === 'Critical')).toBe(true);
    const alerts = await TelemetryService.activeAlerts(campaignId);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('genera alerta de helada y de calor según temperatura', async () => {
    const { campaignId } = await createProducerWithCampaign();
    const frost = await TelemetryService.ingestBurst(campaignId, [{ deviceId: 'n', airTempC: 0 }]);
    expect(frost.alerts.some(a => a.type === 'FrostRisk')).toBe(true);

    const { campaignId: c2 } = await createProducerWithCampaign();
    const heat = await TelemetryService.ingestBurst(c2, [{ deviceId: 'n', airTempC: 35 }]);
    expect(heat.alerts.some(a => a.type === 'HeatStress')).toBe(true);
  });

  it('NO duplica la misma alerta no reconocida en el mismo día', async () => {
    const { campaignId } = await createProducerWithCampaign();
    await TelemetryService.ingestBurst(campaignId, [{ deviceId: 'n', soilMoisturePct: 8 }]);
    await TelemetryService.ingestBurst(campaignId, [{ deviceId: 'n', soilMoisturePct: 7 }]);
    const alerts = await prisma.agroAlert.findMany({ where: { campaignId, type: 'WaterStress' } });
    expect(alerts.length).toBe(1);
  });

  it('clima normal no genera alertas', async () => {
    const { campaignId } = await createProducerWithCampaign();
    const res = await TelemetryService.ingestBurst(campaignId, [
      { deviceId: 'n', soilMoisturePct: 30, airTempC: 18 },
    ]);
    expect(res.alerts.length).toBe(0);
  });

  it('falla con campaña inexistente', async () => {
    await expect(TelemetryService.ingestBurst(999999, [{ deviceId: 'n', soilMoisturePct: 20 }]))
      .rejects.toThrow(/no encontrada/i);
  });
});

// ── Solución 2: oráculo climático ────────────────────────────────────────────
describe('WeatherOracleService', () => {
  it('refresca el caché para todas las estaciones (idempotente)', async () => {
    const day = new Date('2026-06-25');
    const n1 = await WeatherOracleService.refreshAll(day);
    expect(n1).toBe(WeatherOracleService.stations().length);

    // Re-ejecutar el mismo día NO duplica (upsert por stationKey+date).
    await WeatherOracleService.refreshAll(day);
    const total = await (prisma as any).oracleWeatherDataCache.count();
    expect(total).toBe(WeatherOracleService.stations().length);
  });

  it('guarda un hash de integridad y lo puede leer por estación/fecha', async () => {
    const day = new Date('2026-06-25');
    await WeatherOracleService.refreshAll(day);
    const station = WeatherOracleService.stations()[0];
    const reading = await WeatherOracleService.getWeatherForDate(station, day);
    expect(reading).not.toBeNull();
    expect(reading!.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(reading!.tempMaxC).toBeGreaterThanOrEqual(reading!.tempMinC);
  });
});

// ── Solución 4: seguro paramétrico (decisión + liquidación atómica) ──────────
describe('ParametricInsuranceService.evaluateActivePolicies', () => {
  /** Crea una póliza activa para el productor, atada a una estación. */
  async function makePolicy(producerId: number, station: string, opts: {
    rainThresholdMm?: number; tempMaxThreshold?: number; coverage?: number;
  } = {}) {
    return (prisma as any).insurancePolicy.create({
      data: {
        producerId,
        chainPolicyId: `POL-${producerId}-${Date.now()}`,
        crop: 'Quinua', gpsLat: -13.5, gpsLng: -71.9,
        rainThresholdMm: opts.rainThresholdMm ?? 5,
        tempMaxThreshold: opts.tempMaxThreshold ?? null,
        stationKey: station,
        coverageAmount: opts.coverage ?? 500,
        premium: 25,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-12-31'),
        status: 'Active',
      },
    });
  }

  it('detona el pago y LIQUIDA en soles cuando hay sequía (saldo + estado)', async () => {
    const { producerId, phoneNumber } = await createProducerWithCampaign({ balance: 100 });
    const station = 'test-drought';
    await makePolicy(producerId, station, { rainThresholdMm: 5, coverage: 500 });

    // Oráculo: día seco (precipitación 0 < umbral 5).
    const day = new Date('2026-06-25');
    await (prisma as any).oracleWeatherDataCache.create({
      data: { stationKey: station, date: startOfDay(day), tempMaxC: 22, tempMinC: 8, tempAvgC: 15, precipitationMm: 0, payloadHash: 'x'.repeat(64) },
    });

    const outcome = await ParametricInsuranceService.evaluateActivePolicies(day);
    expect(outcome.triggered).toBe(1);
    expect(outcome.paidOut[0].eventType).toBe('Drought');

    // El productor recibió la indemnización en su billetera (100 + 500).
    expect(await balanceOf(phoneNumber)).toBe(600);
    const policy = await prisma.insurancePolicy.findFirst({ where: { producerId } });
    expect(policy?.status).toBe('PaidOut');
    expect(policy?.payoutTxId).not.toBeNull();
  });

  it('NO paga dos veces si el ciclo se ejecuta de nuevo (idempotencia)', async () => {
    const { producerId, phoneNumber } = await createProducerWithCampaign({ balance: 0 });
    const station = 'test-dup';
    await makePolicy(producerId, station, { rainThresholdMm: 5, coverage: 300 });
    const day = new Date('2026-06-25');
    await (prisma as any).oracleWeatherDataCache.create({
      data: { stationKey: station, date: startOfDay(day), tempMaxC: 20, tempMinC: 8, tempAvgC: 14, precipitationMm: 0, payloadHash: 'y'.repeat(64) },
    });

    await ParametricInsuranceService.evaluateActivePolicies(day);
    // Segunda corrida: la póliza ya está PaidOut, no se reevalúa ni re-paga.
    const second = await ParametricInsuranceService.evaluateActivePolicies(day);
    expect(second.triggered).toBe(0);
    expect(await balanceOf(phoneNumber)).toBe(300); // pagó una sola vez
  });

  it('NO detona en clima normal (saldo intacto)', async () => {
    const { producerId, phoneNumber } = await createProducerWithCampaign({ balance: 50 });
    const station = 'test-normal';
    await makePolicy(producerId, station, { rainThresholdMm: 5, coverage: 400 });
    const day = new Date('2026-06-25');
    await (prisma as any).oracleWeatherDataCache.create({
      data: { stationKey: station, date: startOfDay(day), tempMaxC: 22, tempMinC: 9, tempAvgC: 15, precipitationMm: 18, payloadHash: 'z'.repeat(64) },
    });

    const outcome = await ParametricInsuranceService.evaluateActivePolicies(day);
    expect(outcome.triggered).toBe(0);
    expect(await balanceOf(phoneNumber)).toBe(50);
  });

  it('sin dato del oráculo solo marca lastEvaluatedAt, no paga', async () => {
    const { producerId, phoneNumber } = await createProducerWithCampaign({ balance: 10 });
    await makePolicy(producerId, 'station-sin-dato', { rainThresholdMm: 5 });
    const outcome = await ParametricInsuranceService.evaluateActivePolicies(new Date('2026-06-25'));
    expect(outcome.triggered).toBe(0);
    expect(await balanceOf(phoneNumber)).toBe(10);
    const policy = await prisma.insurancePolicy.findFirst({ where: { producerId } });
    expect(policy?.lastEvaluatedAt).not.toBeNull();
    expect(policy?.status).toBe('Active');
  });
});

// ── Solución 5: certificación EUDR ───────────────────────────────────────────
describe('CertificationService', () => {
  it('emite el pasaporte con hash, GPS y PPA; verificación pública = valid', async () => {
    const { campaignId } = await createProducerWithCampaign({ harvestWeightKg: 1200, crop: 'Cacao' });
    const passport = await CertificationService.issue({ campaignId, buyerRuc: '20123456789', taxYear: 2026 });

    expect(passport.vcHash).toMatch(/^[a-f0-9]{64}$/);
    expect(passport.certUuid).toBeTruthy();

    const verified = await CertificationService.verifyByUuid(passport.certUuid);
    expect(verified).not.toBeNull();
    expect(verified!.integrity).toBe('valid'); // hash recomputado coincide
    expect(verified!.gps).not.toBeNull();
    expect(verified!.ppaCode).toBeTruthy();
    expect(verified!.anchoredOnChain).toBe(false); // aún off-chain
  });

  it('es idempotente por campaña (no re-emite)', async () => {
    const { campaignId } = await createProducerWithCampaign({ harvestWeightKg: 800 });
    const first = await CertificationService.issue({ campaignId, buyerRuc: '20123456789', taxYear: 2026 });
    const second = await CertificationService.issue({ campaignId, buyerRuc: '20123456789', taxYear: 2026 });
    expect(second.alreadyIssued).toBe(true);
    expect(second.certUuid).toBe(first.certUuid);
  });

  it('detecta manipulación: si se altera el payload guardado, integrity = tampered', async () => {
    const { campaignId } = await createProducerWithCampaign({ harvestWeightKg: 500 });
    const passport = await CertificationService.issue({ campaignId, buyerRuc: '20123456789', taxYear: 2026 });

    // Simula manipulación de la BD: cambian los kilos sin recalcular el hash.
    const token = await prisma.certificationToken.findUnique({ where: { certUuid: passport.certUuid } });
    const payload = JSON.parse(token!.certifiedPayload!);
    payload.harvestWeightKg = 99999; // dato adulterado
    await prisma.certificationToken.update({
      where: { certUuid: passport.certUuid },
      data: { certifiedPayload: JSON.stringify(payload) },
    });

    const verified = await CertificationService.verifyByUuid(passport.certUuid);
    expect(verified!.integrity).toBe('tampered');
  });

  it('rechaza certificar una cosecha no registrada (harvestWeightKg = 0)', async () => {
    const { campaignId } = await createProducerWithCampaign({ harvestWeightKg: 0 });
    await expect(CertificationService.issue({ campaignId, buyerRuc: '20123456789', taxYear: 2026 }))
      .rejects.toThrow(/no tiene cosecha/i);
  });

  it('rechaza certificar si el productor no está verificado en el PPA', async () => {
    const { campaignId } = await createProducerWithCampaign({ harvestWeightKg: 600, ppaVerified: false });
    await expect(CertificationService.issue({ campaignId, buyerRuc: '20123456789', taxYear: 2026 }))
      .rejects.toThrow(/no está verificado/i);
  });
});

// helper local
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
