import prisma from '../db';

export class LedgerService {
  /**
   * Process an internal P2P or P2B payment within Yunta
   */
  static async processInternalPayment(senderPhone: string, receiverPhone: string, amount: number, idempotencyKey: string) {
    if (senderPhone === receiverPhone) throw new Error('No puedes transferirte a ti mismo');
    if (amount < 0.10) throw new Error('El monto mínimo es S/ 0.10');
    if (amount > 10000) throw new Error('El monto máximo es S/ 10,000.00');
    if (amount <= 0) throw new Error('Amount must be positive');

    // Idempotency anchor: the client-supplied key IS the unique signature.
    // A retry / double-tap reuses the same key -> hits the txSignature @unique
    // constraint (P2002) and the whole $transaction rolls back atomically.
    const txSignature = `INTERNAL_${idempotencyKey}`;

    return await prisma.$transaction(async (tx) => {
      // 1. Resolve sender and receiver ids (no balance read here — see step 3)
      const sender = await tx.merchantProfile.findUnique({
        where: { phoneNumber: senderPhone },
        select: { id: true }
      });
      if (!sender) throw new Error('Insufficient funds or sender not found');

      const receiver = await tx.merchantProfile.findUnique({
        where: { phoneNumber: receiverPhone },
        select: { id: true }
      });
      if (!receiver) throw new Error('Receiver not found');

      // 2. Create transaction record FIRST — the @unique txSignature is the
      //    idempotency gate. A duplicate key fails fast before touching balances.
      const transaction = await tx.transaction.create({
        data: {
          txSignature,
          senderPhone,
          receiverPhone,
          amount,
          fee: 0,
          type: 'P2P',
          interoperableSource: 'Yunta_Internal',
          status: 'Settled',
          settledAt: new Date()
        }
      });

      // 3. ATOMIC conditional debit — only succeeds if balance >= amount in the
      //    same statement. Eliminates the read-then-write race and guarantees
      //    the balance can never go negative (no SELECT ... FOR UPDATE needed).
      const debited = await tx.wallet.updateMany({
        where: { merchantId: sender.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } }
      });
      if (debited.count === 0) throw new Error('Insufficient funds or sender not found');

      // 4. Credit receiver
      await tx.wallet.update({
        where: { merchantId: receiver.id },
        data: { balance: { increment: amount } }
      });

      return transaction;
    });
  }

  /**
   * Process incoming interoperable payment (from Yape/Plin via BCRP/TAPP)
   */
  static async processIncomingInteroperablePayment(receiverPhone: string, amount: number, source: string, externalTxId: string) {
    if (amount <= 0) throw new Error('Amount must be positive');

    return await prisma.$transaction(async (tx) => {
      const receiver = await tx.merchantProfile.findUnique({
        where: { phoneNumber: receiverPhone },
        include: { wallet: true }
      });

      if (!receiver || !receiver.wallet) {
        throw new Error('Receiver not found');
      }

      // 1. Add to receiver
      await tx.wallet.update({
        where: { merchantId: receiver.id },
        data: { balance: { increment: amount } }
      });

      // 2. Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          txSignature: externalTxId, // The CCE/TAPP signature
          receiverPhone,
          amount,
          fee: receiver.mdrRate > 0 ? amount * receiver.mdrRate : 0,
          type: 'P2B',
          interoperableSource: source,
          status: 'Settled',
          settledAt: new Date()
        }
      });

      return transaction;
    });
  }
}
