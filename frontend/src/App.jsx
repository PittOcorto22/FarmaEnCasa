import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [medicamentos, setMedicamentos] = useState([])
  const [estado, setEstado] = useState('Verificando...')

  // Estados para capturar los datos del formulario
  const [telefono, setTelefono] = useState('')
  const [medicamentoPedir, setMedicamentoPedir] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [mensajePedido, setMensajePedido] = useState('')

  useEffect(() => {
    fetch('http://localhost:8000/health')
      .then(res => res.json())
      .then(data => setEstado(data.status))
      .catch(err => setEstado('Error de conexion con el servidor'))

    fetch('http://localhost:8000/medicamentos')
      .then(res => res.json())
      .then(data => setMedicamentos(data))
      .catch(err => console.error(err))
  }, [])

  // Funcion que envia los datos al backend cuando se presiona el boton
  const hacerPedido = (e) => {
    e.preventDefault() // Evita que la pagina se recargue

    const nuevoPedido = {
      telefono: telefono,
      medicamento: medicamentoPedir,
      cantidad: parseInt(cantidad)
    }

    fetch('http://localhost:8000/pedidos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(nuevoPedido)
    })
    .then(res => res.json())
    .then(data => {
      // Si FastAPI devuelve un error (ej. telefono corto), lo mostramos
      if (data.detail) {
        setMensajePedido('Error: ' + data.detail)
      } else {
        setMensajePedido(data.mensaje + ' (Orden: ' + data.orden_id + ')')
      }
    })
    .catch(err => setMensajePedido('Error al conectar al hacer el pedido'))
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>FarmaEnCasa - Panel Principal</h1>
      <p><strong>Estado del Backend:</strong> {estado}</p>

      <h2>Catálogo de Medicamentos</h2>
      <ul>
        {medicamentos.map(med => (
          <li key={med.id}>
            {med.nombre} - Stock: {med.stock} {med.controlado ? '(Controlado)' : ''}
          </li>
        ))}
      </ul>

      <h2>Crear Nuevo Pedido</h2>
      <form onSubmit={hacerPedido} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px' }}>
        <input
          type="text"
          placeholder="Teléfono (10 dígitos)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Nombre del medicamento"
          value={medicamentoPedir}
          onChange={(e) => setMedicamentoPedir(e.target.value)}
          required
        />
        <input
          type="number"
          placeholder="Cantidad"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          min="1"
          required
        />
        <button type="submit">Enviar Pedido</button>
      </form>

      {/* Aqui se muestra el resultado del envio */}
      {mensajePedido && <p style={{ marginTop: '15px' }}><strong>Resultado:</strong> {mensajePedido}</p>}
    </div>
  )
}

export default App