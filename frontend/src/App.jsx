import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [medicamentos, setMedicamentos] = useState([])
  const [estado, setEstado] = useState('Verificando...')

  const [telefono, setTelefono] = useState('')
  const [medicamentoPedir, setMedicamentoPedir] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [mensajePedido, setMensajePedido] = useState('')

  const cargarMedicamentos = () => {
    fetch('http://localhost:8000/medicamentos')
      .then(res => res.json())
      .then(data => setMedicamentos(data))
      .catch(err => console.error(err))
  }

  useEffect(() => {
    fetch('http://localhost:8000/health')
      .then(res => res.json())
      .then(data => setEstado(data.status))
      .catch(err => setEstado('Error de conexion con el servidor'))

    cargarMedicamentos()
  }, [])

  const hacerPedido = (e) => {
    e.preventDefault()
    setMensajePedido('Procesando pedido...')

    const nuevoPedido = {
      telefono: telefono,
      medicamento: medicamentoPedir,
      cantidad: parseInt(cantidad)
    }

    fetch('http://localhost:8000/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoPedido)
    })
    .then(async (res) => {
      const data = await res.json()
      if (!res.ok) {
        let mensajeError = data.detail || data.error || 'Error desconocido al procesar'
        if (res.status === 429) {
          mensajeError = '⚠️ Límite de seguridad: Demasiados pedidos muy rápido. Por favor, espera un minuto.'
        }
        throw new Error(mensajeError)
      }
      return data
    })
    .then(data => {
      setMensajePedido(`✅ ${data.mensaje} (Orden: ${data.orden_id}). Quedan ${data.stock_restante} en stock.`)
      cargarMedicamentos()
      setMedicamentoPedir('')
      setCantidad(1)
    })
    .catch(err => setMensajePedido(err.message))
  }

  return (
    <div className="app-container">
      <h1>FarmaEnCasa</h1>
      <p className="status-text">Estado del Backend: {estado}</p>

      <h2>Catálogo de Medicamentos</h2>
      <ul className="med-list">
        {medicamentos.map(med => (
          <li key={med.id}>
            {med.nombre}
            <span>Stock: {med.stock} {med.es_controlado ? ' (Controlado)' : ''}</span>
          </li>
        ))}
      </ul>

      <h2>Crear Nuevo Pedido</h2>
      <form onSubmit={hacerPedido} className="form-container">
        <input
          type="text"
          placeholder="Teléfono (10 dígitos)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          required
        />

        <select
          value={medicamentoPedir}
          onChange={(e) => setMedicamentoPedir(e.target.value)}
          required
        >
          <option value="" disabled>Selecciona un medicamento...</option>
          {medicamentos.map(med => (
            <option key={med.id} value={med.nombre} disabled={med.stock <= 0}>
              {med.nombre} {med.stock <= 0 ? '(Agotado)' : `(${med.stock} disponibles)`}
            </option>
          ))}
        </select>

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

      {mensajePedido && (
        <div style={{
          marginTop: '20px',
          padding: '12px',
          borderRadius: '8px',
          backgroundColor: mensajePedido.includes('⚠️') ? '#fff3cd' : mensajePedido.includes('✅') ? '#d1e7dd' : '#f8d7da',
          color: mensajePedido.includes('⚠️') ? '#856404' : mensajePedido.includes('✅') ? '#0f5132' : '#842029',
          border: '1px solid currentColor',
          fontSize: '0.95rem'
        }}>
          <strong>Resultado:</strong> {mensajePedido}
        </div>
      )}
    </div>
  )
}

export default App