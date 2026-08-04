# miniSAP

ERP web para PyMEs — alternativa ligera y asequible a SAP Business One, orientada al mercado de **Guatemala** (IVA 12%, régimen de Pequeño Contribuyente, facturación electrónica FEL). Producto **SaaS multi-empresa** con web y (próximamente) app móvil nativa.

## Módulos

- **Inventario**: bodegas, stock, movimientos, transferencias, kardex, conteos físicos, lotes, ubicaciones, reservas, alertas.
- **Compras**: proveedores, solicitudes, órdenes de compra, recepciones, cotizaciones.
- **Ventas**: clientes, cotizaciones, pedidos, despachos, facturas.
- **Catálogo**: SKUs con costeo por Promedio Ponderado Móvil (PMP).
- **Administración**: usuarios con roles (superadmin / admin / operador) y JWT.

## Stack

| Capa      | Tecnología                                                    |
|-----------|---------------------------------------------------------------|
| Backend   | FastAPI · SQLAlchemy 2 async · Alembic · PostgreSQL · JWT      |
| Frontend  | React 19 · TypeScript · Vite · React Router · Axios            |
| Infra     | Docker Compose · (CI en GitHub Actions)                        |

```
backend/    API FastAPI (app/models, app/routers, app/services, alembic/)
frontend/   SPA React + Vite
```

## Puesta en marcha

### Opción A — Docker (todo con un comando)

```bash
cp .env.example .env        # ajusta credenciales si quieres
docker compose up --build
```

- Frontend: http://localhost:8080
- API + docs (Swagger): http://localhost:8000/api → http://localhost:8000/docs
- PostgreSQL: localhost:5432

El backend aplica las migraciones (`alembic upgrade head`) automáticamente al arrancar.

### Opción B — Local (desarrollo)

Requisitos: Python 3.12+, Node 20+, PostgreSQL en local.

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Crea la BD y aplica migraciones
createdb minisapdb
export DATABASE_URL="postgresql+asyncpg://comprasuser@localhost/minisapdb"
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

## Variables de entorno

Ver [`.env.example`](./.env.example). Las principales:

| Variable            | Descripción                                             |
|---------------------|---------------------------------------------------------|
| `DATABASE_URL`      | Conexión asyncpg a PostgreSQL                           |
| `SECRET_KEY`        | Clave para firmar los JWT (**cambiar en producción**)   |
| `JWT_EXPIRE_MINUTES`| Vigencia del token de acceso                            |
| `CORS_ORIGINS`      | Orígenes permitidos, separados por coma                 |
| `VITE_API_URL`      | URL base del API que consume la SPA (build del frontend)|

## Migraciones (Alembic)

```bash
cd backend
alembic revision --autogenerate -m "descripcion del cambio"   # generar
alembic upgrade head                                          # aplicar
alembic downgrade -1                                          # revertir última
```

## Usuario inicial

Al arrancar por primera vez se crea un usuario `admin` (contraseña `admin2026`) si no existe. **Cambiar en el primer login.** (Se reemplazará por un flujo de alta de empresa en la fase multi-empresa.)
