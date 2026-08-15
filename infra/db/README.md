# infra/db — Rol de aplicación y RLS

## Por qué
El aislamiento entre empresas se refuerza con **Row-Level Security (RLS)** de
PostgreSQL (migración `7524eaf58688`). RLS **no aplica** a superusuarios ni a
roles con `BYPASSRLS`. Por eso:

- **Migraciones / admin** → se conectan como el **dueño** (`POSTGRES_USER`, p. ej. `comprasuser`).
- **El backend (app)** → se conecta como **`nebula_app`** (NOSUPERUSER, NOBYPASSRLS),
  para que las políticas RLS realmente lo limiten a la empresa activa.

La app fija la empresa activa en cada request con
`SET app.current_empresa_id` (transacción-local, ver `app/dependencies.py`),
y las políticas comparan `empresa_id` contra esa variable.

## Instalación nueva (Docker)
`docker compose up` monta `infra/db/init/` en el contenedor. El script
`10-app-role.sh` crea el rol automáticamente en la **primera** inicialización
del volumen, usando `APP_DB_USER` / `APP_DB_PASSWORD` del entorno.

## Base de datos YA existente (aplicar una vez)
El script de init solo corre en un volumen vacío. Para una base ya creada,
ejecuta el rol y permisos a mano (como dueño):

```bash
APP_DB_USER=nebula_app APP_DB_PASSWORD='<clave-fuerte>' \
  docker compose exec -T db sh -lc \
  'APP_DB_USER="$APP_DB_USER" APP_DB_PASSWORD="$APP_DB_PASSWORD" \
   POSTGRES_USER="$POSTGRES_USER" POSTGRES_DB="$POSTGRES_DB" \
   bash /docker-entrypoint-initdb.d/10-app-role.sh'
```

(o corre el mismo SQL del script con `psql` conectado como el dueño).

## Respaldos (backups)

Scripts: `infra/db/backup.sh` (pg_dump comprimido + retención) y
`infra/db/restore.sh`. Los respaldos se guardan en `./backups/` (ignorada por git).

### Automático (servicio de compose)
Hay un servicio `db-backup` bajo el perfil `backup` que respalda cada
`BACKUP_INTERVAL_SECONDS` (por defecto diario) y conserva
`BACKUP_KEEP_DAYS` días (por defecto 7):

```bash
docker compose --profile backup up -d db-backup
```

### Manual (una vez)
```bash
docker compose --profile backup run --rm db-backup /usr/local/bin/backup.sh
```

### Restaurar
```bash
docker compose --profile backup run --rm \
  -v "$PWD/infra/db/restore.sh:/usr/local/bin/restore.sh:ro" \
  db-backup /usr/local/bin/restore.sh /backups/minisapdb_AAAAMMDD_HHMMSS.sql.gz
```

### Alternativa con cron del host
Si prefieres no dejar el contenedor corriendo:
```cron
0 2 * * *  cd /ruta/minisap && docker compose --profile backup run --rm db-backup /usr/local/bin/backup.sh
```

## Verificar que RLS funciona
```sql
-- Conectado como nebula_app:
SET app.current_empresa_id = '1';
SELECT count(*) FROM skus;      -- solo filas de la empresa 1
RESET app.current_empresa_id;
SELECT count(*) FROM skus;      -- 0 (deny por defecto)
```

Si conectado como `nebula_app` ves filas de otras empresas, revisa que el rol
**no** sea superusuario ni tenga `BYPASSRLS`:
```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'nebula_app';
-- debe ser  f | f
```
