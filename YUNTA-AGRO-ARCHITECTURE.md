# Yunta-Agro — Arquitectura, Unit Economics y Go-to-Market

> De la billetera del microcomercio a la infraestructura financiera del agro andino-amazónico.
> Pivote sobre el MVP funcional de Yunta (React 19 · Express 5 · Prisma · SQLite).

---

## 0. Tesis del Pivote

El MVP de Yunta ya resuelve un problema estructural: **convertir flujo transaccional
informal en historial crediticio.** El agricultor minifundista sufre la misma exclusión
que el microcomerciante, más tres capas adicionales de fricción: **sin conectividad, sin
cobro digital recurrente, y con riesgo climático (no comercial).**

Yunta-Agro **reutiliza ~80% de la infraestructura existente** y añade tres adaptadores.

| Componente Yunta (existente)                 | Adaptador Yunta-Agro (nuevo)                                  |
| -------------------------------------------- | ------------------------------------------------------------- |
| `calculateAlternativeScore()`                | + ingesta **PPA/MIDAGRI** + peso de cosecha                   |
| Cashbook SaaS (inventario/ventas)            | → **SaaS agronómico** + token de certificación (Ley 32434)    |
| PWA + Service Worker                         | + **capa offline** USSD / Mesh BLE con pre-firma              |
| Ledger atómico + webhook interoperable       | + **Layer-2 EVM** para seguro paramétrico autoejecutable      |
| MDR diferido + intereses                     | + **subsidios estatales cautivos** + COOPAC como rampa fiat   |

> Principio rector: **el agricultor nunca toca la complejidad Web3.** La blockchain es el
> riel de liquidación y confianza; la experiencia es una PWA que funciona sin señal y
> liquida en soles.

---

## 1. Motor de Scoring y SaaS — Identidad y Trazabilidad

### 1.1 Rediseño del scoring (`calculateAgroScore`)

El flujo de cobro agrícola es **estacional** (1–2 cosechas/año), por lo que un score
puramente transaccional penalizaría al agricultor. Se sustituye el peso transaccional por
un **score multifuente con KYC sin fricción** vía el Padrón de Productores Agrarios.

- **Base:** 300 por registro.
- **KYC PPA/MIDAGRI (API):** estar en el padrón = identidad + tenencia verificada (+200);
  hectáreas como proxy de capacidad (+10/ha, tope +150).
- **Trazabilidad de campaña:** campañas con cosecha entregada (+80 c/u) + disciplina de
  insumos (compró semilla/fertilizante a tiempo).
- **Flujo de liquidación interoperable (heredado de Yunta):** pagos de
  agroexportadoras/acopiadores vía TAPP/CCE.

> El PPA convierte el KYC de un cuello de botella manual a **una llamada API**.

### 1.2 SaaS agronómico + token de certificación tributaria (Ley 32434)

El cashbook se transforma en **libro de campaña**: entradas (semillas, fertilizantes,
jornales) y salidas (peso de cosecha, comprador, precio). Cada entrega emite una
**Verifiable Credential tokenizada**:

```
Agricultor entrega cosecha → SaaS registra peso + comprador
   → Yunta-Agro emite VC tokenizada { productor, DNI/PPA, producto, kg, fecha, comprador }
   → Agroexportadora presenta el token ante SUNAT
   → Deducción del 25% de Impuesto a la Renta con prueba inmutable
```

**Moat (demand-pull):** el token es un **beneficio fiscal real** para la exportadora, que
entonces **exige** a sus proveedores usar Yunta-Agro. El agricultor adopta porque su
comprador se lo pide — no por convicción tecnológica. Es el subsidio cruzado de Yunta, con
el "lado que paga" = exportadora vía ahorro tributario.

---

## 2. Arquitectura Offline — Última Milla

Tres anillos de conectividad degradada. La clave técnica: **separar la firma de la
liquidación**.

```
ANILLO 1 — Con señal (PWA online)
   App ◄─HTTPS─► Backend            [flujo normal, ya construido]

ANILLO 2 — Sin señal, solo (PWA offline + pre-firma)
   App firma la venta localmente → IndexedDB (pendiente)
   → Service Worker (Background Sync) reenvía al recuperar señal

ANILLO 3 — Sin señal, en grupo (Mesh BLE)
   Productor A ──BLE──► Productor B/Promotor (con señal) = "mula de datos"
   B sincroniza la tx pre-firmada de A al llegar a cobertura

CANAL PARALELO — Feature phone (USSD)
   Agricultor marca *XXX# → Gateway USSD → Backend
   (saldo, confirmar cobro, solicitar cash-out en COOPAC)
```

La transacción se firma en el campo (criptográficamente válida, con `nonce` +
`expiration` anti-replay estilo LACChain), se encola en IndexedDB y se liquida después.

> **Reutilización directa:** la `Idempotency-Key` + el débito atómico condicional del
> MVP garantizan que una tx relayada **dos veces** por la red Mesh se procese **una sola
> vez**. La infraestructura anti-doble-gasto del MVP es lo que hace segura la
> sincronización asíncrona.

---

## 3. Roadmap Web3 — Seguro Paramétrico Autoejecutable

### 3.1 ¿Por qué Layer-2 y no SQLite?

El seguro paramétrico exige **inmutabilidad de la póliza, ejecución automática sin
intervención humana, y auditabilidad pública** — credibilidad ante el agricultor y el
regulador. Por eso esta capa va on-chain en una **Layer-2 EVM-compatible** (rollup sobre
Lnet/Besu permisionado: gas cero vía el relay de Lnet + cumplimiento regulatorio).

### 3.2 Flujo técnico

```
1. SUSCRIPCIÓN
   Póliza (prima del subsidio o crédito) → contrato registra
   { productor, GPS, cultivo, umbralLluvia, periodo, montoIndemnizacion }

2. MONITOREO (oráculo descentralizado)
   Chainlink / oráculo del consorcio Lnet consulta la API del SENAMHI
   por la estación más cercana al polígono → mm lluvia, índice sequía, alerta de evento.

3. DISPARO (trigger paramétrico — sin peritaje)
   if (lluviaAcumulada < umbralSequia) || (evento == "Yaku")
       → el contrato se autoejecuta. Sin ajustador, sin reclamo manual.

4. LIQUIDACIÓN HÍBRIDA (on-chain decide, off-chain paga en fiat)
   El contrato emite PayoutTriggered { productorId, monto }
   → Backend Yunta escucha el evento (listener)
   → Indemnización en SOLES vía TAPP/CCE (reutiliza processIncomingInteroperablePayment)
```

> **Insight híbrido:** el agricultor **cobra en soles**, no en cripto. La blockchain es el
> *árbitro imparcial* que decide *si* y *cuánto* pagar — elimina el costo de peritaje que
> hace inviable el microseguro rural (donde evaluar el siniestro cuesta más que la
> indemnización). El dinero llega por el riel fiat que el agricultor ya entiende.

---

## 4. Flywheel de Retención y Go-to-Market Rural

### 4.1 Subsidios estatales como flujo de entrada cautivo

El agro no tiene cobro diario que arranque el flywheel. Solución: **el subsidio estatal es
el primer flujo cautivo** y resuelve el *cold-start*.

```
Estado deposita FertiBono/subsidio → billetera Yunta-Agro  (cautivo: debe abrir cuenta)
   → compra insumos con el subsidio → registrado en SaaS (primer dato = score)
   → registra cosecha + token tributario → sube score, atrae exportadora
   → score destraba crédito + seguro paramétrico
   → más campañas → más score → más productos → (repite)
```

La trazabilidad on-chain le sirve al Estado para **auditar que el subsidio se gastó en
insumos reales** (combate el desvío), lo que hace a Yunta-Agro el **canal preferido de
dispersión de smart subsidies**.

### 4.2 COOPAC como rampa fiat y originador

| Rol de la COOPAC            | Función                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| **Cash-out (ramp-off)**     | Retiro de soles en ventanilla.                                          |
| **Cash-in (ramp-on)**       | Depósito de efectivo de ventas locales.                                |
| **Originador de crédito**   | La COOPAC **fondea** la línea que el score origina (ya autorizada a prestar). |
| **Punto de confianza**      | Canal de onboarding humano para baja alfabetización digital.           |

Yunta-Agro **no presta directamente** (evita licencia EEDE/banco): es el **motor de
originación** sobre el balance de la COOPAC. Resuelve liquidez física **y** el cuello de
botella regulatorio del crédito a la vez.

---

## 5. Unit Economics

| Línea de ingreso                     | Mecanismo                                              | Quién paga          |
| ------------------------------------ | ----------------------------------------------------- | ------------------- |
| Dispersión de subsidios              | Fee por transacción de dispersión                     | Estado/programa     |
| Comisión de certificación tributaria | Fee por token emitido (exportadora ahorra 25% IR)     | Agroexportadora     |
| Spread de crédito                    | Fee de originación + servicing sobre balance COOPAC   | Agricultor (COOPAC) |
| Prima de seguro paramétrico          | Margen sobre prima; costo de siniestro ≈ 0            | Agricultor/subsidio |
| SaaS agronómico Pro                  | Suscripción (reportes/trazabilidad)                   | Exportadora/coop.   |

**Subsidio cruzado:** el agricultor accede gratis/subsidiado; los lados que pagan son la
**agroexportadora** (ahorro fiscal) y el **Estado** (dispersión auditable).

---

## 6. Reutilización vs. Construcción

| Capacidad                                         | Estado                          |
| ------------------------------------------------- | ------------------------------- |
| Ledger atómico, idempotencia, anti-doble-gasto    | ✅ Reutilizado del MVP          |
| Webhook interoperable / liquidación fiat (TAPP/CCE)| ✅ Reutilizado (base del payout)|
| Motor de scoring base                             | ♻️ Adaptado (PPA + cosecha)     |
| PWA / Service Worker                              | ♻️ Extendido (Background Sync)  |
| KYC vía PPA/MIDAGRI                                | 🆕 Nuevo adaptador (API)        |
| SaaS agronómico + token tributario                | 🆕 Nuevo                        |
| Capa offline USSD / Mesh BLE                      | 🆕 Nuevo                        |
| Layer-2 + seguro paramétrico + oráculos           | 🆕 Nuevo (acelera Fase 3)       |
| COOPAC como rampa fiat + originador               | 🆕 Nuevo (canal)                |

---

### El pitch en una frase

> **Yunta-Agro convierte el subsidio estatal en la puerta de entrada, la cosecha en
> historial crediticio, la trazabilidad en ahorro fiscal para el exportador, y el clima en
> un seguro que se paga solo — todo sobre una billetera que funciona sin señal y liquida en
> soles, con la blockchain como árbitro invisible.**

---

## Anexos técnicos (en este repo)

- `backend/prisma/schema.agro.prisma` — esquema de datos extendido (modelos Agro).
- `contracts/ParametricInsurance.sol` — contrato de seguro paramétrico (PoC).
- `backend/src/services/parametricInsurance.listener.ts` — listener on-chain → fiat (PoC).

> Los anexos son **prueba de concepto / diseño**: no se integran al runtime del MVP hasta
> la Fase 1 técnica (Postgres + capa Web3). No alteran el código funcional actual.
