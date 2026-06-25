// ============================================================================
// Yunta-Agro — Solución 7: Identidad digital del productor agrario (PPA completo).
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// El Padrón de Productores Agrarios (>2.1M registros georreferenciados) es la
// capa de identidad soberana. Este servicio formaliza la INGESTA de las variables
// georreferenciadas: parcelas con GPS, tenencia, superficie verificada e ID de
// AgroDigital. Hoy se persiste en Postgres con un identityHash (SHA-256) como
// precursor de una Credencial Verificable (VC) en la Fase 3 (SSI).
//
// Construido sobre MidagriService (consulta por DNI). Cuando exista convenio con
// MIDAGRI, el modo 'live' del MidagriService entrega los datos reales y este
// servicio los estructura igual.
// ============================================================================
import crypto from 'crypto';
import prisma from '../db';
import { MidagriService } from './midagri.service';

export interface ParcelInput {
  parcelCode: string; hectares: number; gpsLat: number; gpsLng: number;
  district?: string; province?: string; region?: string; landTenure?: string;
}

export class PpaService {
  /**
   * Ingesta la identidad georreferenciada de un productor desde el PPA y la
   * persiste (perfil + parcelas). Calcula superficie verificada e identityHash.
   * Idempotente: re-ingestar actualiza el perfil y reconcilia las parcelas.
   */
  static async ingestIdentity(producerId: number, parcelsOverride?: ParcelInput[]) {
    const producer = await prisma.producerProfile.findUnique({ where: { id: producerId } });
    if (!producer) throw new Error('Productor no encontrado');

    const ppa = await MidagriService.lookupPadron(producer.dni);
    if (!ppa.exists) {
      // No está en el padrón: marca no verificado y no inventa parcelas.
      await prisma.producerProfile.update({
        where: { id: producerId },
        data: { ppaVerified: false, ppaIngestedAt: new Date() },
      });
      return { ppaVerified: false, parcels: 0, verifiedHectares: 0 };
    }

    // Parcelas: las provistas, o una derivada del padrón (caso 1 parcela principal).
    const parcels: ParcelInput[] = parcelsOverride ?? this.deriveParcelsFromPadron(producer, ppa);
    const verifiedHectares = Math.round(parcels.reduce((a, p) => a + p.hectares, 0) * 100) / 100;

    // Snapshot de identidad → SHA-256 (precursor de la VC/SSI de Fase 3).
    const agroDigitalId = ppa.ppaCode ? `AGD-${ppa.ppaCode}` : `AGD-${producer.dni}`;
    const identityHash = this.hashIdentity({
      dni: producer.dni, agroDigitalId, ppaCode: ppa.ppaCode,
      hectares: verifiedHectares, parcels: parcels.map(p => p.parcelCode).sort(),
    });

    // Persistencia transaccional: perfil + parcelas reconciliadas.
    await prisma.$transaction(async (tx) => {
      await tx.producerProfile.update({
        where: { id: producerId },
        data: {
          ppaVerified: true,
          ppaCode: ppa.ppaCode,
          region: ppa.region ?? producer.region,
          mainCrop: ppa.mainCrop ?? producer.mainCrop,
          hectares: verifiedHectares,
          verifiedHectares,
          legalParcelCount: parcels.length,
          agroDigitalId,
          identityHash,
          ppaIngestedAt: new Date(),
          gpsLat: parcels[0]?.gpsLat ?? producer.gpsLat,
          gpsLng: parcels[0]?.gpsLng ?? producer.gpsLng,
        },
      });
      // Reconciliación de parcelas (upsert por (producerId, parcelCode)).
      for (const p of parcels) {
        await tx.agroParcel.upsert({
          where: { producerId_parcelCode: { producerId, parcelCode: p.parcelCode } },
          create: {
            producerId, parcelCode: p.parcelCode, hectares: p.hectares,
            gpsLat: p.gpsLat, gpsLng: p.gpsLng,
            district: p.district, province: p.province, region: p.region ?? ppa.region,
            landTenure: p.landTenure ?? 'Owner',
          },
          update: {
            hectares: p.hectares, gpsLat: p.gpsLat, gpsLng: p.gpsLng,
            district: p.district, province: p.province, landTenure: p.landTenure ?? 'Owner',
          },
        });
      }
    });

    return { ppaVerified: true, agroDigitalId, identityHash, parcels: parcels.length, verifiedHectares };
  }

  /** ¿El productor tiene identidad PPA completa (requisito para microcrédito)? */
  static async hasVerifiedIdentity(producerId: number): Promise<boolean> {
    const p = await prisma.producerProfile.findUnique({
      where: { id: producerId },
      select: { ppaVerified: true, agroDigitalId: true },
    });
    return Boolean(p?.ppaVerified && p.agroDigitalId);
  }

  /** Deriva una parcela principal del registro del padrón (cuando no hay catastro fino). */
  private static deriveParcelsFromPadron(
    producer: { gpsLat: number | null; gpsLng: number | null; region: string | null },
    ppa: { ppaCode?: string; hectares?: number; region?: string },
  ): ParcelInput[] {
    const lat = producer.gpsLat ?? -13.52;
    const lng = producer.gpsLng ?? -71.97;
    return [{
      parcelCode: `${ppa.ppaCode ?? 'PARCEL'}-01`,
      hectares: ppa.hectares ?? 1,
      gpsLat: lat, gpsLng: lng,
      region: ppa.region ?? producer.region ?? undefined,
      landTenure: 'Owner',
    }];
  }

  /** SHA-256 del snapshot de identidad (claves ordenadas → hash estable). */
  static hashIdentity(payload: Record<string, unknown>): string {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
}
