<!-- Developed by Marketnauta -->
# Despliegue de la demo en Render (URL pública)

Esta guía publica **Yunta-Agro** como una demo en línea usando el plan
**gratuito** de [Render](https://render.com). Al terminar tendrás:

- Una **URL pública del frontend** (la que compartes para ver el prototipo).
- Un **backend API** con PostgreSQL gestionado.
- La **cuenta de prueba** ya cargada automáticamente.

> Todo está definido en [`render.yaml`](../render.yaml) (Infraestructura como
> código). Render lo lee y crea los 3 servicios solo.

---

## Requisitos previos

1. El código ya está en GitHub: `https://github.com/Elmarketnauta/Solucion_agricola`
2. Una cuenta gratuita en https://render.com (puedes registrarte con GitHub).

---

## Paso 1 — Crear el Blueprint

1. Entra a https://dashboard.render.com → botón **New** → **Blueprint**.
2. Conecta tu cuenta de GitHub y selecciona el repo **`Solucion_agricola`**.
3. Render detectará automáticamente el archivo `render.yaml` y mostrará los
   3 servicios que va a crear:
   - `yunta-db` (PostgreSQL)
   - `yunta-backend` (API)
   - `yunta-frontend` (sitio estático)
4. Pulsa **Apply**. Render empezará a construir. La primera vez tarda
   ~5–10 minutos (instala dependencias, corre migraciones y seed).

---

## Paso 2 — Conectar frontend ↔ backend (variables cruzadas)

Como las URLs públicas se conocen recién tras el primer deploy, hay **dos
variables** marcadas `sync: false` que debes rellenar a mano **una sola vez**:

1. En el dashboard, abre el servicio **`yunta-backend`** → copia su URL
   pública (algo como `https://yunta-backend.onrender.com`).
2. Abre **`yunta-frontend`** → pestaña **Environment** → variable
   `VITE_API_URL` → pega ahí la URL del backend → **Save**.
3. Abre **`yunta-frontend`** → copia su URL pública
   (`https://yunta-frontend.onrender.com`).
4. Vuelve a **`yunta-backend`** → **Environment** → variable `CORS_ORIGIN`
   → pega ahí la URL del frontend → **Save**.
5. Cada servicio se redepliega solo al guardar. Espera a que ambos queden
   en estado **Live**.

> ⚠️ Importante: `CORS_ORIGIN` debe ser **exactamente** la URL del frontend
> (sin barra final). Si no coincide, el navegador bloqueará las peticiones.

---

## Paso 3 — Entrar a la demo

Abre la **URL del frontend** (`https://yunta-frontend.onrender.com`) e inicia
sesión con la cuenta de prueba:

| Campo    | Valor             |
| -------- | ----------------- |
| Teléfono | `+51999888777`    |
| PIN      | `1234`            |

(Es "Doña Rosa", con saldo S/150 y línea de crédito.)

También se cargan los productores demo del Centro Agronómico
(**Aurelio**, **María**, **Tomás**) vía el seed agro.

---

## Notas del plan gratuito

- **El backend "duerme"** tras 15 minutos sin tráfico. La primera petición
  después de dormir tarda **~30–50 segundos** en responder (el servicio
  despierta). Es normal en el tier free; al recargar funciona con normalidad.
- **PostgreSQL free** expira a los 90 días en Render. Para una demo
  prolongada, sube a un plan de pago o re-créalo.
- Migraciones y seed corren en cada deploy (`preDeployCommand: npm run
  release`). El seed es **idempotente**: no duplica datos.

---

## Qué hace cada archivo de configuración

- **`render.yaml`** — define los 3 servicios y sus variables de entorno.
- **`backend/package.json`** scripts nuevos:
  - `build` → `prisma generate` (genera el cliente Prisma).
  - `release` → `prisma migrate deploy && seed` (corre antes de arrancar).
  - `start` → `ts-node src/server.ts` (arranca la API).

## Cambio de código para producción

El único ajuste lógico fue la **cookie de sesión**: en producción el frontend
y el backend viven en dominios distintos (`*.onrender.com`), así que la cookie
`yunta_session` usa `SameSite=None; Secure` (requerido para enviar la sesión
entre dominios sobre HTTPS). En local se mantiene `SameSite=Strict`. Ver
`backend/src/server.ts` (`cookieOpts`).
