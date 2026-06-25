# Capa Precursora AgTech (Web2 / off-chain)

> **Developed by Marketnauta**
> 5 soluciones agrotecnológicas implementadas en Node/Express/Prisma/node-cron,
> **sin Solidity, sin ethers, sin Web3** — diseñadas para que la migración a
> smart contracts (LNET) sea un reemplazo de implementación, no un rediseño.

## Las 5 soluciones

| # | Solución | Implementación | Archivos clave |
|---|---|---|---|
| 1 | **Telemetría IoT** | Endpoint de ingesta M2M en ráfaga + evaluación de umbrales → alertas | `telemetry.service.ts`, `POST /api/agro/telemetry/ingest` |
| 2 | **Oráculo climático centralizado** | Cron diario que cachea clima con hash de integridad | `weatherOracle.service.ts`, `cron/index.ts` |
| 3 | **Biofertilizantes / microbioma** | Bonus de score + descuento verde en la TCEA | `agroCredit.service.ts` (`scoreBioInputs`, `computeCreditCost`) |
| 4 | **Seguros paramétricos** | Cron diario que evalúa pólizas vs. oráculo y liquida con el ledger atómico | `parametricInsurance.service.ts` |
| 5 | **Trazabilidad EUDR** | Certificado con UUID + hash SHA-256 (sin NFT) + verificación pública | `certification.service.ts`, `/api/agro/certification/*` |

## Endpoints nuevos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/agro/telemetry/ingest` | API key dispositivo (`X-Device-Key`) | Ingesta de ráfagas IoT |
| GET | `/api/agro/telemetry/:campaignId/alerts` | JWT | Alertas activas (dashboard) |
| POST | `/api/agro/certification/issue` | JWT | Emite el pasaporte EUDR de una cosecha |
| GET | `/api/agro/certification/:certUuid` | **Pública** | Auditor verifica trazabilidad + integridad |
| POST | `/api/agro/ops/run-cycle` | API key ops (`X-Ops-Key`) | Dispara oráculo + seguros manualmente (demos) |

## Cómo cada pieza simula la descentralización

- **Oráculo (Sol. 2):** la tabla `OracleWeatherDataCache` es la "fuente de verdad
  inmutable". Cada lectura lleva un `payloadHash` (SHA-256); reescribirla cambia
  el hash → manipulación detectable. `@@unique(stationKey, date)` = un dato
  autoritativo por día, igual que un oráculo on-chain publica un valor por época.
- **Seguro paramétrico (Sol. 4):** separa **decisión** (¿se rompió el parámetro?)
  de **liquidación** (pago en soles). La decisión la toma hoy el servicio; mañana,
  el contrato. La liquidación SIEMPRE es off-chain (fiat) vía el ledger atómico,
  con `txSignature = INSURANCE_<policyId>` como garantía anti-doble-pago.
- **Certificación (Sol. 5):** `vcHash` (SHA-256 del snapshot GPS+PPA+cosecha) imita
  la inmutabilidad de un token. El `certUuid` es el "id del pasaporte" público.
  Hoy se emite off-chain; mañana ese mismo `vcHash` se ancla en LNET (`chainTxHash`).

## Ruta de migración a Smart Contracts (cuando LNET entregue accesos)

La arquitectura está diseñada como **adaptador**: el "qué" (interfaz, datos,
hashes) ya es el definitivo; solo cambia el "dónde se ejecuta".

| Pieza Web2 (hoy) | Equivalente Web3 (Fase 3) | Qué se reutiliza sin cambios |
|---|---|---|
| `WeatherOracleService` (cron feeder) | Oráculo descentralizado (Chainlink) | La interfaz `getWeatherForDate` y el `payloadHash` |
| `ParametricInsuranceService.checkTrigger` | Lógica del contrato `reportWeather` | **La regla de trigger es idéntica** (pura, ya testeada) |
| Liquidación vía `LedgerService` | Listener on-chain → mismo `LedgerService` | **Todo el pago fiat** (no cambia: blockchain decide, fiat paga) |
| `vcHash` en `CertificationToken` | `chainTxHash` anclado en LNET | El hash y el payload certificado son los mismos |
| `chainPolicyId` (UUID) | id de póliza on-chain | El nombre del campo ya anticipa el origen on-chain |

**Conclusión:** cuando lleguen las credenciales LNET, la migración consiste en
(a) instalar `ethers`, (b) mover la *decisión* del trigger al contrato, y (c)
anclar los hashes que ya generamos. La lógica de negocio, el modelo de datos y
la liquidación fiat **no se reescriben**. El riesgo de la migración se reduce a
integración, no a rediseño.

## Verificación

- ✅ Backend typecheck en verde (4 servicios nuevos + cron + 5 rutas).
- ✅ Schema válido (17 modelos; migración Postgres incremental generada).
- ✅ **10 tests de lógica pura** en verde: trigger paramétrico (sequía/El Niño/
  helada), hashes de integridad (oráculo + EUDR), bioinsumos y descuento verde TCEA.
- ✅ **17 tests de integración en verde contra PostgreSQL 18.4 real**: ingesta IoT
  + alertas (estrés hídrico/calor/helada, sin duplicados), oráculo (upsert
  idempotente + hash), seguros paramétricos (**liquidación real S/500 en la
  billetera, idempotencia anti-doble-pago, sin disparo en clima normal**) y
  certificación EUDR (emisión, idempotencia, **detección de manipulación**, reglas
  de cosecha/PPA). Verificado con un Postgres embebido efímero; en CI/dev se
  corren con `docker compose up -d` + `npm test`.

### Cómo correr los tests de integración
```bash
docker compose up -d        # levanta postgres-test en :5433
cd backend && npm test      # 30 (núcleo) + 10 (puros AgTech) + 17 (integración AgTech)
```
