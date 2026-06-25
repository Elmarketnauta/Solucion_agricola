// ============================================================================
// Yunta-Agro — Programador de tareas (node-cron). Capa Precursora off-chain.
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Orquesta los dos procesos diarios que simulan la descentralización:
//   1. Oráculo climático  → refresca OracleWeatherDataCache (Solución 2)
//   2. Motor paramétrico  → evalúa pólizas y liquida indemnizaciones (Solución 4)
//
// El orden importa: primero se actualiza el oráculo (fuente de verdad), luego el
// motor de seguros lo lee. Se puede deshabilitar con CRON_ENABLED=false (útil en
// tests o entornos donde el cron lo dispara un scheduler externo).
// ============================================================================
import cron from 'node-cron';
import { WeatherOracleService } from '../services/weatherOracle.service';
import { ParametricInsuranceService } from '../services/parametricInsurance.service';
import { purgeExpired } from '../middleware/blocklist';

const CRON_ENABLED = (process.env.CRON_ENABLED ?? 'true').toLowerCase() === 'true';
// Por defecto 06:00 (oráculo) y 06:15 (seguros), hora del servidor.
const ORACLE_CRON = process.env.ORACLE_CRON ?? '0 6 * * *';
const INSURANCE_CRON = process.env.INSURANCE_CRON ?? '15 6 * * *';
// Limpieza de JTIs expirados de la blocklist (diaria, 03:00).
const BLOCKLIST_PURGE_CRON = process.env.BLOCKLIST_PURGE_CRON ?? '0 3 * * *';

/** Ejecuta el ciclo completo una vez (oráculo → seguros). Reutilizable en tests. */
export async function runDailyAgroCycle(forDate: Date = new Date()) {
  const oracle = await WeatherOracleService.refreshAll(forDate);
  const insurance = await ParametricInsuranceService.evaluateActivePolicies(forDate);
  return { oracleReadings: oracle, insurance };
}

/** Registra los cron jobs. Se llama una vez en el bootstrap del servidor. */
export function startCronJobs() {
  if (!CRON_ENABLED) {
    console.log('ℹ️  Cron AgTech: deshabilitado (CRON_ENABLED=false).');
    return;
  }

  cron.schedule(ORACLE_CRON, async () => {
    try {
      const n = await WeatherOracleService.refreshAll();
      console.log(`[cron:oracle] ${n} lecturas climáticas refrescadas en el caché.`);
    } catch (e) {
      console.error('[cron:oracle] error:', e instanceof Error ? e.message : e);
    }
  });

  cron.schedule(INSURANCE_CRON, async () => {
    try {
      const r = await ParametricInsuranceService.evaluateActivePolicies();
      console.log(`[cron:insurance] evaluadas=${r.evaluated} disparadas=${r.triggered} pagadas=${r.paidOut.length}.`);
    } catch (e) {
      console.error('[cron:insurance] error:', e instanceof Error ? e.message : e);
    }
  });

  // Purga de la blocklist: elimina JTIs cuyo JWT ya expiró (no reintroduce el token).
  cron.schedule(BLOCKLIST_PURGE_CRON, async () => {
    try {
      const n = await purgeExpired();
      if (n > 0) console.log(`[cron:blocklist] ${n} token(s) revocado(s) expirado(s) purgado(s).`);
    } catch (e) {
      console.error('[cron:blocklist] error:', e instanceof Error ? e.message : e);
    }
  });

  console.log(`⏱️  Cron AgTech activo — oráculo: "${ORACLE_CRON}", seguros: "${INSURANCE_CRON}", purga blocklist: "${BLOCKLIST_PURGE_CRON}".`);
}
