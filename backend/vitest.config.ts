// Developed by Marketnauta
import { defineConfig } from 'vitest/config';

// Configuración de la suite de pruebas de Yunta.
// - Entorno node (es un backend Express/Prisma, no hay DOM).
// - globalSetup provisiona una BD SQLite de pruebas AISLADA (test.db) antes de
//   correr nada, de modo que las pruebas jamás tocan la BD de desarrollo.
// - Sin paralelismo entre archivos de integración: comparten la misma BD SQLite
//   y SQLite no maneja bien escrituras concurrentes desde varios procesos.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: ['./test/globalSetup.ts'],
    // SQLite es un archivo único: serializamos los archivos de prueba para
    // evitar contención de escritura entre suites de integración.
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
