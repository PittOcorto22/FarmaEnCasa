import { useState, useEffect } from 'react'
import './App.css'

function App() {
  // ---- ESTADOS GLOBALES ----
  const [vista, setVista] = useState('cliente') // 'cliente', 'login', o 'admin'
  const [medicamentos, setMedicamentos] = useState([])
  const [estado, setEstado] = useState('Verificando...')
  const [token, setToken] = useState(localStorage.getItem('token') || null)

  // ---- ESTADOS DEL CLIENTE (PEDIDOS) ----
  const [telefono, setTelefono] = useState('')
  const [medicamentoPedir, setMedicamentoPedir] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [mensajePedido, setMensajePedido] = useState('')

  // ---- ESTADOS DEL LOGIN ----
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mensajeLogin, setMensajeLogin] = useState('')

  // ---- ESTADOS DEL ADMIN (NUEVO MEDICAMENTO) ----
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [nuevoStock, setNuevoStock] = useState('')
  const [nuevoControlado, setNuevoControlado] = useState(false)
  const [mensajeAdmin, setMensajeAdmin] = useState('')

  // Cargar datos al inicio
  useEffect(() => {
    fetch('http://localhost:8000/health')
      .then(res => res.json())
      .then(data => setEstado(data.status))
      .catch(() => setEstado('Error de conexión'))

    cargarMedicamentos()
  }, [])

  const cargarMedicamentos = () => {
    fetch('http://localhost:8000/medicamentos')
      .then(res => res.json())
      .then(data => setMedicamentos(data))
      .catch(err => console.error(err))
  }

  // ==========================================
  //            FUNCIONES DE NEGOCIO
  // ==========================================

  const hacerPedido = (e) => {
    e.preventDefault()
    setMensajePedido('Procesando pedido...')

    fetch('http://localhost:8000/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono, medicamento: medicamentoPedir, cantidad: parseInt(cantidad) })
    })
    .then(async (res) => {
      const data = await res.json()
      if (!res.ok) {
        let errorMsg = data.detail || data.error || 'Error'
        if (res.status === 429) errorMsg = '⚠️ Límite de seguridad: Espera un minuto.'
        throw new Error(errorMsg)
      }
      return data
    })
    .then(data => {
      setMensajePedido(`✅ ${data.mensaje}. Quedan ${data.stock_restante} en stock.`)
      cargarMedicamentos()
      setMedicamentoPedir('')
      setCantidad(1)
    })
    .catch(err => setMensajePedido(err.message))
  }

  const iniciarSesion = (e) => {
    e.preventDefault()
    setMensajeLogin('Autenticando...')

    // FastAPI espera los datos de login en formato de formulario (x-www-form-urlencoded)
    const formData = new URLSearchParams()
    formData.append('username', username)
    formData.append('password', password)

    fetch('http://localhost:8000/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    })
    .then(async (res) => {
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error al iniciar sesión')
      return data
    })
    .then(data => {
      setToken(data.access_token)
      localStorage.setItem('token', data.access_token) // Guardamos la llave en el navegador
      setVista('admin')
      setUsername('')
      setPassword('')
      setMensajeLogin('')
    })
    .catch(err => setMensajeLogin(`❌ ${err.message}`))
  }

  const cerrarSesion = () => {
    setToken(null)
    localStorage.removeItem('token')
    setVista('cliente')
    setMensajeAdmin('')
  }

  const agregarMedicamento = (e) => {
    e.preventDefault()
    setMensajeAdmin('Guardando...')

    fetch('http://localhost:8000/medicamentos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // <--- ¡AQUÍ MANDAMOS EL CANDADO (TOKEN)!
      },
      body: JSON.stringify({
        nombre: nuevoNombre,
        precio: parseFloat(nuevoPrecio),
        stock: parseInt(nuevoStock),
        es_controlado: nuevoControlado
      })
    })
    .then(async (res) => {
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          cerrarSesion() // Si el token expiró, lo sacamos
          throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
        }
        throw new Error(data.detail)
      }
      return data
    })
    .then(data => {
      setMensajeAdmin(`✅ ${data.mensaje}`)
      cargarMedicamentos()
      setNuevoNombre('')
      setNuevoPrecio('')
      setNuevoStock('')
      setNuevoControlado(false)
    })
    .catch(err => setMensajeAdmin(`❌ ${err.message}`))
  }

  // ==========================================
  //                 INTERFAZ
  // ==========================================

  return (
    <div className="app-container">
      {/* NAVEGACIÓN SUPERIOR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>FarmaEnCasa</h1>
        {vista === 'cliente' ? (
          <button style={{ padding: '8px', fontSize: '0.8rem', width: 'auto' }} onClick={() => setVista('login')}>Acceso Empleados</button>
        ) : (
          <button style={{ padding: '8px', fontSize: '0.8rem', width: 'auto', backgroundColor: '#64748b' }} onClick={cerrarSesion}>Volver a Tienda</button>
        )}
      </div>

      {/* PANTALLA: CLIENTE */}
      {vista === 'cliente' && (
        <>
          <p className="status-text">Estado del Backend: {estado}</p>
          <h2>Catálogo Público</h2>
          <ul className="med-list">
            {medicamentos.map(med => (
              <li key={med.id}>
                {med.nombre} <span>Stock: {med.stock} {med.es_controlado ? '(Controlado)' : ''}</span>
              </li>
            ))}
          </ul>

          <h2>Hacer un Pedido</h2>
          <form onSubmit={hacerPedido} className="form-container">
            <input type="text" placeholder="Teléfono (10 dígitos)" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />
            <select value={medicamentoPedir} onChange={(e) => setMedicamentoPedir(e.target.value)} required>
              <option value="" disabled>Selecciona un medicamento...</option>
              {medicamentos.map(med => (
                <option key={med.id} value={med.nombre} disabled={med.stock <= 0}>
                  {med.nombre} {med.stock <= 0 ? '(Agotado)' : `(${med.stock} disponibles)`}
                </option>
              ))}
            </select>
            <input type="number" placeholder="Cantidad" value={cantidad} onChange={(e) => setCantidad(e.target.value)} min="1" required />
            <button type="submit">Enviar Pedido</button>
          </form>
          {mensajePedido && <div style={{ marginTop: '15px', color: '#0f5132' }}><strong>{mensajePedido}</strong></div>}
        </>
      )}

      {/* PANTALLA: LOGIN DE EMPLEADOS */}
      {vista === 'login' && (
        <>
          <h2>Acceso Privado</h2>
          <form onSubmit={iniciarSesion} className="form-container">
            <input type="text" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit">Iniciar Sesión</button>
          </form>
          {mensajeLogin && <div style={{ marginTop: '15px', color: '#842029' }}><strong>{mensajeLogin}</strong></div>}
        </>
      )}

      {/* PANTALLA: PANEL DE ADMINISTRACIÓN */}
      {vista === 'admin' && (
        <>
          <h2 style={{ color: '#0ea5e9' }}>Panel de Administración</h2>

          <form onSubmit={agregarMedicamento} className="form-container" style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>Agregar Nuevo Medicamento</h3>
            <input type="text" placeholder="Nombre (ej. Ibuprofeno)" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} required />
            <input type="number" placeholder="Precio ($)" value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)} step="0.01" required />
            <input type="number" placeholder="Stock inicial" value={nuevoStock} onChange={(e) => setNuevoStock(e.target.value)} required />

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={nuevoControlado} onChange={(e) => setNuevoControlado(e.target.checked)} style={{ width: 'auto' }} />
              Es medicamento controlado (receta médica)
            </label>

            <button type="submit" style={{ backgroundColor: '#10b981' }}>Guardar en Inventario</button>
          </form>
          {mensajeAdmin && <div style={{ marginTop: '15px', color: '#0f5132' }}><strong>{mensajeAdmin}</strong></div>}

          <h3 style={{ marginTop: '20px', borderTop: '2px solid #e2e8f0', paddingTop: '10px' }}>Inventario Actual</h3>
          <ul className="med-list">
            {medicamentos.map(med => (
              <li key={med.id}>
                {med.nombre} <span>${med.precio} | Stock: {med.stock}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default App