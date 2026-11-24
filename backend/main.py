import os
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
import uvicorn
import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext

# ---- BASE DE DATOS ----
from database import engine, SessionLocal
import models

# ---- RATE LIMITING (slowapi) ----
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# ---- CONFIGURACIÓN DE SEGURIDAD ----
SECRET_KEY = os.getenv("SECRET_KEY", "llave_secreta_farma_encasa")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="FarmaEnCasa API", version="1.2.0")

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
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

models.Base.metadata.create_all(bind=engine)

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

# ---- MODELOS DE DATOS (PYDANTIC) ----
class Pedido(BaseModel):
    telefono: str
    medicamento: str
    cantidad: int

class MedicamentoNuevo(BaseModel):
    nombre: str
    precio: float
    stock: int
    es_controlado: bool = False

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
        "version": "1.2.0",
        "health": "/health",
        "docs": "/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "Sistema en linea y funcionando"}

@app.get("/medicamentos")
def get_medicamentos(db: Session = Depends(get_db)):
    return db.query(models.Medicamento).all()

# ---- NUEVO ENDPOINT PROTEGIDO ----
@app.post("/medicamentos", dependencies=[Depends(get_usuario_actual)])
def agregar_medicamento(med: MedicamentoNuevo, db: Session = Depends(get_db)):
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

@app.post("/pedidos")
@limiter.limit("5/minute")
def crear_pedido(request: Request, pedido: Pedido, db: Session = Depends(get_db)):
    if len(pedido.telefono) < 10:
        raise HTTPException(status_code=400, detail="Telefono invalido")

    medicina_db = db.query(models.Medicamento).filter(models.Medicamento.nombre == pedido.medicamento).first()

    if not medicina_db:
        raise HTTPException(status_code=404, detail="Medicamento no encontrado en el catalogo")
    if medicina_db.stock < pedido.cantidad:
        raise HTTPException(status_code=400, detail="Stock insuficiente para surtir este pedido")

    medicina_db.stock -= pedido.cantidad
    nuevo_pedido = models.Pedido(telefono=pedido.telefono, cantidad=pedido.cantidad, medicamento_id=medicina_db.id)
    db.add(nuevo_pedido)
    db.commit()

    return {
        "mensaje": "Pedido creado con éxito",
        "orden_id": nuevo_pedido.id,
        "medicamento": medicina_db.nombre,
        "stock_restante": medicina_db.stock
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)