// Developed by Marketnauta
// ============================================================================
// Pruebas del LEDGER — el núcleo que mueve dinero. Son las pruebas de mayor
// valor del proyecto: si algo aquí falla, el negocio falla (dinero duplicado,
// saldos negativos, doble cobro). Corren contra una BD SQLite de pruebas aislada.
// ============================================================================
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { LedgerService } from '../src/services/ledger.service';
import prisma from '../src/db';
import { createMerchant, balanceOf, resetDb, uniquePhone } from './helpers';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('LedgerService.processInternalPayment — transferencia P2P', () => {
  it('mueve el dinero correctamente cuando hay saldo suficiente', async () => {
    const rosa = await createMerchant({ balance: 100, businessName: 'Doña Rosa' });
    const amigo = await createMerchant({ balance: 0, businessName: 'El Amigo' });

    await LedgerService.processInternalPayment(rosa.phoneNumber, amigo.phoneNumber, 30, 'k1');

    expect(await balanceOf(rosa.phoneNumber)).toBe(70);
    expect(await balanceOf(amigo.phoneNumber)).toBe(30);
  });

  // EL caso de oro: "Doña Rosa tiene S/10 e intenta enviar S/15 -> rechazado".
  it('RECHAZA el pago si el saldo es insuficiente y NO altera ningún saldo', async () => {
    const rosa = await createMerchant({ balance: 10, businessName: 'Doña Rosa' });
    const amigo = await createMerchant({ balance: 5, businessName: 'El Amigo' });

    await expect(
      LedgerService.processInternalPayment(rosa.phoneNumber, amigo.phoneNumber, 15, 'k2')
    ).rejects.toThrow(/insufficient funds|sender not found/i);

    // Atomicidad: ningún saldo se movió.
    expect(await balanceOf(rosa.phoneNumber)).toBe(10);
    expect(await balanceOf(amigo.phoneNumber)).toBe(5);
    // Y no quedó ninguna transacción huérfana.
    expect(await prisma.transaction.count()).toBe(0);
  });

  it('permite gastar exactamente todo el saldo (límite gte, no gt)', async () => {
    const rosa = await createMerchant({ balance: 50 });
    const amigo = await createMerchant({ balance: 0 });

    await LedgerService.processInternalPayment(rosa.phoneNumber, amigo.phoneNumber, 50, 'k3');

    expect(await balanceOf(rosa.phoneNumber)).toBe(0);
    expect(await balanceOf(amigo.phoneNumber)).toBe(50);
  });

  it('IDEMPOTENCIA: un retry con la misma clave NO cobra dos veces', async () => {
    const rosa = await createMerchant({ balance: 100 });
    const amigo = await createMerchant({ balance: 0 });

    // Primer pago: OK.
    await LedgerService.processInternalPayment(rosa.phoneNumber, amigo.phoneNumber, 40, 'same-key');
    // Reintento exacto (doble-tap, reenvío de red): debe fallar por txSignature @unique.
    await expect(
      LedgerService.processInternalPayment(rosa.phoneNumber, amigo.phoneNumber, 40, 'same-key')
    ).rejects.toThrow();

    // El dinero se movió UNA sola vez.
    expect(await balanceOf(rosa.phoneNumber)).toBe(60);
    expect(await balanceOf(amigo.phoneNumber)).toBe(40);
    expect(await prisma.transaction.count()).toBe(1);
  });

  it('ANTI DOBLE-GASTO concurrente: dos pagos simultáneos no sobregiran el saldo', async () => {
    // Rosa tiene 50; lanza DOS pagos de 40 a la vez. Solo uno debe pasar.
    const rosa = await createMerchant({ balance: 50 });
    const a = await createMerchant({ balance: 0 });
    const b = await createMerchant({ balance: 0 });

    const results = await Promise.allSettled([
      LedgerService.processInternalPayment(rosa.phoneNumber, a.phoneNumber, 40, 'race-A'),
      LedgerService.processInternalPayment(rosa.phoneNumber, b.phoneNumber, 40, 'race-B'),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled').length;
    expect(fulfilled).toBe(1); // exactamente uno gana

    // El saldo nunca quedó negativo: pasó 50 - 40 = 10.
    const remaining = await balanceOf(rosa.phoneNumber);
    expect(remaining).toBe(10);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });

  it('rechaza transferirse a uno mismo', async () => {
    const rosa = await createMerchant({ balance: 100 });
    await expect(
      LedgerService.processInternalPayment(rosa.phoneNumber, rosa.phoneNumber, 10, 'k4')
    ).rejects.toThrow(/ti mismo/i);
  });

  it('respeta el monto mínimo (S/ 0.10) y máximo (S/ 10,000)', async () => {
    const rosa = await createMerchant({ balance: 100000 });
    const amigo = await createMerchant({ balance: 0 });

    await expect(
      LedgerService.processInternalPayment(rosa.phoneNumber, amigo.phoneNumber, 0.05, 'k5')
    ).rejects.toThrow(/mínimo/i);

    await expect(
      LedgerService.processInternalPayment(rosa.phoneNumber, amigo.phoneNumber, 10000.01, 'k6')
    ).rejects.toThrow(/máximo/i);
  });

  it('falla si el destinatario no existe (sin tocar el saldo del emisor)', async () => {
    const rosa = await createMerchant({ balance: 100 });
    await expect(
      LedgerService.processInternalPayment(rosa.phoneNumber, uniquePhone(), 10, 'k7')
    ).rejects.toThrow(/receiver not found/i);
    expect(await balanceOf(rosa.phoneNumber)).toBe(100);
  });
});

describe('LedgerService.processIncomingInteroperablePayment — cobro Yape/Plin', () => {
  it('acredita el monto al receptor y registra la transacción', async () => {
    const rosa = await createMerchant({ balance: 20 });

    await LedgerService.processIncomingInteroperablePayment(
      rosa.phoneNumber, 80, 'Yape', 'YAPE_TX_001'
    );

    expect(await balanceOf(rosa.phoneNumber)).toBe(100);
    const tx = await prisma.transaction.findUnique({ where: { txSignature: 'YAPE_TX_001' } });
    expect(tx?.type).toBe('P2B');
    expect(tx?.interoperableSource).toBe('Yape');
  });

  it('IDEMPOTENCIA: un webhook reenviado con el mismo txId no acredita dos veces', async () => {
    const rosa = await createMerchant({ balance: 0 });

    await LedgerService.processIncomingInteroperablePayment(rosa.phoneNumber, 50, 'Plin', 'DUP_TX');
    await expect(
      LedgerService.processIncomingInteroperablePayment(rosa.phoneNumber, 50, 'Plin', 'DUP_TX')
    ).rejects.toThrow();

    expect(await balanceOf(rosa.phoneNumber)).toBe(50); // una sola vez
    expect(await prisma.transaction.count()).toBe(1);
  });

  it('rechaza montos no positivos', async () => {
    const rosa = await createMerchant({ balance: 0 });
    await expect(
      LedgerService.processIncomingInteroperablePayment(rosa.phoneNumber, 0, 'Yape', 'ZERO')
    ).rejects.toThrow(/positive/i);
  });
});
