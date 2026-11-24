import { useState, useEffect, useCallback } from 'react'
import './App.css'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000')
  .trim()
  .replace(/\/+$/, '')

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL no está configurada en Vercel.')
}

const ESTADOS_PEDIDO = ['Pendiente', 'En camino', 'Entregado', 'Cancelado']

function formatearFecha(fechaIso) {
  if (!fechaIso) return 'Sin fecha'
  const fecha = new Date(fechaIso)
  if (Number.isNaN(fecha.getTime())) return 'Sin fecha'
  return fecha.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function claseEstado(estado) {
  switch (estado) {
    case 'En camino':
      return 'badge-en-camino'
    case 'Entregado':
      return 'badge-entregado'
    case 'Cancelado':
      return 'badge-cancelado'
    default:
      return 'badge-pendiente'
  }
}

function App() {
  // ---- ESTADOS GLOBALES ----
  const [vista, setVista] = useState('cliente') // 'cliente', 'login', o 'admin'
  const [tabAdmin, setTabAdmin] = useState('inventario') // 'inventario' o 'pedidos'
  const [medicamentos, setMedicamentos] = useState([])
  const [estado, setEstado] = useState('Verificando...')
  const [token, setToken] = useState(localStorage.getItem('token') || null)

  // ---- ESTADOS DEL CLIENTE (CARRITO Y CHECKOUT) ----
  const [carrito, setCarrito] = useState([])
  const [clienteNombre, setClienteNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [mensajePedido, setMensajePedido] = useState('')
  const [enviandoPedido, setEnviandoPedido] = useState(false)

  // ---- ESTADOS DEL LOGIN ----
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mensajeLogin, setMensajeLogin] = useState('')

  // ---- ESTADOS DEL ADMIN (INVENTARIO) ----
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [nuevoStock, setNuevoStock] = useState('')
  const [nuevoControlado, setNuevoControlado] = useState(false)
  const [mensajeAdmin, setMensajeAdmin] = useState('')

  // ---- ESTADOS DEL ADMIN (PEDIDOS RECIBIDOS) ----
  const [pedidos, setPedidos] = useState([])
  const [mensajePedidos, setMensajePedidos] = useState('')
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState(null)

  const cerrarSesion = useCallback(() => {
    setToken(null)
    localStorage.removeItem('token')
    setPedidos([])
    setVista('cliente')
    setTabAdmin('inventario')
    setMensajeAdmin('')
    setMensajePedidos('')
  }, [])

  const cargarMedicamentos = useCallback(() => {
    fetch(`${API_URL}/medicamentos`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Error al cargar catálogo')
        return res.json()
      })
      .then(data => setMedicamentos(Array.isArray(data) ? data : []))
      .catch(err => console.error(err))
  }, [])

  const cargarPedidos = useCallback((authToken) => {
    const tokenActivo = authToken || token
    if (!tokenActivo) return

    fetch(`${API_URL}/pedidos`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Authorization': `Bearer ${tokenActivo}`,
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ([]))
        if (!res.ok) {
          if (res.status === 401) {
            cerrarSesion()
            throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
          }
          throw new Error(data.detail || `Error al cargar pedidos (${res.status})`)
        }
        return data
      })
      .then(data => {
        setPedidos(Array.isArray(data) ? data : [])
        setMensajePedidos('')
      })
      .catch(err => setMensajePedidos(`❌ ${err.message}`))
  }, [token, cerrarSesion])

  // Cargar salud del backend y catálogo al inicio
  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(res => res.json())
      .then(data => setEstado(data.status))
      .catch(() => setEstado('Error de conexión'))

    cargarMedicamentos()
  }, [cargarMedicamentos])

  // Cargar pedidos automáticamente cuando el administrador abre el panel
  useEffect(() => {
    if (vista === 'admin' && token) {
      cargarPedidos(token)
    }
  }, [vista, token, cargarPedidos])

  // ==========================================
  //         FUNCIONES DEL CARRITO (CLIENTE)
  // ==========================================

  const agregarAlCarrito = (med) => {
    setMensajePedido('')
    setCarrito(prev => {
      const existente = prev.find(item => item.id === med.id)
      if (existente) {
        if (existente.cantidad >= med.stock) return prev
        return prev.map(item =>
          item.id === med.id ? { ...item, cantidad: item.cantidad + 1 } : item
        )
      }
      return [
        ...prev,
        { id: med.id, nombre: med.nombre, precio: Number(med.precio), cantidad: 1, stockMax: med.stock },
      ]
    })
  }

  const cambiarCantidadCarrito = (id, delta) => {
    setCarrito(prev =>
      prev
        .map(item => {
          if (item.id !== id) return item
          const nuevaCant = item.cantidad + delta
          if (nuevaCant <= 0) return null
          const medActual = medicamentos.find(m => m.id === id)
          const limite = medActual ? medActual.stock : item.stockMax
          return { ...item, cantidad: Math.min(nuevaCant, limite) }
        })
        .filter(Boolean)
    )
  }

  const eliminarDelCarrito = (id) => {
    setCarrito(prev => prev.filter(item => item.id !== id))
  }

  const totalCarrito = carrito.reduce(
    (acum, item) => acum + item.precio * item.cantidad,
    0
  )

  const hacerPedido = (e) => {
    e.preventDefault()
    if (carrito.length === 0) {
      setMensajePedido('⚠️ Agrega al menos un medicamento al carrito antes de confirmar.')
      return
    }

    setEnviandoPedido(true)
    setMensajePedido('Procesando pedido...')

    fetch(`${API_URL}/pedidos`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_nombre: clienteNombre.trim(),
        telefono: telefono.trim(),
        direccion: direccion.trim(),
        items: carrito.map(item => ({
          medicamento: item.nombre,
          cantidad: item.cantidad,
        })),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          let errorMsg = data.detail || data.error || `Error al procesar pedido (${res.status})`
          if (Array.isArray(data.detail)) {
            errorMsg = data.detail.map(d => d.msg).join(', ')
          }
          if (res.status === 429) errorMsg = '⚠️ Límite de seguridad: Espera un minuto.'
          throw new Error(errorMsg)
        }
        return data
      })
      .then(data => {
        setMensajePedido(
          `✅ ${data.mensaje} (#${data.orden_id}). Total: $${Number(data.total).toFixed(2)}.`
        )
        cargarMedicamentos()
        setCarrito([])
        setClienteNombre('')
        setTelefono('')
        setDireccion('')
      })
      .catch(err => setMensajePedido(`❌ ${err.message}`))
      .finally(() => setEnviandoPedido(false))
  }

  // ==========================================
  //            AUTENTICACIÓN Y ADMIN
  // ==========================================

  const iniciarSesion = (e) => {
    e.preventDefault()
    setMensajeLogin('Autenticando...')

    // FastAPI espera los datos de login en formato de formulario (x-www-form-urlencoded)
    const formData = new URLSearchParams()
    formData.append('username', username)
    formData.append('password', password)

    fetch(`${API_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.detail || 'Error al iniciar sesión')
        return data
      })
      .then(data => {
        setToken(data.access_token)
        localStorage.setItem('token', data.access_token)
        setVista('admin')
        setTabAdmin('inventario')
        setUsername('')
        setPassword('')
        setMensajeLogin('')
      })
      .catch(err => setMensajeLogin(`❌ ${err.message}`))
  }

  const agregarMedicamento = (e) => {
    e.preventDefault()
    if (!token) {
      cerrarSesion()
      return
    }
    setMensajeAdmin('Guardando...')

    fetch(`${API_URL}/medicamentos`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        nombre: nuevoNombre.trim(),
        precio: parseFloat(nuevoPrecio),
        stock: parseInt(nuevoStock, 10),
        es_controlado: nuevoControlado,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 401) {
            cerrarSesion()
            throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
          }
          throw new Error(data.detail || `Error del servidor (${res.status})`)
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

  const actualizarEstadoPedido = (pedidoId, nuevoEstado) => {
    if (!token) {
      cerrarSesion()
      return
    }
    setActualizandoPedidoId(pedidoId)
    setMensajePedidos('')

    fetch(`${API_URL}/pedidos/${pedidoId}`, {
      method: 'PATCH',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ estado: nuevoEstado }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 401) {
            cerrarSesion()
            throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
          }
          throw new Error(data.detail || `Error al actualizar estado (${res.status})`)
        }
        return data
      })
      .then(data => {
        setPedidos(prev =>
          prev.map(p => (p.id === pedidoId ? { ...p, estado: data.pedido.estado } : p))
        )
        setMensajePedidos(`✅ ${data.mensaje}`)
      })
      .catch(err => setMensajePedidos(`❌ ${err.message}`))
      .finally(() => setActualizandoPedidoId(null))
  }

  const pedidosPendientes = pedidos.filter(p => p.estado === 'Pendiente').length

  // ==========================================
  //                 INTERFAZ
  // ==========================================

  return (
    <div className={`app-container ${vista === 'admin' ? 'admin-wide' : ''}`}>
      {/* NAVEGACIÓN SUPERIOR */}
      <div className="top-bar">
        <h1 className="brand-title">FarmaEnCasa</h1>
        {vista === 'cliente' ? (
          <button
            className="btn-nav"
            onClick={() => setVista(token ? 'admin' : 'login')}
          >
            Acceso Empleados
          </button>
        ) : (
          <button
            className="btn-nav btn-secondary"
            onClick={vista === 'admin' ? cerrarSesion : () => setVista('cliente')}
          >
            {vista === 'admin' ? 'Cerrar Sesión' : 'Volver a Tienda'}
          </button>
        )}
      </div>

      {/* PANTALLA: CLIENTE */}
      {vista === 'cliente' && (
        <>
          <p className="status-text">Estado del Backend: {estado}</p>
          <h2>Catálogo Público</h2>
          <ul className="med-list">
            {medicamentos.map(med => {
              const enCarrito = carrito.find(item => item.id === med.id)
              const sinStock = med.stock <= 0 || (enCarrito && enCarrito.cantidad >= med.stock)
              return (
                <li key={med.id} className="med-item">
                  <div className="med-info">
                    <strong>{med.nombre}</strong>
                    <span>
                      ${Number(med.precio).toFixed(2)} | Stock: {med.stock}{' '}
                      {med.es_controlado ? '(Controlado)' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-add-cart"
                    disabled={sinStock}
                    onClick={() => agregarAlCarrito(med)}
                  >
                    {med.stock <= 0 ? 'Agotado' : '+ Agregar'}
                  </button>
                </li>
              )
            })}
          </ul>

          <h2>Tu Carrito y Checkout</h2>
          {carrito.length === 0 ? (
            <p className="empty-hint">
              Agrega medicamentos del catálogo para armar tu pedido.
            </p>
          ) : (
            <div className="cart-box">
              {carrito.map(item => (
                <div key={item.id} className="cart-row">
                  <div className="cart-item-name">
                    <strong>{item.nombre}</strong>
                    <span>${(item.precio * item.cantidad).toFixed(2)}</span>
                  </div>
                  <div className="cart-controls">
                    <button
                      type="button"
                      className="btn-qty"
                      onClick={() => cambiarCantidadCarrito(item.id, -1)}
                    >
                      -
                    </button>
                    <span className="cart-qty">{item.cantidad}</span>
                    <button
                      type="button"
                      className="btn-qty"
                      onClick={() => cambiarCantidadCarrito(item.id, 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => eliminarDelCarrito(item.id)}
                      title="Quitar"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <div className="cart-total">
                <span>Total a pagar:</span>
                <strong>${totalCarrito.toFixed(2)}</strong>
              </div>
            </div>
          )}

          <form onSubmit={hacerPedido} className="form-container">
            <input
              type="text"
              placeholder="Nombre completo"
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Teléfono (10 dígitos)"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              minLength={10}
              required
            />
            <input
              type="text"
              placeholder="Dirección de entrega (Calle, número, colonia)"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={enviandoPedido || carrito.length === 0}
            >
              {enviandoPedido
                ? 'Enviando pedido...'
                : `Confirmar Pedido ($${totalCarrito.toFixed(2)})`}
            </button>
          </form>
          {mensajePedido && (
            <div className="feedback-msg">
              <strong>{mensajePedido}</strong>
            </div>
          )}
        </>
      )}

      {/* PANTALLA: LOGIN DE EMPLEADOS */}
      {vista === 'login' && (
        <>
          <h2>Acceso Privado</h2>
          <form onSubmit={iniciarSesion} className="form-container">
            <input
              type="text"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">Iniciar Sesión</button>
          </form>
          {mensajeLogin && (
            <div className="feedback-msg error-msg">
              <strong>{mensajeLogin}</strong>
            </div>
          )}
        </>
      )}

      {/* PANTALLA: PANEL DE ADMINISTRACIÓN */}
      {vista === 'admin' && (
        <>
          <h2 className="admin-heading">Panel de Administración</h2>

          {/* PESTAÑAS DEL PANEL ADMIN */}
          <div className="admin-tabs">
            <button
              type="button"
              className={`tab-btn ${tabAdmin === 'inventario' ? 'active' : ''}`}
              onClick={() => setTabAdmin('inventario')}
            >
              Inventario ({medicamentos.length})
            </button>
            <button
              type="button"
              className={`tab-btn ${tabAdmin === 'pedidos' ? 'active' : ''}`}
              onClick={() => {
                setTabAdmin('pedidos')
                cargarPedidos()
              }}
            >
              Pedidos Recibidos ({pedidos.length})
              {pedidosPendientes > 0 && (
                <span className="pending-pill">{pedidosPendientes}</span>
              )}
            </button>
          </div>

          {/* PESTAÑA: INVENTARIO */}
          {tabAdmin === 'inventario' && (
            <>
              <form
                onSubmit={agregarMedicamento}
                className="form-container admin-form-card"
              >
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>
                  Agregar Nuevo Medicamento
                </h3>
                <input
                  type="text"
                  placeholder="Nombre (ej. Ibuprofeno)"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  required
                />
                <input
                  type="number"
                  placeholder="Precio ($)"
                  value={nuevoPrecio}
                  onChange={(e) => setNuevoPrecio(e.target.value)}
                  step="0.01"
                  required
                />
                <input
                  type="number"
                  placeholder="Stock inicial"
                  value={nuevoStock}
                  onChange={(e) => setNuevoStock(e.target.value)}
                  required
                />

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={nuevoControlado}
                    onChange={(e) => setNuevoControlado(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Es medicamento controlado (receta médica)
                </label>

                <button type="submit" style={{ backgroundColor: '#10b981' }}>
                  Guardar en Inventario
                </button>
              </form>
              {mensajeAdmin && (
                <div className="feedback-msg">
                  <strong>{mensajeAdmin}</strong>
                </div>
              )}

              <h3 className="section-divider">Inventario Actual</h3>
              <ul className="med-list">
                {medicamentos.map(med => (
                  <li key={med.id}>
                    {med.nombre}{' '}
                    <span>
                      ${Number(med.precio).toFixed(2)} | Stock: {med.stock}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* PESTAÑA: PEDIDOS RECIBIDOS */}
          {tabAdmin === 'pedidos' && (
            <div className="orders-section">
              <div className="orders-header">
                <h3>Pedidos Recibidos</h3>
                <button
                  type="button"
                  className="btn-refresh"
                  onClick={() => cargarPedidos()}
                >
                  Actualizar
                </button>
              </div>

              {mensajePedidos && (
                <div className="feedback-msg">
                  <strong>{mensajePedidos}</strong>
                </div>
              )}

              {pedidos.length === 0 ? (
                <p className="empty-hint">
                  Aún no se han recibido pedidos de clientes.
                </p>
              ) : (
                <div className="orders-list">
                  {pedidos.map(pedido => (
                    <div key={pedido.id} className="order-card">
                      <div className="order-card-header">
                        <div>
                          <span className="order-id">Pedido #{pedido.id}</span>
                          <span className="order-date">
                            {formatearFecha(pedido.fecha_creacion)}
                          </span>
                        </div>
                        <span className={`status-badge ${claseEstado(pedido.estado)}`}>
                          {pedido.estado}
                        </span>
                      </div>

                      <div className="order-client-info">
                        <div>
                          <strong>Cliente:</strong> {pedido.cliente_nombre}
                        </div>
                        <div>
                          <strong>Teléfono:</strong> {pedido.telefono}
                        </div>
                        <div>
                          <strong>Dirección:</strong> {pedido.direccion}
                        </div>
                      </div>

                      <div className="order-items-box">
                        <strong>Medicamentos:</strong>
                        <ul>
                          {(pedido.detalle_productos || []).map((item, idx) => (
                            <li key={`${pedido.id}-${idx}`}>
                              <span>
                                {item.cantidad}x {item.nombre}
                              </span>
                              <span>${Number(item.subtotal).toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="order-card-footer">
                        <div className="order-total">
                          Total: <strong>${Number(pedido.total).toFixed(2)}</strong>
                        </div>
                        <div className="order-status-control">
                          <label htmlFor={`estado-${pedido.id}`}>Estado:</label>
                          <select
                            id={`estado-${pedido.id}`}
                            value={pedido.estado}
                            disabled={actualizandoPedidoId === pedido.id}
                            onChange={(e) =>
                              actualizarEstadoPedido(pedido.id, e.target.value)
                            }
                          >
                            {ESTADOS_PEDIDO.map(opcion => (
                              <option key={opcion} value={opcion}>
                                {opcion}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
