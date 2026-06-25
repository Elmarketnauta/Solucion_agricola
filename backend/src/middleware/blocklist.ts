// Developed by Marketnauta
// ============================================================================
// Blocklist de JTIs (JWT revocados en logout) — PERSISTENTE en PostgreSQL.
// ----------------------------------------------------------------------------
// Corrige el riesgo P0-3: antes era un Set en memoria que se vaciaba al reiniciar
// el servidor, reactivando tokens que el usuario había cerrado. Ahora la
// revocación vive en la tabla RevokedToken y sobrevive a reinicios/deploys.
//
// Rendimiento: la verificación (isRevoked) corre en CADA request autenticada. Para
// no golpear la BD en el hot path, se mantiene un CACHÉ en memoria que:
//   - se hidrata al arrancar (loadCache) con los JTIs aún vigentes;
//   - se actualiza al revocar;
//   - es la fuente de lectura (la BD es la fuente de verdad/persistencia).
// El caché puede tener falsos negativos solo en una ventana mínima entre
// instancias (multi-proceso); para una sola instancia es exacto. En despliegues
// multi-instancia, refrescar el caché periódicamente o mover a Redis cierra esa
// ventana — ver nota al pie.
// ============================================================================
import prisma from '../db';

const cache = new Set<string>();
let hydrated = false;

/** Hidrata el caché desde la BD (JTIs aún no expirados). Llamar en el bootstrap. */
export async function loadCache(): Promise<number> {
  const rows = await prisma.revokedToken.findMany({
    where: { expiresAt: { gt: new Date() } },
    select: { jti: true },
  });
  cache.clear();
  for (const r of rows) cache.add(r.jti);
  hydrated = true;
  return cache.size;
}

/**
 * Revoca un JTI hasta su expiración. Idempotente (upsert): revocar dos veces no
 * falla. Persiste en BD y refleja en el caché.
 */
export async function revoke(jti: string, expiresAt: Date): Promise<void> {
  await prisma.revokedToken.upsert({
    where: { jti },
    create: { jti, expiresAt },
    update: { expiresAt },
  });
  cache.add(jti);
}

/**
 * ¿El JTI está revocado? Lee del caché (rápido). Si el caché aún no se hidrató
 * (arranque sin loadCache), cae a la BD para no dar falsos negativos.
 */
export async function isRevoked(jti: string): Promise<boolean> {
  if (cache.has(jti)) return true;
  if (hydrated) return false; // caché autoritativo para esta instancia
  const row = await prisma.revokedToken.findUnique({ where: { jti } });
  return row != null && row.expiresAt > new Date();
}

/** Purga JTIs ya expirados (su JWT no es válido por sí mismo). Devuelve cuántos. */
export async function purgeExpired(): Promise<number> {
  const res = await prisma.revokedToken.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  // Limpieza oportunista del caché (no crítica; loadCache lo rehace exacto).
  return res.count;
}
