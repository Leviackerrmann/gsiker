#!/bin/sh
# ---------------------------------------------------------------------------
# Restaura un respaldo (.sql.gz) generado por backup.sh.
#
# Uso (dentro de un contenedor con cliente de postgres, red de compose):
#   RESTORE de un archivo:  restore.sh /backups/minisapdb_20260812_120000.sql.gz
#
# Variables: POSTGRES_USER, POSTGRES_DB, PGPASSWORD, DB_HOST (por defecto db).
# OJO: aplica el dump sobre la BD existente; restaura sobre una BD vacía para
# evitar conflictos, o revisa el contenido antes.
# ---------------------------------------------------------------------------
set -eu

FILE="${1:?Uso: restore.sh <archivo.sql.gz>}"
DB_HOST="${DB_HOST:-db}"

echo "[restore] aplicando ${FILE} sobre ${POSTGRES_DB} @ ${DB_HOST}"
gunzip -c "$FILE" | psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
echo "[restore] OK"
