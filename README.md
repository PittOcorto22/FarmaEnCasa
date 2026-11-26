# FarmaEnCasa — Superfarmacia en Línea

Aplicación web cliente-servidor para la gestión de inventario, catálogo público de farmacia, pedidos a domicilio con confirmación por correo electrónico (OTP) y seguimiento en tiempo real.

- **Frontend (Vercel):** https://farma-en-casa.vercel.app
- **Backend API (Render):** `https://farmaencasa-api.onrender.com` *(documentación interactiva en `/docs`)*

---

## Características Principales

### Tienda Pública (Clientes)
- **Diseño completo tipo superfarmacia:** encabezado sticky con buscador en vivo, barra de 8 departamentos, hero promocional, tarjetas por departamento, pilares de confianza, banners editoriales e información sanitaria.
- **Catálogo enriquecido (27 productos iniciales):** organizado por departamento (*Analgésicos y Dolor, Antibióticos, Gripe y Alergias, Salud Digestiva, Vitaminas y Bienestar, Dermocosmética, Primeros Auxilios y Bebé y Maternidad*), con fotografía, presentación, descripción, precio, stock en tiempo real y distintivo *Venta Libre / Con Receta*.
- **Filtros y búsqueda:** búsqueda instantánea por nombre/síntoma/categoría, filtro por tipo de receta y ordenamiento por precio o nombre.
- **Carrito deslizable y checkout en 2 pasos:**
  1. Registro de datos de entrega (nombre, teléfono, correo electrónico y dirección) con indicador de envío gratis desde `$399 MXN`.
  2. **Confirmación de seguridad por correo (OTP):** envío de un código de 6 dígitos con vigencia de 5 minutos, cifrado con HMAC-SHA256, máximo 5 intentos y protección contra reutilización.
- **Seguimiento de pedidos en tiempo real:** consulta por número de teléfono con barra de progreso visual (`Pendiente` → `En camino` → `Entregado`), historial de órdenes y actualización automática cada 15 segundos.

### Panel de Administración (Empleados)
- **Autenticación segura con JWT:** inicio de sesión protegido (`/token`) con contraseñas hasheadas con `bcrypt` y sesiones de 60 minutos.
- **Gestión de inventario:** registro de nuevos productos (con categoría, presentación, descripción y bandera de controlado), botones de reabastecimiento rápido (`+25` / `+50` piezas) y sincronización del catálogo inicial (`/seed`).
- **Gestión de pedidos recibidos:** visualización completa de datos del cliente, correo verificado, detalle de productos y cambio de estado en tiempo real (`Pendiente`, `En camino`, `Entregado`, `Cancelado`).

---

## Arquitectura y Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend (SPA)** | React 19, Vite, CSS responsivo, `fetch` API con Bearer Token |
| **Backend (API REST)** | FastAPI, Uvicorn, SQLAlchemy, Pydantic (Python 3.11) |
| **Base de Datos** | PostgreSQL en producción (Render con `psycopg3`), SQLite (`farma.db`) en desarrollo local |
| **Seguridad** | PyJWT (HS256), `passlib` + `bcrypt`, `slowapi` (Rate Limiting), HMAC-SHA256 para OTP, CORS configurable |
| **Correo Transaccional** | Brevo REST API (HTTPS 443), Resend API o SMTP (Gmail), con modo demostración de respaldo |
| **Despliegue** | Vercel (Frontend) + Render (Backend y PostgreSQL) |

---

## Modelo de Base de Datos

- **`usuarios`**: `id`, `username` (único), `hashed_password`.
- **`medicamentos`**: `id`, `nombre` (único), `precio`, `stock`, `es_controlado`, `categoria`, `presentacion`, `descripcion`, `imagen_url`.
- **`pedidos`**: `id`, `cliente_nombre`, `telefono`, `correo`, `direccion`, `detalle_productos` (JSON), `total`, `estado`, `fecha_creacion`.
- **`codigos_verificacion`**: `id`, `correo`, `telefono`, `codigo_hash`, `expira_en`, `intentos`, `usado`, `creado_en`.

---

## Estructura del Proyecto

```text
FarmaEnCasa/
├── backend/
│   ├── main.py              # API FastAPI, seguridad JWT, OTP por correo y endpoints
│   ├── models.py            # Modelos relacionales SQLAlchemy
│   ├── schemas.py           # Esquemas de validación Pydantic
│   ├── database.py          # Conexión PostgreSQL / SQLite
│   ├── requirements.txt     # Dependencias de Python
│   └── .env.example         # Plantilla de variables de entorno del backend
├── frontend/
│   ├── public/images/       # Imágenes promocionales y de departamentos
│   ├── src/
│   │   ├── App.jsx          # Tienda, carrito, checkout OTP, rastreo y panel admin
│   │   ├── App.css          # Estilos responsivos de la superfarmacia
│   │   └── index.css        # Base y tipografía global
│   ├── index.html
│   ├── package.json
│   └── .env.example         # Plantilla de variables de entorno del frontend
├── render.yaml              # Configuración de despliegue en Render
└── README.md
```

---

## Endpoints Principales de la API

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Público | Verifica estado del servidor |
| `GET` | `/seed` | Público | Pobla el catálogo inicial (27 productos) y reabastece stock |
| `GET` | `/crear-admin` | Público | Crea el usuario administrador inicial (`admin` / `admin123`) |
| `POST` | `/token` | Público | Genera token JWT para el panel administrativo |
| `GET` | `/medicamentos` | Público | Lista el catálogo completo de productos |
| `POST` | `/medicamentos` | Admin (JWT) | Registra un nuevo producto en el inventario |
| `PATCH` | `/medicamentos/{id}` | Admin (JWT) | Actualiza stock o datos de un producto |
| `POST` | `/pedidos/enviar-codigo` | Público (5/min) | Valida stock y envía código OTP de 6 dígitos al correo |
| `POST` | `/pedidos` | Público (5/min) | Verifica el código OTP, descuenta stock y registra el pedido |
| `GET` | `/pedidos/rastreo/{telefono}` | Público | Consulta el estado e historial de pedidos por teléfono |
| `GET` | `/pedidos` | Admin (JWT) | Lista todos los pedidos recibidos |
| `PATCH` | `/pedidos/{id}` | Admin (JWT) | Actualiza el estado de un pedido |

---

## Ejecución en Desarrollo Local

### 1. Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```
El backend correrá en `http://localhost:8000`. Para inicializar usuario admin y catálogo:
- `http://localhost:8000/crear-admin`
- `http://localhost:8000/seed`

### 2. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
La aplicación abrirá en `http://localhost:5173`.

---

## Variables de Entorno (Producción)

### Backend en Render (`backend/.env.example`)
- `SECRET_KEY`: clave secreta para JWT y firma HMAC de códigos OTP.
- `DATABASE_URL`: cadena de conexión de PostgreSQL (si se omite, usa SQLite local).
- `ALLOWED_ORIGINS`: orígenes permitidos por CORS (ej. `https://farma-en-casa.vercel.app`).
- `BREVO_API_KEY`: clave API de Brevo (`xkeysib-...`) con permisos de correos transaccionales.
- `MAIL_FROM`: correo remitente verificado en Brevo.
- *(Alternativas opcionales: `RESEND_API_KEY` o `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`)*

### Frontend en Vercel (`frontend/.env.example`)
- `VITE_API_URL`: URL base del backend desplegado en Render (sin `/` al final).
