// ============================================================================
// Yunta-Agro — Seed permanente de productores demo (Aurelio, María, Tomás).
// Developed by Marketnauta
// ============================================================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

// ============================================================================
// Yunta-Agro — Seed permanente de productores de demostración.
// ----------------------------------------------------------------------------
// Tres arquetipos que ejercitan todo el rango del motor de scoring agro:
//   1. Aurelio (consolidado)  — PPA verificado + campañas cumplidas → score alto
//   2. María   (en crecimiento) — PPA verificado, 1 campaña parcial  → score medio
//   3. Tomás   (recién llegado) — DNI no en padrón, sin campañas      → score base
//
// Idempotente (upsert por teléfono). Los DNIs se eligen para que el stub del
// PPA (MidagriService) los clasifique como esperado: termina en 0/1 = fuera del
// padrón. Ejecuta DESPUÉS de la migración agro:
//     npx ts-node prisma/seed.agro.ts
// ============================================================================

async function upsertProducer(opts: {
  phone: string; businessName: string; ownerName: string; dni: string;
  balance: number; ppaInPadron: boolean;
}) {
  const pin = await bcrypt.hash('1234', 10);

  const merchant = await prisma.merchantProfile.upsert({
    where: { phoneNumber: opts.phone },
    update: { pin },
    create: {
      businessName: opts.businessName,
      ownerName: opts.ownerName,
      phoneNumber: opts.phone,
      dni: opts.dni,
      pin,
      status: 'Active',
      wallet: { create: { balance: opts.balance } },
      // Línea base: como un agricultor recién registrado (sin crédito aún).
      creditLine: { create: { creditLimit: 0, interestRateEffective: 45, alternativeScore: 300 } },
    },
    include: { producer: true },
  });

  if (!merchant.producer) {
    await prisma.producerProfile.create({
      data: { merchantId: merchant.id, dni: opts.dni },
    });
  }

  return prisma.producerProfile.findUniqueOrThrow({ where: { merchantId: merchant.id } });
}

async function addCampaign(producerId: number, opts: {
  crop: string; season: string; harvestKg: number; buyer: string | null;
  status: string; withSeed: boolean; withFertilizer: boolean;
}) {
  // Idempotencia simple: no duplicar la misma campaña (cultivo+temporada).
  const existing = await prisma.agroCampaign.findFirst({
    where: { producerId, crop: opts.crop, season: opts.season },
  });
  if (existing) return existing;

  const inputs = [];
  if (opts.withSeed) inputs.push({ type: 'Seed', description: `Semilla certificada ${opts.crop}`, amount: 320, paidWith: 'Subsidy' });
  if (opts.withFertilizer) inputs.push({ type: 'Fertilizer', description: 'Guano de isla', amount: 480, paidWith: 'Subsidy' });
  inputs.push({ type: 'Labor', description: 'Jornales de cosecha', amount: 600, paidWith: 'Own' });

  return prisma.agroCampaign.create({
    data: {
      producerId,
      crop: opts.crop,
      season: opts.season,
      harvestWeightKg: opts.harvestKg,
      buyerName: opts.buyer,
      salePricePerKg: opts.harvestKg > 0 ? 4.5 : null,
      inputCostTotal: inputs.reduce((a, i) => a + i.amount, 0),
      status: opts.status,
      harvestedAt: opts.harvestKg > 0 ? new Date() : null,
      inputs: { create: inputs },
    },
  });
}

async function main() {
  console.log('🌱 Seeding Yunta-Agro...');

  // ── 1. Aurelio — productor consolidado (score alto esperado) ──────────────
  const aurelio = await upsertProducer({
    phone: '+51955700001', businessName: 'Chacra El Mirador',
    ownerName: 'Aurelio Quispe Mamani', dni: '12345678', // termina en 8 → en padrón
    balance: 320, ppaInPadron: true,
  });
  await addCampaign(aurelio.id, { crop: 'Quinua', season: '2025-A', harvestKg: 1400, buyer: 'AgroExport Andes SAC', status: 'Sold', withSeed: true, withFertilizer: true });
  await addCampaign(aurelio.id, { crop: 'Quinua', season: '2025-B', harvestKg: 1250, buyer: 'AgroExport Andes SAC', status: 'Sold', withSeed: true, withFertilizer: true });
  await addCampaign(aurelio.id, { crop: 'Papa nativa', season: '2026-A', harvestKg: 980, buyer: 'Mercado Mayorista', status: 'Harvested', withSeed: true, withFertilizer: false });
  console.log(`  ✓ Aurelio (consolidado) — producer ${aurelio.id}, 3 campañas`);

  // ── 2. María — productora en crecimiento (score medio esperado) ───────────
  const maria = await upsertProducer({
    phone: '+51955700002', businessName: 'Fundo Santa Rosa',
    ownerName: 'María Huamán Flores', dni: '70123459', // termina en 9 → en padrón
    balance: 80, ppaInPadron: true,
  });
  await addCampaign(maria.id, { crop: 'Cacao', season: '2026-A', harvestKg: 600, buyer: 'Cooperativa Cacao Selva', status: 'Harvested', withSeed: true, withFertilizer: false });
  console.log(`  ✓ María (en crecimiento) — producer ${maria.id}, 1 campaña`);

  // ── 3. Tomás — recién registrado, fuera del padrón (score base) ───────────
  const tomas = await upsertProducer({
    phone: '+51955700003', businessName: 'Parcela Los Olivos',
    ownerName: 'Tomás Ccapa Apaza', dni: '40288650', // termina en 0 → NO en padrón
    balance: 0, ppaInPadron: false,
  });
  console.log(`  ✓ Tomás (recién registrado, sin PPA) — producer ${tomas.id}, 0 campañas`);

  console.log('✅ Seed Yunta-Agro completo. PIN de todos: 1234');
  console.log('   Teléfonos: +51955700001 / +51955700002 / +51955700003');
  console.log('   Corre POST /api/agro/score (autenticado) para ver el scoring en acción.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
