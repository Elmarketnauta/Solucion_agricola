import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = '+51910251455';
  const merchant = await prisma.merchantProfile.findUnique({
    where: { phoneNumber: phone }
  });

  if (!merchant) {
    console.error('Merchant not found');
    return;
  }

  await prisma.wallet.update({
    where: { merchantId: merchant.id },
    data: { balance: 10000000 }
  });

  console.log(`Balance for ${phone} updated to 10000000`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
