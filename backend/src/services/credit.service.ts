import prisma from '../db';

export class CreditService {
  /**
   * Recalculates the alternative credit score for a merchant based on transaction velocity
   * and SaaS usage. This is the core "Blue Ocean" engine component.
   */
  static async calculateAlternativeScore(merchantId: number): Promise<number> {
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderMerchant: { id: merchantId } },
          { receiverMerchant: { id: merchantId } }
        ],
        status: 'Settled'
      },
      orderBy: { createdAt: 'desc' },
      include: { receiverMerchant: true }
    });

    const sales = await prisma.salesLedger.findMany({
      where: { product: { merchantId } }
    });

    // Score Algorithm (0 - 1000)
    let score = 300; // Base score for registration

    // 1. Transaction Volume (Monetary Value)
    const totalReceivedVolume = transactions
      .filter(tx => tx.receiverMerchant?.id === merchantId)
      .reduce((acc, tx) => acc + tx.amount, 0);
    
    if (totalReceivedVolume > 1000) score += 100;
    if (totalReceivedVolume > 5000) score += 200;

    // 2. Transaction Frequency
    if (transactions.length > 50) score += 100;
    if (transactions.length > 200) score += 150;

    // 3. SaaS Usage (Sales logged in ledger)
    if (sales.length > 20) score += 50;
    if (sales.length > 100) score += 100;

    // Cap score at 1000
    score = Math.min(score, 1000);

    // Update the credit line if it exists
    const creditLine = await prisma.creditLine.findUnique({ where: { merchantId } });
    if (creditLine) {
      // Dynamic limits: e.g. 10% of total volume or minimum 500 if score > 500
      let newLimit = creditLine.creditLimit;
      if (score > 500) {
        newLimit = Math.max(500, totalReceivedVolume * 0.10);
      }

      await prisma.creditLine.update({
        where: { id: creditLine.id },
        data: { 
          alternativeScore: score,
          creditLimit: newLimit,
          // Dynamic interest rate: higher score -> lower rate (from 45% TEA down to 15% TEA)
          interestRateEffective: Math.max(15, 45 - ((score - 300) / 700) * 30)
        }
      });
    }

    return score;
  }

  /**
   * Deducts an installment from incoming sales (BNPL mechanics)
   */
  static async autoDeductInstallment(merchantId: number, incomingAmount: number) {
    const creditLine = await prisma.creditLine.findUnique({
      where: { merchantId },
      include: { installments: { where: { status: 'Unpaid' }, orderBy: { dueDate: 'asc' } } }
    });

    if (!creditLine || creditLine.installments.length === 0) return 0;

    // Deduct 10% of incoming transaction to pay off loan automatically
    const deduction = incomingAmount * 0.10;
    
    // In a real app, we'd apply this deduction to the installments and update balances here
    return deduction;
  }
}
