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


def asegurar_columnas_medicamentos():
    """
    Agrega de forma segura columnas de catálogo enriquecido a la tabla `medicamentos`
    si ya existía previamente en PostgreSQL o SQLite.
    """
    inspector = inspect(engine)
    if "medicamentos" not in inspector.get_table_names():
        return

    columnas_existentes = {col["name"] for col in inspector.get_columns("medicamentos")}
    columnas_requeridas = [
        ("categoria", "VARCHAR DEFAULT 'Analgésicos y Dolor'"),
        ("presentacion", "VARCHAR DEFAULT 'Caja estándar'"),
        ("descripcion", "TEXT DEFAULT ''"),
        ("imagen_url", "VARCHAR DEFAULT ''"),
    ]

    with engine.begin() as conn:
        for nombre_col, definicion in columnas_requeridas:
            if nombre_col not in columnas_existentes:
                conn.execute(
                    text(f"ALTER TABLE medicamentos ADD COLUMN {nombre_col} {definicion}")
                )


models.Base.metadata.create_all(bind=engine)
asegurar_columnas_pedidos()
asegurar_columnas_medicamentos()


CATALOGO_INICIAL = [
    # Analgésicos y Dolor
    {
        "nombre": "Paracetamol",
        "precio": 32.0,
        "stock": 120,
        "es_controlado": False,
        "categoria": "Analgésicos y Dolor",
        "presentacion": "Caja con 20 tabletas · 500 mg",
        "descripcion": "Alivio eficaz del dolor leve a moderado y control rápido de la fiebre.",
        "imagen_url": "/images/cat-analgesicos.jpg",
    },
    {
        "nombre": "Aspirina",
        "precio": 54.0,
        "stock": 95,
        "es_controlado": False,
        "categoria": "Analgésicos y Dolor",
        "presentacion": "Caja con 40 tabletas · 500 mg",
        "descripcion": "Ácido acetilsalicílico auxiliar en dolor de cabeza, malestar muscular y fiebre.",
        "imagen_url": "/images/cat-analgesicos.jpg",
    },
    {
        "nombre": "Ibuprofeno 400 mg",
        "precio": 48.0,
        "stock": 110,
        "es_controlado": False,
        "categoria": "Analgésicos y Dolor",
        "presentacion": "Caja con 20 cápsulas blandas",
        "descripcion": "Antiinflamatorio y analgésico de rápida absorción para dolores musculares y articulares.",
        "imagen_url": "/images/cat-analgesicos.jpg",
    },
    {
        "nombre": "Naproxeno Sódico 550 mg",
        "precio": 76.0,
        "stock": 85,
        "es_controlado": False,
        "categoria": "Analgésicos y Dolor",
        "presentacion": "Caja con 12 tabletas",
        "descripcion": "Auxiliar en el alivio de inflamación, dolor muscular, lumbar y cólicos.",
        "imagen_url": "/images/cat-analgesicos.jpg",
    },
    {
        "nombre": "Ketorolaco 10 mg",
        "precio": 65.0,
        "stock": 70,
        "es_controlado": False,
        "categoria": "Analgésicos y Dolor",
        "presentacion": "Caja con 10 tabletas",
        "descripcion": "Analgésico de acción rápida indicado para alivio a corto plazo del dolor agudo.",
        "imagen_url": "/images/cat-analgesicos.jpg",
    },
    # Antibióticos (Receta)
    {
        "nombre": "Amoxicilina",
        "precio": 125.0,
        "stock": 65,
        "es_controlado": True,
        "categoria": "Antibióticos",
        "presentacion": "Caja con 12 cápsulas · 500 mg",
        "descripcion": "Antibiótico de amplio espectro. Su venta requiere receta médica vigente.",
        "imagen_url": "/images/cat-antibioticos.jpg",
    },
    {
        "nombre": "Azitromicina 500 mg",
        "precio": 168.0,
        "stock": 55,
        "es_controlado": True,
        "categoria": "Antibióticos",
        "presentacion": "Caja con 3 tabletas",
        "descripcion": "Antibiótico macrólido para infecciones respiratorias. Requiere receta médica.",
        "imagen_url": "/images/cat-antibioticos.jpg",
    },
    {
        "nombre": "Ciprofloxacino 500 mg",
        "precio": 142.0,
        "stock": 50,
        "es_controlado": True,
        "categoria": "Antibióticos",
        "presentacion": "Caja con 12 tabletas",
        "descripcion": "Antibiótico de amplio espectro. Venta exclusiva bajo prescripción médica.",
        "imagen_url": "/images/cat-antibioticos.jpg",
    },
    # Gripe y Alergias
    {
        "nombre": "Loratadina 10 mg",
        "precio": 42.0,
        "stock": 130,
        "es_controlado": False,
        "categoria": "Gripe y Alergias",
        "presentacion": "Caja con 20 tabletas",
        "descripcion": "Antihistamínico 24 horas que alivia estornudos, escurrimiento y alergias sin sueño.",
        "imagen_url": "/images/cat-gripe.jpg",
    },
    {
        "nombre": "Antigripal Día y Noche",
        "precio": 98.0,
        "stock": 90,
        "es_controlado": False,
        "categoria": "Gripe y Alergias",
        "presentacion": "Caja con 24 cápsulas",
        "descripcion": "Fórmula multisíntoma contra congestión nasal, cuerpo cortado, dolor y fiebre.",
        "imagen_url": "/images/cat-gripe.jpg",
    },
    {
        "nombre": "Jarabe Ambroxol 30 mg",
        "precio": 74.0,
        "stock": 80,
        "es_controlado": False,
        "categoria": "Gripe y Alergias",
        "presentacion": "Frasco con 120 ml + vaso dosificador",
        "descripcion": "Mucolítico y expectorante auxiliar en el alivio de tos con flemas.",
        "imagen_url": "/images/cat-gripe.jpg",
    },
    {
        "nombre": "Spray Nasal Solución Salina",
        "precio": 89.0,
        "stock": 75,
        "es_controlado": False,
        "categoria": "Gripe y Alergias",
        "presentacion": "Frasco atomizador · 50 ml",
        "descripcion": "Descongestionante isotónico suave para hidratación e higiene nasal diaria.",
        "imagen_url": "/images/cat-gripe.jpg",
    },
    # Salud Digestiva
    {
        "nombre": "Omeprazol 20 mg",
        "precio": 58.0,
        "stock": 115,
        "es_controlado": False,
        "categoria": "Salud Digestiva",
        "presentacion": "Caja con 14 cápsulas",
        "descripcion": "Auxiliar en el tratamiento de la acidez estomacal frecuente y reflujo gastroesofágico.",
        "imagen_url": "/images/cat-digestivo.jpg",
    },
    {
        "nombre": "Subsalicilato de Bismuto",
        "precio": 112.0,
        "stock": 85,
        "es_controlado": False,
        "categoria": "Salud Digestiva",
        "presentacion": "Frasco suspensión · 236 ml",
        "descripcion": "Alivio rápido para indigestión, acidez, náuseas y malestar estomacal.",
        "imagen_url": "/images/cat-digestivo.jpg",
    },
    {
        "nombre": "Probióticos Flora Intestinal",
        "precio": 189.0,
        "stock": 70,
        "es_controlado": False,
        "categoria": "Salud Digestiva",
        "presentacion": "Caja con 10 ampolletas bebibles",
        "descripcion": "Ayuda a regenerar y mantener el equilibrio natural de la microbiota intestinal.",
        "imagen_url": "/images/cat-digestivo.jpg",
    },
    # Vitaminas y Bienestar
    {
        "nombre": "Vitamina C + Zinc Efervescente",
        "precio": 118.0,
        "stock": 140,
        "es_controlado": False,
        "categoria": "Vitaminas y Bienestar",
        "presentacion": "Tubo con 20 tabletas · Sabor naranja",
        "descripcion": "Suplemento antioxidante que fortalece el sistema inmunológico diariamente.",
        "imagen_url": "/images/cat-vitaminas.jpg",
    },
    {
        "nombre": "Complejo B + Ácido Fólico",
        "precio": 94.0,
        "stock": 105,
        "es_controlado": False,
        "categoria": "Vitaminas y Bienestar",
        "presentacion": "Frasco con 60 tabletas",
        "descripcion": "Contribuye al metabolismo energético y al buen funcionamiento del sistema nervioso.",
        "imagen_url": "/images/cat-vitaminas.jpg",
    },
    {
        "nombre": "Vitamina D3 4000 UI",
        "precio": 145.0,
        "stock": 90,
        "es_controlado": False,
        "categoria": "Vitaminas y Bienestar",
        "presentacion": "Frasco con 60 cápsulas blandas",
        "descripcion": "Apoya la absorción de calcio, la salud ósea y el bienestar inmunológico.",
        "imagen_url": "/images/cat-vitaminas.jpg",
    },
    {
        "nombre": "Electrolitos Orales Manzana",
        "precio": 29.0,
        "stock": 150,
        "es_controlado": False,
        "categoria": "Vitaminas y Bienestar",
        "presentacion": "Botella 625 ml lista para beber",
        "descripcion": "Hidratación instantánea con glucosa y minerales esenciales para recuperar energía.",
        "imagen_url": "/images/cat-vitaminas.jpg",
    },
    # Dermocosmética y Cuidado
    {
        "nombre": "Protector Solar Facial FPS 50+",
        "precio": 285.0,
        "stock": 65,
        "es_controlado": False,
        "categoria": "Dermocosmética",
        "presentacion": "Tubo 50 ml · Toque seco",
        "descripcion": "Muy alta protección dermatológica UVA/UVB sin brillo ni sensación grasosa.",
        "imagen_url": "/images/cat-cuidado.jpg",
    },
    {
        "nombre": "Crema Hidratante Reparadora",
        "precio": 215.0,
        "stock": 75,
        "es_controlado": False,
        "categoria": "Dermocosmética",
        "presentacion": "Envase con dispensador · 400 ml",
        "descripcion": "Fórmula con ceramidas y ácido hialurónico ideal para piel seca y sensible.",
        "imagen_url": "/images/cat-cuidado.jpg",
    },
    {
        "nombre": "Agua Micelar Dermolimpiadora",
        "precio": 169.0,
        "stock": 80,
        "es_controlado": False,
        "categoria": "Dermocosmética",
        "presentacion": "Frasco 400 ml · Sin fragancia",
        "descripcion": "Limpia impurezas y desmaquilla suavemente respetando el pH natural de la piel.",
        "imagen_url": "/images/cat-cuidado.jpg",
    },
    # Primeros Auxilios
    {
        "nombre": "Termómetro Digital Clínico",
        "precio": 115.0,
        "stock": 60,
        "es_controlado": False,
        "categoria": "Primeros Auxilios",
        "presentacion": "1 pieza · Punta flexible y alarma",
        "descripcion": "Lectura clínica precisa en 60 segundos con memoria de última medición.",
        "imagen_url": "/images/cat-auxilios.jpg",
    },
    {
        "nombre": "Botiquín Esencial Curitas y Gasas",
        "precio": 138.0,
        "stock": 85,
        "es_controlado": False,
        "categoria": "Primeros Auxilios",
        "presentacion": "Estuche con 40 piezas estériles",
        "descripcion": "Incluye gasas estériles, vendas elásticas, cinta microporosa y curitas surtidas.",
        "imagen_url": "/images/cat-auxilios.jpg",
    },
    {
        "nombre": "Alcohol Etílico 70° Antiséptico",
        "precio": 38.0,
        "stock": 130,
        "es_controlado": False,
        "categoria": "Primeros Auxilios",
        "presentacion": "Botella con 500 ml",
        "descripcion": "Antiséptico tópico indispensable para la desinfección y botiquín familiar.",
        "imagen_url": "/images/cat-auxilios.jpg",
    },
    # Bebé y Maternidad
    {
        "nombre": "Suero Oral Pediátrico Fresa",
        "precio": 34.0,
        "stock": 110,
        "es_controlado": False,
        "categoria": "Bebé y Maternidad",
        "presentacion": "Botella 500 ml · Sabor fresa",
        "descripcion": "Solución de rehidratación oral balanceada especialmente pensada para niños.",
        "imagen_url": "/images/cat-bebe.jpg",
    },
    {
        "nombre": "Pomada Protectora para Rozaduras",
        "precio": 129.0,
        "stock": 75,
        "es_controlado": False,
        "categoria": "Bebé y Maternidad",
        "presentacion": "Tubo 110 g · Con óxido de zinc",
        "descripcion": "Forma una barrera protectora hipoalergénica que calma y cuida la piel del bebé.",
        "imagen_url": "/images/cat-bebe.jpg",
    },
]


def poblar_y_reabastecer_catalogo(db: Session):
    """
    Inserta productos faltantes del catálogo inicial, completa metadatos vacíos
    y reabastece stock cuando está por debajo del stock recomendado.
    """
    existentes = db.query(models.Medicamento).all()
    mapa_por_nombre = {}
    for med in existentes:
        nombre_limpio = (med.nombre or "").strip()
        if med.nombre != nombre_limpio and nombre_limpio not in mapa_por_nombre:
            med.nombre = nombre_limpio
        mapa_por_nombre[nombre_limpio.lower()] = med

    agregados = 0
    actualizados = 0

    for item in CATALOGO_INICIAL:
        clave = item["nombre"].strip().lower()
        med_db = mapa_por_nombre.get(clave)
        if med_db is None:
            nuevo = models.Medicamento(**item)
            db.add(nuevo)
            mapa_por_nombre[clave] = nuevo
            agregados += 1
        else:
            cambio = False
            if (med_db.stock or 0) < item["stock"]:
                med_db.stock = item["stock"]
                cambio = True
            if not med_db.categoria or med_db.categoria == "General":
                med_db.categoria = item["categoria"]
                cambio = True
            if not med_db.presentacion or med_db.presentacion == "Caja estándar":
                med_db.presentacion = item["presentacion"]
                cambio = True
            if not med_db.descripcion:
                med_db.descripcion = item["descripcion"]
                cambio = True
            if not med_db.imagen_url:
                med_db.imagen_url = item["imagen_url"]
                cambio = True
            if cambio:
                actualizados += 1

    db.commit()
    return agregados, actualizados


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
    nombre_limpio = med.nombre.strip()
    if db.query(models.Medicamento).filter(models.Medicamento.nombre == nombre_limpio).first():
        raise HTTPException(status_code=400, detail="Este medicamento ya existe en el catálogo")

    nuevo_med = models.Medicamento(
        nombre=nombre_limpio,
        precio=med.precio,
        stock=med.stock,
        es_controlado=med.es_controlado,
        categoria=(med.categoria or "Analgésicos y Dolor").strip(),
        presentacion=(med.presentacion or "Caja estándar").strip(),
        descripcion=(med.descripcion or "").strip(),
        imagen_url=(med.imagen_url or "").strip(),
    )
    db.add(nuevo_med)
    db.commit()
    db.refresh(nuevo_med)
    return {
        "mensaje": f"{nuevo_med.nombre} agregado exitosamente al inventario",
        "medicamento": nuevo_med,
    }


# ---- ENDPOINT PROTEGIDO: ACTUALIZAR STOCK / DATOS DE MEDICAMENTO ----
@app.patch("/medicamentos/{medicamento_id}", dependencies=[Depends(get_usuario_actual)])
def actualizar_medicamento(
    medicamento_id: int,
    datos: schemas.MedicamentoUpdate,
    db: Session = Depends(get_db),
):
    med_db = db.query(models.Medicamento).filter(models.Medicamento.id == medicamento_id).first()
    if not med_db:
        raise HTTPException(status_code=404, detail="Medicamento no encontrado")

    if datos.stock is not None:
        med_db.stock = datos.stock
    if datos.precio is not None:
        med_db.precio = datos.precio
    if datos.categoria is not None:
        med_db.categoria = datos.categoria.strip()
    if datos.presentacion is not None:
        med_db.presentacion = datos.presentacion.strip()
    if datos.descripcion is not None:
        med_db.descripcion = datos.descripcion.strip()
    if datos.imagen_url is not None:
        med_db.imagen_url = datos.imagen_url.strip()
    if datos.es_controlado is not None:
        med_db.es_controlado = datos.es_controlado

    db.commit()
    db.refresh(med_db)
    return {
        "mensaje": f"Inventario actualizado: {med_db.nombre} (Stock: {med_db.stock})",
        "medicamento": med_db,
    }


@app.get("/seed")
def llenar_base_de_datos(db: Session = Depends(get_db)):
    agregados, actualizados = poblar_y_reabastecer_catalogo(db)
    total = db.query(models.Medicamento).count()
    return {
        "mensaje": (
            f"Catálogo sincronizado: {agregados} productos nuevos agregados, "
            f"{actualizados} productos reabastecidos/actualizados (total: {total})."
        ),
        "agregados": agregados,
        "actualizados": actualizados,
        "total": total,
    }


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

    pedido_serializado = serializar_pedido(nuevo_pedido)

    return {
        "mensaje": "Pedido creado con éxito",
        "id": nuevo_pedido.id,
        "orden_id": nuevo_pedido.id,
        "total": nuevo_pedido.total,
        "estado": nuevo_pedido.estado,
        "detalle_productos": detalle_lista,
        "stock_restante": primer_med.stock,
        "pedido": pedido_serializado,
    }


@app.get("/pedidos/rastreo/{telefono}", response_model=List[schemas.PedidoOut])
def rastrear_pedidos_por_telefono(telefono: str, db: Session = Depends(get_db)):
    telefono_limpio = telefono.strip()
    if len(telefono_limpio) < 10:
        raise HTTPException(status_code=400, detail="Ingresa un teléfono válido de al menos 10 dígitos")

    pedidos_db = (
        db.query(models.Pedido)
        .filter(models.Pedido.telefono == telefono_limpio)
        .order_by(models.Pedido.fecha_creacion.desc(), models.Pedido.id.desc())
        .all()
    )
    return [serializar_pedido(p) for p in pedidos_db]


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
