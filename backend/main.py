from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="FarmaEnCasa API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Pedido(BaseModel):
    telefono: str
    medicamento: str
    cantidad: int

@app.get("/health")
def health_check():
    return {"status": "Sistema en linea y funcionando"}

@app.get("/medicamentos")
def get_medicamentos():
    return [
        {"id": 1, "nombre": "Aspirina", "stock": 50, "controlado": False},
        {"id": 2, "nombre": "Amoxicilina", "stock": 15, "controlado": True}
    ]

@app.post("/pedidos")
def crear_pedido(pedido: Pedido):
    if len(pedido.telefono) < 10:
        raise HTTPException(status_code=400, detail="Telefono invalido")
    return {"mensaje": "Pedido creado", "orden_id": 1001}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)