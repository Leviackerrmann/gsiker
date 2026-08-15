#!/bin/sh
# ---------------------------------------------------------------------------
# Respaldo de la base de datos (pg_dump comprimido) con retención.
#
# Pensado para correr dentro de un contenedor con el cliente de postgres
# (imagen postgres:*), conectándose al servicio `db` de la red de compose.
# Variables:
#   POSTGRES_USER, POSTGRES_DB   (requeridas)
#   PGPASSWORD                   (requerida para autenticar)
#   DB_HOST                      (por defecto: db)
#   BACKUP_DIR                   (por defecto: /backups)
#   BACKUP_KEEP_DAYS             (por defecto: 7; borra respaldos más viejos)
# ---------------------------------------------------------------------------
set -eu

DB_HOST="${DB_HOST:-db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/${POSTGRES_DB}_${TS}.sql.gz"

echo "[backup] pg_dump ${POSTGRES_DB} @ ${DB_HOST} -> ${OUT}"
pg_dump -h "$DB_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$OUT"

# Verifica que el respaldo no quedó vacío.
if [ ! -s "$OUT" ]; then
    echo "[backup] ERROR: el respaldo quedó vacío" >&2
    rm -f "$OUT"
    exit 1
fi

# Retención: elimina respaldos más viejos que KEEP_DAYS.
find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -type f -mtime "+${KEEP_DAYS}" -delete

echo "[backup] OK ($(du -h "$OUT" | cut -f1))"
