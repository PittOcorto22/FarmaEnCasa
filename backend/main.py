from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
import uvicorn

# ---- BASE DE DATOS ----
from database import engine, SessionLocal
import models

# ---- RATE LIMITING (slowapi) ----
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# 1. Inicializar limitador usando la IP del cliente como clave
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="FarmaEnCasa API", version="1.1.0")

# 2. Registrar el manejador de límite excedido (HTTP 429)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Crear tablas
models.Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class Pedido(BaseModel):
    telefono: str
    medicamento: str
    cantidad: int

@app.get("/health")
def health_check():
    return {"status": "Sistema en linea y funcionando"}

@app.get("/medicamentos")
def get_medicamentos(db: Session = Depends(get_db)):
    medicamentos = db.query(models.Medicamento).all()
    return medicamentos

@app.get("/seed")
def llenar_base_de_datos(db: Session = Depends(get_db)):
    if db.query(models.Medicamento).first():
        return {"mensaje": "La base de datos ya tiene medicamentos"}

    med1 = models.Medicamento(nombre="Aspirina", precio=50.0, stock=50, es_controlado=False)
    med2 = models.Medicamento(nombre="Amoxicilina", precio=120.0, stock=15, es_controlado=True)

    db.add(med1)
    db.add(med2)
    db.commit()
    return {"mensaje": "Medicamentos agregados exitosamente a la base de datos"}

# 3. Aplicamos el límite: máximo 5 pedidos por minuto por cliente
# NOTA: Slowapi requiere que 'request: Request' sea parámetro de la función
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

    nuevo_pedido = models.Pedido(
        telefono=pedido.telefono,
        cantidad=pedido.cantidad,
        medicamento_id=medicina_db.id
    )

    db.add(nuevo_pedido)
    db.commit()
    db.refresh(nuevo_pedido)

    return {
        "mensaje": "Pedido creado con éxito",
        "orden_id": nuevo_pedido.id,
        "medicamento": medicina_db.nombre,
        "stock_restante": medicina_db.stock
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)