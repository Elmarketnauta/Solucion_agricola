import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Yunta...');

  const pin = await bcrypt.hash('1234', 10);

  const rosa = await prisma.merchantProfile.upsert({
    where: { phoneNumber: '+51999888777' },
    update: { pin },
    create: {
      businessName: 'Bodega Doña Rosa',
      ownerName: 'Rosa Pérez',
      phoneNumber: '+51999888777',
      ruc: '10445566778',
      pin,
      wallet: { create: { balance: 150 } },
      creditLine: { create: { creditLimit: 500, interestRateEffective: 15.5 } }
    }
  });
  console.log('Doña Rosa created:', rosa.id);

  const amigo = await prisma.merchantProfile.upsert({
    where: { phoneNumber: '+51910251455' },
    update: { pin },
    create: {
      businessName: 'Bodega El Amigo',
      ownerName: 'Juan Carlos',
      phoneNumber: '+51910251455',
      pin,
      wallet: { create: { balance: 10000000 } },
      creditLine: { create: { creditLimit: 500, interestRateEffective: 15.5 } }
    }
  });
  console.log('El Amigo created:', amigo.id);

  // Create a sample transaction
  const crypto = await import('crypto');
  await prisma.transaction.create({
    data: {
      txSignature: crypto.createHash('sha256').update('seed-tx-1').digest('hex'),
      senderPhone: null,
      receiverPhone: '+51999888777',
      amount: 150,
      type: 'P2B',
      interoperableSource: 'Yape',
      status: 'Settled',
      settledAt: new Date()
    }
  }).catch(() => console.log('Sample tx already exists'));

  console.log('✅ Seed complete. All PINs: 1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
