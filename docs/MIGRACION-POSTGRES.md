# Migración a PostgreSQL — Guía de setup y verificación

> **Developed by Marketnauta**
> Resuelve el riesgo P0: *"SQLite (archivo local) — no apto para producción multiusuario"*.

## Qué cambió

| Antes (SQLite) | Ahora (PostgreSQL) |
|---|---|
| `provider = "sqlite"` | `provider = "postgresql"` |
| `DATABASE_URL="file:./dev.db"` | `DATABASE_URL="postgresql://yunta:...@localhost:5432/yunta"` |
| Sin servidor de BD | `docker-compose.yml` levanta Postgres 16 |
| Concurrencia serializada (se cae con carga) | Concurrencia real (miles de usuarios) |
| Migraciones SQLite | Migración Postgres nativa (`20260625000000_init_postgres`) |

**No se reescribió lógica de negocio.** Gracias a Prisma, el cambio fue de
configuración + migraciones. El código de servicios/ledger es idéntico (Prisma
abstrae el motor). Las migraciones SQLite anteriores quedaron archivadas en
`backend/prisma/migrations_sqlite_archive/` por trazabilidad.

## Requisito previo: Docker

Este es el único paso manual. Instala **Docker Desktop**:
- Windows: https://www.docker.com/products/docker-desktop/ → instalar → reiniciar.
- Verifica: `docker --version` y `docker compose version`.

## Puesta en marcha (3 comandos)

```bash
# 1. Desde la raíz del repo: levanta Postgres (dev en :5432, test en :5433)
docker compose up -d

# 2. Aplica las migraciones a la base de datos de desarrollo
cd backend
npx prisma migrate deploy

# 3. Carga los datos demo (cuentas MVP + 3 productores agro)
npx ts-node prisma/seed.ts
npx ts-node prisma/seed.agro.ts
```

Luego se levanta como siempre:
```bash
# backend
PORT=3000 npx ts-node src/server.ts
# frontend (otra terminal)
cd ../frontend && npx vite --port 5173
```

## Correr las pruebas (contra Postgres de test, :5433)

```bash
cd backend
npm test          # 30 tests contra la BD de pruebas aislada
```

El `globalSetup` sincroniza el esquema en la BD `yunta_test` (puerto 5433) antes
de correr. Esa BD es un contenedor **efímero** (sin volumen): se descarta con
`docker compose down`. **Nunca toca los datos de desarrollo.**

## Por qué Postgres es seguro para el dinero (concurrencia)

El débito del ledger usa un `UPDATE ... WHERE balance >= amount` condicional.
En Postgres (aislamiento `READ COMMITTED` por defecto) ese UPDATE toma un *row
lock*: si dos pagos intentan debitar la misma wallet a la vez, el segundo espera
al commit del primero y **re-evalúa el saldo actualizado**. Resultado: **nunca
hay sobregiro ni lost-update**. Está documentado en `ledger.service.ts` y
cubierto por la prueba de *doble-gasto concurrente* (`test/ledger.test.ts`).

## Producción

No usar el Postgres de Docker en producción. Usar un **Postgres gestionado**
(Neon, Supabase, AWS RDS, Cloud SQL) y poner su connection string en
`DATABASE_URL` vía el gestor de secretos (nunca commitear credenciales). El
resto del flujo (`migrate deploy`) es idéntico.

## Estado de verificación

- ✅ Schema migrado a `provider = postgresql` (14 modelos, 100% tipos portables).
- ✅ Migración Postgres generada y validada (14 tablas, 12 índices únicos, 14 FKs).
- ✅ Prisma Client regenerado para Postgres.
- ✅ Backend y tests typecheck en verde con el cliente Postgres.
- ⏳ **Pendiente de verificación en runtime:** requiere Docker instalado para
  levantar Postgres y correr `migrate deploy` + los 30 tests contra PG. Hasta
  entonces, el cambio está completo a nivel de código/config pero no ejecutado.
