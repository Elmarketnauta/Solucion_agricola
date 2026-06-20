import prisma from '../db';
import { LedgerService } from './ledger.service';
import { CreditService } from './credit.service';

export class InteroperabilityService {
  static async handleIncomingWebhook(payload: {
    amount: number;
    destinationPhone: string;
    sourceApp: string;
    cceSignature: string;
  }) {
    console.log(`[BCRP Webhook] Incoming ${payload.amount} PEN from ${payload.sourceApp} to ${payload.destinationPhone}`);

    const tx = await LedgerService.processIncomingInteroperablePayment(
      payload.destinationPhone,
      payload.amount,
      payload.sourceApp,
      payload.cceSignature
    );

    const receiver = await prisma.merchantProfile.findUnique({
      where: { phoneNumber: payload.destinationPhone }
    });

    if (tx && receiver) {
      await CreditService.autoDeductInstallment(receiver.id, payload.amount);
      CreditService.calculateAlternativeScore(receiver.id).catch(console.error);
    }

    return { status: 'Success', txId: tx.id };
  }
}
