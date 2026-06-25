// Developed by Marketnauta
// ============================================================================
// Pruebas de la blocklist de JWT PERSISTENTE (P0-3). El caso de oro: la
// revocación debe SOBREVIVIR a un reinicio del servidor — antes (en memoria) se
// perdía. Aquí se simula el reinicio recargando el caché desde la BD.
// ============================================================================
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../src/db';
import { revoke, isRevoked, loadCache, purgeExpired } from '../src/middleware/blocklist';

const future = () => new Date(Date.now() + 7 * 864e5);
const past = () => new Date(Date.now() - 1000);

beforeEach(async () => {
  await prisma.revokedToken.deleteMany();
  await loadCache(); // arranca con caché limpio
});
afterAll(async () => { await prisma.$disconnect(); });

describe('Blocklist JWT persistente', () => {
  it('un JTI revocado se detecta como revocado', async () => {
    await revoke('jti-1', future());
    expect(await isRevoked('jti-1')).toBe(true);
    expect(await isRevoked('jti-desconocido')).toBe(false);
  });

  it('CASO DE ORO: la revocación SOBREVIVE a un reinicio (recarga de caché)', async () => {
    await revoke('jti-persistente', future());
    expect(await isRevoked('jti-persistente')).toBe(true);

    // Simula reinicio del servidor: el caché en memoria se pierde y se rehidrata
    // desde la BD (la fuente de verdad persistente).
    await loadCache();

    // Antes (Set en memoria) esto habría dado false → token reactivado. Ahora:
    expect(await isRevoked('jti-persistente')).toBe(true);
  });

  it('revoke es idempotente (revocar dos veces no falla)', async () => {
    await revoke('jti-dup', future());
    await expect(revoke('jti-dup', future())).resolves.toBeUndefined();
    const count = await prisma.revokedToken.count({ where: { jti: 'jti-dup' } });
    expect(count).toBe(1);
  });

  it('loadCache hidrata solo los JTIs aún vigentes (no los expirados)', async () => {
    await prisma.revokedToken.create({ data: { jti: 'jti-vivo', expiresAt: future() } });
    await prisma.revokedToken.create({ data: { jti: 'jti-muerto', expiresAt: past() } });
    const loaded = await loadCache();
    expect(loaded).toBe(1); // solo el vigente
    expect(await isRevoked('jti-vivo')).toBe(true);
  });

  it('purgeExpired elimina los JTIs cuyo JWT ya expiró', async () => {
    await prisma.revokedToken.create({ data: { jti: 'a', expiresAt: future() } });
    await prisma.revokedToken.create({ data: { jti: 'b', expiresAt: past() } });
    await prisma.revokedToken.create({ data: { jti: 'c', expiresAt: past() } });
    const purged = await purgeExpired();
    expect(purged).toBe(2);
    expect(await prisma.revokedToken.count()).toBe(1);
  });
});
