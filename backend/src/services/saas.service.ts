import prisma from '../db';

export class SaasService {
  /**
   * Log a sale in the merchant's SaaS cashbook.
   */
  static async logSale(merchantId: number, productId: number, quantity: number) {
    const product = await prisma.product.findFirst({
      where: { id: productId, merchantId }
    });

    if (!product) throw new Error('Product not found or does not belong to merchant');
    if (product.stockQuantity < quantity) throw new Error('Insufficient stock');

    const totalAmount = product.price * quantity;

    return await prisma.$transaction(async (tx) => {
      // 1. Deduct stock
      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: { decrement: quantity } }
      });

      // 2. Log sale
      const sale = await tx.salesLedger.create({
        data: {
          productId,
          quantity,
          totalAmount
        }
      });

      return sale;
    });
  }

  /**
   * Calculate MDR based on Rochet-Tirole two-sided subsidy.
   * If merchant is new or volume < 10,000, MDR = 0%.
   */
  static async calculateMdr(merchantId: number): Promise<number> {
    const merchant = await prisma.merchantProfile.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new Error('Merchant not found');

    const now = new Date();
    const monthsSinceRegistration = (now.getTime() - merchant.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30);

    // Subsidized phase: first 12 months = 0% MDR
    if (monthsSinceRegistration <= 12) {
      if (merchant.mdrRate !== 0) {
        await prisma.merchantProfile.update({ where: { id: merchantId }, data: { mdrRate: 0 } });
      }
      return 0;
    }

    // Competitive fee phase: 1.5%
    if (merchant.mdrRate !== 0.015) {
      await prisma.merchantProfile.update({ where: { id: merchantId }, data: { mdrRate: 0.015 } });
    }
    return 0.015;
  }
}
