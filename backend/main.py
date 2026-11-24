import json
import os
from datetime import datetime, timedelta, timezone
from typing import List

import jwt
import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

# ---- BASE DE DATOS Y ESQUEMAS ----
from database import SessionLocal, engine
import models
import schemas

# ---- CONFIGURACIÓN DE SEGURIDAD ----
SECRET_KEY = os.getenv("SECRET_KEY", "llave_secreta_farma_encasa")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="FarmaEnCasa API", version="1.3.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Por defecto solo permite Vite local; en producción definir ALLOWED_ORIGINS en Render
raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
allow_origins = [
    origin.strip().rstrip("/")
    for origin in raw_origins.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def asegurar_columnas_pedidos():
    """
    Agrega de forma segura las columnas nuevas a la tabla `pedidos` si ya existía
    previamente en PostgreSQL o SQLite, sin borrar ni modificar datos existentes.
    """
    inspector = inspect(engine)
    if "pedidos" not in inspector.get_table_names():
        return

    columnas_existentes = {col["name"] for col in inspector.get_columns("pedidos")}
    es_sqlite = engine.dialect.name == "sqlite"

    columnas_requeridas = [
        ("cliente_nombre", "VARCHAR DEFAULT 'Cliente'"),
        ("direccion", "VARCHAR DEFAULT 'Sin dirección'"),
        ("detalle_productos", "TEXT DEFAULT '[]'"),
        ("total", "FLOAT DEFAULT 0.0"),
        ("estado", "VARCHAR DEFAULT 'Pendiente'"),
        (
            "fecha_creacion",
            "TIMESTAMP" if es_sqlite else "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP",
        ),
    ]

    with engine.begin() as conn:
        for nombre_col, definicion in columnas_requeridas:
            if nombre_col not in columnas_existentes:
                conn.execute(
                    text(f"ALTER TABLE pedidos ADD COLUMN {nombre_col} {definicion}")
                )


models.Base.metadata.create_all(bind=engine)
asegurar_columnas_pedidos()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---- UTILIDADES DE SEGURIDAD ----
def verificar_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def crear_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=60)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# Función del candado: Lee el token, lo descifra y verifica quién es el usuario
def get_usuario_actual(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credenciales_exception = HTTPException(
        status_code=401,
        detail="No se pudo validar las credenciales o el token expiró",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credenciales_exception
    except jwt.InvalidTokenError:
        raise credenciales_exception

    user = db.query(models.Usuario).filter(models.Usuario.username == username).first()
    if user is None:
        raise credenciales_exception
    return user


# ---- SERIALIZADOR DE PEDIDOS ----
def serializar_pedido(pedido_db: models.Pedido) -> schemas.PedidoOut:
    detalle_lista = []
    if pedido_db.detalle_productos:
        try:
            parsed = json.loads(pedido_db.detalle_productos)
            if isinstance(parsed, list):
                detalle_lista = parsed
        except (TypeError, ValueError):
            detalle_lista = []

    # Respaldo para pedidos creados antes de la migración a carrito
    if not detalle_lista and pedido_db.medicamento is not None:
        cant = pedido_db.cantidad or 1
        precio_u = float(pedido_db.medicamento.precio or 0.0)
        detalle_lista = [
            {
                "medicamento_id": pedido_db.medicamento.id,
                "nombre": pedido_db.medicamento.nombre,
                "cantidad": cant,
                "precio_unitario": precio_u,
                "subtotal": round(precio_u * cant, 2),
            }
        ]

    total = float(pedido_db.total or 0.0)
    if total == 0.0 and detalle_lista:
        total = round(sum(float(item.get("subtotal", 0.0)) for item in detalle_lista), 2)

    return schemas.PedidoOut(
        id=pedido_db.id,
        cliente_nombre=pedido_db.cliente_nombre or "Cliente",
        telefono=pedido_db.telefono,
        direccion=pedido_db.direccion or "Sin dirección",
        detalle_productos=[schemas.DetalleProductoPedido(**item) for item in detalle_lista],
        total=total,
        estado=pedido_db.estado or "Pendiente",
        fecha_creacion=pedido_db.fecha_creacion,
    )


# ==========================================
#      ENDPOINTS DE SEGURIDAD
# ==========================================

@app.get("/crear-admin")
def crear_admin(db: Session = Depends(get_db)):
    if db.query(models.Usuario).filter(models.Usuario.username == "admin").first():
        return {"mensaje": "El usuario admin ya existe"}
    nuevo_usuario = models.Usuario(username="admin", hashed_password=get_password_hash("admin123"))
    db.add(nuevo_usuario)
    db.commit()
    return {"mensaje": "Usuario 'admin' creado con la contraseña 'admin123'"}


@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(models.Usuario.username == form_data.username).first()
    if not user or not verificar_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Usuario o contraseña incorrectos")

    token_jwt = crear_token({"sub": user.username})
    return {"access_token": token_jwt, "token_type": "bearer"}


# ==========================================
#          ENDPOINTS DEL NEGOCIO
# ==========================================

@app.get("/")
def root():
    return {
        "app": "FarmaEnCasa API",
        "version": "1.3.0",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    return {"status": "Sistema en linea y funcionando"}


@app.get("/medicamentos")
def get_medicamentos(db: Session = Depends(get_db)):
    return db.query(models.Medicamento).all()


# ---- ENDPOINT PROTEGIDO: AGREGAR MEDICAMENTO ----
@app.post("/medicamentos", dependencies=[Depends(get_usuario_actual)])
def agregar_medicamento(med: schemas.MedicamentoNuevo, db: Session = Depends(get_db)):
    if db.query(models.Medicamento).filter(models.Medicamento.nombre == med.nombre).first():
        raise HTTPException(status_code=400, detail="Este medicamento ya existe en el catálogo")

    nuevo_med = models.Medicamento(
        nombre=med.nombre, precio=med.precio, stock=med.stock, es_controlado=med.es_controlado
    )
    db.add(nuevo_med)
    db.commit()
    return {"mensaje": f"{med.nombre} agregado exitosamente al inventario"}


@app.get("/seed")
def llenar_base_de_datos(db: Session = Depends(get_db)):
    if db.query(models.Medicamento).first():
        return {"mensaje": "La base de datos ya tiene medicamentos"}

    db.add(models.Medicamento(nombre="Aspirina", precio=50.0, stock=50, es_controlado=False))
    db.add(models.Medicamento(nombre="Amoxicilina", precio=120.0, stock=15, es_controlado=True))
    db.commit()
    return {"mensaje": "Medicamentos iniciales agregados exitosamente"}


# ---- ENDPOINTS DE PEDIDOS ----
@app.post("/pedidos")
@limiter.limit("5/minute")
def crear_pedido(request: Request, pedido: schemas.PedidoCreate, db: Session = Depends(get_db)):
    cliente_nombre = pedido.cliente_nombre.strip()
    telefono = pedido.telefono.strip()
    direccion = pedido.direccion.strip()

    if len(cliente_nombre) < 2:
        raise HTTPException(status_code=400, detail="Nombre de cliente inválido")
    if len(telefono) < 10:
        raise HTTPException(status_code=400, detail="Teléfono inválido (mínimo 10 caracteres)")
    if len(direccion) < 4:
        raise HTTPException(status_code=400, detail="Dirección de entrega inválida")

    # Soporta carrito (items) o petición individual (medicamento + cantidad)
    items_solicitados = list(pedido.items or [])
    if not items_solicitados and pedido.medicamento and pedido.cantidad:
        items_solicitados = [
            schemas.ItemPedido(medicamento=pedido.medicamento, cantidad=pedido.cantidad)
        ]

    if not items_solicitados:
        raise HTTPException(status_code=400, detail="Debes incluir al menos un medicamento en el pedido")

    # Agrupar cantidades si se repite el mismo medicamento en el carrito
    cantidades_por_nombre = {}
    for item in items_solicitados:
        nombre_limpio = item.medicamento.strip()
        if not nombre_limpio or item.cantidad <= 0:
            raise HTTPException(status_code=400, detail="Producto o cantidad inválidos")
        cantidades_por_nombre[nombre_limpio] = cantidades_por_nombre.get(nombre_limpio, 0) + item.cantidad

    # Validar existencia y stock de TODOS los medicamentos antes de descontar
    medicamentos_validados = []
    for nombre_med, cant_total in cantidades_por_nombre.items():
        medicina_db = (
            db.query(models.Medicamento)
            .filter(models.Medicamento.nombre == nombre_med)
            .first()
        )
        if not medicina_db:
            raise HTTPException(
                status_code=404,
                detail=f"Medicamento '{nombre_med}' no encontrado en el catálogo",
            )
        if medicina_db.stock < cant_total:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para {medicina_db.nombre} (disponibles: {medicina_db.stock})",
            )
        medicamentos_validados.append((medicina_db, cant_total))

    # Descontar stock y construir el detalle del pedido
    detalle_lista = []
    total_pedido = 0.0
    total_unidades = 0

    for medicina_db, cant_total in medicamentos_validados:
        medicina_db.stock -= cant_total
        precio_u = float(medicina_db.precio)
        subtotal = round(precio_u * cant_total, 2)
        total_pedido = round(total_pedido + subtotal, 2)
        total_unidades += cant_total
        detalle_lista.append(
            {
                "medicamento_id": medicina_db.id,
                "nombre": medicina_db.nombre,
                "cantidad": cant_total,
                "precio_unitario": precio_u,
                "subtotal": subtotal,
            }
        )

    primer_med = medicamentos_validados[0][0]
    nuevo_pedido = models.Pedido(
        cliente_nombre=cliente_nombre,
        telefono=telefono,
        direccion=direccion,
        detalle_productos=json.dumps(detalle_lista, ensure_ascii=False),
        total=total_pedido,
        estado="Pendiente",
        fecha_creacion=datetime.now(timezone.utc),
        cantidad=total_unidades,
        medicamento_id=primer_med.id,
    )
    db.add(nuevo_pedido)
    db.commit()
    db.refresh(nuevo_pedido)

    return {
        "mensaje": "Pedido creado con éxito",
        "orden_id": nuevo_pedido.id,
        "total": nuevo_pedido.total,
        "estado": nuevo_pedido.estado,
        "detalle_productos": detalle_lista,
        "stock_restante": primer_med.stock,
    }


@app.get("/pedidos", response_model=List[schemas.PedidoOut], dependencies=[Depends(get_usuario_actual)])
def listar_pedidos(db: Session = Depends(get_db)):
    pedidos_db = (
        db.query(models.Pedido)
        .order_by(models.Pedido.fecha_creacion.desc(), models.Pedido.id.desc())
        .all()
    )
    return [serializar_pedido(p) for p in pedidos_db]


@app.patch("/pedidos/{pedido_id}", dependencies=[Depends(get_usuario_actual)])
def actualizar_estado_pedido(
    pedido_id: int,
    actualizacion: schemas.PedidoEstadoUpdate,
    db: Session = Depends(get_db),
):
    pedido_db = db.query(models.Pedido).filter(models.Pedido.id == pedido_id).first()
    if not pedido_db:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    pedido_db.estado = actualizacion.estado
    db.commit()
    db.refresh(pedido_db)

    return {
        "mensaje": f"Pedido #{pedido_db.id} actualizado a '{pedido_db.estado}'",
        "pedido": serializar_pedido(pedido_db),
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
