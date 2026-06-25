# Yunta-Agro — Capturas de la vista Score Agro

Capturas de pantalla reales (Chromium / Playwright, viewport móvil 412×915 @2x)
de la vista de scoring crediticio agrícola en `/agro`, conducida con los tres
productores de demostración del seed (`backend/prisma/seed.agro.ts`).

Demuestran el **gradiente pedagógico** del motor: a mejor productor, mayor línea
de crédito y **menor TCEA** (costo total del crédito). Es el modelo de negocio
hecho visible en la UI.

| Captura | Productor | Score | Tramo | Línea | TCEA | Qué demuestra |
|---|---|---|---|---|---|---|
| [agro-score-aurelio-tramo-a.png](agro-score-aurelio-tramo-a.png) | Aurelio (consolidado) | 874 | A | S/ 1,748 | 24.89% | PPA + 3 campañas → sujeto de crédito preferente |
| [agro-score-maria-tramo-b.png](agro-score-maria-tramo-b.png) | María (en crecimiento) | 639 | B | S/ 1,278 | 37.04% | PPA + 1 campaña → crédito estándar |
| [agro-score-tomas-base.png](agro-score-tomas-base.png) | Tomás (sin PPA) | 300 | — | S/ 0 | 55.06% | Fuera del padrón → en construcción de historial |
| [dashboard-acceso-agro.png](dashboard-acceso-agro.png) | (Aurelio) | — | — | — | — | Acceso "Score Agro" 🌱 en el grid del Dashboard |

## Qué muestra cada vista de score

- **Hero:** puntaje /1000, tramo de riesgo (A/B/C/D), barra de progreso y contexto
  del cultivo (la campaña estacional no penaliza al agricultor).
- **Panel del analista:** línea pre-aprobada + **TCEA desglosada** (interés TEA +
  comisión administrativa + portes + seguro paramétrico), con nota de metodología SBS.
- **Desglose del score:** las 6 palancas (registro, identidad PPA, capacidad,
  historial de campañas, disciplina de insumos, flujo de cobros) con su peso y tope.
- **Flujo educativo:** "Tu plan para mejorar" — próximos pasos personalizados
  ordenados por impacto (+pts), cada uno con el *por qué* en lenguaje del sector.

> Para regenerar: levantar backend (`PORT=3000`) + `vite preview --port 4173`,
> y correr el script de captura Playwright apuntando a los tres teléfonos
> `+51955700001 / 2 / 3` (PIN `1234`).
