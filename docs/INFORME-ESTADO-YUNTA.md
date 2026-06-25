# Informe de Estado — Yunta / Yunta-Agro
### Documentación técnica para el Project Manager

> **Developed by Marketnauta**
> Fecha del informe: 25 de junio de 2026 · Rama: `master`
> Propósito: dar al PM una foto fiel del estado de la programación, qué está
> listo para usarse, qué es maqueta, y qué decisiones de producto faltan.

---

## 1. Resumen ejecutivo (TL;DR para el PM)

Yunta es una **billetera fiat (soles) para microcomercio peruano** que evolucionó
hacia **Yunta-Agro**, una capa de inclusión financiera para pequeños productores
agrícolas. El estado actual se divide en tres capas con madurez muy distinta:

| Capa | Estado | ¿Listo para? |
|---|---|---|
| **MVP Wallet fiat** | ✅ **Funcional y seguro** | Demo a inversionistas / piloto cerrado controlado |
| **Yunta-Agro (scoring)** | 🟡 **Núcleo funcional, periferia en diseño** | Demo del modelo de negocio / validación con financieras |
| **SuperApp (FX, Seguros, etc.)** | 🔴 **Maquetas visuales** | Solo demo de UI / "visión de producto" |
| **Web3 / Lnet** | ⚙️ **Configurado, deshabilitado** | Nada en runtime; listo para Fase 3 cuando haya nodo |

**Veredicto:** Yunta está listo para **demostrar y validar** (inversionistas,
aliados financieros, usuarios piloto guiados), **no para producción abierta**.
El salto a producción requiere decisiones de producto y trabajo de ingeniería
que se detallan en la §7.

**Lo más urgente que debe saber el PM:**
1. ✅ ~~No hay tests automatizados.~~ **RESUELTO:** 30 tests (Vitest) cubren el
   núcleo de dinero y el scoring. Ver §3.5.
2. **5 de 11 pantallas son maquetas** sin backend (FX, Seguros, Inversiones, Préstamos, Comercios).
3. 🟢 ~~La base de datos es SQLite.~~ **Migrado a PostgreSQL** (código/config listos;
   falta verificar en runtime con Docker — ver §7 P0-1 y `docs/MIGRACION-POSTGRES.md`).
4. **Casi todo el trabajo Agro/Web3 está sin commitear** (ahora aún más cambios).

---

## 2. Arquitectura y stack tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (PWA)          React 19 + Vite 8 + TypeScript      │
│  - Service Worker (Workbox) precache + offline shell         │
│  - ~2,077 líneas en 34 archivos                              │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST / JSON + JWT (cookie httpOnly)
┌───────────────────────────┴─────────────────────────────────┐
│  BACKEND (API)           Express 5 + TypeScript               │
│  - Prisma 5 ORM · ~1,522 líneas en 18 archivos               │
│  - Helmet, rate-limit, bcrypt, JWT + blocklist en memoria    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│  DATOS                   PostgreSQL 16 (Docker / gestionado)  │
│  - 14 modelos Prisma (7 MVP + 7 Agro)                        │
└──────────────────────────────────────────────────────────────┘

  [Configurado pero DESHABILITADO] Web3 / Lnet (Hyperledger Besu)
  [Diseño / PoC, sin instalar]     Seguro paramétrico (Solidity + ethers)
```

**Componentes auxiliares:** un `simulator/` (Express) que emula pagos Yape
entrantes para probar la interoperabilidad.

---

## 3. Qué está LISTO y funcional ✅

### 3.1 Autenticación y seguridad
- Registro y login con **teléfono + PIN** (bcrypt para el hash del PIN).
- **JWT** firmado, entregado por **cookie httpOnly** (buena práctica: no expuesto a JS).
- **Logout con revocación** vía blocklist de JTI en memoria.
- **Helmet** (cabeceras de seguridad), **CORS dinámico**, **rate-limiting** en
  rutas sensibles (auth, validación de destinatario).
- **CSP minimalista** para API REST en producción.

### 3.2 Núcleo transaccional (lo más sólido del proyecto)
- **Transferencias P2P en soles** entre comercios, funcionando de extremo a extremo.
- **Ledger atómico**: usa `prisma.$transaction` con `updateMany` condicional
  (saldo ≥ monto) → **imposible sobregirar**.
- **Idempotencia anti-doble-pago**: `txSignature @unique`. Un doble-tap o retry
  reutiliza la misma firma y no duplica el cargo.
- **Webhook interoperable** (`/api/webhook/interoperable`) con verificación de
  **firma HMAC** — recibe pagos externos (Yape/Plin/CCE simulados) y los liquida
  por la misma ruta atómica.
- Dashboard de saldo, historial de transacciones, validación de destinatario.

### 3.3 Yunta-Agro — scoring crediticio (núcleo funcional)
- **Onboarding sin fricción vía PPA/MIDAGRI**: con el DNI se consulta el Padrón
  de Productores Agrarios → verifica identidad + tenencia de tierra en una llamada.
  *(Hoy en modo `stub` determinista; listo para apuntar a la API real con un flag.)*
- **Motor de score agronómico** (`agroCredit.service.ts`): reemplaza la
  "frecuencia transaccional" (que castiga al agricultor estacional) por 6 palancas:
  registro base, identidad PPA, capacidad productiva (hectáreas), historial de
  campañas, disciplina de insumos, flujo de cobros.
- **Cálculo de TCEA** (costo total del crédito) compuesto según metodología SBS.
- **3 endpoints REST funcionales**: `/api/agro/onboard`, `/api/agro/score`, `/api/agro/profile`.
- **Vista del analista financiero** (`/agro`): hero con puntaje/tramo de riesgo,
  TCEA desglosada, las 6 palancas con su peso, y un **plan educativo personalizado**.
- **Seed permanente** con 3 arquetipos verificados (Aurelio 874/A, María 639/B, Tomás 300).

### 3.4 PWA / offline (parcial)
- **Service Worker con Workbox**: precache de assets, la app abre sin conexión
  (shell offline), API en modo NetworkOnly.

### 3.5 Suite de pruebas automatizadas ✅ (resuelve P0-2)
- **30 tests automatizados** con **Vitest**, todos en verde, contra una BD
  PostgreSQL de pruebas **aislada** (contenedor en :5433) que jamás toca los datos de desarrollo.
- **Cobertura del núcleo de dinero** (`ledger.test.ts`, 11 tests): no-sobregiro
  ("Doña Rosa con S/10 no puede enviar S/15"), idempotencia anti-doble-pago,
  **anti doble-gasto concurrente** (dos pagos simultáneos no sobregiran),
  atomicidad (un fallo no deja saldos a medias), límites mín/máx, auto-transferencia.
- **Motor de scoring agro + TCEA** (`agroCredit.test.ts`, 14 tests): desglose del
  puntaje, topes, TCEA multiplicativa, "mejor score → menor costo", caso Aurelio (24.89%).
- **Adaptador MIDAGRI/PPA** (`midagri.test.ts`, 5 tests): validación de DNI y determinismo.
- **Cómo correr:** `cd backend && npm test` (o `npm run test:watch`).
- *Nota:* las pruebas ya **encontraron un bug de supuesto** durante su creación
  (una TEA mal asumida en el caso Aurelio) — evidencia de que la red de seguridad funciona.

---

## 4. Qué está PARCIAL o en DISEÑO 🟡

| Funcionalidad | Estado real | Detalle |
|---|---|---|
| **Tokens de certificación tributaria** (Ley 32434) | Solo `model` en schema | `CertificationToken` existe en la BD pero **no hay lógica** que los emita. |
| **Subsidios inteligentes (FertiBono)** | Solo `model` en schema | `SubsidyDisbursement` modelado, sin servicio que lo procese. |
| **Arquitectura offline USSD + Mesh BLE** | Solo `model` en schema | `OfflineSignedTx` modelado (idempotencyKey, nonce, firma), **sin código** de firma offline ni sincronización. Es diseño documentado. |
| **MIDAGRI / PPA real** | Modo `stub` | Funciona con datos deterministas; el modo `live` está cableado pero **no probado contra la API real** (falta acceso). |
| **Cashbook agronómico (SaaS)** | Modelado | `AgroCampaign` + `CampaignInput` existen; falta la UI de registro de campañas. |

---

## 5. Qué es MAQUETA (no funcional) 🔴

**5 de las 11 pantallas del frontend son mockups visuales con CERO llamadas a la API:**

| Pantalla | Llamadas a API | Qué es |
|---|---|---|
| `FX.tsx` (Cambio de divisas) | **0** | Maqueta estática |
| `Insurance.tsx` (Seguros) | **0** | Maqueta estática |
| `Investments.tsx` (Inversiones) | **0** | Maqueta estática |
| `Loans.tsx` (Préstamos) | **0** | Maqueta estática |
| `Merchants.tsx` (Comercios) | **0** | Maqueta estática |

> Estas pantallas comunican la **visión "SuperApp"** pero no tienen backend.
> Para el PM: **no prometer estas funciones como operativas** en demos. Son
> ilustrativas. (Las que SÍ funcionan: Dashboard, Transfer, Transactions, AgroScore.)

---

## 6. Web3 / Lnet — estado preciso ⚙️

- **No hay ninguna blockchain conectada.** El wallet es un ledger en PostgreSQL.
- Toda la **configuración** para conectar a **Lnet (Hyperledger Besu)** está
  cableada y validada, pero **deshabilitada** por defecto (`LNET_ENABLED=false`).
  El backend arranca en modo fiat y lo informa en el log.
- Artefactos listos para Fase 3 (en `contracts/` y `backend/src/config/`):
  contrato `ParametricInsurance.sol` (PoC), su ABI, el listener off-chain, el
  módulo `lnet.config.ts` con validación de variables, y `.env.web3.example`.
- **Lo que falta para conectar:** credenciales reales de Lnet (RPC, chain ID,
  Relay Hub, llave del writer node), un nodo L2 EVM, e `npm i ethers`.
- Checklist de activación documentado en `contracts/README.md`.

---

## 7. Brechas y mejoras a evaluar por el PM

Priorizadas por impacto para llevar Yunta de "demo" a "piloto/producción".

### 🔴 Bloqueantes para producción (P0)
1. 🟢 **Migrar de SQLite a PostgreSQL — HECHO a nivel de código/config.**
   Schema en `provider = postgresql`, migración Postgres nativa generada y
   validada (14 tablas, 14 FKs), `docker-compose.yml` para levantar la BD,
   tests apuntados al Postgres de pruebas, ledger documentado para concurrencia
   Postgres. **Pendiente:** instalar Docker y correr `migrate deploy` + los 30
   tests contra Postgres para verificar en runtime. Guía: `docs/MIGRACION-POSTGRES.md`.
2. ~~**Suite de pruebas automatizadas.**~~ ✅ **RESUELTO.** Se implementaron **30
   tests** (Vitest) cubriendo el ledger (atomicidad, idempotencia, no-sobregiro,
   concurrencia) y el motor de scoring/TCEA. Ver §3.5. *Mejora continua sugerida:*
   ampliar a tests de los endpoints HTTP (auth, rutas agro) y medir cobertura.
3. **Persistir la blocklist de JWT.** Hoy es en memoria → al reiniciar el server,
   los tokens revocados vuelven a ser válidos. Mover a Redis/DB.
4. **Commitear el trabajo Agro/Web3.** 14 archivos nuevos + 44 modificados sin
   versionar. Riesgo de pérdida; bloquea CI/CD y revisión.

### 🟡 Necesarias para un piloto real (P1)
5. **Integración real con MIDAGRI/PPA** (salir del modo stub) — requiere convenio/acceso.
6. **Riel de cash-in/cash-out real** (COOPAC, agentes) — hoy el dinero entrante
   es simulado vía webhook.
7. **Decidir el destino de las 5 maquetas**: implementarlas, recortarlas del
   alcance, o marcarlas explícitamente como "roadmap" en la UI.
8. **Observabilidad**: logging estructurado, métricas, alertas, monitoreo de errores.
9. **Gestión de secretos** (KMS / vault) en vez de `.env` plano para producción.

### 🟢 Para escalar la propuesta Agro/Web3 (P2)
10. **Implementar el Cashbook agronómico** (UI de campañas/insumos) — alimenta el score.
11. **Emisión de tokens de certificación tributaria** (lógica de `CertificationToken`).
12. **Arquitectura offline USSD + Mesh BLE** (firma offline + sync) — gran
    diferenciador rural, hoy solo modelo de datos.
13. **Fase 0 Web3**: registro formal de nodo en Lnet (prerequisito de todo lo on-chain).
14. **Seguro paramétrico**: desplegar el contrato + oráculo SENAMHI + listener.

---

## 8. Riesgos a comunicar

| Riesgo | Severidad | Mitigación sugerida |
|---|---|---|
| ~~Sin tests → regresiones silenciosas~~ | ✅ Mitigado | 30 tests cubren ledger + scoring (§3.5) |
| ~~SQLite en producción~~ | 🟢 Migrado | Postgres (código/config listos; verificar runtime con Docker) |
| Blocklist volátil (logout no persiste) | Media | Redis/DB (P0-3) |
| Maquetas confundidas con features reales | Media | Etiquetar UI / alinear expectativas en demos |
| Dependencia de convenios externos (MIDAGRI, COOPAC) | Media | Gestión temprana de alianzas (no es ingeniería) |
| Trabajo sin commitear | Media | Versionar ya (P0-4) |

---

## 9. Para qué está listo HOY (matriz de uso)

| Caso de uso | ¿Listo? | Notas |
|---|---|---|
| Demo a inversionistas | ✅ Sí | Flujo wallet + Score Agro impresiona y es real |
| Validación del modelo de negocio con financieras | ✅ Sí | Score + TCEA + tramos de riesgo son demostrables |
| Piloto cerrado y guiado (pocos usuarios) | 🟡 Con cuidado | Funciona, pero sin tests ni Postgres asume riesgo |
| Producción abierta al público | 🔴 No | Faltan P0 completos |
| Operación on-chain / seguros paramétricos | 🔴 No | Fase 3, requiere nodo Lnet |

---

## 10. Apéndice técnico

- **Endpoints activos (12):** health, auth/register, auth/login, auth/logout,
  merchant/dashboard, merchant/transactions, transfer, transfer/validate,
  agro/onboard, agro/score, agro/profile, webhook/interoperable.
- **Modelos de datos (14):** MerchantProfile, Wallet, Transaction, Product,
  SalesLedger, CreditLine, LoanInstallment *(MVP)* · ProducerProfile, AgroCampaign,
  CampaignInput, CertificationToken, SubsidyDisbursement, InsurancePolicy,
  OfflineSignedTx *(Agro)*.
- **Documentación relacionada:**
  `YUNTA-AGRO-ARCHITECTURE.md` (diseño de los 4 ejes),
  `contracts/README.md` (estado Web3 + checklist),
  `docs/screenshots/` (capturas de la vista Score Agro con los 3 arquetipos).
- **Credenciales demo (PIN 1234):** `+51955700001` Aurelio (score 874/A),
  `+51955700002` María (639/B), `+51955700003` Tomás (300), `+51987654321`
  Doña Rosa, `+51912345678` El Amigo.
- **Cómo levantar:** backend `cd backend && PORT=3000 npx ts-node src/server.ts`;
  frontend `cd frontend && npx vite --port 5173`; abrir `http://localhost:5173`.
