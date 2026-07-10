let solicitudIdActual = null;
let editMode = false;
let editSolicitudId = 0;
let formDirty = false;

const ENABLE_EDIT_UNIDAD = false;

const BORRADOR_KEY = 'borrador_solicitud';

function tieneDatos() {
  const rows = document.querySelectorAll('#itemsBody tr');
  if (rows.length > 0) return true;
  const campos = ['#empresa', '#area', '#nombreSolicitante', '#cargoSolicitante', '#jefeNombre', '#jefeCargo', '#fechaEntregaGlobal'];
  return campos.some(s => {
    const el = document.querySelector(s);
    return el && el.value.trim() !== '';
  });
}

function toggleEmptyMessage() {
  const msg = document.getElementById('emptyItemsMessage');
  const rows = document.querySelectorAll('#itemsBody tr');
  if (msg) {
    msg.style.display = rows.length === 0 ? 'block' : 'none';
  }
}

function marcarDirty() {
  formDirty = tieneDatos();
}

function serializarFormulario() {
  const rows = document.querySelectorAll('#itemsBody tr');
  const items = [];
  rows.forEach(row => {
    items.push({
      sku_id: row.querySelector('.cantidad-input')?.dataset?.skuId || '',
      codigo: row.querySelector('.sku-tag')?.textContent || '',
      descripcion: row.cells[1]?.textContent?.trim() || '',
      cantidad: row.querySelector('.cantidad-input')?.value || '1',
      unidad: row.querySelector('.unidad-select')?.value || 'Unidad',
      observaciones: row.querySelector('.observaciones-input')?.value || '',
      destino: row.querySelector('.destino-input')?.value || '',
      fecha_entrega: row.querySelector('.fecha-entrega-input')?.value || ''
    });
  });
  return {
    empresa: document.getElementById('empresa')?.value || '',
    area: document.getElementById('area')?.value || '',
    nombre: document.getElementById('nombreSolicitante')?.value || '',
    cargo: document.getElementById('cargoSolicitante')?.value || '',
    jefe_nombre: document.getElementById('jefeNombre')?.value || '',
    jefe_cargo: document.getElementById('jefeCargo')?.value || '',
    fecha_global: document.getElementById('fechaEntregaGlobal')?.value || '',
    items: items
  };
}

function restaurarBorrador(data) {
  if (data.empresa) document.getElementById('empresa').value = data.empresa;
  if (data.area) document.getElementById('area').value = data.area;
  if (data.nombre) document.getElementById('nombreSolicitante').value = data.nombre;
  if (data.cargo) document.getElementById('cargoSolicitante').value = data.cargo;
  if (data.jefe_nombre) document.getElementById('jefeNombre').value = data.jefe_nombre;
  if (data.jefe_cargo) document.getElementById('jefeCargo').value = data.jefe_cargo;
  if (data.fecha_global) document.getElementById('fechaEntregaGlobal').value = data.fecha_global;
  if (data.items) {
    for (const item of data.items) {
      agregarItemATabla(item);
    }
  }
  storage.removeItem(BORRADOR_KEY);
  showToast('Borrador restaurado', 'success');
}

function iniciarAutoGuardado() {
  setInterval(() => {
    if (!formDirty) return;
    const data = serializarFormulario();
    const itemsCount = data.items.length;
    if (itemsCount === 0) return;
    storage.setItem(BORRADOR_KEY, JSON.stringify(data));
  }, 30000);
}

document.addEventListener('DOMContentLoaded', () => {
  const inputFecha = document.getElementById('fechaEntregaGlobal');
  if (inputFecha) {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    const hoyISO = `${yyyy}-${mm}-${dd}`;
    inputFecha.value = hoyISO;
    inputFecha.min = hoyISO;
    toggleEmptyMessage();
  }

  const editModeEl = document.getElementById('editMode');
  const editIdEl = document.getElementById('editSolicitudId');
  if (editModeEl && editModeEl.value === 'true') {
    editMode = true;
    editSolicitudId = parseInt(editIdEl?.value || '0');
    if (editSolicitudId) {
      cargarSolicitudParaEditar(editSolicitudId);
    }
  }

  // ── Borrador restore (item 5) ──
  const borradorBar = document.getElementById('borradorBar');
  if (!editMode && borradorBar) {
    const saved = storage.getItem(BORRADOR_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.items && data.items.length > 0) {
          borradorBar.style.display = 'flex';
        }
      } catch (e) {}
    }
  }

  document.getElementById('btnRestaurarBorrador')?.addEventListener('click', () => {
    try {
      const saved = storage.getItem(BORRADOR_KEY);
      if (saved) restaurarBorrador(JSON.parse(saved));
    } catch (e) { showToast('Error al restaurar borrador', 'error'); }
    document.getElementById('borradorBar').style.display = 'none';
  });

  document.getElementById('btnDescartarBorrador')?.addEventListener('click', () => {
    storage.removeItem(BORRADOR_KEY);
    document.getElementById('borradorBar').style.display = 'none';
    showToast('Borrador descartado', 'info');
  });

  // ── Auto-save cada 30s (item 5) ──
  iniciarAutoGuardado();

  // ── beforeunload (tab close/refresh) ──
  window.addEventListener('beforeunload', function(e) {
    if (formDirty && !editMode) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ── Navigation intercept (sidebar + breadcrumb + any internal link) ──
  function interceptNav(e, link) {
    if (formDirty && !editMode) {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        e.preventDefault();
        document.getElementById('btnSalirSinGuardar').dataset.targetUrl = href;
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalConfirmarSalir'));
        modal.show();
      }
    }
  }

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => interceptNav(e, link));
  });

  document.querySelectorAll('a[href^="/"]:not(.sidebar-link):not(.modal a):not([target="_blank"])').forEach(link => {
    link.addEventListener('click', (e) => interceptNav(e, link));
  });

  document.getElementById('btnSalirSinGuardar')?.addEventListener('click', function() {
    const url = this.dataset.targetUrl;
    if (url) { formDirty = false; window.location.href = url; }
  });

  // ── Mark dirty on form changes ──
  const formInputs = document.querySelectorAll('#empresa, #area, #nombreSolicitante, #cargoSolicitante, #jefeNombre, #jefeCargo, #fechaEntregaGlobal');
  formInputs.forEach(el => el.addEventListener('change', marcarDirty));
  formInputs.forEach(el => el.addEventListener('input', marcarDirty));
});

function formatearFechaES(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return '';
  const [y, m, d] = yyyy_mm_dd.split('-');
  return `${d}/${m}/${y}`;
}

function actualizarFechaEnItems(fechaGlobal) {
  const filas = document.querySelectorAll('#itemsBody tr');
  const fechaFormateada = formatearFechaES(fechaGlobal);
  filas.forEach(row => {
    const hidden = row.querySelector('.fecha-entrega-input');
    if (hidden) hidden.value = fechaGlobal;
    const badge = row.querySelector('span.badge');
    if (badge) badge.textContent = fechaFormateada;
  });
  marcarDirty();
}

const fechaEntregaGlobalEl = document.getElementById('fechaEntregaGlobal');
if (fechaEntregaGlobalEl) {
  const hoy = new Date().toISOString().split('T')[0];
  fechaEntregaGlobalEl.min = hoy;
  fechaEntregaGlobalEl.addEventListener('change', (e) => {
    const nuevaFecha = e.target.value;
    if (!nuevaFecha) return;
    actualizarFechaEnItems(nuevaFecha);
  });
}

async function cargarSolicitudParaEditar(id) {
  try {
    const res = await fetch(`/solicitud/${id}/json`);
    const data = await res.json();
    if (!data.success) {
      showToast('Error al cargar solicitud', 'error');
      return;
    }
    const s = data.solicitud;
    if (s.items && s.items.length > 0) {
      const primeraFecha = s.items[0].fecha_entrega;
      if (primeraFecha) {
        document.getElementById('fechaEntregaGlobal').value = primeraFecha;
      }
    }
    if (s.items) {
      for (const item of s.items) {
        const sku = item.sku || {};
        agregarItemATabla({
          id: item.sku_id || item.sku?.id,
          codigo: sku.codigo_sku || item.sku_codigo || '',
          descripcion: sku.descripcion || item.sku_descripcion || '',
          cantidad: item.cantidad || 1,
          unidad: item.unidad_override || sku.unidad_medida || 'Unidad',
          observaciones: item.observaciones || '',
          destino: item.destino || '',
          fecha_entrega: item.fecha_entrega || ''
        });
      }
    }
    solicitudIdActual = id;
    document.getElementById('btnGenerarPDF').disabled = false;
  } catch (e) {
    console.error('Error cargando solicitud:', e);
    showToast('Error al cargar los datos de la solicitud', 'error');
  }
}

function agregarItemATabla(item) {
  const tbody = document.getElementById('itemsBody');
  const row = tbody.insertRow();
  row.className = 'item-row-new';

  const descripcionEscapada = (item.descripcion || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  const hoyISO = `${yyyy}-${mm}-${dd}`;
  const fecha = item.fecha_entrega || document.getElementById('fechaEntregaGlobal').value || hoyISO;

  row.innerHTML = `
    <td><span class="sku-tag">${item.codigo}</span></td>
    <td style="font-size:0.85rem">${descripcionEscapada}</td>
    <td><input type="number" class="form-input form-input-sm cantidad-input" value="${item.cantidad || 1}" min="1" data-sku-id="${item.sku_id || item.id}" style="width:60px"></td>
    <td>
      <select class="form-select unidad-select" style="font-size:0.8rem;padding:0.3rem 0.5rem;max-width:120px">
        ${unidadOptions(item.unidad || 'Unidad')}
      </select>
    </td>
    <td><input type="text" class="form-input form-input-sm observaciones-input" placeholder="Op" style="width:100px" value="${item.observaciones || ''}"></td>
    <td><input type="text" class="form-input form-input-sm destino-input" placeholder="Op" style="width:90px" value="${item.destino || ''}"></td>
    <td><input type="date" class="form-input form-input-sm fecha-entrega-input" value="${fecha}" min="${hoyISO}" style="width:115px"></td>
    <td class="text-center">
      <button class="btn-icon" onclick="eliminarItem(this)" title="Eliminar item">
        <i class="bi bi-trash"></i>
      </button>
    </td>
  `;

  // Track dirty on item input changes
  row.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', marcarDirty);
    el.addEventListener('input', marcarDirty);
  });

  toggleEmptyMessage();
  marcarDirty();
}

function unidadOptions(selected) {
  const unidades = [
    'Unidad', 'Caja', 'Paquete', 'Kilogramo (kg)', 'Metro (mts)', 'Litro (L)', 'Tonelada m\u00e9trica (t / MT)',
    'Rollo', 'Bolsa', 'Gal\u00f3n (gal)', 'Libra (lb)', 'Onza (oz)', 'Pieza (pz)',
    'Juego', 'Cart\u00f3n', 'Frasco', 'Tambor', 'Barril', 'Pallet',
    'Docena (dz)', 'Par', 'Kit', 'Bobina', 'Saco',
    'Metro cuadrado (m\u00b2)', 'Metro c\u00fabico (m\u00b3)', 'Mililitro (ml)', 'Gramo (g)', 'Tonel'
  ];
  return unidades.map(u => `<option value="${u}" ${u === selected ? 'selected' : ''}>${u}</option>`).join('');
}

const SUBCATEGORIAS_POR_CATEGORIA = {
  "ACCESORIOS/COMPONENTES": [
    "Administrativo", "Calidad", "Inform\u00e1tica", "Log\u00edstica",
    "Mantenimiento", "Producci\u00f3n", "Almac\u00e9n y distribuci\u00f3n", "Otros"
  ],
  "CONSUMIBLES GENERALES": [
    "Administraci\u00f3n", "Cafeter\u00eda", "Limpieza", "Mantenimiento",
    "Producci\u00f3n", "Planificaci\u00f3n", "Papeler\u00eda y formularios"
  ],
  "HERRAMIENTAS": [
    "Mantenimiento", "Producci\u00f3n", "Tecnolog\u00eda", "Otros"
  ],
  "INSUMOS INDIRECTOS DE PRODUCCION": [
    "Producci\u00f3n", "Planificaci\u00f3n", "Mantenimiento", "Inform\u00e1tica",
    "Calidad", "Guantes, cofias, etc", "Etiquetas y r\u00f3tulos",
    "Uniformes y ropa de trabajo", "Sellos", "Otros"
  ],
  "MATERIA PRIMA": [
    "Resina Pl\u00e1stica", "Masterbatch", "Aditivo", "Jumbos/Paca"
  ],
  "REPUESTOS": [
    "El\u00e9ctrico", "Mec\u00e1nico", "Hidr\u00e1ulico", "Otros"
  ],
  "SERVICIOS": [
    "Administrativo", "Almac\u00e9n y distribuci\u00f3n", "Exportaciones",
    "Importaciones", "Mantenimiento", "Inform\u00e1tica",
    "Planificaci\u00f3n", "Log\u00edstica"
  ]
};

function poblarSubcategorias(categoriaSeleccionada) {
  const subSelect = document.getElementById('nuevaSubcategoria');
  const lista = SUBCATEGORIAS_POR_CATEGORIA[categoriaSeleccionada] || [];
  subSelect.innerHTML = '';
  if (!categoriaSeleccionada) {
    subSelect.disabled = true;
    subSelect.innerHTML = '<option value="">Seleccione una categor\u00eda primero...</option>';
    return;
  }
  subSelect.disabled = false;
  subSelect.innerHTML = '<option value="">Seleccione...</option>' +
    lista.map(sc => `<option value="${sc}">${sc}</option>`).join('');
}

document.getElementById('nuevaCategoria')?.addEventListener('change', function (e) {
  poblarSubcategorias(e.target.value);
});

const modalCrearSKUEl = document.getElementById('modalCrearSKU');
if (modalCrearSKUEl) {
  modalCrearSKUEl.addEventListener('shown.bs.modal', () => {
    const cat = document.getElementById('nuevaCategoria');
    const sub = document.getElementById('nuevaSubcategoria');
    if (cat) cat.value = "";
    if (sub) {
      sub.disabled = true;
      sub.innerHTML = '<option value="">Seleccione una categor\u00eda primero...</option>';
    }
  });
}

let searchTimeout = null;
document.getElementById('buscarSKU')?.addEventListener('input', async function(e) {
  const query = e.target.value;
  if (query.length < 2) {
    document.getElementById('resultadosBusqueda').innerHTML = '';
    return;
  }
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`/buscar-sku?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      mostrarResultados(data.skus);
    } catch (error) {
      console.error('Error al buscar SKU:', error);
      showToast('Error al buscar SKU', 'error');
    }
  }, 250);
});

function mostrarResultados(skus) {
  const container = document.getElementById('resultadosBusqueda');
  if (skus.length === 0) {
    container.innerHTML = '<div class="list-group-item" style="cursor:default;color:var(--gray-400);font-size:0.85rem"><i class="bi bi-search me-2"></i>No se encontraron resultados</div>';
    return;
  }
  container.innerHTML = skus.map(sku => {
    const codigoEscapado = (sku.codigo || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const descripcionEscapada = (sku.descripcion || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const unidadEscapada = (sku.unidad || 'UND').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const descripcionHTML = (sku.descripcion || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `
      <div class="list-group-item" onclick="seleccionarSKU(${sku.id}, '${codigoEscapado}', '${descripcionEscapada}', '${unidadEscapada}')">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="flex:1;min-width:0">
            <span style="font-weight:600;color:var(--primary-dark)">${sku.codigo}</span>
            <span style="color:var(--gray-300);margin:0 0.35rem">&mdash;</span>
            <span style="color:var(--gray-500);font-size:0.88rem">${descripcionHTML}</span>
          </div>
          <span style="font-size:0.78rem;color:var(--gray-400);white-space:nowrap;margin-left:0.5rem">${sku.unidad || 'UND'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function seleccionarSKU(id, codigo, descripcion, unidad) {
  document.getElementById('buscarSKU').value = '';
  document.getElementById('resultadosBusqueda').innerHTML = '';
  if (solicitudIdActual && !editMode) {
    solicitudIdActual = null;
    document.getElementById('btnGenerarPDF').disabled = true;
  }
  const fechaGlobal = document.getElementById('fechaEntregaGlobal').value;
  if (!fechaGlobal) {
    showToast('Por favor seleccione primero la Fecha de Entrega Global', 'warning');
    return;
  }
  agregarItemATabla({ id, codigo, descripcion, unidad, cantidad: 1, observaciones: '', destino: '', fecha_entrega: fechaGlobal });
  showToast(`Item ${codigo} agregado`, 'success');
}

function eliminarItem(btn) {
  const row = btn.closest('tr');
  row.style.transition = 'all 0.2s ease';
  row.style.opacity = '0';
  setTimeout(() => {
    row.remove();
    toggleEmptyMessage();
    marcarDirty();
    showToast('Item eliminado', 'info');
  }, 200);
}

document.getElementById('btnConfirmarCrearSKU')?.addEventListener('click', async function () {
  const btn = this;
  const descripcion = document.getElementById('nuevaDescripcion').value.trim();
  const categoria = document.getElementById('nuevaCategoria').value;
  const subcategoria = document.getElementById('nuevaSubcategoria').value;
  const unidad = document.getElementById('nuevaUnidad').value;

  if (!descripcion || !categoria || !subcategoria) {
    showToast('Por favor complete la descripci\u00f3n, categor\u00eda y subcategor\u00eda', 'warning');
    return;
  }

  setLoading(btn, true);
  try {
    const response = await fetch('/crear-sku', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descripcion, categoria, subcategoria, unidad })
    });

    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Respuesta no-JSON (${response.status}): ${text.slice(0, 200)}`);
    }

    if (!response.ok || !data.success) {
      showToast(data?.message || 'Error al crear el SKU', 'error');
      setLoading(btn, false);
      return;
    }

    showToast(`SKU ${data.codigo_sku} creado exitosamente`, 'success');

    const modalEl = document.getElementById('modalCrearSKU');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    document.getElementById('formCrearSKU').reset();
    poblarSubcategorias("");
    seleccionarSKU(data.sku_id, data.codigo_sku, descripcion, unidad);

  } catch (error) {
    console.error('Error al crear SKU:', error);
    showToast(error.message || 'Error al crear el SKU', 'error');
  } finally {
    setLoading(btn, false);
  }
});

document.getElementById('btnGuardarSolicitud')?.addEventListener('click', async function() {
  const btn = this;
  const fechaGlobal = document.getElementById('fechaEntregaGlobal').value;
  if (!fechaGlobal) {
    showToast('Por favor seleccione la Fecha de Entrega Global', 'warning');
    return;
  }

  const rows = document.querySelectorAll('#itemsBody tr');
  const empresa = document.getElementById('empresa').value.trim();
  const area = document.getElementById('area').value.trim();
  const nombreSolicitante = document.getElementById('nombreSolicitante').value.trim();
  const cargoSolicitante = document.getElementById('cargoSolicitante').value.trim();
  const jefeNombre = document.getElementById('jefeNombre').value.trim();
  const jefeCargo = document.getElementById('jefeCargo').value.trim();

  if (!empresa || !area || !nombreSolicitante || !cargoSolicitante || !jefeNombre || !jefeCargo) {
    showToast('Por favor complete todos los campos obligatorios', 'warning');
    return;
  }

  if (rows.length === 0) {
    showToast('Debe agregar al menos un item a la solicitud', 'warning');
    return;
  }

  setLoading(btn, true);

  const items = [];
  rows.forEach(row => {
    const skuId = parseInt(row.querySelector('.cantidad-input').dataset.skuId);
    items.push({
      sku_id: isNaN(skuId) ? null : skuId,
      cantidad: parseInt(row.querySelector('.cantidad-input').value) || 1,
      observaciones: row.querySelector('.observaciones-input').value,
      destino: row.querySelector('.destino-input').value,
      fecha_entrega: row.querySelector('.fecha-entrega-input').value,
      unidad: row.querySelector('.unidad-select').value
    });
  });

  const body = {
    items,
    empresa, area,
    nombre: nombreSolicitante,
    cargo: cargoSolicitante,
    jefe_nombre: jefeNombre,
    jefe_cargo: jefeCargo
  };

  try {
    const hiddenId = document.getElementById('solicitudIdHidden');
    const existingId = editMode ? editSolicitudId : (hiddenId?.value || solicitudIdActual);
    const url = existingId ? `/actualizar-solicitud/${existingId}` : '/crear-solicitud';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.success) {
      formDirty = false;
      storage.removeItem(BORRADOR_KEY);
      solicitudIdActual = data.solicitud_id;
      if (hiddenId) hiddenId.value = data.solicitud_id;
      showToast('Solicitud guardada exitosamente', 'success');
      document.getElementById('btnGenerarPDF').disabled = false;
      if (editMode) editSolicitudId = data.solicitud_id;
    } else {
      showToast(data.message || 'Error al guardar la solicitud', 'error');
    }
  } catch (error) {
    console.error('Error al guardar solicitud:', error);
    showToast('Error al guardar la solicitud', 'error');
  } finally {
    setLoading(btn, false);
  }
});

document.getElementById('btnGenerarPDF')?.addEventListener('click', function() {
  const hiddenId = document.getElementById('solicitudIdHidden');
  const id = editMode ? editSolicitudId : (hiddenId?.value || solicitudIdActual);
  if (id) {
    verPDF(id);
  }
});

document.getElementById('btnDescargarPDFModal')?.addEventListener('click', function() {
  const modalEl = document.getElementById('modalVisorPDF');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();
  const hiddenId = document.getElementById('solicitudIdHidden');
  document.getElementById('empresa').value = '';
  document.getElementById('area').value = '';
  document.getElementById('nombreSolicitante').value = '';
  document.getElementById('cargoSolicitante').value = '';
  document.getElementById('jefeNombre').value = '';
  document.getElementById('jefeCargo').value = '';
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  document.getElementById('fechaEntregaGlobal').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('itemsBody').innerHTML = '';
  document.getElementById('btnGenerarPDF').disabled = true;
  solicitudIdActual = null;
  editMode = false;
  editSolicitudId = 0;
  formDirty = false;
  if (hiddenId) hiddenId.value = '';
  toggleEmptyMessage();
  showToast('Solicitud descargada exitosamente', 'success');
});

function editarUnidadSKU(skuId, codigo, unidadActual) {
  document.getElementById('editarSkuId').value = skuId;
  document.getElementById('editarSkuCodigo').textContent = codigo;
  document.getElementById('editarUnidad').value = unidadActual || 'Unidad';
  const modal = new bootstrap.Modal(document.getElementById('modalEditarUnidadSKU'));
  modal.show();
}

document.getElementById('btnLimpiar')?.addEventListener('click', function() {
  if (editMode) {
    window.location.href = '/';
    return;
  }
  document.getElementById('empresa').value = '';
  document.getElementById('area').value = '';
  document.getElementById('nombreSolicitante').value = '';
  document.getElementById('cargoSolicitante').value = '';
  document.getElementById('jefeNombre').value = '';
  document.getElementById('jefeCargo').value = '';
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  document.getElementById('fechaEntregaGlobal').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('itemsBody').innerHTML = '';
  document.getElementById('btnGenerarPDF').disabled = true;
  solicitudIdActual = null;
  formDirty = false;
  const hiddenId = document.getElementById('solicitudIdHidden');
  if (hiddenId) hiddenId.value = '';
  toggleEmptyMessage();
  showToast('Formulario limpiado', 'info');
});

document.getElementById('btnConfirmarEditarUnidad')?.addEventListener('click', async function() {
  const skuId = document.getElementById('editarSkuId').value;
  const nuevaUnidad = document.getElementById('editarUnidad').value;
  if (!nuevaUnidad) {
    showToast('Por favor seleccione una unidad de medida', 'warning');
    return;
  }
  try {
    const response = await fetch(`/actualizar-sku/${skuId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unidad: nuevaUnidad })
    });
    const data = await response.json();
    if (data.success) {
      showToast(data.message, 'success');
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalEditarUnidadSKU'));
      modal.hide();
      document.getElementById('buscarSKU').value = '';
      document.getElementById('resultadosBusqueda').innerHTML = '';
    } else {
      showToast(data.message, 'error');
    }
  } catch (error) {
    console.error('Error al actualizar SKU:', error);
    showToast('Error al actualizar el SKU', 'error');
  }
});
