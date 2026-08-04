# legacy_data

Artefactos rescatados de la antigua app Flask (`compras_sk`), eliminada del repo
durante la migración a FastAPI + React. Se conservan **solo como fuente de datos
para una futura migración** al sistema multi-empresa; no forman parte del código
en ejecución.

| Archivo                          | Qué es                                                        |
|----------------------------------|---------------------------------------------------------------|
| `BASE DE DATOS.xlsx`             | Base de datos original en Excel de la app de compras.         |
| `backups/backup_compras_full_*.sql.gz` | Dumps de PostgreSQL de la BD `comprasdb` (producción).  |
| `backups/code_backup_*.tar.gz`   | Snapshot del código Flask completo.                           |
| `migrate_excel.py.reference`     | Script original que importaba el Excel; **referencia** del mapeo de columnas → entidades (dependía de los modelos Flask, no ejecutable tal cual). |

La app Flask completa sigue disponible en el historial de git si se necesita.

**Pendiente**: al construir el módulo multi-empresa (Fase 1) y fiscal (Fase 2),
evaluar migrar estos datos de compras/proveedores al nuevo esquema.
