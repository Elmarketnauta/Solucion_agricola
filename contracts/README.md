# `contracts/` — Capa Web3 (Fase 3, DISEÑO / PoC — NO está en runtime)

> ⚠️ **Estado: PRUEBA DE CONCEPTO.** Nada en esta carpeta se ejecuta en el MVP
> actual. El MVP de Yunta es un wallet fiat (soles) sobre SQLite; **no tiene
> blockchain conectada**. Estos artefactos documentan el *contrato de
> integración* de la Fase 3, no código vivo. No los integres al build ni los
> arranques sin completar los prerrequisitos de abajo.

## Qué hay aquí

| Artefacto | Rol | Estado |
|---|---|---|
| [`ParametricInsurance.sol`](ParametricInsurance.sol) | Árbitro on-chain del seguro paramétrico (Layer-2 EVM sobre Lnet/Besu). Decide *si* y *cuánto* indemnizar a partir de datos del SENAMHI vía oráculo; emite `PayoutTriggered`. **No mueve dinero fiat.** | PoC — sin desplegar |
| [`../backend/src/services/parametricInsurance.listener.ts`](../backend/src/services/parametricInsurance.listener.ts) | Listener off-chain: escucha `PayoutTriggered` y liquida la indemnización **en soles** por el riel fiat (TAPP/CCE), reutilizando `processIncomingInteroperablePayment` del MVP. | PoC — **excluido del build** (ver nota) |

| [`abi/ParametricInsurance.json`](abi/ParametricInsurance.json) | ABI del contrato, derivado del `.sol`. Listo para `ethers`; solo falta la dirección desplegada. | Plantilla — sin dirección |
| [`../backend/.env.web3.example`](../backend/.env.web3.example) | Plantilla de TODAS las variables de entorno de Lnet/Besu (con placeholders). | Plantilla |
| [`../backend/src/config/lnet.config.ts`](../backend/src/config/lnet.config.ts) | Módulo que **lee y valida** la config Lnet. NO conecta (no usa `ethers`). Es seguro importarlo desde el MVP. | **Activo** (solo lectura de config) |

El diseño completo de los 4 ejes (scoring agro, offline USSD+Mesh BLE, Web3 +
seguro paramétrico, flywheel/GTM) está en [`../YUNTA-AGRO-ARCHITECTURE.md`](../YUNTA-AGRO-ARCHITECTURE.md).

## Configuración (lista para rellenar — Fase 0)

Toda la config de la conexión Web3 ya está cableada y validada, **solo faltan
las credenciales reales de Lnet** (placeholders `__PENDIENTE__` / `0x000…`):

1. Copia las variables de [`../backend/.env.web3.example`](../backend/.env.web3.example) a `backend/.env`.
2. Rellena con los datos que entregue Lnet al registrar el nodo (RPC, chain ID,
   Relay Hub, llave del writer node, dirección del contrato, oráculo SENAMHI).
3. El backend al arrancar informa el estado (sin conectar):
   - `ℹ️ Lnet/Web3: deshabilitado` → modo fiat (default).
   - `⚠️ HABILITADO pero faltan variables: …` → config incompleta (las nombra).
   - `🔗 configuración completa` → listo para la Fase 3 (`npm i ethers`).
4. El módulo `lnet.config.ts` expone `missingLnetConfig()` y `requireLnetConfig()`
   para fallar temprano y claro si algo falta.

## Por qué NO está integrado (a propósito)

El listener consume `ethers` y requiere un nodo **Layer-2 EVM** que el MVP no
tiene. Integrarlo al runtime hoy sería arrastrar código muerto a un MVP fiat y
romper la honestidad del estado del proyecto. Por eso:

- `parametricInsurance.listener.ts` está en el array `exclude` de
  [`../backend/tsconfig.json`](../backend/tsconfig.json) → **no compila** con el
  backend y no puede arrancarse por accidente.
- `ethers` **no** está en `backend/package.json`.
- El `.sol` no está desplegado en ninguna red.

Esto es deliberado: el MVP queda limpio y verificable; la capa Web3 espera su fase.

## Checklist para activar (Fase 3)

1. **Registro de nodo en Lnet** (Fase 0 del audit blockchain) — prerequisito de todo.
2. Levantar / contratar una **Layer-2 EVM** sobre Lnet/Besu permisionado.
3. `cd backend && npm i ethers`.
4. Configurar el **oráculo** (Chainlink/consorcio) apuntando a la API del SENAMHI.
5. Desplegar `ParametricInsurance.sol`; guardar dirección + ABI.
6. Variables de entorno (ya plantilladas en `../backend/.env.web3.example`):
   `LNET_ENABLED=true`, `LNET_L2_RPC_URL`, `PARAMETRIC_INSURANCE_ADDRESS`,
   `WRITER_NODE_PRIVATE_KEY`, etc.
7. Quitar `parametricInsurance.listener.ts` del `exclude` de
   [`../backend/tsconfig.json`](../backend/tsconfig.json) y arrancarlo en el
   bootstrap (`ParametricInsuranceListener.start(signer)`).
8. Prueba end-to-end con un evento de sequía simulado (trigger `reportWeather`)
   → verificar liquidación idempotente en soles (clave `INSURANCE_${policyId}`).

Hasta completar 1–8, esta carpeta es **documentación de arquitectura**, no software en ejecución.
