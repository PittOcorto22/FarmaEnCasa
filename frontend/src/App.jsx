import { useState, useEffect, useCallback, useMemo } from 'react'
import './App.css'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000')
  .trim()
  .replace(/\/+$/, '')

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL no está configurada en Vercel.')
}

const ENVIO_GRATIS_MINIMO = 399
const ESTADOS_PEDIDO = ['Pendiente', 'En camino', 'Entregado', 'Cancelado']
const PASOS_PROGRESO = [
  { key: 'Pendiente', label: 'Pendiente', desc: 'Pedido confirmado en farmacia' },
  { key: 'En camino', label: 'En camino', desc: 'Repartidor en ruta a tu domicilio' },
  { key: 'Entregado', label: 'Entregado', desc: 'Entregado satisfactoriamente' },
]

const DEPARTAMENTOS = [
  { key: 'Analgésicos y Dolor', imagen: '/images/cat-analgesicos.jpg' },
  { key: 'Antibióticos', imagen: '/images/cat-antibioticos.jpg' },
  { key: 'Gripe y Alergias', imagen: '/images/cat-gripe.jpg' },
  { key: 'Salud Digestiva', imagen: '/images/cat-digestivo.jpg' },
  { key: 'Vitaminas y Bienestar', imagen: '/images/cat-vitaminas.jpg' },
  { key: 'Dermocosmética', imagen: '/images/cat-cuidado.jpg' },
  { key: 'Primeros Auxilios', imagen: '/images/cat-auxilios.jpg' },
  { key: 'Bebé y Maternidad', imagen: '/images/cat-bebe.jpg' },
]

const IMAGEN_POR_CATEGORIA = Object.fromEntries(
  DEPARTAMENTOS.map(d => [d.key, d.imagen])
)

function inferirMetadatosProducto(med) {
  const nombreLower = (med.nombre || '').toLowerCase()
  let categoria = (med.categoria || '').trim()

  if (!categoria || categoria === 'General') {
    if (med.es_controlado || /amox|azitro|cipro|antibio/.test(nombreLower)) {
      categoria = 'Antibióticos'
    } else if (/loratad|grip|ambrox|nasal|tos/.test(nombreLower)) {
      categoria = 'Gripe y Alergias'
    } else if (/omepra|bismuto|probi|gastr/.test(nombreLower)) {
      categoria = 'Salud Digestiva'
    } else if (/vitamin|complejo|electro/.test(nombreLower)) {
      categoria = 'Vitaminas y Bienestar'
    } else if (/solar|crema|micelar|dermo/.test(nombreLower)) {
      categoria = 'Dermocosmética'
    } else if (/term|botiqu|alcohol|gasa|curita/.test(nombreLower)) {
      categoria = 'Primeros Auxilios'
    } else if (/beb[eé]|pedi[aá]t|rozadura/.test(nombreLower)) {
      categoria = 'Bebé y Maternidad'
    } else {
      categoria = 'Analgésicos y Dolor'
    }
  }

  const imagen_url =
    (med.imagen_url || '').trim() ||
    IMAGEN_POR_CATEGORIA[categoria] ||
    '/images/cat-analgesicos.jpg'

  const presentacion =
    (med.presentacion || '').trim() || 'Presentación farmacéutica estándar'

  const descripcion =
    (med.descripcion || '').trim() ||
    (med.es_controlado
      ? 'Medicamento controlado de calidad certificada. Requiere receta médica vigente.'
      : 'Producto original disponible con entrega express a domicilio en FarmaEnCasa.')

  return {
    ...med,
    nombre: (med.nombre || '').trim(),
    categoria,
    presentacion,
    descripcion,
    imagen_url,
  }
}

function indicePaso(estado) {
  const idx = PASOS_PROGRESO.findIndex(p => p.key === estado)
  return idx === -1 ? 0 : idx
}

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
  const [vista, setVista] = useState('cliente') // 'cliente', 'seguimiento', 'login', 'admin'
  const [tabAdmin, setTabAdmin] = useState('inventario') // 'inventario' | 'pedidos'
  const [medicamentosRaw, setMedicamentosRaw] = useState([])
  const [estado, setEstado] = useState('Verificando...')
  const [token, setToken] = useState(localStorage.getItem('token') || null)
  const [carritoAbierto, setCarritoAbierto] = useState(false)

  // ---- FILTROS DEL CATÁLOGO PRINCIPAL ----
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState('Todos')
  const [filtroReceta, setFiltroReceta] = useState('todos') // 'todos' | 'libre' | 'controlado'
  const [ordenCatalogo, setOrdenCatalogo] = useState('destacados')

  // ---- ESTADOS DEL CLIENTE (CARRITO Y CHECKOUT) ----
  const [carrito, setCarrito] = useState([])
  const [clienteNombre, setClienteNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correoCliente, setCorreoCliente] = useState('')
  const [direccion, setDireccion] = useState('')
  const [pasoCheckout, setPasoCheckout] = useState('datos') // 'datos' | 'verificar'
  const [codigoVerificacion, setCodigoVerificacion] = useState('')
  const [codigoDemo, setCodigoDemo] = useState('')
  const [enviandoCodigo, setEnviandoCodigo] = useState(false)
  const [segundosReenvio, setSegundosReenvio] = useState(0)
  const [mensajePedido, setMensajePedido] = useState('')
  const [enviandoPedido, setEnviandoPedido] = useState(false)

  // ---- ESTADOS DE SEGUIMIENTO PARA EL CLIENTE ----
  const [telefonoBusqueda, setTelefonoBusqueda] = useState(
    localStorage.getItem('telefono_rastreo') || ''
  )
  const [telefonoRastreoActivo, setTelefonoRastreoActivo] = useState(
    localStorage.getItem('telefono_rastreo') || ''
  )
  const [pedidosCliente, setPedidosCliente] = useState([])
  const [pedidoSeleccionadoId, setPedidoSeleccionadoId] = useState(null)
  const [mensajeRastreo, setMensajeRastreo] = useState('')
  const [ultimaActualizacion, setUltimaActualizacion] = useState('')

  // ---- ESTADOS DEL LOGIN ----
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mensajeLogin, setMensajeLogin] = useState('')

  // ---- ESTADOS DEL ADMIN (INVENTARIO) ----
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [nuevoStock, setNuevoStock] = useState('')
  const [nuevaCategoria, setNuevaCategoria] = useState('Analgésicos y Dolor')
  const [nuevaPresentacion, setNuevaPresentacion] = useState('')
  const [nuevaDescripcion, setNuevaDescripcion] = useState('')
  const [nuevoControlado, setNuevoControlado] = useState(false)
  const [mensajeAdmin, setMensajeAdmin] = useState('')
  const [actualizandoMedId, setActualizandoMedId] = useState(null)

  // ---- ESTADOS DEL ADMIN (PEDIDOS RECIBIDOS) ----
  const [pedidos, setPedidos] = useState([])
  const [mensajePedidos, setMensajePedidos] = useState('')
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState(null)

  const medicamentos = useMemo(
    () => medicamentosRaw.map(inferirMetadatosProducto),
    [medicamentosRaw]
  )

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
      .then(data => setMedicamentosRaw(Array.isArray(data) ? data : []))
      .catch(err => console.error(err))
  }, [])

  const consultarRastreo = useCallback((tel, idPreferido = null) => {
    const telLimpio = (tel || '').trim()
    if (telLimpio.length < 10) {
      setMensajeRastreo('⚠️ Ingresa un número de teléfono válido de al menos 10 dígitos.')
      return
    }

    fetch(`${API_URL}/pedidos/rastreo/${encodeURIComponent(telLimpio)}`, {
      method: 'GET',
      mode: 'cors',
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.detail || `Error al consultar pedidos (${res.status})`)
        }
        return data
      })
      .then(data => {
        const lista = Array.isArray(data) ? data : []
        setPedidosCliente(lista)
        setTelefonoRastreoActivo(telLimpio)
        localStorage.setItem('telefono_rastreo', telLimpio)
        setUltimaActualizacion(
          new Date().toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        )

        if (lista.length === 0) {
          setPedidoSeleccionadoId(null)
          setMensajeRastreo(`No se encontraron pedidos registrados para el teléfono ${telLimpio}.`)
        } else {
          setMensajeRastreo('')
          setPedidoSeleccionadoId(prevId => {
            if (idPreferido && lista.some(p => p.id === idPreferido)) return idPreferido
            if (prevId && lista.some(p => p.id === prevId)) return prevId
            return lista[0].id
          })
        }
      })
      .catch(err => setMensajeRastreo(`❌ ${err.message}`))
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
      .then(data => setEstado(data.status || 'Sistema en línea'))
      .catch(() => setEstado('Error de conexión'))

    cargarMedicamentos()
  }, [cargarMedicamentos])

  // Cargar pedidos automáticamente cuando el administrador abre el panel
  useEffect(() => {
    if (vista === 'admin' && token) {
      cargarPedidos(token)
    }
  }, [vista, token, cargarPedidos])

  // Polling automático cada 15 segundos en la vista de Seguimiento del Cliente
  useEffect(() => {
    if (vista !== 'seguimiento' || telefonoRastreoActivo.length < 10) return undefined

    const intervalo = setInterval(() => {
      consultarRastreo(telefonoRastreoActivo)
    }, 15000)

    return () => clearInterval(intervalo)
  }, [vista, telefonoRastreoActivo, consultarRastreo])

  // Temporizador para reenvío de código OTP por correo
  useEffect(() => {
    if (segundosReenvio <= 0) return undefined
    const timer = setInterval(() => {
      setSegundosReenvio(prev => (prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [segundosReenvio])

  // ==========================================
  //         NAVEGACIÓN Y FILTRADO
  // ==========================================

  const irACatalogo = (categoria = null) => {
    setVista('cliente')
    if (categoria !== null) {
      setCategoriaActiva(categoria)
    }
    setTimeout(() => {
      const el = document.getElementById('catalogo-farmacia')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const manejarBusquedaSubmit = (e) => {
    e.preventDefault()
    irACatalogo()
  }

  const conteoPorDepartamento = useMemo(() => {
    const mapa = {}
    for (const med of medicamentos) {
      mapa[med.categoria] = (mapa[med.categoria] || 0) + 1
    }
    return mapa
  }, [medicamentos])

  const totalUnidadesStock = useMemo(
    () => medicamentos.reduce((acc, m) => acc + (Number(m.stock) || 0), 0),
    [medicamentos]
  )

  const medicamentosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const filtrados = medicamentos.filter(med => {
      if (categoriaActiva !== 'Todos' && med.categoria !== categoriaActiva) {
        return false
      }
      if (filtroReceta === 'libre' && med.es_controlado) return false
      if (filtroReceta === 'controlado' && !med.es_controlado) return false
      if (q) {
        const texto = `${med.nombre} ${med.categoria} ${med.presentacion} ${med.descripcion}`.toLowerCase()
        if (!texto.includes(q)) return false
      }
      return true
    })

    const copia = [...filtrados]
    if (ordenCatalogo === 'precio-asc') {
      copia.sort((a, b) => Number(a.precio) - Number(b.precio))
    } else if (ordenCatalogo === 'precio-desc') {
      copia.sort((a, b) => Number(b.precio) - Number(a.precio))
    } else if (ordenCatalogo === 'nombre') {
      copia.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    }
    return copia
  }, [medicamentos, busqueda, categoriaActiva, filtroReceta, ordenCatalogo])

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
        {
          id: med.id,
          nombre: med.nombre,
          precio: Number(med.precio),
          cantidad: 1,
          stockMax: med.stock,
          imagen_url: med.imagen_url,
          presentacion: med.presentacion,
        },
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

  const totalPiezasCarrito = carrito.reduce((acum, item) => acum + item.cantidad, 0)
  const totalCarrito = carrito.reduce(
    (acum, item) => acum + item.precio * item.cantidad,
    0
  )
  const faltaEnvioGratis = Math.max(0, ENVIO_GRATIS_MINIMO - totalCarrito)
  const progresoEnvio = Math.min(100, (totalCarrito / ENVIO_GRATIS_MINIMO) * 100)

  const solicitarCodigoCorreo = (e) => {
    if (e) e.preventDefault()
    if (carrito.length === 0) {
      setMensajePedido('⚠️ Agrega al menos un producto al carrito antes de continuar.')
      return
    }

    setEnviandoCodigo(true)
    setMensajePedido('Enviando código de seguridad a tu correo...')

    fetch(`${API_URL}/pedidos/enviar-codigo`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_nombre: clienteNombre.trim(),
        telefono: telefono.trim(),
        correo: correoCliente.trim(),
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
          let errorMsg = data.detail || data.error || `Error al enviar código (${res.status})`
          if (Array.isArray(data.detail)) {
            errorMsg = data.detail.map(d => d.msg).join(', ')
          }
          if (res.status === 429) errorMsg = '⚠️ Demasiadas solicitudes. Espera un minuto.'
          throw new Error(errorMsg)
        }
        return data
      })
      .then(data => {
        setPasoCheckout('verificar')
        setCodigoVerificacion('')
        setCodigoDemo(data.modo_demo && data.codigo_demo ? data.codigo_demo : '')
        setSegundosReenvio(30)
        setMensajePedido(`✅ ${data.mensaje}`)
      })
      .catch(err => setMensajePedido(`❌ ${err.message}`))
      .finally(() => setEnviandoCodigo(false))
  }

  const hacerPedido = (e) => {
    e.preventDefault()
    if (carrito.length === 0) {
      setMensajePedido('⚠️ Agrega al menos un producto al carrito antes de confirmar.')
      return
    }

    const codigoLimpio = codigoVerificacion.trim()
    if (!/^\d{6}$/.test(codigoLimpio)) {
      setMensajePedido('⚠️ Ingresa el código de 6 dígitos que llegó a tu correo.')
      return
    }

    const telCompra = telefono.trim()
    setEnviandoPedido(true)
    setMensajePedido('Verificando código y confirmando pedido...')

    fetch(`${API_URL}/pedidos`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_nombre: clienteNombre.trim(),
        telefono: telCompra,
        correo: correoCliente.trim(),
        codigo_verificacion: codigoLimpio,
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
        cargarMedicamentos()
        setCarrito([])
        setClienteNombre('')
        setTelefono('')
        setCorreoCliente('')
        setDireccion('')
        setPasoCheckout('datos')
        setCodigoVerificacion('')
        setCodigoDemo('')
        setSegundosReenvio(0)
        setMensajePedido('')
        setCarritoAbierto(false)

        const pedidoNuevo = data.pedido
        if (pedidoNuevo) {
          setPedidosCliente([pedidoNuevo])
          setPedidoSeleccionadoId(pedidoNuevo.id)
        }
        setTelefonoBusqueda(telCompra)
        setTelefonoRastreoActivo(telCompra)
        localStorage.setItem('telefono_rastreo', telCompra)
        setVista('seguimiento')
        window.scrollTo({ top: 0, behavior: 'smooth' })
        consultarRastreo(telCompra, pedidoNuevo ? pedidoNuevo.id : data.orden_id)
      })
      .catch(err => setMensajePedido(`❌ ${err.message}`))
      .finally(() => setEnviandoPedido(false))
  }

  const abrirVistaSeguimiento = () => {
    setCarritoAbierto(false)
    setVista('seguimiento')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const telGuardado = telefonoBusqueda.trim() || telefonoRastreoActivo.trim()
    if (telGuardado.length >= 10) {
      consultarRastreo(telGuardado)
    }
  }

  const buscarPedidoPorTelefono = (e) => {
    e.preventDefault()
    setVista('seguimiento')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    consultarRastreo(telefonoBusqueda)
  }

  // ==========================================
  //            AUTENTICACIÓN Y ADMIN
  // ==========================================

  const iniciarSesion = (e) => {
    e.preventDefault()
    setMensajeLogin('Autenticando...')

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
    setMensajeAdmin('Guardando producto...')

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
        categoria: nuevaCategoria,
        presentacion: nuevaPresentacion.trim() || 'Caja estándar',
        descripcion: nuevaDescripcion.trim(),
        imagen_url: IMAGEN_POR_CATEGORIA[nuevaCategoria] || '/images/cat-analgesicos.jpg',
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
        setNuevaPresentacion('')
        setNuevaDescripcion('')
        setNuevoControlado(false)
      })
      .catch(err => setMensajeAdmin(`❌ ${err.message}`))
  }

  const reabastecerProducto = (med, incremento) => {
    if (!token) {
      cerrarSesion()
      return
    }
    setActualizandoMedId(med.id)
    setMensajeAdmin('')

    fetch(`${API_URL}/medicamentos/${med.id}`, {
      method: 'PATCH',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ stock: Number(med.stock || 0) + incremento }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 401) {
            cerrarSesion()
            throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
          }
          throw new Error(data.detail || `Error al actualizar stock (${res.status})`)
        }
        return data
      })
      .then(data => {
        setMensajeAdmin(`✅ ${data.mensaje}`)
        cargarMedicamentos()
      })
      .catch(err => setMensajeAdmin(`❌ ${err.message}`))
      .finally(() => setActualizandoMedId(null))
  }

  const sincronizarCatalogoCompleto = () => {
    setMensajeAdmin('Sincronizando catálogo y reabasteciendo stock...')
    fetch(`${API_URL}/seed`, { method: 'GET', mode: 'cors' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.detail || 'No se pudo sincronizar el catálogo')
        return data
      })
      .then(data => {
        setMensajeAdmin(`✅ ${data.mensaje}`)
        cargarMedicamentos()
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
  const pedidoActivo =
    pedidosCliente.find(p => p.id === pedidoSeleccionadoId) || pedidosCliente[0] || null
  const sistemaOnline = !estado.toLowerCase().includes('error')

  // ==========================================
  //                 INTERFAZ
  // ==========================================

  return (
    <div className="store-shell">
      {/* 1. BARRA SUPERIOR DE AVISOS Y UTILIDAD */}
      <div className="utility-bar">
        <div className="page-rail utility-inner">
          <div className="utility-left">
            <span className="utility-pill">Envío Express</span>
            <span>
              Envío gratis en compras mayores a <strong>${ENVIO_GRATIS_MINIMO} MXN</strong> · Entrega en 45–60 min · Atención 24/7
            </span>
          </div>
          <div className="utility-right">
            <span className="status-dot-wrap">
              <span className={`status-dot ${sistemaOnline ? '' : 'offline'}`} />
              {estado}
            </span>
            <span>Tel: 800 327 6224</span>
            {vista !== 'admin' ? (
              <button
                type="button"
                className="utility-link-btn"
                onClick={() => {
                  setVista(token ? 'admin' : 'login')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                {token ? 'Panel Empleados' : 'Acceso Empleados'}
              </button>
            ) : (
              <button
                type="button"
                className="utility-link-btn"
                onClick={cerrarSesion}
              >
                Cerrar Sesión
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. HEADER PRINCIPAL DE FARMACIA */}
      <header className="site-header">
        <div className="page-rail header-main">
          <button
            type="button"
            className="brand-btn"
            onClick={() => {
              setVista('cliente')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <div className="brand-cross" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5V4z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-name">
                Farma<span>EnCasa</span>
              </span>
              <span className="brand-sub">Superfarmacia en Línea</span>
            </div>
          </button>

          <form onSubmit={manejarBusquedaSubmit} className="header-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Busca medicamentos, vitaminas, dermocosmética o síntomas..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                if (vista !== 'cliente') setVista('cliente')
              }}
            />
            {busqueda && (
              <button
                type="button"
                className="header-search-clear"
                onClick={() => setBusqueda('')}
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            )}
            <button type="submit" className="header-search-submit">
              Buscar
            </button>
          </form>

          <div className="header-actions">
            <button
              type="button"
              className="btn-outline-header"
              onClick={abrirVistaSeguimiento}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s7-5.3 7-12a7 7 0 1 0-14 0c0 6.7 7 12 7 12z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              Rastrear pedido
            </button>

            <button
              type="button"
              className="btn-cart-header"
              onClick={() => setCarritoAbierto(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="9" cy="20" r="1.5" />
                <circle cx="18" cy="20" r="1.5" />
                <path d="M2 3h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.4-1.1L21 7H6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>${totalCarrito.toFixed(2)}</span>
              <span className="cart-badge-count">{totalPiezasCarrito}</span>
            </button>
          </div>
        </div>

        {/* 3. BARRA DE DEPARTAMENTOS */}
        {vista === 'cliente' && (
          <nav className="dept-strip" aria-label="Departamentos de farmacia">
            <div className="page-rail dept-strip-scroll">
              <button
                type="button"
                className={`dept-pill ${categoriaActiva === 'Todos' ? 'active' : ''}`}
                onClick={() => irACatalogo('Todos')}
              >
                Todos los productos
              </button>
              {DEPARTAMENTOS.map(dep => (
                <button
                  key={dep.key}
                  type="button"
                  className={`dept-pill ${categoriaActiva === dep.key ? 'active' : ''}`}
                  onClick={() => irACatalogo(dep.key)}
                >
                  {dep.key}
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="store-main">
        {/* =========================================
            VISTA 1: TIENDA PRINCIPAL DE FARMACIA
           ========================================= */}
        {vista === 'cliente' && (
          <>
            {/* 4. HERO FULL-WIDTH + PROMOS LATERALES */}
            <section className="hero-section">
              <div className="page-rail hero-grid">
                <div className="hero-main-banner">
                  <img
                    src="/images/hero-farmacia.jpg"
                    alt="Atención farmacéutica profesional en FarmaEnCasa"
                    className="hero-bg-img"
                  />
                  <div className="hero-overlay" />
                  <div className="hero-content">
                    <span className="hero-eyebrow">
                      Superfarmacia en línea · Entrega Express
                    </span>
                    <h1>Tu salud y bienestar hasta la puerta de tu casa</h1>
                    <p>
                      Encuentra medicamentos de patente y genéricos, vitaminas, dermocosmética y primeros auxilios con stock verificado y rastreo en vivo de tu pedido.
                    </p>
                    <div className="hero-cta-row">
                      <button
                        type="button"
                        className="btn-hero-primary"
                        onClick={() => irACatalogo('Todos')}
                      >
                        Explorar Catálogo
                      </button>
                      <button
                        type="button"
                        className="btn-hero-secondary"
                        onClick={abrirVistaSeguimiento}
                      >
                        Rastrear mi Pedido
                      </button>
                    </div>
                    <div className="hero-metrics">
                      <div className="hero-metric">
                        <strong>{medicamentos.length} productos</strong>
                        <span>Catálogo actualizado</span>
                      </div>
                      <div className="hero-metric">
                        <strong>{totalUnidadesStock.toLocaleString('es-MX')} pzas</strong>
                        <span>Disponibles en stock</span>
                      </div>
                      <div className="hero-metric">
                        <strong>45 – 60 min</strong>
                        <span>Entrega local rápida</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hero-side-stack">
                  <button
                    type="button"
                    className="side-promo-card"
                    onClick={abrirVistaSeguimiento}
                  >
                    <img
                      src="/images/promo-envio.jpg"
                      alt="Envío rápido a domicilio de FarmaEnCasa"
                    />
                    <div className="side-promo-overlay" />
                    <div className="side-promo-body">
                      <span className="side-promo-tag">Entrega Segura</span>
                      <h3>Envío Express a tu Domicilio</h3>
                      <p>
                        Gratis en compras desde ${ENVIO_GRATIS_MINIMO}. Sigue el estado de tu entrega en vivo con tu teléfono.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="side-promo-card"
                    onClick={() => irACatalogo('Vitaminas y Bienestar')}
                  >
                    <img
                      src="/images/promo-vitaminas.jpg"
                      alt="Vitaminas, minerales y bienestar diario"
                    />
                    <div className="side-promo-overlay emerald" />
                    <div className="side-promo-body">
                      <span className="side-promo-tag">Bienestar Diario</span>
                      <h3>Vitaminas, Defensas e Hidratación</h3>
                      <p>
                        Vitamina C + Zinc, Complejo B, Vitamina D3 y electrolitos listos para envío hoy.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </section>

            {/* 5. PILARES DE CONFIANZA */}
            <section className="trust-strip">
              <div className="page-rail trust-grid">
                <div className="trust-card">
                  <div className="trust-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="1" y="4" width="15" height="12" rx="2" />
                      <path d="M16 8h4l3 4v4h-7V8z" />
                      <circle cx="6.5" cy="18.5" r="2" />
                      <circle cx="18.5" cy="18.5" r="2" />
                    </svg>
                  </div>
                  <div>
                    <h4>Entrega rápida 45–60 min</h4>
                    <p>Despacho inmediato desde nuestra sucursal más cercana.</p>
                  </div>
                </div>

                <div className="trust-card">
                  <div className="trust-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-4z" />
                      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <h4>Medicamentos 100% originales</h4>
                    <p>Almacenamiento controlado y respaldo de laboratorios autorizados.</p>
                  </div>
                </div>

                <div className="trust-card">
                  <div className="trust-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6M9 13h6M9 17h4" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <h4>Control seguro de receta</h4>
                    <p>Verificación responsable en antibióticos y fármacos controlados.</p>
                  </div>
                </div>

                <div className="trust-card">
                  <div className="trust-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <h4>Rastreo en tiempo real</h4>
                    <p>Consulta el avance de tu orden solo con tu número telefónico.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 6. COMPRA POR DEPARTAMENTO */}
            <section className="section-block">
              <div className="page-rail">
                <div className="section-header-row">
                  <div>
                    <h2 className="section-title">Compra por Departamento</h2>
                    <p className="section-subtitle">
                      Explora nuestras categorías de farmacia, bienestar y cuidado personal
                    </p>
                  </div>
                  {categoriaActiva !== 'Todos' && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setCategoriaActiva('Todos')}
                    >
                      Ver todos los departamentos
                    </button>
                  )}
                </div>

                <div className="dept-cards-grid">
                  {DEPARTAMENTOS.map(dep => {
                    const cantidad = conteoPorDepartamento[dep.key] || 0
                    return (
                      <button
                        key={dep.key}
                        type="button"
                        className={`dept-visual-card ${categoriaActiva === dep.key ? 'active' : ''}`}
                        onClick={() => irACatalogo(dep.key)}
                      >
                        <div className="dept-thumb">
                          <img src={dep.imagen} alt={dep.key} />
                        </div>
                        <span className="dept-visual-name">{dep.key}</span>
                        <span className="dept-visual-count">
                          {cantidad} {cantidad === 1 ? 'producto' : 'productos'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            {/* 7. BANDA RÁPIDA DE RASTREO */}
            <section className="section-block" style={{ paddingTop: 4 }}>
              <div className="page-rail">
                <div className="quick-track-band">
                  <div className="quick-track-copy">
                    <h3>¿Ya realizaste un pedido? Rastréalo al instante</h3>
                    <p>
                      Ingresa el teléfono registrado en tu compra para ver el estado en vivo (Pendiente, En camino o Entregado).
                    </p>
                  </div>
                  <form onSubmit={buscarPedidoPorTelefono} className="quick-track-inline-form">
                    <input
                      type="text"
                      placeholder="Teléfono de 10 dígitos"
                      value={telefonoBusqueda}
                      onChange={(e) => setTelefonoBusqueda(e.target.value)}
                      minLength={10}
                      required
                    />
                    <button type="submit">Rastrear ahora</button>
                  </form>
                </div>
              </div>
            </section>

            {/* 8. CATÁLOGO PRINCIPAL DE PRODUCTOS */}
            <section id="catalogo-farmacia" className="section-block">
              <div className="page-rail">
                <div className="section-header-row">
                  <div>
                    <h2 className="section-title">
                      {categoriaActiva === 'Todos'
                        ? 'Catálogo Completo de Farmacia'
                        : categoriaActiva}
                    </h2>
                    <p className="section-subtitle">
                      Mostrando <strong>{medicamentosFiltrados.length}</strong> de {medicamentos.length} productos disponibles con inventario en tiempo real
                    </p>
                  </div>
                </div>

                <div className="catalog-controls">
                  <div className="filter-chips">
                    <button
                      type="button"
                      className={`filter-chip ${filtroReceta === 'todos' ? 'active' : ''}`}
                      onClick={() => setFiltroReceta('todos')}
                    >
                      Todos ({medicamentos.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${filtroReceta === 'libre' ? 'active' : ''}`}
                      onClick={() => setFiltroReceta('libre')}
                    >
                      Venta libre
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${filtroReceta === 'controlado' ? 'active' : ''}`}
                      onClick={() => setFiltroReceta('controlado')}
                    >
                      Con receta médica
                    </button>
                    {(categoriaActiva !== 'Todos' || busqueda || filtroReceta !== 'todos') && (
                      <button
                        type="button"
                        className="filter-chip"
                        onClick={() => {
                          setCategoriaActiva('Todos')
                          setBusqueda('')
                          setFiltroReceta('todos')
                        }}
                      >
                        Limpiar filtros ×
                      </button>
                    )}
                  </div>

                  <div className="catalog-sort-wrap">
                    <label htmlFor="orden-catalogo">Ordenar por:</label>
                    <select
                      id="orden-catalogo"
                      value={ordenCatalogo}
                      onChange={(e) => setOrdenCatalogo(e.target.value)}
                    >
                      <option value="destacados">Destacados</option>
                      <option value="precio-asc">Menor precio</option>
                      <option value="precio-desc">Mayor precio</option>
                      <option value="nombre">Nombre (A – Z)</option>
                    </select>
                  </div>
                </div>

                {medicamentosFiltrados.length === 0 ? (
                  <div className="empty-hint">
                    <strong>No encontramos productos con esos filtros.</strong>
                    <p style={{ margin: '6px 0 12px 0' }}>
                      Intenta buscar otro nombre o explora todos los departamentos de la farmacia.
                    </p>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setCategoriaActiva('Todos')
                        setBusqueda('')
                        setFiltroReceta('todos')
                      }}
                    >
                      Ver todo el catálogo
                    </button>
                  </div>
                ) : (
                  <div className="product-grid">
                    {medicamentosFiltrados.map(med => {
                      const enCarrito = carrito.find(item => item.id === med.id)
                      const agotado = med.stock <= 0
                      const enLimite = enCarrito && enCarrito.cantidad >= med.stock
                      const stockClase = agotado ? 'out' : med.stock <= 15 ? 'low' : 'ok'
                      const stockEtiqueta = agotado
                        ? 'Agotado'
                        : med.stock <= 15
                        ? `Últimas ${med.stock}`
                        : `Disponible (${med.stock})`

                      return (
                        <article key={med.id} className="product-card">
                          <div className="product-media">
                            <img src={med.imagen_url} alt={med.nombre} loading="lazy" />
                            <div className="product-badges-top">
                              <span
                                className={`rx-badge ${
                                  med.es_controlado ? 'controlled' : 'otc'
                                }`}
                              >
                                {med.es_controlado ? 'Con Receta' : 'Venta Libre'}
                              </span>
                              <span className={`stock-pill ${stockClase}`}>
                                {stockEtiqueta}
                              </span>
                            </div>
                          </div>

                          <div className="product-body">
                            <span className="product-category">{med.categoria}</span>
                            <h3 className="product-title">{med.nombre}</h3>
                            <p className="product-presentation">{med.presentacion}</p>
                            <p className="product-desc">{med.descripcion}</p>

                            <div className="product-footer">
                              <div className="product-price-row">
                                <span className="product-price">
                                  ${Number(med.precio).toFixed(2)}
                                  <small>MXN</small>
                                </span>
                                <span className="product-stock-text">
                                  Stock: {med.stock} pzas
                                </span>
                              </div>

                              {enCarrito ? (
                                <div className="card-qty-bar">
                                  <button
                                    type="button"
                                    className="card-qty-btn"
                                    onClick={() => cambiarCantidadCarrito(med.id, -1)}
                                    aria-label={`Quitar uno de ${med.nombre}`}
                                  >
                                    −
                                  </button>
                                  <span className="card-qty-value">
                                    {enCarrito.cantidad} en carrito
                                  </span>
                                  <button
                                    type="button"
                                    className="card-qty-btn"
                                    disabled={enLimite}
                                    onClick={() => cambiarCantidadCarrito(med.id, 1)}
                                    aria-label={`Agregar uno más de ${med.nombre}`}
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-card-add"
                                  disabled={agotado}
                                  onClick={() => agregarAlCarrito(med)}
                                >
                                  {agotado ? 'Sin stock por ahora' : '+ Agregar al carrito'}
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* 9. BANNERS EDITORIALES INTERMEDIOS */}
            <section className="section-block">
              <div className="page-rail promo-dual-grid">
                <div className="editorial-banner">
                  <img
                    src="/images/promo-dermo.jpg"
                    alt="Dermocosmética y cuidado diario de la piel"
                  />
                  <div className="editorial-overlay" />
                  <div className="editorial-content">
                    <span>Cuidado Dermatológico</span>
                    <h3>Protección solar y dermocosmética para toda tu familia</h3>
                    <p>
                      Fórmulas hipoalergénicas con FPS 50+, ceramidas y agua micelar recomendadas para piel sensible.
                    </p>
                    <button
                      type="button"
                      onClick={() => irACatalogo('Dermocosmética')}
                    >
                      Explorar Dermocosmética
                    </button>
                  </div>
                </div>

                <div className="editorial-banner">
                  <img
                    src="/images/cat-auxilios.jpg"
                    alt="Botiquín y primeros auxilios en casa"
                  />
                  <div className="editorial-overlay" />
                  <div className="editorial-content">
                    <span>Botiquín del Hogar</span>
                    <h3>Equipa tu casa con básicos de primeros auxilios</h3>
                    <p>
                      Termómetros digitales clínicos, gasas estériles, antisépticos y sueros orales siempre en existencia.
                    </p>
                    <button
                      type="button"
                      onClick={() => irACatalogo('Primeros Auxilios')}
                    >
                      Ver Primeros Auxilios
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 10. INFORMACIÓN FARMACÉUTICA Y SERVICIOS */}
            <section className="section-block">
              <div className="page-rail">
                <div className="section-header-row">
                  <div>
                    <h2 className="section-title">Información y Servicios de FarmaEnCasa</h2>
                    <p className="section-subtitle">
                      Todo lo que necesitas saber sobre envíos, recetas médicas y atención farmacéutica
                    </p>
                  </div>
                </div>

                <div className="info-grid">
                  <div className="info-card">
                    <span className="info-card-badge">Guía de Compra</span>
                    <h3>¿Cómo funciona tu pedido en línea?</h3>
                    <ul>
                      <li>Selecciona los medicamentos y productos que necesitas y agrégalos al carrito.</li>
                      <li>Completa tu nombre, teléfono, correo electrónico y dirección de entrega.</li>
                      <li>Ingresa el código de seguridad de 6 dígitos que enviamos a tu correo para confirmar tu orden y rastrearla en tiempo real.</li>
                    </ul>
                  </div>

                  <div className="info-card">
                    <span className="info-card-badge">Horarios y Cobertura</span>
                    <h3>Entregas rápidas todos los días</h3>
                    <p>
                      Nuestra plataforma recibe pedidos las <strong>24 horas, los 7 días de la semana</strong>. Los envíos express salen en bloques continuos de 7:00 a 23:00 hrs con tiempo estimado de 45 a 60 minutos en zona metropolitana.
                    </p>
                    <p style={{ marginTop: 8 }}>
                      <strong>Beneficio:</strong> Envío gratis en órdenes desde ${ENVIO_GRATIS_MINIMO} MXN.
                    </p>
                  </div>

                  <div className="info-card">
                    <span className="info-card-badge">Uso Responsable</span>
                    <h3>Aviso Sanitario y Receta Médica</h3>
                    <p>
                      <strong>Consulte a su médico. No se automedique.</strong> Los antibióticos y productos marcados como <em>Con Receta</em> requieren presentar receta médica vigente con cédula profesional al momento de recibir el pedido.
                    </p>
                    <p style={{ marginTop: 8 }}>
                      Todos los medicamentos son resguardados bajo estándares de temperatura y trazabilidad.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* =========================================
            VISTA 2: SEGUIMIENTO DE PEDIDO
           ========================================= */}
        {vista === 'seguimiento' && (
          <section className="subview-wrap">
            <div className="page-rail">
              <div className="subview-card">
                <div className="subview-header">
                  <h2>Seguimiento de Pedido en Tiempo Real</h2>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {telefonoRastreoActivo.length >= 10 && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => consultarRastreo(telefonoRastreoActivo)}
                      >
                        Actualizar estado
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setVista('cliente')}
                    >
                      Volver a la tienda
                    </button>
                  </div>
                </div>

                <form onSubmit={buscarPedidoPorTelefono} className="quick-track-box">
                  <span className="quick-track-label">
                    Consulta el estatus de tus pedidos ingresando tu teléfono
                  </span>
                  <div className="quick-track-row">
                    <input
                      type="text"
                      placeholder="Teléfono de 10 dígitos"
                      value={telefonoBusqueda}
                      onChange={(e) => setTelefonoBusqueda(e.target.value)}
                      minLength={10}
                      required
                    />
                    <button type="submit" className="btn-emerald">
                      Buscar pedidos
                    </button>
                  </div>
                </form>

                {ultimaActualizacion && pedidosCliente.length > 0 && (
                  <p className="polling-note">
                    Actualización automática cada 15 segundos · Última consulta: {ultimaActualizacion}
                  </p>
                )}

                {mensajeRastreo && (
                  <div className="empty-hint">
                    <strong>{mensajeRastreo}</strong>
                  </div>
                )}

                {pedidoActivo && (
                  <div className="order-card tracking-card">
                    <div className="order-card-header">
                      <div>
                        <span className="order-id">Orden #{pedidoActivo.id}</span>
                        <span className="order-date">
                          {formatearFecha(pedidoActivo.fecha_creacion)}
                        </span>
                      </div>
                      <span className={`status-badge ${claseEstado(pedidoActivo.estado)}`}>
                        {pedidoActivo.estado}
                      </span>
                    </div>

                    {pedidoActivo.estado === 'Cancelado' ? (
                      <div className="cancelled-banner">
                        Este pedido fue cancelado. Si tienes dudas, comunícate a atención al cliente.
                      </div>
                    ) : (
                      <div className="progress-stepper">
                        {PASOS_PROGRESO.map((paso, index) => {
                          const pasoActual = indicePaso(pedidoActivo.estado)
                          const completado = index <= pasoActual
                          const activo = index === pasoActual
                          return (
                            <div
                              key={paso.key}
                              className={`progress-step ${completado ? 'completed' : ''} ${
                                activo ? 'current' : ''
                              }`}
                            >
                              <div className="step-circle">{completado ? '✓' : index + 1}</div>
                              <div className="step-label">{paso.label}</div>
                              <div className="step-desc">{paso.desc}</div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="order-client-info">
                      <div>
                        <strong>Cliente:</strong> {pedidoActivo.cliente_nombre}
                      </div>
                      <div>
                        <strong>Teléfono:</strong> {pedidoActivo.telefono}
                      </div>
                      {pedidoActivo.correo && (
                        <div>
                          <strong>Correo verificado:</strong> {pedidoActivo.correo}
                        </div>
                      )}
                      <div>
                        <strong>Dirección:</strong> {pedidoActivo.direccion}
                      </div>
                    </div>

                    <div className="order-items-box">
                      <strong>Resumen de tu compra:</strong>
                      <ul>
                        {(pedidoActivo.detalle_productos || []).map((item, idx) => (
                          <li key={`${pedidoActivo.id}-${idx}`}>
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
                        Total: <strong>${Number(pedidoActivo.total).toFixed(2)} MXN</strong>
                      </div>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => consultarRastreo(telefonoRastreoActivo, pedidoActivo.id)}
                      >
                        Actualizar ahora
                      </button>
                    </div>
                  </div>
                )}

                {pedidosCliente.length > 1 && (
                  <div className="history-section">
                    <h3>Historial de tus pedidos ({pedidosCliente.length})</h3>
                    <div className="history-list">
                      {pedidosCliente.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className={`history-item ${
                            pedidoActivo && pedidoActivo.id === p.id ? 'selected' : ''
                          }`}
                          onClick={() => setPedidoSeleccionadoId(p.id)}
                        >
                          <div>
                            <strong>Orden #{p.id}</strong>
                            <span className="history-date">{formatearFecha(p.fecha_creacion)}</span>
                          </div>
                          <div className="history-right">
                            <span>${Number(p.total).toFixed(2)}</span>
                            <span className={`status-badge ${claseEstado(p.estado)}`}>{p.estado}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* =========================================
            VISTA 3: LOGIN DE EMPLEADOS
           ========================================= */}
        {vista === 'login' && (
          <section className="subview-wrap">
            <div className="page-rail">
              <div className="subview-card narrow">
                <div className="subview-header">
                  <h2>Acceso para Empleados</h2>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setVista('cliente')}
                  >
                    Volver
                  </button>
                </div>
                <p style={{ marginTop: 0, color: '#475569', fontSize: '0.9rem' }}>
                  Inicia sesión con tus credenciales de administrador para gestionar inventario y pedidos.
                </p>
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
                  <button type="submit" className="btn-primary">
                    Iniciar Sesión
                  </button>
                </form>
                {mensajeLogin && (
                  <div className="feedback-msg error-msg">
                    <strong>{mensajeLogin}</strong>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* =========================================
            VISTA 4: PANEL DE ADMINISTRACIÓN
           ========================================= */}
        {vista === 'admin' && (
          <section className="subview-wrap">
            <div className="page-rail">
              <div className="subview-card">
                <div className="subview-header">
                  <h2>Panel Administrativo de Farmacia</h2>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setVista('cliente')}
                    >
                      Ver Tienda Pública
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={cerrarSesion}
                    >
                      Cerrar Sesión
                    </button>
                  </div>
                </div>

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

                {tabAdmin === 'inventario' && (
                  <>
                    <form onSubmit={agregarMedicamento} className="form-container admin-form-card">
                      <h3 style={{ margin: '0 0 6px 0', color: '#0a2259' }}>
                        Registrar Nuevo Producto en Inventario
                      </h3>
                      <div className="form-grid-2">
                        <input
                          type="text"
                          placeholder="Nombre del producto (ej. Ibuprofeno 600 mg)"
                          value={nuevoNombre}
                          onChange={(e) => setNuevoNombre(e.target.value)}
                          required
                        />
                        <select
                          value={nuevaCategoria}
                          onChange={(e) => setNuevaCategoria(e.target.value)}
                        >
                          {DEPARTAMENTOS.map(dep => (
                            <option key={dep.key} value={dep.key}>
                              {dep.key}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-grid-2">
                        <input
                          type="number"
                          placeholder="Precio ($ MXN)"
                          value={nuevoPrecio}
                          onChange={(e) => setNuevoPrecio(e.target.value)}
                          step="0.01"
                          min="0.01"
                          required
                        />
                        <input
                          type="number"
                          placeholder="Stock inicial (piezas)"
                          value={nuevoStock}
                          onChange={(e) => setNuevoStock(e.target.value)}
                          min="0"
                          required
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Presentación (ej. Caja con 20 tabletas · 500 mg)"
                        value={nuevaPresentacion}
                        onChange={(e) => setNuevaPresentacion(e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Descripción breve de uso o beneficio"
                        value={nuevaDescripcion}
                        onChange={(e) => setNuevaDescripcion(e.target.value)}
                      />
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={nuevoControlado}
                          onChange={(e) => setNuevoControlado(e.target.checked)}
                          style={{ width: 'auto' }}
                        />
                        Es medicamento controlado (requiere receta médica)
                      </label>
                      <button type="submit" className="btn-emerald">
                        Guardar en Inventario
                      </button>
                    </form>

                    {mensajeAdmin && (
                      <div
                        className={`feedback-msg ${
                          mensajeAdmin.startsWith('❌') ? 'error-msg' : ''
                        }`}
                      >
                        <strong>{mensajeAdmin}</strong>
                      </div>
                    )}

                    <div className="admin-inventory-header">
                      <h3>Inventario Actual ({totalUnidadesStock} piezas en total)</h3>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={sincronizarCatalogoCompleto}
                      >
                        Reabastecer catálogo inicial
                      </button>
                    </div>

                    <div className="admin-inv-list">
                      {medicamentos.map(med => (
                        <div key={med.id} className="admin-inv-row">
                          <div className="admin-inv-main">
                            <img
                              src={med.imagen_url}
                              alt={med.nombre}
                              className="admin-inv-thumb"
                            />
                            <div className="admin-inv-meta">
                              <strong>
                                {med.nombre} {med.es_controlado ? '· (Receta)' : ''}
                              </strong>
                              <span>
                                {med.categoria} · {med.presentacion} · ${Number(med.precio).toFixed(2)} MXN ·{' '}
                                <strong>Stock: {med.stock}</strong>
                              </span>
                            </div>
                          </div>
                          <div className="admin-inv-actions">
                            <button
                              type="button"
                              className="btn-restock"
                              disabled={actualizandoMedId === med.id}
                              onClick={() => reabastecerProducto(med, 25)}
                            >
                              +25 pzas
                            </button>
                            <button
                              type="button"
                              className="btn-restock"
                              disabled={actualizandoMedId === med.id}
                              onClick={() => reabastecerProducto(med, 50)}
                            >
                              +50 pzas
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {tabAdmin === 'pedidos' && (
                  <div className="orders-section">
                    <div className="subview-header" style={{ marginBottom: 14, paddingBottom: 10 }}>
                      <h3 style={{ margin: 0, color: '#0a2259' }}>Pedidos Recibidos</h3>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => cargarPedidos()}
                      >
                        Actualizar lista
                      </button>
                    </div>

                    {mensajePedidos && (
                      <div
                        className={`feedback-msg ${
                          mensajePedidos.startsWith('❌') ? 'error-msg' : ''
                        }`}
                        style={{ marginBottom: 14 }}
                      >
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
                              {pedido.correo && (
                                <div>
                                  <strong>Correo:</strong> {pedido.correo}
                                </div>
                              )}
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
                                Total: <strong>${Number(pedido.total).toFixed(2)} MXN</strong>
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
              </div>
            </div>
          </section>
        )}
      </main>

      {/* 11. FOOTER DE FARMACIA */}
      <footer className="site-footer">
        <div className="page-rail footer-grid">
          <div className="footer-col">
            <h3 className="footer-brand-title">
              Farma<span>EnCasa</span>
            </h3>
            <p>
              Tu superfarmacia en línea con catálogo verificado, envío express a domicilio y seguimiento en vivo de cada orden. Cuidamos la salud de tu familia todos los días.
            </p>
            <p>
              <strong>Línea de atención:</strong> 800 327 6224 · soporte@farmaencasa.mx
            </p>
          </div>

          <div className="footer-col">
            <h4>Departamentos</h4>
            <ul className="footer-links">
              {DEPARTAMENTOS.slice(0, 5).map(dep => (
                <li key={dep.key}>
                  <button type="button" onClick={() => irACatalogo(dep.key)}>
                    {dep.key}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-col">
            <h4>Atención al Cliente</h4>
            <ul className="footer-links">
              <li>
                <button type="button" onClick={abrirVistaSeguimiento}>
                  Rastrear mi pedido
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setCarritoAbierto(true)}>
                  Ver mi carrito ({totalPiezasCarrito})
                </button>
              </li>
              <li>
                <button type="button" onClick={() => irACatalogo('Dermocosmética')}>
                  Dermocosmética
                </button>
              </li>
              <li>
                <button type="button" onClick={() => irACatalogo('Primeros Auxilios')}>
                  Primeros Auxilios
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setVista(token ? 'admin' : 'login')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  Portal de Empleados
                </button>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Información Sanitaria</h4>
            <p>
              Consulte a su médico. El uso de medicamentos de venta con receta es responsabilidad de quien los prescribe y de quien los consume.
            </p>
            <p>
              Horario de entregas: Lunes a Domingo de 7:00 a 23:00 hrs.
            </p>
          </div>
        </div>

        <div className="page-rail footer-bottom">
          <span>© {new Date().getFullYear()} FarmaEnCasa · Todos los derechos reservados.</span>
          <span>Estado del servicio: {estado}</span>
        </div>
      </footer>

      {/* BARRA FLOTANTE DE CARRITO (CUANDO HAY PRODUCTOS) */}
      {vista === 'cliente' && totalPiezasCarrito > 0 && !carritoAbierto && (
        <button
          type="button"
          className="floating-cart-bar"
          onClick={() => setCarritoAbierto(true)}
        >
          <span>Ver carrito ({totalPiezasCarrito} {totalPiezasCarrito === 1 ? 'artículo' : 'artículos'})</span>
          <span>·</span>
          <strong>${totalCarrito.toFixed(2)} MXN</strong>
        </button>
      )}

      {/* 12. DRAWER LATERAL DE CARRITO Y CHECKOUT */}
      {carritoAbierto && (
        <div
          className="drawer-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCarritoAbierto(false)
          }}
        >
          <aside className="cart-drawer" aria-label="Carrito de compras">
            <div className="drawer-header">
              <h2>Tu Carrito ({totalPiezasCarrito})</h2>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setCarritoAbierto(false)}
                aria-label="Cerrar carrito"
              >
                ×
              </button>
            </div>

            <div className="shipping-meter">
              {faltaEnvioGratis > 0 ? (
                <span>
                  Agrega <strong>${faltaEnvioGratis.toFixed(2)} MXN</strong> más para desbloquear <strong>envío express gratis</strong>
                </span>
              ) : (
                <span>
                  🎉 ¡Felicidades! Tu pedido califica para <strong>envío express gratis</strong>
                </span>
              )}
              <div className="shipping-meter-bar">
                <div
                  className="shipping-meter-fill"
                  style={{ width: `${progresoEnvio}%` }}
                />
              </div>
            </div>

            <div className="drawer-body">
              {carrito.length === 0 ? (
                <div className="empty-hint">
                  <strong>Tu carrito está vacío</strong>
                  <p style={{ margin: '6px 0 14px 0' }}>
                    Agrega medicamentos, vitaminas o productos de cuidado desde el catálogo.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setCarritoAbierto(false)
                      irACatalogo('Todos')
                    }}
                  >
                    Ir al Catálogo
                  </button>
                </div>
              ) : (
                <>
                  {carrito.map(item => (
                    <div key={item.id} className="drawer-item">
                      <img
                        src={item.imagen_url || '/images/cat-analgesicos.jpg'}
                        alt={item.nombre}
                        className="drawer-item-img"
                      />
                      <div className="drawer-item-info">
                        <strong>{item.nombre}</strong>
                        <span>
                          ${item.precio.toFixed(2)} c/u · Subtotal:{' '}
                          <strong>${(item.precio * item.cantidad).toFixed(2)}</strong>
                        </span>
                      </div>
                      <div className="cart-controls">
                        <button
                          type="button"
                          className="btn-qty"
                          onClick={() => cambiarCantidadCarrito(item.id, -1)}
                        >
                          −
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
                          title="Eliminar"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="drawer-summary">
                    <div className="summary-line">
                      <span>Productos ({totalPiezasCarrito})</span>
                      <span>${totalCarrito.toFixed(2)} MXN</span>
                    </div>
                    <div className="summary-line">
                      <span>Envío a domicilio</span>
                      <span style={{ color: '#059669', fontWeight: 700 }}>
                        {faltaEnvioGratis === 0 ? 'GRATIS' : 'Incluido en promoción'}
                      </span>
                    </div>
                    <div className="summary-line total">
                      <span>Total a pagar</span>
                      <span>${totalCarrito.toFixed(2)} MXN</span>
                    </div>
                  </div>

                  <div className="checkout-steps-indicator">
                    <span className={pasoCheckout === 'datos' ? 'active' : 'done'}>
                      1. Datos y correo
                    </span>
                    <span className={pasoCheckout === 'verificar' ? 'active' : ''}>
                      2. Código de seguridad
                    </span>
                  </div>

                  {pasoCheckout === 'datos' ? (
                    <>
                      <h3 className="checkout-title">Datos de entrega y confirmación</h3>
                      <form onSubmit={solicitarCodigoCorreo} className="form-container">
                        <input
                          type="text"
                          placeholder="Nombre completo de quien recibe"
                          value={clienteNombre}
                          onChange={(e) => setClienteNombre(e.target.value)}
                          required
                        />
                        <input
                          type="text"
                          placeholder="Teléfono de contacto (10 dígitos)"
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value)}
                          minLength={10}
                          required
                        />
                        <input
                          type="email"
                          placeholder="Correo electrónico (para código de confirmación)"
                          value={correoCliente}
                          onChange={(e) => setCorreoCliente(e.target.value)}
                          required
                        />
                        <input
                          type="text"
                          placeholder="Dirección completa (Calle, número, colonia y referencias)"
                          value={direccion}
                          onChange={(e) => setDireccion(e.target.value)}
                          required
                        />
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={enviandoCodigo || carrito.length === 0}
                        >
                          {enviandoCodigo
                            ? 'Enviando código al correo...'
                            : 'Enviar código de confirmación al correo'}
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="otp-verify-box">
                      <h3 className="checkout-title" style={{ marginTop: 0 }}>
                        Confirma tu pedido con el código
                      </h3>
                      <p className="otp-helper-text">
                        Ingresa el código de <strong>6 dígitos</strong> enviado a{' '}
                        <strong>{correoCliente}</strong> (válido por 5 minutos).
                      </p>

                      {codigoDemo && (
                        <div className="otp-demo-alert">
                          <strong>Modo demostración activo:</strong> aún no hay proveedor de correo configurado en el servidor. Tu código de prueba es{' '}
                          <span className="otp-demo-code">{codigoDemo}</span>
                        </div>
                      )}

                      <form onSubmit={hacerPedido} className="form-container">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="\d{6}"
                          maxLength={6}
                          className="otp-code-input"
                          placeholder="000000"
                          value={codigoVerificacion}
                          onChange={(e) =>
                            setCodigoVerificacion(e.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                          required
                        />
                        <button
                          type="submit"
                          className="btn-emerald"
                          disabled={enviandoPedido || codigoVerificacion.length !== 6}
                        >
                          {enviandoPedido
                            ? 'Verificando y confirmando...'
                            : `Verificar y Confirmar Pedido ($${totalCarrito.toFixed(2)} MXN)`}
                        </button>
                      </form>

                      <div className="otp-actions-row">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={enviandoCodigo || segundosReenvio > 0}
                          onClick={solicitarCodigoCorreo}
                        >
                          {segundosReenvio > 0
                            ? `Reenviar en ${segundosReenvio}s`
                            : 'Reenviar código'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setPasoCheckout('datos')
                            setCodigoVerificacion('')
                            setCodigoDemo('')
                            setMensajePedido('')
                          }}
                        >
                          Editar datos
                        </button>
                      </div>
                    </div>
                  )}

                  {mensajePedido && (
                    <div
                      className={`feedback-msg ${
                        mensajePedido.startsWith('❌') || mensajePedido.startsWith('⚠️')
                          ? 'error-msg'
                          : ''
                      }`}
                    >
                      <strong>{mensajePedido}</strong>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
