from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class MedicamentoNuevo(BaseModel):
    nombre: str
    precio: float
    stock: int
    es_controlado: bool = False
    categoria: str = "Analgésicos y Dolor"
    presentacion: str = "Caja estándar"
    descripcion: str = ""
    imagen_url: str = ""


class MedicamentoUpdate(BaseModel):
    stock: Optional[int] = Field(default=None, ge=0)
    precio: Optional[float] = Field(default=None, gt=0)
    categoria: Optional[str] = None
    presentacion: Optional[str] = None
    descripcion: Optional[str] = None
    imagen_url: Optional[str] = None
    es_controlado: Optional[bool] = None


class ItemPedido(BaseModel):
    medicamento: str
    cantidad: int = Field(..., ge=1)


class DetalleProductoPedido(BaseModel):
    medicamento_id: Optional[int] = None
    nombre: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class PedidoCreate(BaseModel):
    cliente_nombre: str = Field(..., min_length=2)
    telefono: str = Field(..., min_length=10)
    direccion: str = Field(..., min_length=4)
    items: Optional[List[ItemPedido]] = None
    # Compatibilidad con peticiones simples de un solo medicamento
    medicamento: Optional[str] = None
    cantidad: Optional[int] = Field(default=None, ge=1)


EstadoPedido = Literal["Pendiente", "En camino", "Entregado", "Cancelado"]


class PedidoEstadoUpdate(BaseModel):
    estado: EstadoPedido


class PedidoOut(BaseModel):
    id: int
    cliente_nombre: str
    telefono: str
    direccion: str
    detalle_productos: List[DetalleProductoPedido]
    total: float
    estado: str
    fecha_creacion: Optional[datetime] = None
