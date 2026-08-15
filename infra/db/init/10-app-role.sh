#!/bin/bash
# ---------------------------------------------------------------------------
# Crea el rol de aplicación con el que se conecta el backend.
#
# Por qué existe: la Row-Level Security (RLS) que aísla las empresas se
# *omite* si la app se conecta como superusuario o con un rol BYPASSRLS
# (como el dueño POSTGRES_USER). El backend debe conectarse con un rol
# SIN privilegios (NOSUPERUSER, NOBYPASSRLS) para que las políticas RLS
# realmente apliquen. Las migraciones y tareas de admin siguen usando el
# dueño (POSTGRES_USER).
#
# Este script corre automáticamente SOLO en la primera inicialización del
# volumen de datos (docker-entrypoint-initdb.d). Para una base YA existente,
# ejecútalo/replica su SQL a mano una vez (ver infra/db/README.md).
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DB_USER="${APP_DB_USER:-nebula_app}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:?APP_DB_PASSWORD no está definido}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
-- Crea el rol solo si no existe (patrón idempotente con \\gexec).
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT',
  '$APP_DB_USER', '$APP_DB_PASSWORD'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_DB_USER')\gexec

-- Asegura la contraseña por si el rol ya existía.
ALTER ROLE "$APP_DB_USER" WITH LOGIN PASSWORD '$APP_DB_PASSWORD' NOSUPERUSER NOBYPASSRLS;

-- Permisos mínimos: conectar, usar el esquema y DML sobre las tablas.
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO "$APP_DB_USER";
GRANT USAGE ON SCHEMA public TO "$APP_DB_USER";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "$APP_DB_USER";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "$APP_DB_USER";

-- Que las tablas/secuencias que creen FUTURAS migraciones (como POSTGRES_USER)
-- concedan permisos automáticamente al rol de la app.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$APP_DB_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "$APP_DB_USER";
EOSQL

echo "[10-app-role] Rol de aplicación '$APP_DB_USER' listo (NOSUPERUSER, NOBYPASSRLS)."
