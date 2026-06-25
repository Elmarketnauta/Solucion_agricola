// ============================================================================
// Yunta-Agro — Solución 5: Trazabilidad y certificación EUDR (relacional).
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// "Pasaporte digital" del lote SIN NFTs ni blockchain. Al cerrar la cosecha se
// toma un snapshot inmutable (GPS + PPA + campaña + producto) y se sella con un
// SHA-256 (vcHash). Cualquier alteración posterior de los datos rompería el hash
// → la inmutabilidad de un token on-chain, emulada en Postgres.
//
// El certUuid es el identificador público del pasaporte: un auditor (ej. un
// comprador europeo verificando EUDR / deforestación cero) lo consulta sin auth
// y recalcula el hash para confirmar que el lote no fue manipulado.
//
// MIGRACIÓN A WEB3: vcHash es exactamente lo que se anclará en LNET (campo
// chainTxHash). El "issue" off-chain de hoy se convierte en "mint + anchor"
// mañana; el payload certificado y su hash son idénticos.
// ============================================================================
import crypto from 'crypto';
import prisma from '../db';

export interface CertifyInput {
  campaignId: number;
  buyerRuc: string;
  taxYear: number;
  deductiblePct?: number;
}

export class CertificationService {
  /**
   * Emite el certificado/pasaporte de una campaña cosechada. Idempotente por
   * campaña (CertificationToken.campaignId es @unique).
   */
  static async issue(input: CertifyInput) {
    const campaign = await prisma.agroCampaign.findUnique({
      where: { id: input.campaignId },
      include: { producer: true },
    });
    if (!campaign) throw new Error('Campaña no encontrada');
    if (campaign.harvestWeightKg <= 0) {
      throw new Error('La campaña no tiene cosecha registrada (harvestWeightKg = 0)');
    }
    const producer = campaign.producer;
    if (!producer.ppaVerified) {
      throw new Error('El productor no está verificado en el PPA: no se puede certificar el origen');
    }

    const existing = await prisma.certificationToken.findUnique({
      where: { campaignId: input.campaignId },
    });
    if (existing) {
      return { alreadyIssued: true, ...this.toPassport(existing) };
    }

    // Snapshot canónico inmutable que se certifica.
    const payload = {
      campaignId: campaign.id,
      crop: campaign.crop,
      season: campaign.season,
      harvestWeightKg: campaign.harvestWeightKg,
      harvestedAt: campaign.harvestedAt?.toISOString() ?? null,
      producerDni: producer.dni,
      ppaCode: producer.ppaCode,
      gpsLat: producer.gpsLat,
      gpsLng: producer.gpsLng,
      region: producer.region,
      buyerRuc: input.buyerRuc,
      taxYear: input.taxYear,
    };
    const vcHash = this.hashPayload(payload);

    const token = await prisma.certificationToken.create({
      data: {
        campaignId: campaign.id,
        producerId: producer.id,
        productKg: campaign.harvestWeightKg,
        buyerRuc: input.buyerRuc,
        taxYear: input.taxYear,
        deductiblePct: input.deductiblePct ?? 0.25,
        vcHash,
        gpsLat: producer.gpsLat,
        gpsLng: producer.gpsLng,
        region: producer.region,
        cropType: campaign.crop,
        ppaCode: producer.ppaCode,
        certifiedPayload: JSON.stringify(payload),
        status: 'Issued',
      },
    });

    return { alreadyIssued: false, ...this.toPassport(token) };
  }

  /**
   * Verificación pública por certUuid (para auditores/compradores). Recalcula el
   * hash sobre el payload guardado y confirma que coincide con vcHash → prueba de
   * no-manipulación.
   */
  static async verifyByUuid(certUuid: string) {
    const token = await prisma.certificationToken.findUnique({
      where: { certUuid },
    });
    if (!token) return null;

    let tamperCheck: 'valid' | 'tampered' | 'unknown' = 'unknown';
    if (token.certifiedPayload) {
      const recomputed = this.hashPayload(JSON.parse(token.certifiedPayload));
      tamperCheck = recomputed === token.vcHash ? 'valid' : 'tampered';
    }

    return {
      certUuid: token.certUuid,
      vcHash: token.vcHash,
      integrity: tamperCheck, // 'valid' = el lote no fue manipulado
      anchoredOnChain: Boolean(token.chainTxHash),
      chainTxHash: token.chainTxHash,
      product: token.cropType,
      productKg: token.productKg,
      region: token.region,
      gps: token.gpsLat != null && token.gpsLng != null ? { lat: token.gpsLat, lng: token.gpsLng } : null,
      ppaCode: token.ppaCode,        // origen verificado en el Padrón
      buyerRuc: token.buyerRuc,
      taxYear: token.taxYear,
      issuedAt: token.issuedAt,
      status: token.status,
    };
  }

  /** SHA-256 hex del payload canónico (claves ordenadas para hash estable). */
  static hashPayload(payload: Record<string, unknown>): string {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  private static toPassport(token: { certUuid: string; vcHash: string; status: string; issuedAt: Date }) {
    return {
      certUuid: token.certUuid,
      vcHash: token.vcHash,
      status: token.status,
      issuedAt: token.issuedAt,
      // URL pública del pasaporte para el auditor (deforestación cero / EUDR).
      verifyUrl: `/api/agro/certification/${token.certUuid}`,
    };
  }
}
