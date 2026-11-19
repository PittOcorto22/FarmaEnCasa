Documentación Técnica: FarmaEnCasa (v1.2.0)

1. Descripción General del Proyecto

FarmaEnCasa es una aplicación web multiplataforma (Cliente/Servidor) diseñada para la gestión de inventario y pedidos de una farmacia. El sistema cuenta con un catálogo público para clientes y un panel administrativo privado para el control de inventario mediante autenticación segura.

2. Arquitectura y Stack Tecnológico

El proyecto utiliza una arquitectura de Cliente-Servidor (Frontend-Backend separados):

Backend (API REST)

Framework: FastAPI (Python)

Servidor ASGI: Uvicorn

Base de Datos: SQLite (Implementación local actual)

ORM: SQLAlchemy

Seguridad:

PyJWT para la generación y validación de tokens JSON Web Tokens (JWT).

passlib y bcrypt (v3.2.2) para el hashing y salting de contraseñas.

slowapi para la prevención de ataques de fuerza bruta y Rate Limiting.

Frontend (SPA - Single Page Application)

Librería/Framework: React.js

Herramienta de Construcción: Vite

Peticiones HTTP: fetch API nativa con manejo de Headers para autenticación (Bearer Token).

3. Modelo de Base de Datos (Relacional)

Actualmente estructurado en SQLite con tres entidades principales:

Usuarios: id, username (único), hashed_password.

Medicamentos: id, nombre (único), precio, stock, es_controlado.

Pedidos: id, telefono, cantidad, medicamento_id (Llave Foránea conectada a Medicamentos).

4. Reglas de Negocio Implementadas

Gestión de Stock: Un cliente no puede solicitar un pedido si la cantidad supera el stock actual del medicamento. Al realizar un pedido exitoso, el stock se descuenta automáticamente.

Validación de Datos: El número de teléfono del cliente debe tener una longitud mínima de 10 caracteres.

Seguridad y Límite de Peticiones (Rate Limiting): El endpoint de creación de pedidos está limitado a un máximo de 5 peticiones por minuto por dirección IP para evitar saturación o spam.

Control de Acceso (RBAC básico): Solo los usuarios con credenciales válidas (Administrador) pueden generar un token de sesión (válido por 60 minutos) y acceder a la ruta protegida para agregar nuevos medicamentos.

5. Estado Actual del Proyecto (Lo que ya está hecho)

[x] Diseño e implementación de la API REST en FastAPI.

[x] Conexión funcional con SQLite mediante SQLAlchemy.

[x] Integración de dependencias de seguridad y encriptación.

[x] Endpoint protegido (candado) con JWT para agregar medicamentos.

[x] Interfaz de usuario en React con tres vistas dinámicas: Catálogo Público, Login, y Panel de Administración.

[x] Manejo de almacenamiento local (localStorage) para persistencia de sesión en el cliente.

[x] Compatibilidad multiplataforma asegurada (Windows/macOS/Linux).

[x] Limpieza y optimización del archivo requirements.txt para garantizar instalaciones rápidas en otros entornos.

6. Siguientes Pasos (Pendientes)

Migración de Base de Datos a la Nube: Transición de SQLite (local) a un motor de base de datos relacional centralizado en la nube (ej. PostgreSQL), para que todos los clientes vean el mismo inventario en tiempo real.

Despliegue (Deployment): Subir el código de producción a servidores en la nube (ej. Render para el backend, Vercel para el frontend).

Documentación Adicional: Generación de diagramas de arquitectura, modelo relacional (ER) y manuales de usuario para el reporte académico final.