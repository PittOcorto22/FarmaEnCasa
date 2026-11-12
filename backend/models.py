from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Medicamento(Base):
    __tablename__ = "medicamentos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, index=True)
    precio = Column(Float)
    stock = Column(Integer, default=0)
    es_controlado = Column(Boolean, default=False)

    # Relación para saber en qué pedidos está este medicamento
    pedidos = relationship("Pedido", back_populates="medicamento")


class Pedido(Base):
    __tablename__ = "pedidos"

    id = Column(Integer, primary_key=True, index=True)
    telefono = Column(String(10), index=True)  # Aquí mantenemos tu regla de los 10 dígitos
    cantidad = Column(Integer, default=1)

    # Llave foránea para conectar el pedido con el medicamento real
    medicamento_id = Column(Integer, ForeignKey("medicamentos.id"))

    # Relación inversa
    medicamento = relationship("Medicamento", back_populates="pedidos")