// Developed by Marketnauta
// ----------------------------------------------------------------------------
// globalSetup de Vitest: corre UNA vez antes de toda la suite.
// Provisiona el esquema en la base de datos de PRUEBAS de PostgreSQL (aislada de
// la de desarrollo), de forma que las pruebas de integración del ledger jamás
// tocan los datos reales. La BD de pruebas la levanta docker-compose en el
// puerto 5433 (servicio `postgres-test`).
// ----------------------------------------------------------------------------
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// URL de la BD de pruebas. Por defecto apunta al Postgres de pruebas de docker
// (puerto 5433). Se puede sobreescribir con TEST_DATABASE_URL en CI.
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://yunta:yunta_dev_password@localhost:5433/yunta_test?schema=public';

export default async function globalSetup() {
  // Sincroniza el esquema con la BD de pruebas vía `prisma db push` (rápido,
  // sin generar archivos de migración). Resetea para arrancar siempre limpio.
  // Pasamos DATABASE_URL solo a este subproceso.
  //
  // Si la BD de pruebas no está disponible (ej. Docker apagado), NO abortamos:
  // las pruebas de lógica pura (sin BD) deben poder correr igual. Las pruebas de
  // integración fallarán por su cuenta con un error claro de conexión.
  try {
    execSync('npx prisma db push --force-reset --skip-generate --accept-data-loss', {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: 'inherit',
    });
  } catch {
    console.warn(
      '\n⚠️  No se pudo provisionar la BD de pruebas (¿Docker apagado?). ' +
      'Las pruebas de integración fallarán; las de lógica pura corren igual.\n'
    );
  }

  // No hay teardown de archivos: la BD de pruebas es un contenedor efímero
  // (sin volumen) que se descarta con `docker compose down`.
  return async () => {};
}
