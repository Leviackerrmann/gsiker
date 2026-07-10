// ── CSRF Protection ──
(function() {
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    if (!csrfMeta) return;
    const token = csrfMeta.getAttribute('content');
    const origFetch = window.fetch;
    window.fetch = function(url, options) {
        if (options && options.method && options.method.toUpperCase() === 'POST') {
            options.headers = options.headers || {};
            if (options.headers instanceof Headers) {
                options.headers.set('X-CSRFToken', token);
            } else {
                options.headers['X-CSRFToken'] = token;
            }
        }
        return origFetch.call(this, url, options);
    };
})();

// ── Safe Storage (Tracking Prevention resistant) ──
const storage = {
    _available: true,
    _check: function() {
        if (!this._available) return false;
        try { localStorage.getItem('__test'); return true; }
        catch(e) { this._available = false; return false; }
    },
    getItem: function(key) {
        try { return localStorage.getItem(key); }
        catch(e) { return null; }
    },
    setItem: function(key, value) {
        try { localStorage.setItem(key, value); }
        catch(e) { /* storage blocked */ }
    },
    removeItem: function(key) {
        try { localStorage.removeItem(key); }
        catch(e) { /* storage blocked */ }
    },
    sessionGet: function(key) {
        try { return sessionStorage.getItem(key); }
        catch(e) { return null; }
    },
    sessionSet: function(key, value) {
        try { sessionStorage.setItem(key, value); }
        catch(e) { /* storage blocked */ }
    },
    sessionRemove: function(key) {
        try { sessionStorage.removeItem(key); }
        catch(e) { /* storage blocked */ }
    }
};
storage._check();

const DEVICE_TOKEN_KEY = 'compras_device_token';

function getDeviceToken() {
  let token = storage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    token = btoa(String.fromCharCode(...arr)).replace(/\/+/g, '_').replace(/=+$/, '');
    storage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

function enviarConToken(body) {
  body.device_token = getDeviceToken();
  return body;
}

function setLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    const spinner = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>';
    button.innerHTML = spinner + 'Procesando...';
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalHtml || button.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggleBtn = document.getElementById('sidebarToggle');
  const closeBtn = document.getElementById('sidebarClose');

  if (sidebar && overlay && toggleBtn) {
    function openSidebar() {
      sidebar.classList.add('open');
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
    function closeSidebar() {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
      document.body.style.overflow = '';
    }
    toggleBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
    });
  }

  // ── Theme Toggle (item 6) ──
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  if (themeToggle) {
    const applyTheme = (t) => {
      document.documentElement.setAttribute('data-theme', t);
      storage.setItem('theme', t);
      if (themeIcon) {
        themeIcon.className = t === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
      }
    };
    const current = storage.getItem('theme') || 'light';
    applyTheme(current);
    themeToggle.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  // ── Identity System ──
  const identidadEl = document.getElementById('userIdentidad');
  if (identidadEl) {
    identidadEl.addEventListener('click', abrirModalIdentidad);
  }

  const isAdminPage = window.location.pathname.startsWith('/admin');
  if (!isAdminPage && !storage.sessionGet('identity_confirmed')) {
    abrirModalIdentidad(true);
  }

  // ── Session expiry check (item 1) ──
  const userNameEl = document.getElementById('userNombre');
  if (!isAdminPage && userNameEl && userNameEl.textContent !== 'Seleccionar usuario') {
    fetch('/verificar-identidad')
      .then(r => r.json())
      .then(data => {
        if (!data.valida) {
          showToast('Tu sesi\u00f3n expir\u00f3, selecciona tu nombre nuevamente', 'warning');
          setTimeout(() => abrirModalIdentidad(true), 500);
        }
      })
      .catch(() => {});
  }

  // ── Sidebar badge count (item 10) ──
  function actualizarBadge() {
    const badge = document.getElementById('sidebarSolicitudCount');
    if (!badge) return;
    fetch('/sidebar-count')
      .then(r => r.json())
      .then(data => {
        if (data.count > 0) {
          badge.textContent = data.count;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }
      })
      .catch(() => {});
  }
  actualizarBadge();
  setInterval(actualizarBadge, 30000);


  // ── Identity search ──
  const inputBuscar = document.getElementById('buscarIdentidad');
  const resultados = document.getElementById('resultadosIdentidad');
  const registerDiv = document.getElementById('identidadRegister');

  if (inputBuscar) {
    let timeoutId = null;
    inputBuscar.addEventListener('input', () => {
      clearTimeout(timeoutId);
      const q = inputBuscar.value.trim();
      if (q.length < 1) {
        resultados.innerHTML = '';
        resultados.style.display = 'none';
        registerDiv.style.display = 'none';
        return;
      }
      timeoutId = setTimeout(async () => {
        try {
          const res = await fetch(`/buscar-usuarios?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          if (data.usuarios && data.usuarios.length > 0) {
            resultados.innerHTML = data.usuarios.map(u => {
              const icono = u.vinculado
                ? '<i class="bi bi-lock-fill id-icon locked"></i>'
                : '<i class="bi bi-person-circle id-icon"></i>';
              const badge = u.vinculado
                ? '<span class="id-badge locked">Vinculado</span>'
                : '<span class="id-badge free">Libre</span>';
              return `<div class="identity-item" onclick="seleccionarIdentidad('${u.nombre.replace(/'/g, "\\'")}')">
                  ${icono}
                  <span class="id-name">${u.nombre}</span>
                  ${badge}
                 </div>`;
            }).join('');
            resultados.style.display = 'block';
            registerDiv.style.display = 'none';
          } else {
            resultados.innerHTML = '<div class="identity-notfound"><i class="bi bi-search"></i>No encontrado</div>';
            resultados.style.display = 'block';
            registerDiv.style.display = 'block';
            document.getElementById('nombreRegistro').value = q;
          }
        } catch (e) {
          console.error('Error buscando usuarios:', e);
        }
      }, 250);
    });

    inputBuscar.addEventListener('blur', () => {
      setTimeout(() => { resultados.style.display = 'none'; }, 200);
    });
    inputBuscar.addEventListener('focus', () => {
      if (resultados.children.length > 0) resultados.style.display = 'block';
    });
  }

  // ── Registration ──
  const btnRegistrar = document.getElementById('btnRegistrarIdentidad');
  if (btnRegistrar) {
    btnRegistrar.addEventListener('click', registrarIdentidad);
    document.getElementById('nombreRegistro')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') registrarIdentidad();
    });
  }

  document.getElementById('btnConfirmarPinIdentidad')?.addEventListener('click', confirmarPinIdentidad);
  document.getElementById('btnCancelarPinIdentidad')?.addEventListener('click', cancelarPinIdentidad);
  document.getElementById('pinIdentidad')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmarPinIdentidad();
  });
  document.getElementById('pinIdentidad')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '').slice(0, 4);
  });
  document.getElementById('pinRegistro')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '').slice(0, 4);
  });
});

// ── Identity Functions ──
let identidadPendiente = null;

function abrirModalIdentidad(required) {
  const modalEl = document.getElementById('modalIdentidad');
  if (!modalEl) return;
  if (window.location.pathname.startsWith('/admin')) return;
  const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: !required });
  modal.show();
  setTimeout(() => {
    const input = document.getElementById('buscarIdentidad');
    if (input) { input.value = ''; input.focus(); }
    const resultados = document.getElementById('resultadosIdentidad');
    if (resultados) { resultados.innerHTML = ''; resultados.style.display = 'none'; }
    const registerDiv = document.getElementById('identidadRegister');
    if (registerDiv) registerDiv.style.display = 'none';
    const errorRegistro = document.getElementById('errorRegistro');
    if (errorRegistro) errorRegistro.style.display = 'none';
    const pinContainer = document.getElementById('pinIdentidadContainer');
    if (pinContainer) pinContainer.style.display = 'none';
    const errorPin = document.getElementById('errorPin');
    if (errorPin) errorPin.style.display = 'none';
    identidadPendiente = null;
  }, 300);
}

async function seleccionarIdentidad(nombre) {
  const pinContainer = document.getElementById('pinIdentidadContainer');
  const errorPin = document.getElementById('errorPin');
  if (errorPin) errorPin.style.display = 'none';
  if (identidadPendiente) return;

  try {
    const res = await fetch('/set-identidad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enviarConToken({ nombre }))
    });
    const data = await res.json();
    if (data.success) {
      storage.sessionSet('identity_confirmed', '1');
      actualizarUIIdentidad(nombre);
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalIdentidad'));
      if (modal) modal.hide();
      showToast(`Bienvenido, ${nombre}`, 'success');
    } else if (data.needs_pin) {
      identidadPendiente = nombre;
      if (pinContainer) {
        pinContainer.style.display = 'block';
        document.getElementById('pinIdentidad').value = '';
        document.getElementById('pinIdentidad').focus();
      }
      if (errorPin) {
        errorPin.textContent = data.message || 'Ingrese su c\u00f3digo PIN';
        errorPin.style.display = 'block';
      }
    } else {
      showToast(data.message || 'Error al seleccionar usuario', 'error');
    }
  } catch (e) {
    console.error('Error al seleccionar identidad:', e);
    showToast('Error de conexión. Si usás Edge, desactivá "Prevención de seguimiento" para este sitio.', 'error');
  }
}

async function confirmarPinIdentidad() {
  const pin = document.getElementById('pinIdentidad').value.trim();
  const errorPin = document.getElementById('errorPin');
  if (!pin || pin.length !== 4) {
    if (errorPin) {
      errorPin.textContent = 'El PIN debe tener exactamente 4 d\u00edgitos';
      errorPin.style.display = 'block';
    }
    return;
  }
  if (!identidadPendiente) return;

  const btn = document.getElementById('btnConfirmarPinIdentidad');
  setLoading(btn, true);
  try {
    const res = await fetch('/set-identidad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enviarConToken({ nombre: identidadPendiente, pin_code: pin }))
    });
    const data = await res.json();
    if (data.success) {
      storage.sessionSet('identity_confirmed', '1');
      actualizarUIIdentidad(identidadPendiente);
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalIdentidad'));
      if (modal) modal.hide();
      showToast(`Bienvenido, ${identidadPendiente}`, 'success');
      identidadPendiente = null;
    } else if (data.needs_pin) {
      if (errorPin) {
        errorPin.textContent = data.message || 'PIN incorrecto';
        errorPin.style.display = 'block';
      }
      document.getElementById('pinIdentidad').value = '';
      document.getElementById('pinIdentidad').focus();
    } else {
      if (errorPin) {
        errorPin.textContent = data.message || 'Error al verificar PIN';
        errorPin.style.display = 'block';
      }
    }
  } catch (e) {
    console.error('Error al confirmar PIN:', e);
    showToast('Error del servidor. Recarga la página.', 'error');
  }
  setLoading(btn, false);
}

function cancelarPinIdentidad() {
  identidadPendiente = null;
  const pinContainer = document.getElementById('pinIdentidadContainer');
  if (pinContainer) pinContainer.style.display = 'none';
  const errorPin = document.getElementById('errorPin');
  if (errorPin) errorPin.style.display = 'none';
}

async function registrarIdentidad() {
  const input = document.getElementById('nombreRegistro');
  const errorEl = document.getElementById('errorRegistro');
  const pinInput = document.getElementById('pinRegistro');
  const nombre = input ? input.value.trim() : '';
  const pin = pinInput ? pinInput.value.trim() : '';

  if (!nombre || nombre.split(/\s+/).length < 2) {
    if (errorEl) {
      errorEl.textContent = 'Debe ingresar nombre y apellido';
      errorEl.style.display = 'block';
    }
    return;
  }

  const partes = nombre.split(/\s+/);
  const nom = partes[0];
  const ape = partes[partes.length - 1];

  if (nom[0] !== nom[0].toUpperCase() || ape[0] !== ape[0].toUpperCase()) {
    if (errorEl) {
      errorEl.textContent = 'La primera letra del nombre y del apellido debe ser may\u00fascula (ej: Ronald Giron)';
      errorEl.style.display = 'block';
    }
    return;
  }

  if (!pin || pin.length !== 4) {
    if (errorEl) {
      errorEl.textContent = 'Debe crear un c\u00f3digo PIN de exactamente 4 d\u00edgitos';
      errorEl.style.display = 'block';
    }
    return;
  }

  if (errorEl) errorEl.style.display = 'none';

  const btn = document.getElementById('btnRegistrarIdentidad');
  setLoading(btn, true);
  try {
    const res = await fetch('/registrar-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enviarConToken({ nombre, pin_code: pin }))
    });
    const data = await res.json();
    if (data.success) {
      if (data.device_token) storage.setItem(DEVICE_TOKEN_KEY, data.device_token);
      storage.sessionSet('identity_confirmed', '1');
      actualizarUIIdentidad(nombre);
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalIdentidad'));
      if (modal) modal.hide();
      showToast(`Registrado como ${nombre}`, 'success');
    } else {
      if (errorEl) {
        errorEl.textContent = data.message || 'Error al registrar';
        errorEl.style.display = 'block';
      }
    }
  } catch (e) {
    console.error('Error al registrar:', e);
  }
  setLoading(btn, false);
}

function actualizarUIIdentidad(nombre) {
  const nombreEl = document.getElementById('userNombre');
  const avatarEl = document.getElementById('userAvatar');
  const sidebarAvatar = document.getElementById('sidebarUserAvatar');
  const sidebarName = document.getElementById('sidebarUserName');
  if (nombreEl) nombreEl.textContent = nombre;
  if (avatarEl) avatarEl.textContent = nombre.substring(0, 2).toUpperCase();
  if (sidebarAvatar) sidebarAvatar.textContent = nombre.substring(0, 2).toUpperCase();
  if (sidebarName) sidebarName.textContent = nombre;
}

// ── PDF Viewer ──
function verPDF(id) {
    const modal = new bootstrap.Modal(document.getElementById('modalVisorPDF'));
    const iframe = document.getElementById('pdfViewerFrame');
    const loading = document.getElementById('pdfViewerLoading');
    const downloadBtn = document.getElementById('btnDescargarPDFModal');
    iframe.style.display = 'none';
    loading.style.display = 'flex';
    downloadBtn.href = '/generar-pdf/' + id + '?download=1';
    iframe.src = '/generar-pdf/' + id;
    modal.show();
    iframe.onload = function() {
        loading.style.display = 'none';
        iframe.style.display = 'block';
    };
}

// ── Toast ──
function showToast(message, type) {
  type = type || 'success';
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const config = {
    success: { icon: 'bi-check-circle-fill', bg: '#16a34a' },
    error: { icon: 'bi-exclamation-circle-fill', bg: '#dc2626' },
    warning: { icon: 'bi-exclamation-triangle-fill', bg: '#d97706', textColor: '#1a1a2e' },
    info: { icon: 'bi-info-circle-fill', bg: '#0284c7', textColor: '#1a1a2e' }
  };
  const cfg = config[type] || config.success;
  const textColor = cfg.textColor || '#fff';
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');
  toast.style.cssText = `background:${cfg.bg};color:${textColor};`;
  toast.innerHTML = `
    <div class="d-flex align-items-center p-2">
      <div class="toast-body d-flex align-items-center gap-2 py-1">
        <i class="bi ${cfg.icon} fs-5"></i>
        <span>${message}</span>
      </div>
      <button type="button" class="btn-close ${textColor === '#fff' ? 'btn-close-white' : ''} me-2" data-bs-dismiss="toast" style="font-size:0.75rem;"></button>
    </div>
  `;
  container.appendChild(toast);
  const bsToast = new bootstrap.Toast(toast, { delay: 4000 });
  bsToast.show();
  toast.addEventListener('hidden.bs.toast', () => toast.remove());
}
