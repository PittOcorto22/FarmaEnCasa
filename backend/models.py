from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
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
    telefono = Column(String)
    cantidad = Column(Integer)
    medicamento_id = Column(Integer, ForeignKey("medicamentos.id"))

    medicamento = relationship("Medicamento", back_populates="pedidos")

# ---- NUEVA TABLA PARA EL LOGIN ----
class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)