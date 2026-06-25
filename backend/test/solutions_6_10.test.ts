// Developed by Marketnauta
// ============================================================================
// Pruebas de lógica PURA de las soluciones 6–10 (sin BD): firmas HMAC (TAPP,
// offline), hash de identidad PPA, hash de payload de dron, detección de semilla
// mejorada. Las partes con BD se prueban en solutions_6_10.integration.test.ts.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { TappService } from '../src/services/tapp.service';
import { OfflineService } from '../src/services/offline.service';
import { PpaService } from '../src/services/ppa.service';
import { DroneTelemetryService } from '../src/services/droneTelemetry.service';
import { AgroCreditService } from '../src/services/agroCredit.service';

describe('TAPP — firma HMAC (Solución 6)', () => {
  it('valida una firma correcta y rechaza una incorrecta', () => {
    process.env.TAPP_BCRP_SECRET = 'secreto-bcrp';
    const body = JSON.stringify({ amount: 100, ref: 'X' });
    const sig = TappService.signPayload(body);
    expect(TappService.verifySignature(body, sig)).toBe(true);
    expect(TappService.verifySignature(body, 'firmamala')).toBe(false);
    expect(TappService.verifySignature(body, undefined)).toBe(false);
  });
});

describe('Offline — firma y payload canónico (Solución 8)', () => {
  it('la firma del payload es estable y verificable', () => {
    process.env.OFFLINE_DEVICE_SECRET = 'device-key';
    const tx = { idempotencyKey: 'k1', producerPhone: '+51900000001', receiverPhone: '+51900000002', amount: 50, nonce: 3, signature: '', expiresAt: '2030-01-01T00:00:00.000Z' };
    const sig = OfflineService.signPayload(tx as any);
    expect(OfflineService.verifySignature({ ...tx, signature: sig } as any)).toBe(true);
    expect(OfflineService.verifySignature({ ...tx, signature: 'mala' } as any)).toBe(false);
  });

  it('un cambio en el monto invalida la firma (anti-tamper)', () => {
    process.env.OFFLINE_DEVICE_SECRET = 'device-key';
    const tx = { idempotencyKey: 'k2', producerPhone: '+51900000001', receiverPhone: '+51900000002', amount: 50, nonce: 1, signature: '', expiresAt: '2030-01-01T00:00:00.000Z' };
    const sig = OfflineService.signPayload(tx as any);
    expect(OfflineService.verifySignature({ ...tx, amount: 999, signature: sig } as any)).toBe(false);
  });
});

describe('PPA — hash de identidad (Solución 7)', () => {
  it('hash estable ante reordenamiento de claves, sensible a cambios', () => {
    const a = PpaService.hashIdentity({ dni: '12345678', ppaCode: 'PPA-1', hectares: 5 });
    const b = PpaService.hashIdentity({ hectares: 5, dni: '12345678', ppaCode: 'PPA-1' });
    expect(a).toBe(b);
    const c = PpaService.hashIdentity({ dni: '12345678', ppaCode: 'PPA-1', hectares: 6 });
    expect(c).not.toBe(a);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Drone — hash de payload (Solución 9)', () => {
  it('produce un SHA-256 estable del análisis', () => {
    const p = { campaignId: 1, provider: 'AgriVision', flightId: 'F1', capturedAt: '2026-06-25T10:00:00Z', ndvi: 0.7 };
    const h = DroneTelemetryService.hashPayload(p as any);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(DroneTelemetryService.hashPayload({ ...p } as any));
  });
});

describe('AgroCredit — genética mejorada (Solución 10)', () => {
  it('reconoce semilla mejorada por seedClass, geneticTrait o descripción', () => {
    expect(AgroCreditService.isImprovedSeed({ type: 'Seed', description: '', seedClass: 'RustResistant', geneticTrait: null })).toBe(true);
    expect(AgroCreditService.isImprovedSeed({ type: 'Seed', description: 'papa tolerante a heladas', seedClass: null, geneticTrait: null })).toBe(true);
    expect(AgroCreditService.isImprovedSeed({ type: 'Seed', description: 'clon bajo cadmio (INIA)', seedClass: null, geneticTrait: null })).toBe(true);
    expect(AgroCreditService.isImprovedSeed({ type: 'Seed', description: 'semilla común', seedClass: 'Conventional', geneticTrait: null })).toBe(false);
  });

  it('la genética mejorada REDUCE la TCEA (descuento adicional en la prima)', () => {
    const sin = AgroCreditService.computeCreditCost(20, 700, 0, 0);
    const con = AgroCreditService.computeCreditCost(20, 700, 0, 100);
    expect(con.components.parametricInsurance).toBeLessThan(sin.components.parametricInsurance);
    expect(con.tcea).toBeLessThan(sin.tcea);
  });

  it('bio + genética acumulan descuento (mayor mitigación de riesgo = menor TCEA)', () => {
    const base = AgroCreditService.computeCreditCost(20, 700, 0, 0);
    const ambos = AgroCreditService.computeCreditCost(20, 700, 120, 100);
    expect(ambos.tcea).toBeLessThan(base.tcea);
  });
});
