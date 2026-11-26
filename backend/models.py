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
    categoria = Column(String, nullable=False, default="Analgésicos y Dolor", index=True)
    presentacion = Column(String, nullable=False, default="Caja estándar")
    descripcion = Column(Text, nullable=False, default="")
    imagen_url = Column(String, nullable=False, default="")

    pedidos = relationship("Pedido", back_populates="medicamento")


class Pedido(Base):
    __tablename__ = "pedidos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_nombre = Column(String, nullable=False, default="Cliente")
    telefono = Column(String, nullable=False)
    correo = Column(String, nullable=False, default="")
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


class CodigoVerificacion(Base):
    __tablename__ = "codigos_verificacion"

    id = Column(Integer, primary_key=True, index=True)
    correo = Column(String, nullable=False, index=True)
    telefono = Column(String, nullable=False, index=True)
    codigo_hash = Column(String, nullable=False)
    expira_en = Column(DateTime(timezone=True), nullable=False)
    intentos = Column(Integer, nullable=False, default=0)
    usado = Column(Boolean, nullable=False, default=False)
    creado_en = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )


# ---- TABLA PARA EL LOGIN ----
class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
