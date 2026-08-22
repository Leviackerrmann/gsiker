# Guía de Estudio — Proyecto miniSAP

> **Para quién es esta guía**: alguien que sabe HTML, CSS y JavaScript básico, y quiere entender
> (y eventualmente modificar) este proyecto desde cero.
>
> **Cómo usarla**: lee las fases **en orden**. Cada fase tiene objetivos, conceptos explicados
> desde cero, archivos reales del proyecto para leer, ejercicios y tiempo estimado.
> Marca tu progreso en el checklist del [Apéndice C](#apéndice-c--checklist-de-progreso).

---

## Índice

- [El proyecto en una página](#el-proyecto-en-una-página)
- [Fase 0 — El mapa del territorio](#fase-0--el-mapa-del-territorio) (~2 h)
- [Fase 1 — Fundamentos que te faltan](#fase-1--fundamentos-que-te-faltan) (~15–20 h)
- [Fase 2 — El backend (`backend/app`)](#fase-2--el-backend-backendapp) (~10 h)
- [Fase 3 — El frontend (`frontend/src`)](#fase-3--el-frontend-frontendsrc) (~10 h)
- [Fase 4 — Todo junto](#fase-4--todo-junto) (~5 h)
- [Fase 5 — Ejercicios prácticos](#fase-5--ejercicios-prácticos) (~10 h)
- [Apéndice A — Glosario](#apéndice-a--glosario)
- [Apéndice B — Recursos gratuitos recomendados](#apéndice-b--recursos-gratuitos-recomendados)
- [Apéndice C — Checklist de progreso](#apéndice-c--checklist-de-progreso)

---

## El proyecto en una página

**miniSAP** (internamente llamado *gsiker API*) es un **ERP web** para pequeñas empresas de
Guatemala: un sistema que gestiona inventario, compras, ventas, punto de venta (POS),
cobranza y catálogo de productos.

Es **SaaS multi-empresa**: un solo servidor atiende a muchas empresas distintas, y los datos
de cada empresa están aislados de las demás (como Google Workspace: muchas empresas, misma
plataforma).

| Capa | Tecnología | ¿Qué hace? |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | Lo que ves en el navegador |
| Backend | FastAPI (Python) | Recibe peticiones, aplica reglas de negocio |
| Base de datos | PostgreSQL | Guarda toda la información |
| Infraestructura | Docker Compose | Levanta todo con un comando |

**Tamaño**: ~12,500 líneas de Python + ~9,600 líneas de TypeScript ≈ **22,000 líneas**.
Parece mucho, pero está muy bien organizado: cada módulo (inventario, ventas, compras...)
sigue el mismo patrón. Cuando entiendas uno, ya entiendes casi todos.

**Cómo levantarlo** (lo necesitarás desde la Fase 0):

```bash
cp .env.example .env        # crea tu archivo de configuración
docker compose up --build   # levanta todo
```

- Web: http://localhost:8080
- API + documentación interactiva (**Swagger**): http://localhost:8000/docs ← tu mejor amigo

---

# Fase 0 — El mapa del territorio

**Objetivo**: entender qué es un ERP, cómo se comunica un sistema web moderno, y qué pasa
cuando haces clic en un botón de esta aplicación.

## 0.1 Los tres actores de toda app web

```
┌──────────────┐         HTTP (JSON)          ┌──────────────┐        SQL        ┌──────────────┐
│   FRONTEND   │ ───────────────────────────► │   BACKEND    │ ────────────────► │  BASE DE     │
│  (navegador) │ ◄─────────────────────────── │  (servidor)  │ ◄──────────────── │    DATOS     │
│              │         respuestas           │              │                   │              │
│ React + TS   │                              │ FastAPI      │                   │ PostgreSQL   │
│ HTML/CSS/JS  │                              │ Python       │                   │ tablas       │
└──────────────┘                              └──────────────┘                   └──────────────┘
   frontend/src                                  backend/app                       docker: db
```

- **Frontend**: lo que ya conoces (HTML, CSS, JS). Aquí está la interfaz.
- **Backend**: un programa en Python que corre en un servidor. No tiene interfaz visual;
  solo **escucha peticiones** y **responde datos**.
- **Base de datos**: donde viven los datos, organizados en **tablas** (como hojas de Excel
  con columnas fijas y relaciones entre ellas).

**Dato clave**: el frontend y el backend **nunca se hablan directamente en código**. Se
comunican por HTTP enviando texto JSON. Esto significa que puedes probar el backend sin
abrir el frontend (con Swagger o `curl`), y viceversa.

## 0.2 Anatomía de una petición en miniSAP

Cuando abres la pantalla de SKUs (catálogo de productos), pasa esto:

1. El navegador pide a React que renderice la página `/skus`.
2. React ejecuta código JS que hace una petición HTTP:
   `GET http://localhost:8000/api/skus` con un header `Authorization: Bearer <token>`.
3. FastAPI recibe la petición, valida el token (¿quién eres?), valida la empresa
   (¿de qué empresa eres?) y consulta PostgreSQL.
4. PostgreSQL responde filas de la tabla `skus`; FastAPI las convierte a JSON.
5. React recibe el JSON y lo convierte en HTML visible.

Ese mismo ciclo se repite en **todas** las pantallas del sistema. Si entiendes este flujo,
entiendes el 80% de la arquitectura.

## 0.3 Conceptos propios de este proyecto

| Concepto | Significado aquí |
|---|---|
| **ERP** | Software integral de gestión empresarial (inventario + compras + ventas + finanzas) |
| **SaaS** | *Software as a Service*: el software corre en un servidor central y las empresas lo usan por suscripción |
| **Multi-tenant** | Varias empresas comparten el mismo sistema y BD, pero cada una solo ve SUS datos (aislamiento por `empresa_id`) |
| **JWT** | "Credencial digital": al hacer login el backend te da un token; lo incluyes en cada petición para demostrar quién eres |
| **Plan / Suscripción** | Cada empresa contrata un plan (Básico $99, Pro $299 GTQ/mes) que limita usuarios, registros y módulos |

## 0.4 Mapa de carpetas del repositorio

```
minisap/
├── backend/
│   ├── app/
│   │   ├── main.py          ← punto de entrada del backend
│   │   ├── database.py      ← conexión a PostgreSQL
│   │   ├── config.py        ← configuración (lee .env)
│   │   ├── dependencies.py  ← autenticación y permisos
│   │   ├── models/          ← TABLAS de la BD (una clase = una tabla)
│   │   ├── schemas/         ← "formatos" de entrada/salida de la API
│   │   ├── routers/         ← ENDPOINTS de la API (las URLs)
│   │   ├── services/        ← lógica de negocio (reglas del ERP)
│   │   └── utils/           ← utilidades (seguridad, JWT, passwords)
│   ├── alembic/             ← migraciones (historial de cambios de la BD)
│   ├── tests/               ← pruebas automáticas
│   └── seed.py / seed_local.py  ← datos de ejemplo
├── frontend/
│   ├── src/
│   │   ├── main.tsx         ← punto de entrada del frontend
│   │   ├── App.tsx          ← rutas (qué URL muestra qué página)
│   │   ├── pages/           ← UNA CARPETA POR MÓDULO (inventario/, ventas/, ...)
│   │   ├── components/      ← piezas reutilizables (Modal, Sidebar, Toast...)
│   │   ├── contexts/        ← estado global (sesión del usuario)
│   │   ├── lib/             ← utilidades (cliente HTTP axios, formato dinero)
│   │   └── styles/          ← CSS propio
│   └── package.json         ← dependencias de Node
├── docker-compose.yml       ← define los servicios (db, backend, frontend)
└── .env                     ← credenciales y configuración local
```

### Ejercicio 0.1
1. Levanta el proyecto con `docker compose up --build`.
2. Abre http://localhost:8000/docs y **explora 10 minutos**: verás todos los endpoints
   agrupados por módulo. Es la lista completa de "lo que el backend sabe hacer".
3. Abre http://localhost:8080, registra una empresa en `/register` y mete algunos datos.
4. **Pregunta de reflexión**: cuando guardaste un dato, ¿pasó primero por el frontend o por
   el backend? *(Respuesta: el frontend envió una petición POST al backend, y el backend
   escribió en la BD. El navegador nunca habla directo con la BD.)*

---

# Fase 1 — Fundamentos que te faltan

**Objetivo**: aprender lo mínimo indispensable de Python, APIs REST y SQL.
No necesitas ser experto: necesitas poder **leer** el código del proyecto sin ahogarte.

## 1.1 Python para quien sabe JavaScript (~8 h)

Python ocupa el rol que JS tiene en el navegador, pero en el servidor. Las diferencias que
más te van a chocar:

| JavaScript | Python | Ejemplo real del proyecto |
|---|---|---|
| `const x = 5` | `x = 5` (sin palabra clave) | variables simples |
| `function f(a) {}` | `def f(a):` | `def get_db():` en `database.py` |
| `{ }` delimitan bloques | **la indentación** delimita bloques | todo el proyecto |
| `// comentario` | `# comentario` | `main.py` línea 16 |
| `null` | `None` | `Mapped[str] \| None` en modelos |
| `true / false` | `True / False` | `nullable=False` en modelos |
| `async/await` | `async/await` (¡igual!) | `async def login(...)` en `routers/auth.py` |
| `import x from "mod"` | `from modulo import x` | imports de `main.py` |
| template literals `` `Hi ${name}` `` | f-strings `f"Hola {nombre}"` | `api.ts` usa esto en TS |
| objetos `{clave: valor}` | diccionarios `{"clave": "valor"}` | `PLANES_DEFAULT` en `main.py` |
| arrays `[1,2]` | listas `[1, 2]` | igualito |

Conceptos de Python que DEBES dominar antes de seguir (búscalos en cualquier tutorial):

1. Variables, tipos básicos, f-strings
2. Listas, diccionarios, tuplas
3. Funciones (`def`, parámetros con nombre: `hash_password(password=...)`)
4. Clases y herencia (`class SKU(TenantMixin, Base):` — se lee "SKU hereda de TenantMixin y Base")
5. **Decoradores**: funciones que "envuelven" otras funciones. Sintaxis `@algo` sobre una función.
   En este proyecto significan cosas como "esta función es un endpoint GET" (`@router.get("/login")`).
   Por ahora solo necesitas saber **leerlos**, no escribirlos.
6. **Type hints**: Python permite anotar tipos: `def suma(a: int, b: int) -> int:`. El proyecto
   los usa intensivamente (`Mapped[str]`, `-> AsyncSession`). Son documentación que el editor
   puede verificar.
7. `async / await`: igual de concepto que en JS moderno — operaciones lentas (BD, red) que no
   bloquean el programa mientras esperan.

**Señal de que estás listo**: puedes leer esto (real, de `backend/app/database.py`) y explicar
línea por línea qué hace:

```python
async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

*(Traducción: abre una sesión de BD; si todo sale bien, confirma los cambios (`commit`);
si algo explota, deshazlos (`rollback`) y propaga el error. `yield` indica que es un
"generador": FastAPI la usa como dependencia que entrega la sesión a cada endpoint.)*

### Ejercicio 1.1
Instala Python 3.12 y escribe un script `mi_primer_script.py` que:
- Tenga una clase `Producto` con atributos `codigo`, `precio` y un método `con_iva()` que
  devuelva el precio * 1.12 (IVA Guatemala).
- Cree una lista de 3 productos y imprima el precio con IVA de cada uno usando un f-string.

Luego compara tu solución con `backend/app/models/sku.py` — acabas de escribir la versión
"juguetito" de un modelo real.

## 1.2 APIs REST y JSON (~3 h)

Una **API REST** es un "menú" de URLs donde cada URL acepta ciertos verbos HTTP:

| Verbo | Significado | Ejemplo real del proyecto |
|---|---|---|
| `GET` | leer datos | `GET /api/skus` — lista de productos |
| `POST` | crear | `POST /api/auth/login` — iniciar sesión |
| `PUT/PATCH` | actualizar | `PATCH /api/skus/{id}` |
| `DELETE` | borrar | `DELETE /api/compras/ordenes/{id}` |

**JSON** es el formato de texto con que se intercambian los datos. Si sabes objetos de JS,
ya sabes JSON:

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer"
}
```

**Status codes** que verás en el proyecto: `200` OK · `201` creado · `400` petición inválida ·
`401` no autenticado (token inválido) · `402` suscripción vencida (¡este proyecto lo usa!) ·
`403` sin permiso · `404` no existe · `422` datos inválidos (FastAPI lo usa muchísimo) · `500` error interno.

**JWT (JSON Web Token)**: al loguearte, el backend te devuelve un token largo. Es como un
brazalete de festival: contiene tu identidad (usuario, empresa, rol) firmado digitalmente.
En cada petición lo mandas en el header: `Authorization: Bearer eyJhbG...`. El backend lo
decodifica y sabe quién eres sin volver a consultar la contraseña.

### Ejercicio 1.2
1. Abre http://localhost:8000/docs.
2. Ejecuta `POST /api/auth/login` con tu usuario (Swagger tiene un botón "Try it out").
3. Copia el `access_token`, haz clic en el botón **Authorize** 🔓 de Swagger y pégalo.
4. Ejecuta `GET /api/auth/me`. Acabas de hacer exactamente lo que hace el frontend al cargar.

## 1.3 SQL y bases de datos relacionales (~4 h)

PostgreSQL guarda datos en **tablas**. Para este proyecto necesitas entender:

```sql
SELECT codigo_sku, descripcion FROM skus WHERE empresa_id = 1;   -- leer
INSERT INTO skus (codigo_sku, descripcion) VALUES ('PROD-001', 'Teclado');  -- crear
UPDATE skus SET precio_referencia = 250 WHERE id = 7;            -- actualizar
DELETE FROM skus WHERE id = 7;                                   -- borrar
```

Y dos conceptos estructurales:

- **Primary key (PK)**: el `id` único de cada fila.
- **Foreign key (FK)**: columna que apunta al `id` de otra tabla. Ejemplo: `usuario.empresa_id`
  apunta a `empresa.id`. Así se construyen las relaciones ("un usuario pertenece a una empresa").

**Relación con el código**: cada tabla del proyecto corresponde a una clase en
`backend/app/models/`. La tabla `skus` ↔ clase `SKU`. A esa correspondencia se le llama **ORM**
(Object-Relational Mapper): escribes Python, la librería (SQLAlchemy) genera el SQL.

### Ejercicio 1.3
Entra al contenedor de la BD y juega con SQL real:

```bash
docker compose exec db psql -U comprasuser -d minisapdb
```

```sql
\dt                          -- lista todas las tablas
SELECT count(*) FROM skus;
SELECT codigo_sku, descripcion FROM skus LIMIT 5;
\q
```

---

# Fase 2 — El backend (`backend/app`)

**Objetivo**: entender cómo el backend recibe peticiones, valida identidad, habla con la BD
y responde. Lectura guiada **en orden de dificultad**.

## 2.1 `database.py` — la conexión a la BD (16 líneas)

Archivo completo:

```python
engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

- `engine`: la conexión viva a PostgreSQL (configurada en `.env` vía `DATABASE_URL`).
- `get_db()`: FastAPI la invoca **antes de cada request** que la necesite y le entrega una
  sesión. Al terminar: commit (guardar) o rollback (deshacer).
- Este patrón se llama **inyección de dependencias**: los endpoints declaran
  `db: AsyncSession = Depends(get_db)` y FastAPI hace el resto.

## 2.2 `models/` — las tablas como clases Python

Lee en este orden:

1. `models/base.py` — la clase madre de todas las tablas.
2. `models/mixins.py` — `TenantMixin`: el "sello multi-empresa". Casi todas las tablas lo
   heredan y por eso tienen columna `empresa_id`. **Este mixin es el corazón del aislamiento
   multi-tenant.**
3. `models/sku.py` — el modelo más simple y didáctico (26 líneas):

```python
class SKU(TenantMixin, Base):
    __tablename__ = "skus"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    codigo_sku: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    precio_referencia: Mapped[float] = mapped_column(Float, default=0.0)
    maneja_lotes: Mapped[bool] = mapped_column(Boolean, default=False)
    ...

    __table_args__ = (UniqueConstraint("empresa_id", "codigo_sku"),)
```

Cómo se lee: "La tabla `skus` tiene estas columnas. Un código de SKU puede repetirse entre
empresas distintas, pero **dentro de una misma empresa** es único" (esa es la
`UniqueConstraint` de dos columnas — detalle elegante de multi-tenant).

Modelos que debes reconocer después de esta lectura (no memorizar):

| Archivo | Tablas principales |
|---|---|
| `empresa.py` | `Empresa`, `Plan`, `Suscripcion` |
| `usuario.py` | `Usuario` (roles: admin, operador...) |
| `sku.py` | `SKU` (catálogo) |
| `inventario.py` | `Bodega`, `Stock`, `MovimientoInventario`, `Lote`... |
| `compras.py` | `Proveedor`, `OrdenCompra`, `RecepcionCompra`... |
| `ventas.py` | `Cliente`, `PedidoVenta`, `FacturaVenta`... |
| `pos.py` | `CajaSesion`, `VentaPOS`, `Pago` |
| `cobranza.py` | `CuentaPorCobrar`, `AbonoCxC` |

## 2.3 `schemas/` — los contratos de la API

Un **schema** (Pydantic) describe la forma exacta de los datos que entran y salen de cada
endpoint. Es el "control de calidad" automático: si el frontend manda `"precio": "abc"`
donde va un número, FastAPI rechaza con error 422 **antes** de tocar tu código.

Compara `schemas/sku.py` con `models/sku.py`: mismo producto, pero el schema expone solo los
campos seguros/públicos. Regla mental: **model = tabla de BD; schema = contrato JSON**.

## 2.4 `routers/` — los endpoints

Cada archivo agrupa endpoints de un módulo. Lee `routers/auth.py` (login) porque es el más
didáctico:

```python
router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=LoginResponse)
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    ...
```

Anatomía de un endpoint:

- `@router.post("/login")` — decorador: "URL `/api/auth/login`, método POST".
- `body: LoginRequest` — el JSON recibido, ya validado por Pydantic.
- `db: AsyncSession = Depends(get_db)` — inyección de la sesión de BD.
- `return TokenResponse(...)` — FastAPI lo serializa a JSON automáticamente.

Flujo del login (léelo en el código):
1. Rate-limit anti fuerza bruta (`ratelimit.py`).
2. Busca el usuario en la BD (`select(Usuario).where(...)`).
3. Verifica el hash de la contraseña (`verify_password` — nunca se guardan contraseñas planas).
4. Genera y devuelve el JWT con `sub` (id usuario), `empresa_id` y `rol`.

Después revisa rápido `routers/skus.py` y `routers/inventario.py`: verás que repiten el
mismo patrón (listar / obtener / crear / actualizar / borrar). **Todos los módulos siguen
ese patrón CRUD.**

## 2.5 `dependencies.py` — seguridad y multi-tenant

Aquí vive la magia del aislamiento:

- `get_current_user`: decodifica el JWT y carga el usuario. Sin token válido → 401.
- `get_current_empresa`: resuelve la empresa del usuario y configura PostgreSQL (Row-Level
  Security) para que **cualquier consulta solo vea filas de esa empresa**. Aunque hubiera un
  bug en el código, la BD misma impide cruzar datos entre empresas.
- `requiere_permiso(...)`: gates por rol (admin vs operador).
- `require_escritura`: si la suscripción está vencida → HTTP 402 y no se puede escribir.

## 2.6 `services/` — las reglas del negocio

Los routers son "recepcionistas"; los services contienen las reglas del ERP:

- `valorizacion.py` — costeo PMP (Promedio Ponderado Móvil): cómo cambia el costo unitario
  con cada compra.
- `inventario.py` — movimientos, transferencias entre bodegas, kardex.
- `limites.py` — "tu plan permite 300 SKUs y ya tienes 300" → bloqueo.
- `permisos.py` — quién puede hacer qué según su rol.

### Ejercicio 2.1 (tracer bullet)
Sigue el recorrido completo de `GET /api/skus`:
1. Encuéntralo en `routers/skus.py`.
2. Identifica qué dependencias usa (`get_current_user`? `get_current_empresa`?).
3. Encuentra el modelo y el schema involucrados.
4. Ejecútalo desde Swagger con tu token y compara la respuesta JSON con el schema.

**Entregable**: un diagrama en papel: URL → router → dependency → model → tabla → JSON.

### Ejercicio 2.2
En Swagger, intenta crear un SKU con `"codigo_sku": ""` (vacío). Observa el error 422 y
encuentra en el schema de `schemas/sku.py` la validación que lo produce.

---

# Fase 3 — El frontend (`frontend/src`)

**Objetivo**: pasar de HTML/CSS/JS plano a React + TypeScript, leyendo los archivos más
simples primero.

## 3.1 De HTML a JSX (~2 h)

React es JS para construir interfaces con **componentes** (funciones que devuelven HTML).
Su sintaxis **JSX** te resultará familiar:

```jsx
function Badge({ children }) {
  return <span className="badge">{children}</span>;   // className, no class
}
```

Diferencias clave respecto a HTML plano:

| HTML | JSX/React |
|---|---|
| `class="..."` | `className="..."` |
| `onclick="fn()"` | `onClick={fn}` |
| texto dinámico con JS manual | `{variable}` dentro del markup |
| actualizas el DOM a mano | React redibuja solo cuando cambia el **estado** |

**Estado**: datos que, al cambiar, provocan re-render. Se declara con `useState`:

```tsx
const [abierto, setAbierto] = useState(false);  // [valor, setter]
setAbierto(true);                                // React re-dibuja el componente
```

**Props**: parámetros que un componente recibe, como atributos HTML: `<Badge color="red">Agotado</Badge>`.

## 3.2 TypeScript en 15 minutos

TS = JS + tipos. El proyecto lo usa para evitar bugs. Solo necesitas leer:

```tsx
interface User {
  id: string;
  username: string;
  rol: "admin" | "operador";   // solo esos dos valores válidos
}
const [user, setUser] = useState<User | null>(null);  // User o null
```

Si ves `<User>` después de una función, es un "genérico": `useState<User>` = "este estado
contiene un User". Los tipos están definidos en `src/types/`.

## 3.3 Ruta de lectura (en orden)

1. **`frontend/index.html`** — sí, hay un HTML normal. Tiene un `<div id="root">` vacío:
   React llena TODO ahí dentro. Tu conocimiento de HTML sigue siendo la base.

2. **`src/main.tsx`** (11 líneas) — el arranque:

```tsx
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```
   *"Toma el div #root y dibuja dentro el componente App."*

3. **`src/App.tsx`** — el mapa de rutas. Componentes guardianes:
   - `ProtectedRoute`: sin sesión → redirige a `/login`.
   - `PublicRoute`: Login/Register solo si NO hay sesión.
   - `PlatformRoute`: panel del superadmin (token aparte).
   Cada ruta conecta una URL con una página: `/ventas/facturas` → `pages/ventas/Facturas.tsx`.

4. **`src/components/Layout.tsx` + `Sidebar.tsx`** — el cascarón visual (navbar + menú).
   Aquí verás CSS clásico aplicado a componentes.

5. **`src/lib/api.ts`** (27 líneas) — el cliente HTTP. Archivo ORO para entender la conexión
   front-back:

```ts
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```
   Traducción: "en TODA petición, si hay token guardado, adjúntalo automáticamente".
   Y el interceptor de respuesta: si el backend responde 401, borra el token y manda al login.

6. **`src/contexts/AuthContext.tsx`** (85 líneas) — el estado global de sesión:

```tsx
const login = async (username: string, password: string) => {
  const res = await api.post("/auth/login", { username, password });
  await finalizarLogin(res.data.access_token);
};
```
   Exactamente lo que hiciste a mano en Swagger (ejercicio 1.2), pero automatizado.
   Cualquier componente puede llamar `useAuth()` para saber quién está logueado.

7. **Una página completa**: `src/pages/inventario/Bodegas.tsx`. Patrón universal de las
   ~25 páginas del proyecto:
   ```
   useState para datos/carga/errores
   useEffect → api.get("/inventario/bodegas") al montar
   render: tabla HTML con .map() sobre los datos
   Modal para crear/editar → api.post / api.put
   ```

### Ejercicio 3.1
Con el proyecto corriendo (`npm run dev` en `frontend/`, o Docker), cambia el título de la
página en `index.html` y un texto cualquiera en `Sidebar.tsx`. Refresca y verifica.
*(Esto prueba que tu entorno funciona y que entendiste dónde vive cada cosa.)*

### Ejercicio 3.2
Abre `pages/inventario/Bodegas.tsx` y responde:
1. ¿Qué URL del API consume para listar?
2. ¿Qué pasa si `api.get` falla?
3. ¿Qué componente usa para el formulario de creación?

---

# Fase 4 — Todo junto

**Objetivo**: ver el sistema como un organismo completo, no como piezas sueltas.

## 4.1 El flujo completo de login (estudio de caso estrella)

Sigue estos pasos EN EL CÓDIGO, en orden:

1. `pages/Login.tsx` — el formulario llama `login()` del contexto.
2. `contexts/AuthContext.tsx:58` — `api.post("/auth/login", {username, password})`.
3. `lib/api.ts` — axios envía `POST http://localhost:8000/api/auth/login`.
4. `routers/auth.py:118` — FastAPI valida credenciales contra la BD y devuelve el JWT.
5. El token se guarda en `localStorage`.
6. Redirección a `/` → `ProtectedRoute` ve token → deja pasar → `Layout` + `Dashboard`.
7. Cada petición posterior lleva el token (gracias al interceptor de `api.ts`).
8. En el backend, `get_current_user` + `get_current_empresa` validan token y aíslan datos.

**Nueve pasos, cuatro archivos, dos lados del sistema.** Dibuja este flujo de memoria:
es LA prueba de que entiendes el proyecto.

## 4.2 Docker Compose — el escenario

`docker-compose.yml` define 3 servicios (+2 opcionales):

| Servicio | Qué es | Puerto |
|---|---|---|
| `db` | PostgreSQL 16 | 5433 (host) |
| `backend` | FastAPI + uvicorn; aplica migraciones al arrancar | 8000 |
| `frontend` | build de Vite servido por nginx | 8080 |
| `db-backup` | (opcional) respaldos diarios | — |
| `telegram` | (opcional) bot de Telegram con IA | — |

No necesitas dominar Docker todavía: basta entender que "levanta los 3 actores de la Fase 0,
cada uno en su caja aislada".

## 4.3 Datos de prueba (seeds)

- `backend/seed_local.py` — agrega datos realistas SIN borrar nada (clientes guatemaltecos,
  SKUs, stock). Idempotente: detecta si ya corrió. Ejecutar:
  `docker compose exec backend python seed_local.py`.
- `backend/seed.py` — ⚠️ destructivo: borra TODO y recarga. Solo para resetear.

## 4.4 Migraciones (Alembic)

Cuando cambias un modelo (agregar columna), la BD no cambia sola. Se genera una "migración":

```bash
cd backend
alembic revision --autogenerate -m "agrega campo X a sku"
alembic upgrade head      # aplicar
alembic downgrade -1      # revertir última
```

Mira `backend/alembic/versions/`: es el historial/git de la estructura de la BD.

## 4.5 Tests

`backend/tests/` — 11 archivos. Los nombres cuentan la historia del sistema:
`test_multitenancy.py` (¿una empresa ve datos de otra?), `test_permisos.py`,
`test_planes_limites.py`, `test_pos.py`, `test_audit.py`...

```bash
docker compose exec backend pytest
```

### Ejercicio 4.1
Corre `docker compose exec backend pytest test_health.py -v` y luego abre
`tests/test_health.py`. Los tests son excelentes ejemplos de cómo SE USA la API.

---

# Fase 5 — Ejercicios prácticos

De menor a mayor dificultad. Hazlos en orden; cada uno consolida el anterior.

### Ejercicio 5.1 — Tourista del API (30 min)
Sin tocar código: en Swagger, crea un proveedor, una bodega y un SKU. Luego lista cada uno.
**Meta**: soltura total con POST/GET y el botón Authorize.

### Ejercicio 5.2 — Cambio cosmético end-to-end (1 h)
Cambia la etiqueta "Bodegas" por "Almacenes" en:
1. El menú (`components/Sidebar.tsx`)
2. El título de la página (`pages/inventario/Bodegas.tsx`)
Verifica en el navegador. **Meta**: ciclo editar→ver resultado.

### Ejercicio 5.3 — Nuevo campo en SKU, mitad backend (2–3 h)
Agrega el campo `marca: str | None` al modelo `SKU`:
1. `models/sku.py` — agrega la columna.
2. Genera migración: `alembic revision --autogenerate -m "sku marca"` + `upgrade head`.
3. `schemas/sku.py` — agrégalo al schema de respuesta y al de creación.
4. Verifica en Swagger que aparece al crear/listar.
**Pistas**: mira cómo está definido `categoria` (también nullable String) y copia el patrón.

### Ejercicio 5.4 — Completa el circuito: marca en el frontend (2–3 h)
Continúa el 5.3:
1. `types/` — agrega `marca?: string` a la interfaz de SKU.
2. `pages/SKUs.tsx` — muestra la columna en la tabla y el input en el formulario.
3. Prueba creando un SKU con marca desde la web.
**Meta**: primer cambio FULL-STACK tuyo, de BD a pantalla. 🎉

### Ejercicio 5.5 — Endpoint nuevo (3–4 h)
Crea `GET /api/skus/resumen` que devuelva `{"total": N, "sin_stock": M}`:
1. Agrega la función en `routers/skus.py` (copia el patrón de otro GET).
2. Consulta con `select(func.count(SKU.id))` (busca ejemplos de `func.count` en otros routers).
3. Pruébalo en Swagger.
4. (Opcional) muéstralo en el Dashboard.

### Ejercicio 5.6 — Lee un service de verdad (2 h)
Lee `services/valorizacion.py` (costeo PMP) e intenta explicar con tus palabras:
¿qué le pasa al costo unitario cuando compro 10 unidades a Q50 teniendo 10 unidades a Q30?
Verifica tu respuesta con el código y con un test de `tests/test_multimoneda.py` o similar.

---

# Apéndice A — Glosario

| Término | Definición corta |
|---|---|
| **API** | Menú de URLs por donde un programa pide datos a otro |
| **Async** | Operaciones que no bloquean el programa mientras esperan (BD, red) |
| **CRUD** | Create, Read, Update, Delete — las 4 operaciones básicas |
| **Decorador** | `@algo` sobre una función; le agrega comportamiento (ej: convertirla en endpoint) |
| **Dependencias (DI)** | FastAPI te entrega objetos listos (sesión BD, usuario actual) si los declaras como parámetros |
| **Endpoint** | Una URL + método que ejecuta una función del backend |
| **FK** | Foreign key: columna que apunta al id de otra tabla |
| **Hook** | Función de React con superpoderes: `useState`, `useEffect`, `useContext` |
| **Interceptor** | Código de axios que se ejecuta en TODA petición/respuesta |
| **JSON** | Formato de texto para intercambiar datos (objetos JS serializados) |
| **JWT** | Token firmado que identifica al usuario en cada petición |
| **Middleware** | Código que procesa TODAS las peticiones antes/después (auditoría, CORS) |
| **Migración** | Script versionado que cambia la estructura de la BD |
| **Multi-tenant** | Muchas empresas, un sistema, datos aislados por `empresa_id` |
| **ORM** | Traductor clases Python ↔ tablas SQL (SQLAlchemy) |
| **Props** | Parámetros que recibe un componente React |
| **RLS** | Row-Level Security: PostgreSQL filtra filas por empresa a nivel de BD |
| **Schema (Pydantic)** | Contrato de forma/validación de datos de entrada/salida de la API |
| **SPA** | Single Page Application: el navegador carga 1 HTML y React dibuja todo |
| **State** | Datos internos de un componente cuyo cambio dispara re-render |
| **Tenant** | Una empresa cliente del SaaS |
| **Vite** | Herramienta que compila/sirve el frontend en desarrollo |

# Apéndice B — Recursos gratuitos recomendados

| Tema | Recurso | Nota |
|---|---|---|
| Python | [docs.python.org/es/3/tutorial](https://docs.python.org/es/3/tutorial/) | oficial, en español — capítulos 1–5 y 9 |
| Python (video) | freeCodeCamp.org — "Python para principiantes" | busca versión en español |
| SQL | [sqlbolt.com](https://sqlbolt.com) | interactivo, 2–3 horas |
| APIs REST | [restfulapi.net](https://restfulapi.net) | referencia clara |
| FastAPI | [fastapi.tiangolo.com/es/](https://fastapi.tiangolo.com/es/) | **oficial en español, excelente** — tutorial completo |
| SQLAlchemy | [docs.sqlalchemy.org](https://docs.sqlalchemy.org/tutorial/) | solo el tutorial básico |
| React | [es.react.dev/learn](https://es.react.dev/learn) | **oficial en español** — secciones "Describing the UI" y "Managing State" |
| TypeScript | [typescriptlang.org/docs/handbook](https://www.typescriptlang.org/docs/handbook/2/basic-types.html) | solo "The Basics" y "Everyday Types" |
| JWT | [jwt.io/introduction](https://jwt.io/introduction) | 10 minutos |
| Docker | [docker.com/get-started](https://www.docker.com/get-started/) | solo conceptos, no necesitas dominarlo |

**Regla de oro**: cuando un concepto no entiendas, búscalo en estos recursos SOLO lo
necesario y vuelve al código del proyecto. El proyecto es el libro de texto principal.

# Apéndice C — Checklist de progreso

### Fase 0
- [ ] Explico frontend / backend / BD y cómo se comunican
- [ ] Levanté el proyecto con Docker
- [ ] Exploré Swagger (/docs) y la web (:8080)

### Fase 1
- [ ] Escribí mi script de Python con clases y listas
- [ ] Hice login desde Swagger y llamé un endpoint protegido
- [ ] Corrí consultas SQL dentro del contenedor de la BD

### Fase 2
- [ ] Entiendo `database.py` línea por línea
- [ ] Puedo leer un modelo y decir qué columnas tiene la tabla
- [ ] Sé explicar la diferencia model vs schema
- [ ] Trazé `GET /api/skus` de punta a punta (ejercicio 2.1)
- [ ] Entiendo cómo `empresa_id` + RLS aíslan los datos por empresa

### Fase 3
- [ ] Entiendo JSX y sus diferencias con HTML
- [ ] Sé qué hace `main.tsx` y `App.tsx`
- [ ] Explico el interceptor de `lib/api.ts`
- [ ] Explico el flujo de `AuthContext.tsx`
- [ ] Identifico el patrón useState/useEffect/render en una página

### Fase 4
- [ ] Dibujo de memoria el flujo completo de login (9 pasos)
- [ ] Sé qué levanta cada servicio de docker-compose
- [ ] Corrí los seeds y los tests
- [ ] Sé generar y aplicar una migración

### Fase 5
- [ ] 5.1 Tour del API
- [ ] 5.2 Cambio cosmético
- [ ] 5.3 Campo `marca` en backend
- [ ] 5.4 Campo `marca` en frontend (full-stack)
- [ ] 5.5 Endpoint `/api/skus/resumen`
- [ ] 5.6 Entiendo el costeo PMP

---

*Última actualización: agosto 2026 · Generada a partir del análisis del código real del repositorio.*
