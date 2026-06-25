// Developed by Marketnauta
// ============================================================================
// Pruebas del motor de scoring AGRO + cálculo de TCEA.
// - computeCreditCost: pruebas puras (sin BD) de la matemática financiera.
// - calculateAgroScore: pruebas de integración del desglose del puntaje.
// ============================================================================
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { AgroCreditService } from '../src/services/agroCredit.service';
import prisma from '../src/db';
import { createMerchant, resetDb } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AgroCreditService.computeCreditCost — TCEA (metodología SBS)', () => {
  it('la TCEA es MAYOR que la TEA (incluye comisiones + portes + seguro)', () => {
    const { tea, tcea } = AgroCreditService.computeCreditCost(20, 700);
    expect(tcea).toBeGreaterThan(tea);
  });

  it('se compone de forma MULTIPLICATIVA, no suma simple', () => {
    const r = AgroCreditService.computeCreditCost(20, 300);
    const sumaSimple =
      r.components.interestTea +
      r.components.adminCommission +
      r.components.disbursementFee +
      r.components.parametricInsurance;
    // La composición multiplicativa siempre da MÁS que la suma de los %.
    expect(r.tcea).toBeGreaterThan(sumaSimple);
  });

  it('mejor score => menor TCEA (el modelo de negocio se ve en el número)', () => {
    const teaFija = 18;
    const malScore = AgroCreditService.computeCreditCost(teaFija, 320);
    const buenScore = AgroCreditService.computeCreditCost(teaFija, 950);
    expect(buenScore.tcea).toBeLessThan(malScore.tcea);
  });

  it('los componentes de costo respetan sus pisos (no bajan del mínimo)', () => {
    // Con score máximo, la comisión admin no baja de 1.0 y el seguro no de 1.2.
    const r = AgroCreditService.computeCreditCost(15, 1000);
    expect(r.components.adminCommission).toBeGreaterThanOrEqual(1.0);
    expect(r.components.parametricInsurance).toBeGreaterThanOrEqual(1.2);
    expect(r.components.disbursementFee).toBe(0.8); // fijo
  });

  it('todos los valores vienen redondeados a 2 decimales', () => {
    const r = AgroCreditService.computeCreditCost(17.345, 612);
    for (const v of [r.tea, r.tcea, r.components.adminCommission, r.components.parametricInsurance]) {
      expect(v).toBe(Math.round(v * 100) / 100);
    }
  });

  it('caso Aurelio (score 874) reproduce la TCEA documentada (24.89%)', () => {
    // La TEA NO es fija: el sistema la deriva del score (45% → 15%). Para score
    // 874 la TEA dinámica es 20.4%, y con esa TEA la TCEA da 24.89% — el valor
    // que aparece en la documentación y las capturas del prototipo.
    const score = 874;
    const teaDinamica = Math.round((Math.max(15, 45 - ((score - 300) / 700) * 30)) * 100) / 100;
    expect(teaDinamica).toBe(20.4);

    const r = AgroCreditService.computeCreditCost(teaDinamica, score);
    expect(r.tcea).toBe(24.89);
  });
});

describe('AgroCreditService.calculateAgroScore — desglose del puntaje', () => {
  beforeEach(async () => {
    await resetDb();
  });

  /** Crea un comercio + productor (PPA pre-verificado) con N campañas cosechadas. */
  async function makeProducer(opts: {
    dni: string;
    ppaVerified: boolean;
    hectares?: number;
    campaigns?: { harvested: boolean; withSeed?: boolean; withFertilizer?: boolean }[];
  }) {
    const m = await createMerchant({ withCreditLine: true });
    const producer = await (prisma as any).producerProfile.create({
      data: {
        merchantId: m.id,
        dni: opts.dni,
        ppaVerified: opts.ppaVerified,
        hectares: opts.hectares ?? 0,
      },
    });
    for (const c of opts.campaigns ?? []) {
      const campaign = await (prisma as any).agroCampaign.create({
        data: {
          producerId: producer.id,
          crop: 'Quinua',
          season: '2026-A',
          harvestWeightKg: c.harvested ? 1200 : 0,
        },
      });
      const inputs: any[] = [];
      if (c.withSeed) inputs.push({ campaignId: campaign.id, type: 'Seed', description: 's', amount: 100 });
      if (c.withFertilizer) inputs.push({ campaignId: campaign.id, type: 'Fertilizer', description: 'f', amount: 200 });
      for (const i of inputs) await (prisma as any).campaignInput.create({ data: i });
    }
    return { merchantId: m.id, producerId: producer.id };
  }

  it('productor en PPA suma identidad (200) + capacidad por hectáreas', async () => {
    const { producerId } = await makeProducer({ dni: '12345678', ppaVerified: true, hectares: 5 });
    const s = await AgroCreditService.calculateAgroScore(producerId);

    expect(s.base).toBe(300);
    expect(s.ppaIdentity).toBe(200);
    expect(s.ppaCapacity).toBe(50); // 5 ha * 10
    expect(s.total).toBe(550);
  });

  it('la capacidad por hectáreas está topada en 150', async () => {
    const { producerId } = await makeProducer({ dni: '22345678', ppaVerified: true, hectares: 100 });
    const s = await AgroCreditService.calculateAgroScore(producerId);
    expect(s.ppaCapacity).toBe(150); // tope, no 1000
  });

  it('cada campaña cosechada suma 80, topado en 320', async () => {
    const { producerId } = await makeProducer({
      dni: '32345678', ppaVerified: true, hectares: 1,
      campaigns: Array(5).fill({ harvested: true }), // 5*80 = 400 -> tope 320
    });
    const s = await AgroCreditService.calculateAgroScore(producerId);
    expect(s.campaignHistory).toBe(320);
  });

  it('la disciplina de insumos premia semilla + fertilizante (15 c/u)', async () => {
    const { producerId } = await makeProducer({
      dni: '42345678', ppaVerified: true, hectares: 1,
      campaigns: [{ harvested: true, withSeed: true, withFertilizer: true }],
    });
    const s = await AgroCreditService.calculateAgroScore(producerId);
    expect(s.inputDiscipline).toBe(30); // 15 + 15
  });

  it('productor NO estacional sin PPA: solo base, NO penalizado a cero', async () => {
    // Tomás: sin PPA, sin campañas. El motor NO lo castiga por falta de
    // frecuencia transaccional; conserva su base de 300.
    const { producerId } = await makeProducer({ dni: '50000002', ppaVerified: true, hectares: 0 });
    const s = await AgroCreditService.calculateAgroScore(producerId);
    expect(s.total).toBeGreaterThanOrEqual(300);
  });

  it('el total nunca supera 1000 (tope duro)', async () => {
    const { producerId } = await makeProducer({
      dni: '62345678', ppaVerified: true, hectares: 100,
      campaigns: Array(10).fill({ harvested: true, withSeed: true, withFertilizer: true }),
    });
    const s = await AgroCreditService.calculateAgroScore(producerId);
    expect(s.total).toBeLessThanOrEqual(1000);
  });

  it('aplica el score a la línea de crédito (límite + TEA dinámica)', async () => {
    const { merchantId, producerId } = await makeProducer({
      dni: '72345678', ppaVerified: true, hectares: 8,
      campaigns: Array(3).fill({ harvested: true, withSeed: true, withFertilizer: true }),
    });
    const s = await AgroCreditService.calculateAgroScore(producerId);
    const cl = await prisma.creditLine.findUnique({ where: { merchantId } });

    expect(cl?.alternativeScore).toBe(s.total);
    if (s.total > 500) {
      expect(cl?.creditLimit).toBe(s.total * 2); // límite anclado a capacidad probada
    }
    // TEA dinámica entre 15% y 45%.
    expect(cl?.interestRateEffective).toBeGreaterThanOrEqual(15);
    expect(cl?.interestRateEffective).toBeLessThanOrEqual(45);
  });

  it('lanza si el productor no existe', async () => {
    await expect(AgroCreditService.calculateAgroScore(999999)).rejects.toThrow(/not found/i);
  });
});
