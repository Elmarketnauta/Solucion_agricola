// Developed by Marketnauta
// ============================================================================
// Pruebas de la lógica PURA de la Capa Precursora AgTech (sin BD): trigger
// paramétrico, hashing de integridad (oráculo + certificación), descuento verde
// en la TCEA y detección de bioinsumos. Las partes con BD (ingesta, payouts) se
// verifican en integración cuando haya Postgres.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { ParametricInsuranceService } from '../src/services/parametricInsurance.service';
import { CertificationService } from '../src/services/certification.service';
import { WeatherOracleService } from '../src/services/weatherOracle.service';
import { AgroCreditService } from '../src/services/agroCredit.service';

describe('ParametricInsurance — regla de trigger (pura)', () => {
  const policy = { rainThresholdMm: 5, tempMaxThreshold: 33, tempMinThreshold: 1 };

  it('detona SEQUÍA cuando la lluvia cae bajo el umbral', () => {
    const t = ParametricInsuranceService.checkTrigger(policy, { precipitationMm: 2, tempMaxC: 20, tempMinC: 10 });
    expect(t).toBe('Drought');
  });

  it('detona OLA DE CALOR (El Niño) cuando la temp máxima supera el umbral', () => {
    const t = ParametricInsuranceService.checkTrigger(policy, { precipitationMm: 20, tempMaxC: 34, tempMinC: 12 });
    expect(t).toBe('HeatStress_ElNino');
  });

  it('detona HELADA cuando la temp mínima cae bajo el umbral', () => {
    const t = ParametricInsuranceService.checkTrigger(policy, { precipitationMm: 20, tempMaxC: 18, tempMinC: 0 });
    expect(t).toBe('Frost');
  });

  it('NO detona en clima normal', () => {
    const t = ParametricInsuranceService.checkTrigger(policy, { precipitationMm: 20, tempMaxC: 22, tempMinC: 8 });
    expect(t).toBeNull();
  });

  it('la sequía tiene prioridad sobre el calor si ambos se cumplen', () => {
    const t = ParametricInsuranceService.checkTrigger(policy, { precipitationMm: 0, tempMaxC: 40, tempMinC: 12 });
    expect(t).toBe('Drought');
  });
});

describe('WeatherOracle — hash de integridad (pura, determinista)', () => {
  it('el mismo dato produce el mismo hash; un cambio lo rompe', () => {
    const r = { stationKey: 's', date: new Date('2026-06-25'), tempMaxC: 30, tempMinC: 10, tempAvgC: 20, precipitationMm: 3, humidityPct: 50 };
    const h1 = WeatherOracleService.hashReading(r);
    const h2 = WeatherOracleService.hashReading({ ...r });
    expect(h1).toBe(h2);
    const h3 = WeatherOracleService.hashReading({ ...r, precipitationMm: 4 });
    expect(h3).not.toBe(h1);
    expect(h1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });
});

describe('Certification — hash del pasaporte EUDR (pura)', () => {
  it('hash estable ante reordenamiento de claves, sensible a cambios de valor', () => {
    const a = CertificationService.hashPayload({ campaignId: 1, crop: 'Cacao', gpsLat: -12.3 });
    const b = CertificationService.hashPayload({ gpsLat: -12.3, crop: 'Cacao', campaignId: 1 });
    expect(a).toBe(b); // orden de claves no afecta
    const c = CertificationService.hashPayload({ campaignId: 1, crop: 'Cacao', gpsLat: -12.4 });
    expect(c).not.toBe(a); // un GPS distinto rompe el hash → manipulación detectable
  });
});

describe('AgroCredit — Solución 3: bioinsumos y descuento verde en TCEA', () => {
  it('reconoce biofertilizantes por type y por descripción', () => {
    expect(AgroCreditService.isBioInput({ type: 'BioFertilizer', description: '' })).toBe(true);
    expect(AgroCreditService.isBioInput({ type: 'Fertilizer', description: 'Trichoderma harzianum' })).toBe(true);
    expect(AgroCreditService.isBioInput({ type: 'Fertilizer', description: 'Aplicación de micorrizas' })).toBe(true);
    expect(AgroCreditService.isBioInput({ type: 'Fertilizer', description: 'Urea 46%' })).toBe(false);
  });

  it('el bono de bioinsumos REDUCE la TCEA (descuento verde en la prima)', () => {
    const sinBio = AgroCreditService.computeCreditCost(20, 700, 0);
    const conBio = AgroCreditService.computeCreditCost(20, 700, 120); // bono máximo
    expect(conBio.components.parametricInsurance).toBeLessThan(sinBio.components.parametricInsurance);
    expect(conBio.tcea).toBeLessThan(sinBio.tcea);
  });

  it('sin bono, la TCEA es idéntica al comportamiento previo (no rompe nada)', () => {
    const a = AgroCreditService.computeCreditCost(18, 874);     // firma de 2 args
    const b = AgroCreditService.computeCreditCost(18, 874, 0);  // 3er arg en 0
    expect(a.tcea).toBe(b.tcea);
  });
});
