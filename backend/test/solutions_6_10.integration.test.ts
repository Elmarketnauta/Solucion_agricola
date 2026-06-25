// Developed by Marketnauta
// ============================================================================
// Pruebas de INTEGRACIÓN de las soluciones 6–10 (tocan PostgreSQL). Requieren la
// BD de pruebas (docker compose up -d → postgres-test). Cubren: liquidación TAPP,
// sync offline en lote (idempotencia + nonce + firma), ingesta de drones → alerta
// de riesgo que baja el score, y el gate de identidad PPA para el microcrédito.
// ============================================================================
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../src/db';
import { TappService } from '../src/services/tapp.service';
import { OfflineService } from '../src/services/offline.service';
import { DroneTelemetryService } from '../src/services/droneTelemetry.service';
import { AgroCreditService } from '../src/services/agroCredit.service';
import { resetDb, createMerchant, createProducerWithCampaign, balanceOf } from './helpers';

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

// ── Solución 6: TAPP ─────────────────────────────────────────────────────────
describe('TappService.disburseSubsidy', () => {
  it('liquida el subsidio en la billetera del beneficiario', async () => {
    const m = await createMerchant({ balance: 100 });
    const r = await TappService.disburseSubsidy({
      programCode: 'FERTIABONO', beneficiaryPhone: m.phoneNumber, amount: 350, bcrpReference: 'BCRP-001',
    });
    expect(r.alreadyProcessed).toBe(false);
    expect(await balanceOf(m.phoneNumber)).toBe(450);
    const rec = await prisma.govSubsidyDisbursement.findUnique({ where: { bcrpReference: 'BCRP-001' } });
    expect(rec?.status).toBe('Settled');
  });

  it('es idempotente por bcrpReference (no paga dos veces)', async () => {
    const m = await createMerchant({ balance: 0 });
    await TappService.disburseSubsidy({ programCode: 'FERTIABONO', beneficiaryPhone: m.phoneNumber, amount: 200, bcrpReference: 'BCRP-DUP' });
    const second = await TappService.disburseSubsidy({ programCode: 'FERTIABONO', beneficiaryPhone: m.phoneNumber, amount: 200, bcrpReference: 'BCRP-DUP' });
    expect(second.alreadyProcessed).toBe(true);
    expect(await balanceOf(m.phoneNumber)).toBe(200);
  });

  it('rechaza beneficiario inexistente', async () => {
    await expect(TappService.disburseSubsidy({ programCode: 'X', beneficiaryPhone: '+51900000999', amount: 10, bcrpReference: 'BCRP-NF' }))
      .rejects.toThrow(/no encontrado/i);
  });
});

// ── Solución 8: offline sync ─────────────────────────────────────────────────
describe('OfflineService.syncBatch', () => {
  const SECRET = 'device-key';
  function signedTx(over: Partial<any>): any {
    const base: any = {
      idempotencyKey: 'tx-' + Math.random().toString(36).slice(2),
      producerPhone: '', receiverPhone: '', amount: 10, nonce: 1,
      signature: '',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(), receivedVia: 'USSD',
      ...over,
    };
    base.signature = OfflineService.signPayload(base, SECRET);
    return base;
  }

  it('procesa un lote válido y liquida en el ledger', async () => {
    process.env.OFFLINE_DEVICE_SECRET = SECRET;
    const a = await createMerchant({ balance: 100 });
    const b = await createMerchant({ balance: 0 });
    const tx = signedTx({ producerPhone: a.phoneNumber, receiverPhone: b.phoneNumber, amount: 30, nonce: 1 });

    const r = await OfflineService.syncBatch([tx as any]);
    expect(r.settled).toBe(1);
    expect(await balanceOf(a.phoneNumber)).toBe(70);
    expect(await balanceOf(b.phoneNumber)).toBe(30);
  });

  it('IDEMPOTENCIA: la misma idempotencyKey reenviada no re-liquida', async () => {
    process.env.OFFLINE_DEVICE_SECRET = SECRET;
    const a = await createMerchant({ balance: 100 });
    const b = await createMerchant({ balance: 0 });
    const tx = signedTx({ producerPhone: a.phoneNumber, receiverPhone: b.phoneNumber, amount: 40, nonce: 1, idempotencyKey: 'fixed' });

    await OfflineService.syncBatch([tx as any]);
    const again = await OfflineService.syncBatch([tx as any]);
    expect(again.duplicates).toBe(1);
    expect(await balanceOf(a.phoneNumber)).toBe(60); // una sola vez
  });

  it('rechaza nonce <= último liquidado (anti-replay)', async () => {
    process.env.OFFLINE_DEVICE_SECRET = SECRET;
    const a = await createMerchant({ balance: 100 });
    const b = await createMerchant({ balance: 0 });
    await OfflineService.syncBatch([signedTx({ producerPhone: a.phoneNumber, receiverPhone: b.phoneNumber, amount: 10, nonce: 5 }) as any]);
    const r = await OfflineService.syncBatch([signedTx({ producerPhone: a.phoneNumber, receiverPhone: b.phoneNumber, amount: 10, nonce: 3 }) as any]);
    expect(r.rejected.some(x => /replay|nonce/i.test(x.reason))).toBe(true);
  });

  it('rechaza firma inválida y transacción caducada', async () => {
    process.env.OFFLINE_DEVICE_SECRET = SECRET;
    const a = await createMerchant({ balance: 100 });
    const b = await createMerchant({ balance: 0 });
    const bad = signedTx({ producerPhone: a.phoneNumber, receiverPhone: b.phoneNumber, amount: 10, nonce: 1 });
    bad.signature = 'firma-falsa';
    const expired = signedTx({ producerPhone: a.phoneNumber, receiverPhone: b.phoneNumber, amount: 10, nonce: 2, expiresAt: new Date(Date.now() - 1000).toISOString() });

    const r = await OfflineService.syncBatch([bad as any, expired as any]);
    expect(r.settled).toBe(0);
    expect(r.rejected.length).toBe(2);
    expect(await balanceOf(a.phoneNumber)).toBe(100);
  });

  it('resiliencia: una tx inválida no aborta las válidas del lote', async () => {
    process.env.OFFLINE_DEVICE_SECRET = SECRET;
    const a = await createMerchant({ balance: 100 });
    const b = await createMerchant({ balance: 0 });
    const good = signedTx({ producerPhone: a.phoneNumber, receiverPhone: b.phoneNumber, amount: 20, nonce: 1 });
    const bad = signedTx({ producerPhone: a.phoneNumber, receiverPhone: b.phoneNumber, amount: 20, nonce: 1 });
    bad.signature = 'mala';
    const r = await OfflineService.syncBatch([good as any, bad as any]);
    expect(r.settled).toBe(1);
    expect(r.rejected.length).toBe(1);
  });
});

// ── Solución 9: drones → riesgo dinámico ─────────────────────────────────────
describe('DroneTelemetryService.ingest', () => {
  it('detecta enfermedad y crea alerta de riesgo que baja el score', async () => {
    const { campaignId, producerId } = await createProducerWithCampaign({ harvestWeightKg: 1000 });
    // Score base sin alerta.
    const before = await AgroCreditService.calculateAgroScore(producerId);

    await DroneTelemetryService.ingest({
      campaignId, provider: 'AgriVision', flightId: 'F1', capturedAt: new Date().toISOString(),
      diseaseDetected: true, diseaseLabel: 'Roya amarilla', affectedAreaPct: 40,
    });
    const delta = await DroneTelemetryService.activeRiskDelta(producerId);
    expect(delta).toBeLessThan(0); // penalización activa

    const after = await AgroCreditService.calculateAgroScore(producerId);
    expect(after.riskPenalty).toBeLessThan(0);
    expect(after.total).toBeLessThan(before.total); // el score bajó por el riesgo
  });

  it('estrés térmico genera alerta de riesgo', async () => {
    const { campaignId, producerId } = await createProducerWithCampaign({ harvestWeightKg: 500 });
    const r = await DroneTelemetryService.ingest({
      campaignId, provider: 'X', flightId: 'F2', capturedAt: new Date().toISOString(), canopyTempC: 34,
    });
    expect(r.riskAlerts.some(a => a.category === 'ThermalStress')).toBe(true);
  });

  it('clima/sanidad normal no genera alertas de riesgo', async () => {
    const { campaignId } = await createProducerWithCampaign({ harvestWeightKg: 500 });
    const r = await DroneTelemetryService.ingest({
      campaignId, provider: 'X', flightId: 'F3', capturedAt: new Date().toISOString(), ndvi: 0.8, canopyTempC: 22,
    });
    expect(r.riskAlerts.length).toBe(0);
  });
});

// ── Solución 7: gate de identidad PPA + Solución 10: genética en el score ─────
describe('AgroCreditService — gate PPA + bonus genético', () => {
  it('sin PPA verificado, el crédito NO se desbloquea (límite 0)', async () => {
    const { merchantId, producerId } = await createProducerWithCampaign({ harvestWeightKg: 1500, ppaVerified: false, dni: '70000001' });
    const s = await AgroCreditService.calculateAgroScore(producerId);
    // DNI termina en 1 → el stub del PPA lo marca como NO registrado.
    expect(s.creditUnlocked).toBe(false);
    const cl = await prisma.creditLine.findUnique({ where: { merchantId } });
    expect(cl?.creditLimit).toBe(0); // gate cerrado pese al historial
  });

  it('con PPA verificado, el crédito se desbloquea', async () => {
    const { merchantId, producerId } = await createProducerWithCampaign({ harvestWeightKg: 1500, ppaVerified: true, hectares: 6 });
    const s = await AgroCreditService.calculateAgroScore(producerId);
    expect(s.creditUnlocked).toBe(true);
    const cl = await prisma.creditLine.findUnique({ where: { merchantId } });
    if (s.total > 500) expect(cl!.creditLimit).toBeGreaterThan(0);
  });

  it('semilla mejorada suma geneticBonus al score', async () => {
    const { producerId, campaignId } = await createProducerWithCampaign({ harvestWeightKg: 1000, ppaVerified: true });
    await (prisma as any).campaignInput.create({
      data: { campaignId, type: 'Seed', description: 'Trigo resistente a roya', amount: 200, paidWith: 'Credit', seedClass: 'RustResistant' },
    });
    const s = await AgroCreditService.calculateAgroScore(producerId);
    expect(s.geneticBonus).toBeGreaterThan(0);
  });
});
