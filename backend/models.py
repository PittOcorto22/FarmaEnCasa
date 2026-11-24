from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Medicamento(Base):
    __tablename__ = "medicamentos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True)
    precio = Column(Float)
    stock = Column(Integer)
    es_controlado = Column(Boolean, default=False)

    pedidos = relationship("Pedido", back_populates="medicamento")


class Pedido(Base):
    __tablename__ = "pedidos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_nombre = Column(String, nullable=False, default="Cliente")
    telefono = Column(String, nullable=False)
    direccion = Column(String, nullable=False, default="Sin dirección")
    detalle_productos = Column(Text, nullable=False, default="[]")
    total = Column(Float, nullable=False, default=0.0)
    estado = Column(String, nullable=False, default="Pendiente", index=True)
    fecha_creacion = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    # Columnas opcionales conservadas por compatibilidad con registros previos
    cantidad = Column(Integer, nullable=True)
    medicamento_id = Column(Integer, ForeignKey("medicamentos.id"), nullable=True)

    medicamento = relationship("Medicamento", back_populates="pedidos")


# ---- TABLA PARA EL LOGIN ----
class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
