// ============================================================================
// Yunta-Agro — Solución 8: Billeteras offline (sincronización USSD/Mesh).
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Procesa LOTES de transacciones firmadas offline que llegan cuando el celular
// recupera señal (o vía puente SMS/USSD). Cada transacción trae:
//   - idempotencyKey: ancla anti doble-gasto (único en OfflineSignedTx).
//   - nonce: contador monótono por productor (evita replays / reordenamientos).
//   - signature: HMAC del payload con el secreto del dispositivo (simula la firma
//     de la llave offline; en Fase 3 será una firma de clave del wallet/SSI).
//   - expiresAt: ventana de validez (rechaza transacciones caducadas).
//
// Validación por transacción, persistencia del recibo (OfflineSignedTx) y
// liquidación en el ledger atómico. El procesamiento en lote es resiliente: una
// transacción inválida no aborta las demás.
// ============================================================================
import crypto from 'crypto';
import prisma from '../db';
import { LedgerService } from './ledger.service';

export interface OfflineTxInput {
  idempotencyKey: string;
  producerPhone: string;
  receiverPhone: string;
  amount: number;
  nonce: number;
  signature: string;
  expiresAt: string; // ISO
  receivedVia?: 'Sync' | 'USSD' | 'MeshBLE';
}

export interface OfflineSyncResult {
  received: number;
  settled: number;
  rejected: { idempotencyKey: string; reason: string }[];
  duplicates: number;
}

export class OfflineService {
  /** Procesa un lote de transacciones offline. Resiliente: aísla fallos por tx. */
  static async syncBatch(txs: OfflineTxInput[]): Promise<OfflineSyncResult> {
    if (!Array.isArray(txs) || txs.length === 0) {
      throw new Error('Se esperaba un lote de transacciones no vacío');
    }
    const result: OfflineSyncResult = { received: txs.length, settled: 0, rejected: [], duplicates: 0 };

    for (const tx of txs) {
      try {
        const outcome = await this.processOne(tx);
        if (outcome === 'settled') result.settled += 1;
        else if (outcome === 'duplicate') result.duplicates += 1;
      } catch (err: any) {
        result.rejected.push({ idempotencyKey: tx.idempotencyKey, reason: err.message });
        await this.recordRejection(tx, err.message).catch(() => {});
      }
    }
    return result;
  }

  /** Valida y liquida UNA transacción offline. Devuelve 'settled' | 'duplicate'. */
  private static async processOne(tx: OfflineTxInput): Promise<'settled' | 'duplicate'> {
    // 1. Idempotencia: ¿ya recibimos esta tx? (anti doble-gasto entre sincronizaciones)
    const existing = await prisma.offlineSignedTx.findUnique({
      where: { idempotencyKey: tx.idempotencyKey },
    });
    if (existing) return 'duplicate';

    // 2. Validación de expiración (ventana de validez de la firma offline).
    const expiresAt = new Date(tx.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new Error('expiresAt inválido');
    if (expiresAt.getTime() < Date.now()) {
      await this.persist(tx, 'Rejected_Expired');
      throw new Error('Transacción caducada');
    }

    // 3. Validación de firma (HMAC del payload con el secreto del dispositivo).
    if (!this.verifySignature(tx)) {
      await this.persist(tx, 'Rejected_Signature');
      throw new Error('Firma inválida');
    }

    // 4. Validación de nonce monótono (anti-replay): el nonce debe ser mayor que
    //    el último liquidado para ese productor.
    const lastNonce = await this.lastSettledNonce(tx.producerPhone);
    if (tx.nonce <= lastNonce) {
      await this.persist(tx, 'Rejected_Signature');
      throw new Error(`Nonce ${tx.nonce} <= último liquidado ${lastNonce} (replay)`);
    }

    if (tx.amount <= 0) {
      await this.persist(tx, 'Rejected_Signature');
      throw new Error('Monto inválido');
    }

    // 5. Persistir el recibo (gana el @unique de idempotencyKey ante carreras) y
    //    liquidar en el ledger atómico (su propia idempotencia por txSignature).
    const receipt = await this.persist(tx, 'Pending');
    await LedgerService.processInternalPayment(
      tx.producerPhone, tx.receiverPhone, tx.amount, `OFFLINE_${tx.idempotencyKey}`,
    );
    await prisma.offlineSignedTx.update({
      where: { id: receipt.id }, data: { status: 'Settled', settledAt: new Date() },
    });
    return 'settled';
  }

  /** Último nonce de una tx LIQUIDADA para el productor (0 si no hay). */
  private static async lastSettledNonce(producerPhone: string): Promise<number> {
    const last = await prisma.offlineSignedTx.findFirst({
      where: { producerPhone, status: 'Settled' },
      orderBy: { nonce: 'desc' }, select: { nonce: true },
    });
    return last?.nonce ?? 0;
  }

  /** Verifica el HMAC del payload canónico con el secreto del dispositivo offline. */
  static verifySignature(tx: OfflineTxInput): boolean {
    const secret = process.env.OFFLINE_DEVICE_SECRET;
    if (!secret) return false;
    const expected = this.signPayload(tx, secret);
    const a = Buffer.from(tx.signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** Firma canónica del payload (utilidad para simular el dispositivo en pruebas). */
  static signPayload(tx: OfflineTxInput, secret = process.env.OFFLINE_DEVICE_SECRET ?? ''): string {
    const canonical = `${tx.idempotencyKey}|${tx.producerPhone}|${tx.receiverPhone}|${tx.amount}|${tx.nonce}|${tx.expiresAt}`;
    return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  }

  private static async persist(tx: OfflineTxInput, status: string) {
    return prisma.offlineSignedTx.upsert({
      where: { idempotencyKey: tx.idempotencyKey },
      create: {
        idempotencyKey: tx.idempotencyKey,
        producerPhone: tx.producerPhone,
        payload: JSON.stringify({ receiverPhone: tx.receiverPhone, amount: tx.amount }),
        signature: tx.signature,
        nonce: tx.nonce,
        expiresAt: new Date(tx.expiresAt),
        receivedVia: tx.receivedVia ?? 'Sync',
        status,
      },
      update: { status },
    });
  }

  private static async recordRejection(tx: OfflineTxInput, _reason: string) {
    // El recibo de rechazo ya se persiste en processOne; este es un fallback para
    // errores tempranos (ej. expiresAt inválido) que no alcanzaron a persistir.
    const exists = await prisma.offlineSignedTx.findUnique({ where: { idempotencyKey: tx.idempotencyKey } });
    if (!exists && tx.idempotencyKey) {
      await this.persist(tx, 'Rejected_Signature').catch(() => {});
    }
  }
}
