// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Utilidades compartidas para las pruebas de integración: creación de
// comercios/wallets/productores de prueba y limpieza de la BD entre tests.
// ----------------------------------------------------------------------------
import prisma from '../src/db';

let phoneCounter = 0;

/** Genera un teléfono único por test para evitar colisiones de @unique. */
export function uniquePhone(): string {
  phoneCounter += 1;
  return `+5199${String(phoneCounter).padStart(7, '0')}`;
}

/** Crea un comercio con su wallet y (opcional) línea de crédito. Devuelve ids/phone. */
export async function createMerchant(opts: {
  balance?: number;
  businessName?: string;
  withCreditLine?: boolean;
} = {}) {
  const phoneNumber = uniquePhone();
  const merchant = await prisma.merchantProfile.create({
    data: {
      businessName: opts.businessName ?? `Test ${phoneNumber}`,
      ownerName: 'Tester',
      phoneNumber,
      pin: 'x', // hash dummy; no se usa en estas pruebas
      wallet: { create: { balance: opts.balance ?? 0 } },
      ...(opts.withCreditLine
        ? { creditLine: { create: { creditLimit: 0, alternativeScore: 300, interestRateEffective: 45 } } }
        : {}),
    },
    include: { wallet: true, creditLine: true },
  });
  return { id: merchant.id, phoneNumber, walletId: merchant.wallet!.id };
}

/** Lee el saldo actual de un comercio por teléfono. */
export async function balanceOf(phoneNumber: string): Promise<number> {
  const m = await prisma.merchantProfile.findUnique({
    where: { phoneNumber },
    include: { wallet: true },
  });
  return m?.wallet?.balance ?? NaN;
}

/**
 * Limpia todas las tablas en orden hijo→padre para respetar las FKs.
 * Se llama en beforeEach para que cada prueba arranque con BD vacía.
 */
export async function resetDb() {
  // Hijos primero (agro + AgTech + soluciones 6–10), luego MVP, luego padres.
  await (prisma as any).ioTSensorTelemetry.deleteMany();
  await (prisma as any).droneTelemetryCache.deleteMany();
  await (prisma as any).agroAlert.deleteMany();
  await (prisma as any).riskAlert.deleteMany();
  await (prisma as any).campaignInput.deleteMany();
  await (prisma as any).certificationToken.deleteMany();
  await (prisma as any).subsidyDisbursement.deleteMany();
  await (prisma as any).insurancePolicy.deleteMany();
  await (prisma as any).agroCampaign.deleteMany();
  await (prisma as any).agroParcel.deleteMany();
  await (prisma as any).offlineSignedTx?.deleteMany?.();
  await (prisma as any).oracleWeatherDataCache.deleteMany();
  await (prisma as any).govSubsidyDisbursement.deleteMany();
  await (prisma as any).producerProfile.deleteMany();
  await prisma.salesLedger.deleteMany();
  await prisma.loanInstallment.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.product.deleteMany();
  await prisma.creditLine.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.merchantProfile.deleteMany();
}

/**
 * Crea un comercio + productor (PPA verificado) + una campaña. Base reutilizable
 * para las pruebas de telemetría, certificación y seguros.
 */
export async function createProducerWithCampaign(opts: {
  balance?: number;
  ppaVerified?: boolean;
  hectares?: number;
  gpsLat?: number;
  gpsLng?: number;
  region?: string;
  dni?: string;
  harvestWeightKg?: number;
  crop?: string;
} = {}) {
  const m = await createMerchant({ balance: opts.balance ?? 0, withCreditLine: true });
  const producer = await (prisma as any).producerProfile.create({
    data: {
      merchantId: m.id,
      dni: opts.dni ?? uniqueDni(),
      ppaVerified: opts.ppaVerified ?? true,
      ppaCode: 'PPA-TEST-001',
      agroDigitalId: (opts.ppaVerified ?? true) ? `AGD-${uniqueDni()}` : null,
      hectares: opts.hectares ?? 3,
      region: opts.region ?? 'Cusco',
      gpsLat: opts.gpsLat ?? -13.52,
      gpsLng: opts.gpsLng ?? -71.97,
      mainCrop: opts.crop ?? 'Quinua',
    },
  });
  const campaign = await (prisma as any).agroCampaign.create({
    data: {
      producerId: producer.id,
      crop: opts.crop ?? 'Quinua',
      season: '2026-A',
      harvestWeightKg: opts.harvestWeightKg ?? 0,
      harvestedAt: (opts.harvestWeightKg ?? 0) > 0 ? new Date() : null,
      status: (opts.harvestWeightKg ?? 0) > 0 ? 'Harvested' : 'Growing',
    },
  });
  return { merchantId: m.id, phoneNumber: m.phoneNumber, producerId: producer.id, campaignId: campaign.id };
}

let dniCounter = 10_000_000;
/** Genera un DNI único de 8 dígitos para evitar colisiones de @unique. */
export function uniqueDni(): string {
  dniCounter += 1;
  return String(dniCounter).slice(0, 8);
}
