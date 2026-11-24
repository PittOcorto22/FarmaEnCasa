Documentación Técnica: FarmaEnCasa (v1.3.0)

1. Descripción General del Proyecto

FarmaEnCasa es una aplicación web multiplataforma (Cliente/Servidor) diseñada para la gestión de inventario y pedidos de una farmacia. El sistema cuenta con un catálogo público para clientes y un panel administrativo privado para el control de inventario mediante autenticación segura.

2. Arquitectura y Stack Tecnológico

El proyecto utiliza una arquitectura de Cliente-Servidor (Frontend-Backend separados), actualmente desplegada en la nube:

Backend (API REST - Desplegado en Render)

Framework: FastAPI (Python 3.11.11 en Render mediante render.yaml)

Servidor ASGI: Uvicorn (puerto dinámico vía variable de entorno PORT)

Base de Datos: PostgreSQL en producción (vía `DATABASE_URL` y driver `psycopg[binary]` / psycopg3 con `postgresql+psycopg://`, `pool_pre_ping=True` y `pool_recycle=300`) y SQLite (`farma.db`) como respaldo automático en desarrollo local.

ORM: SQLAlchemy

Configuración por entorno: SECRET_KEY, ALLOWED_ORIGINS (CORS dinámico), DATABASE_URL y PORT (plantilla en backend/.env.example).

Seguridad:

PyJWT para la generación y validación de tokens JSON Web Tokens (JWT).

passlib y bcrypt (v3.2.2) para el hashing y salting de contraseñas.

slowapi para la prevención de ataques de fuerza bruta y Rate Limiting.

Frontend (SPA - Single Page Application - Desplegado en Vercel)

Librería/Framework: React.js (v19)

Herramienta de Construcción: Vite (Root Directory: frontend)

Peticiones HTTP: fetch API nativa con manejo de Headers para autenticación (Bearer Token) y URL del backend configurable mediante VITE_API_URL (plantilla en frontend/.env.example).

3. Modelo de Base de Datos (Relacional)

Actualmente estructurado en SQLite con tres entidades principales:

Usuarios: id, username (único), hashed_password.

Medicamentos: id, nombre (único), precio, stock, es_controlado.

Pedidos: id, cliente_nombre, telefono, direccion, detalle_productos (JSON en texto), total, estado (Pendiente/En camino/Entregado/Cancelado), fecha_creacion (y compatibilidad opcional con cantidad y medicamento_id).

4. Reglas de Negocio Implementadas

Gestión de Stock: Un cliente no puede solicitar un pedido si la cantidad supera el stock actual del medicamento. Al realizar un pedido exitoso, el stock se descuenta automáticamente.

Validación de Datos: El número de teléfono del cliente debe tener una longitud mínima de 10 caracteres.

Seguridad y Límite de Peticiones (Rate Limiting): El endpoint de creación de pedidos está limitado a un máximo de 5 peticiones por minuto por dirección IP para evitar saturación o spam.

Control de Acceso (RBAC básico): Solo los usuarios con credenciales válidas (Administrador) pueden generar un token de sesión (válido por 60 minutos) y acceder a la ruta protegida para agregar nuevos medicamentos.

5. Estado Actual del Proyecto (Lo que ya está hecho)

[x] Diseño e implementación de la API REST en FastAPI (incluyendo endpoints /, /health, /seed, /crear-admin, /token, /medicamentos y /pedidos).

[x] Conexión funcional con SQLite mediante SQLAlchemy y preparación de database.py para leer DATABASE_URL (listo para PostgreSQL).

[x] Integración de dependencias de seguridad y encriptación.

[x] Endpoint protegido (candado) con JWT para agregar medicamentos.

[x] Interfaz de usuario en React con tres vistas dinámicas: Catálogo Público, Login, y Panel de Administración.

[x] Manejo de almacenamiento local (localStorage) para persistencia de sesión en el cliente.

[x] Compatibilidad multiplataforma asegurada (Windows/macOS/Linux).

[x] Limpieza y optimización del archivo requirements.txt para garantizar instalaciones rápidas en otros entornos.

[x] Configuración de despliegue y variables de entorno: render.yaml, .gitignore raíz, backend/.env.example, frontend/.env.example, CORS y SECRET_KEY configurables, y VITE_API_URL en frontend.

[x] Despliegue (Deployment) completado y verificado en producción: Backend corriendo en Render y Frontend en Vercel comunicándose correctamente (commit 7de08e9 en origin/main).

[x] Preparación completa para PostgreSQL en la nube (`psycopg2-binary` en `backend/requirements.txt`, `pool_pre_ping=True` y `pool_recycle=300` en `backend/database.py`) manteniendo compatibilidad local con SQLite.

[x] Endurecimiento de CORS en producción (`ALLOWED_ORIGINS="https://farma-en-casa.vercel.app"` en `render.yaml`, métodos `GET, POST, PATCH, OPTIONS`, cabeceras `Authorization, Content-Type`) y validación robusta de `VITE_API_URL` / JWT en `frontend/src/App.jsx`.

[x] Módulo completo de gestión de pedidos: modelo `Pedido` extendido con migración segura de columnas existentes, `backend/schemas.py`, `POST /pedidos` con carrito y descuento atómico de stock, endpoint público `GET /pedidos/rastreo/{telefono}`, endpoints protegidos `GET /pedidos` y `PATCH /pedidos/{pedido_id}`, carrito/checkout con redirección a Seguimiento de Pedido en tiempo real (barra de progreso + polling cada 15s + buscador por teléfono) y pestaña "Pedidos Recibidos" en el Panel de Administración.

6. Siguientes Pasos (Pendientes)

1. Despliegue de PostgreSQL en Render: Subir estos cambios (`git push`), crear la instancia de PostgreSQL en Render, configurar `DATABASE_URL` (Internal Database URL) y `ALLOWED_ORIGINS=https://farma-en-casa.vercel.app` en las variables de entorno del Web Service, e inicializar `/crear-admin` y `/seed`.

2. Documentación Adicional: Generación de diagramas de arquitectura, modelo relacional (ER) y manuales de usuario para el reporte académico final.