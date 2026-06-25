// ============================================================================
// Yunta-Agro — Solución 6: Infraestructura de inclusión financiera rural (TAPP).
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// TAPP es el riel de pagos interoperables del BCRP (modelo UPI de India). Este
// servicio simula la RECEPCIÓN de fondos gubernamentales (Fertiabono, etc.) y los
// liquida en la billetera del agricultor usando el ledger atómico del MVP.
//
// Autenticación: firma HMAC-SHA256 sobre el payload con un secreto compartido con
// el BCRP (simulado). Idempotencia: `bcrpReference` es único → un reenvío del BCRP
// no paga dos veces. La liquidación reutiliza processIncomingInteroperablePayment,
// el mismo camino atómico anti-doble-gasto que un cobro Yape/Plin.
//
// MIGRACIÓN: cuando TAPP exponga su API real, solo cambia la fuente del webhook;
// la verificación HMAC y la liquidación fiat permanecen idénticas.
// ============================================================================
import crypto from 'crypto';
import prisma from '../db';
import { LedgerService } from './ledger.service';

export interface TappDisbursementPayload {
  programCode: string;       // FERTIABONO, AGROIDEAS…
  beneficiaryPhone: string;  // teléfono del productor
  beneficiaryDni?: string;   // DNI (conciliación con PPA)
  amount: number;            // soles
  bcrpReference: string;     // referencia única del BCRP (ancla de idempotencia)
}

export class TappService {
  /**
   * Verifica la firma HMAC-SHA256 del payload con el secreto compartido del BCRP.
   * Comparación en tiempo constante para evitar timing attacks.
   */
  static verifySignature(rawBody: string, signature: string | undefined): boolean {
    const secret = process.env.TAPP_BCRP_SECRET;
    if (!secret || !signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Liquida un desembolso de subsidio gubernamental en la billetera del productor.
   * Idempotente por `bcrpReference`. Devuelve el registro y la transacción del ledger.
   */
  static async disburseSubsidy(payload: TappDisbursementPayload) {
    if (payload.amount <= 0) throw new Error('El monto del subsidio debe ser positivo');

    // Idempotencia: si ya procesamos esta referencia del BCRP, no repetir.
    const existing = await prisma.govSubsidyDisbursement.findUnique({
      where: { bcrpReference: payload.bcrpReference },
    });
    if (existing) {
      return { alreadyProcessed: true, disbursementId: existing.id, ledgerTxId: existing.ledgerTxId };
    }

    // Verifica que el beneficiario exista (billetera destino).
    const beneficiary = await prisma.merchantProfile.findUnique({
      where: { phoneNumber: payload.beneficiaryPhone },
      include: { wallet: true },
    });
    if (!beneficiary || !beneficiary.wallet) {
      throw new Error('Beneficiario no encontrado');
    }

    // Liquidación atómica vía ledger. La firma `TAPP_<ref>` es única → si el pago
    // ya existe, el @unique de txSignature lo bloquea (doble protección con bcrpRef).
    const tx = await LedgerService.processIncomingInteroperablePayment(
      payload.beneficiaryPhone,
      payload.amount,
      `TAPP_${payload.programCode}`,    // interoperableSource
      `TAPP_${payload.bcrpReference}`,  // txSignature única
    );

    const record = await prisma.govSubsidyDisbursement.create({
      data: {
        programCode: payload.programCode,
        beneficiaryPhone: payload.beneficiaryPhone,
        beneficiaryDni: payload.beneficiaryDni,
        amount: payload.amount,
        rail: 'TAPP',
        bcrpReference: payload.bcrpReference,
        status: 'Settled',
        ledgerTxId: tx.id,
      },
    });

    console.log(`[TAPP] ${payload.programCode}: S/ ${payload.amount.toFixed(2)} liquidados a ${payload.beneficiaryPhone} (ref ${payload.bcrpReference}, tx ${tx.id})`);
    return { alreadyProcessed: false, disbursementId: record.id, ledgerTxId: tx.id };
  }

  /** Genera una firma HMAC para un payload (utilidad para pruebas/simulación). */
  static signPayload(rawBody: string): string {
    const secret = process.env.TAPP_BCRP_SECRET ?? '';
    return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  }
}
