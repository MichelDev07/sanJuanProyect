/* ============================================================
   SAN JUAN · CONTROL FINANCIERO — app.js
   Lógica de autenticación, datos y UI
   ============================================================ */

/* ---------------- ESTADO GLOBAL ---------------- */
let currentUser = null;     // { id, email, fullName }
let productos = [];
let gastos = [];
let ventas = [];
let pendingDelete = null;   // { type: 'gasto'|'venta', id }

/* ---------------- HELPERS ---------------- */

function formatGs(numero) {
  const n = Math.round(Number(numero) || 0);
  return "Gs. " + n.toLocaleString("es-PY");
}

function formatFecha(fechaStr) {
  if (!fechaStr) return "—"; 
  const [y, m, d] = fechaStr.split("-");
  return `${d}/${m}/${y}`;
}

function hoyISO() {
  const hoy = new Date();
  const offset = hoy.getTimezoneOffset();
  const local = new Date(hoy.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function showToast(msg, type = "default") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = "toast is-show" + (type === "error" ? " is-error" : type === "ok" ? " is-ok" : "");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("is-show");
  }, 3200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function initials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
}

/* ============================================================
   AUTENTICACIÓN
   ============================================================ */

const authScreen = document.getElementById("auth-screen");
const appEl = document.getElementById("app");

function setButtonLoading(btn, loading, loadingText) {
  if (!btn) return;
  const textEl = btn.querySelector(".btn-text") || btn;
  if (loading) {
    btn.dataset.originalText = textEl.textContent;
    textEl.textContent = loadingText || "Cargando…";
    btn.disabled = true;
  } else {
    textEl.textContent = btn.dataset.originalText || textEl.textContent;
    btn.disabled = false;
  }
}

// --- Tabs login / registro ---
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => {
      t.classList.remove("is-active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("is-active");
    tab.setAttribute("aria-selected", "true");

    const target = tab.dataset.tab;
    document.getElementById("login-form").classList.toggle("is-hidden", target !== "login");
    document.getElementById("signup-form").classList.toggle("is-hidden", target !== "signup");
  });
});

// --- Verificar que Supabase esté listo ---
async function ensureSupabaseReady() {
  if (window.supabaseClient) return;
  // Esperar a que supabase se inicialice (máximo 5 segundos)
  for (let i = 0; i < 100; i++) {
    if (window.supabaseClient) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("Supabase no se pudo cargar");
}

// --- Registro ---
document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const fullname = form.fullname.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const msgEl = document.getElementById("signup-msg");
  const btn = form.querySelector("button[type=submit]");

  msgEl.textContent = "";
  msgEl.classList.remove("is-ok");
  setButtonLoading(btn, true, "Creando cuenta…");

  try {
    await ensureSupabaseReady();
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullname } },
    });
    if (error) throw error;

    if (data.session) {
      // confirmación de email desactivada: entra directo
      await onAuthenticated(data.session.user);
    } else {
      msgEl.textContent = "¡Cuenta creada! Revisá tu correo para confirmar el acceso.";
      msgEl.classList.add("is-ok");
      form.reset();
    }
  } catch (err) {
    msgEl.textContent = traducirErrorAuth(err.message);
  } finally {
    setButtonLoading(btn, false);
  }
});

// --- Login ---
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  const password = form.password.value;
  const msgEl = document.getElementById("login-msg");
  const btn = form.querySelector("button[type=submit]");

  msgEl.textContent = "";
  setButtonLoading(btn, true, "Entrando…");

  try {
    await ensureSupabaseReady();
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await onAuthenticated(data.user);
  } catch (err) {
    msgEl.textContent = traducirErrorAuth(err.message);
  } finally {
    setButtonLoading(btn, false);
  }
});

function traducirErrorAuth(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("user already registered")) return "Ese correo ya tiene una cuenta. Iniciá sesión.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("unable to validate email")) return "Ese correo no es válido.";
  return msg || "Ocurrió un error. Intentá nuevamente.";
}

// --- Logout ---
document.getElementById("logout-btn").addEventListener("click", async () => {
  await ensureSupabaseReady();
  await window.supabaseClient.auth.signOut();
  currentUser = null;
  appEl.classList.add("is-hidden");
  authScreen.classList.remove("is-hidden");
  document.getElementById("login-form").reset();
});

async function onAuthenticated(user) {
  // Trae el perfil (nombre completo) desde la tabla profiles
  let fullName = user.user_metadata?.full_name || user.email;

  try {
    const { data: profile } = await window.supabaseClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    if (profile?.full_name) fullName = profile.full_name;
  } catch (_) {
    /* si no existe el perfil todavía, seguimos con el de metadata */
  }

  currentUser = { id: user.id, email: user.email, fullName };

  document.getElementById("user-name").textContent = fullName;
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-avatar").textContent = initials(fullName);
  document.getElementById("user-avatar-sm").textContent = initials(fullName);
  document.getElementById("dash-username").textContent = fullName.split(" ")[0];
  document.getElementById("kpi-usuario").textContent = fullName;

  authScreen.classList.add("is-hidden");
  appEl.classList.remove("is-hidden");

  await cargarTodo();
}

// --- Sesión existente al cargar la página ---
async function initAuthState() {
  await ensureSupabaseReady();
  const { data } = await window.supabaseClient.auth.getSession();
  if (data.session?.user) {
    await onAuthenticated(data.session.user);
  }
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */

const titulos = {
  dashboard: "Dashboard",
  gastos: "Gastos",
  ventas: "Ventas",
  reportes: "Reportes",
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;

    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-active"));
    document.getElementById("view-" + view).classList.add("is-active");

    document.getElementById("topbar-title").textContent = titulos[view];

    document.querySelector(".sidebar").classList.remove("is-open");

    if (view === "reportes") renderReportes();
  });
});

document.getElementById("menu-toggle").addEventListener("click", () => {
  document.querySelector(".sidebar").classList.toggle("is-open");
});

/* ============================================================
   CARGA DE DATOS
   ============================================================ */

async function cargarTodo() {
  await Promise.all([cargarProductos(), cargarGastos(), cargarVentas()]);
  renderDashboard();
  renderGastosTable();
  renderVentasTable();
}

async function cargarProductos() {
  const { data, error } = await window.supabaseClient.from("productos").select("*").order("nombre");
  if (error) {
    showToast("No se pudieron cargar los productos.", "error");
    return;
  }
  productos = data || [];
  poblarSelectProductos();
}

async function cargarGastos() {
  const { data, error } = await window.supabaseClient
    .from("gastos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    showToast("No se pudieron cargar los gastos.", "error");
    return;
  }
  gastos = data || [];
}

async function cargarVentas() {
  const { data, error } = await window.supabaseClient
    .from("ventas")
    .select("*")
    .order("fecha", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    showToast("No se pudieron cargar las ventas.", "error");
    return;
  }
  ventas = data || [];
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function renderDashboard() {
  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
  const totalVentas = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  const ganancia = totalVentas - totalGastos;

  document.getElementById("kpi-gastos").textContent = formatGs(totalGastos);
  document.getElementById("kpi-gastos-count").textContent = `${gastos.length} gasto${gastos.length === 1 ? "" : "s"} registrado${gastos.length === 1 ? "" : "s"}`;
  document.getElementById("kpi-ventas").textContent = formatGs(totalVentas);
  document.getElementById("kpi-ventas-count").textContent = `${ventas.length} venta${ventas.length === 1 ? "" : "s"} registrada${ventas.length === 1 ? "" : "s"}`;
  document.getElementById("kpi-ganancia").textContent = formatGs(ganancia);

  const kpiGananciaCard = document.querySelector(".kpi-ganancia .kpi-value");
  kpiGananciaCard.style.color = ganancia < 0 ? "var(--rojo-error)" : "var(--noche)";

  const fechaHoy = new Date().toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric" });
  document.getElementById("header-date").textContent = fechaHoy;

  // últimos movimientos combinados
  const movGastos = gastos.map((g) => ({
    tipo: "gasto",
    fecha: g.fecha,
    detalle: g.concepto,
    usuario: g.usuario_nombre,
    monto: -Number(g.monto),
    created_at: g.created_at,
  }));
  const movVentas = ventas.map((v) => ({
    tipo: "venta",
    fecha: v.fecha,
    detalle: `${v.producto_nombre} ×${v.cantidad}`,
    usuario: v.usuario_nombre,
    monto: Number(v.total),
    created_at: v.created_at,
  }));

  const movimientos = [...movGastos, ...movVentas]
    .sort((a, b) => new Date(b.created_at || b.fecha) - new Date(a.created_at || a.fecha))
    .slice(0, 8);

  const tbody = document.querySelector("#dash-recent-table tbody");
  tbody.innerHTML = "";

  document.getElementById("dash-empty").classList.toggle("is-hidden", movimientos.length > 0);
  document.getElementById("dash-recent-table").classList.toggle("is-hidden", movimientos.length === 0);

  movimientos.forEach((m) => {
    const tr = document.createElement("tr");
    const esGasto = m.tipo === "gasto";
    tr.innerHTML = `
      <td>${formatFecha(m.fecha)}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:6px;font-weight:600;color:${esGasto ? "var(--brasa)" : "var(--verde-ok)"}">
          ${esGasto ? "🔥 Gasto" : "🎉 Venta"}
        </span>
      </td>
      <td>${escapeHtml(m.detalle)}</td>
      <td>${escapeHtml(m.usuario)}</td>
      <td class="num" style="color:${esGasto ? "var(--brasa)" : "var(--verde-ok)"}">
        ${esGasto ? "−" : "+"}${formatGs(Math.abs(m.monto))}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ============================================================
   MÓDULO GASTOS
   ============================================================ */

const gastoModalBackdrop = document.getElementById("gasto-modal-backdrop");
const gastoForm = document.getElementById("gasto-form");

document.getElementById("open-gasto-modal").addEventListener("click", () => abrirModalGasto());
document.getElementById("close-gasto-modal").addEventListener("click", cerrarModalGasto);
document.getElementById("cancel-gasto").addEventListener("click", cerrarModalGasto);
gastoModalBackdrop.addEventListener("click", (e) => {
  if (e.target === gastoModalBackdrop) cerrarModalGasto();
});

function abrirModalGasto(gasto = null) {
  document.getElementById("gasto-modal-title").textContent = gasto ? "Editar gasto" : "Nuevo gasto";
  document.getElementById("gasto-id").value = gasto?.id || "";
  document.getElementById("gasto-concepto").value = gasto?.concepto || "";
  document.getElementById("gasto-monto").value = gasto?.monto || "";
  document.getElementById("gasto-fecha").value = gasto?.fecha || hoyISO();
  gastoModalBackdrop.classList.remove("is-hidden");
  document.getElementById("gasto-concepto").focus();
}

function cerrarModalGasto() {
  gastoModalBackdrop.classList.add("is-hidden");
  gastoForm.reset();
}

gastoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("gasto-id").value;
  const concepto = document.getElementById("gasto-concepto").value.trim();
  const monto = Number(document.getElementById("gasto-monto").value);
  const fecha = document.getElementById("gasto-fecha").value;
  const btn = document.getElementById("save-gasto-btn");

  if (!concepto || !monto || monto <= 0 || !fecha) {
    showToast("Completá todos los campos correctamente.", "error");
    return;
  }

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = "Guardando…";

  try {
    if (id) {
      const { error } = await window.supabaseClient
        .from("gastos")
        .update({ concepto, monto, fecha })
        .eq("id", id);
      if (error) throw error;
      showToast("Gasto actualizado correctamente.", "ok");
    } else {
      const { error } = await window.supabaseClient.from("gastos").insert({
        concepto,
        monto,
        fecha,
        user_id: currentUser.id,
        usuario_nombre: currentUser.fullName,
      });
      if (error) throw error;
      showToast("Gasto registrado correctamente.", "ok");
    }

    cerrarModalGasto();
    await cargarGastos();
    renderGastosTable();
    renderDashboard();
  } catch (err) {
    showToast("Error al guardar el gasto: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

function renderGastosTable() {
  const termino = document.getElementById("gastos-search").value.trim().toLowerCase();
  const filtrados = gastos.filter(
    (g) =>
      g.concepto.toLowerCase().includes(termino) ||
      g.usuario_nombre.toLowerCase().includes(termino)
  );

  const tbody = document.querySelector("#gastos-table tbody");
  tbody.innerHTML = "";

  document.getElementById("gastos-empty").classList.toggle("is-hidden", filtrados.length > 0);
  document.getElementById("gastos-table").classList.toggle("is-hidden", filtrados.length === 0);

  filtrados.forEach((g) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${g.id}</td>
      <td>${formatFecha(g.fecha)}</td>
      <td>${escapeHtml(g.concepto)}</td>
      <td class="num">${formatGs(g.monto)}</td>
      <td>${escapeHtml(g.usuario_nombre)}</td>
      <td class="actions-col">
        <div class="row-actions">
          <button class="row-btn" data-action="edit-gasto" data-id="${g.id}" aria-label="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="row-btn danger" data-action="delete-gasto" data-id="${g.id}" aria-label="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
  document.getElementById("total-gastos").textContent = formatGs(totalGastos);
}

document.getElementById("gastos-search").addEventListener("input", renderGastosTable);

document.querySelector("#gastos-table tbody").addEventListener("click", (e) => {
  const btn = e.target.closest(".row-btn");
  if (!btn) return;
  const id = Number(btn.dataset.id);

  if (btn.dataset.action === "edit-gasto") {
    const gasto = gastos.find((g) => g.id === id);
    if (gasto) abrirModalGasto(gasto);
  }
  if (btn.dataset.action === "delete-gasto") {
    pedirConfirmacion("gasto", id, "Vas a eliminar este gasto permanentemente.");
  }
});

/* ============================================================
   MÓDULO VENTAS
   ============================================================ */

function poblarSelectProductos() {
  const select = document.getElementById("venta-producto");
  const selectEdit = document.getElementById("venta-edit-producto");
  const opciones = productos
    .map((p) => `<option value="${p.id}" data-precio="${p.precio}">${escapeHtml(p.nombre)} — ${formatGs(p.precio)}</option>`)
    .join("");

  select.innerHTML = `<option value="" disabled selected>Elegí un producto…</option>` + opciones;
  selectEdit.innerHTML = opciones;
}

const ventaForm = document.getElementById("venta-form");
const ventaProductoSel = document.getElementById("venta-producto");
const ventaCantidadInput = document.getElementById("venta-cantidad");

function recalcularVentaForm() {
  const opt = ventaProductoSel.selectedOptions[0];
  const precio = opt ? Number(opt.dataset.precio) : 0;
  const cantidad = Number(ventaCantidadInput.value) || 0;
  document.getElementById("venta-precio").value = precio ? formatGs(precio) : "";
  document.getElementById("venta-total").value = precio ? formatGs(precio * cantidad) : "";
}

ventaProductoSel.addEventListener("change", recalcularVentaForm);
ventaCantidadInput.addEventListener("input", recalcularVentaForm);

ventaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const opt = ventaProductoSel.selectedOptions[0];
  if (!opt || !opt.value) {
    showToast("Elegí un producto.", "error");
    return;
  }
  const productoId = Number(opt.value);
  const productoNombre = opt.textContent.split(" — ")[0];
  const precio = Number(opt.dataset.precio);
  const cantidad = Number(ventaCantidadInput.value);

  if (!cantidad || cantidad <= 0) {
    showToast("La cantidad debe ser mayor a 0.", "error");
    return;
  }

  const total = precio * cantidad;
  const btn = ventaForm.querySelector("button[type=submit]");
  btn.disabled = true;

  try {
    const { error } = await window.supabaseClient.from("ventas").insert({
      producto_id: productoId,
      producto_nombre: productoNombre,
      cantidad,
      precio_unitario: precio,
      total,
      fecha: hoyISO(),
      user_id: currentUser.id,
      usuario_nombre: currentUser.fullName,
    });
    if (error) throw error;

    showToast("Venta registrada correctamente.", "ok");
    ventaForm.reset();
    ventaCantidadInput.value = 1;
    document.getElementById("venta-precio").value = "";
    document.getElementById("venta-total").value = "";

    await cargarVentas();
    renderVentasTable();
    renderDashboard();
  } catch (err) {
    showToast("Error al registrar la venta: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

function renderVentasTable() {
  const termino = document.getElementById("ventas-search").value.trim().toLowerCase();
  const filtradas = ventas.filter(
    (v) =>
      v.producto_nombre.toLowerCase().includes(termino) ||
      v.usuario_nombre.toLowerCase().includes(termino)
  );

  const tbody = document.querySelector("#ventas-table tbody");
  tbody.innerHTML = "";

  document.getElementById("ventas-empty").classList.toggle("is-hidden", filtradas.length > 0);
  document.getElementById("ventas-table").classList.toggle("is-hidden", filtradas.length === 0);

  filtradas.forEach((v) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${v.id}</td>
      <td>${formatFecha(v.fecha)}</td>
      <td>${escapeHtml(v.producto_nombre)}</td>
      <td class="num">${v.cantidad}</td>
      <td class="num">${formatGs(v.precio_unitario)}</td>
      <td class="num">${formatGs(v.total)}</td>
      <td>${escapeHtml(v.usuario_nombre)}</td>
      <td class="actions-col">
        <div class="row-actions">
          <button class="row-btn" data-action="edit-venta" data-id="${v.id}" aria-label="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="row-btn danger" data-action="delete-venta" data-id="${v.id}" aria-label="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const totalVentas = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  document.getElementById("total-ventas").textContent = formatGs(totalVentas);
}

document.getElementById("ventas-search").addEventListener("input", renderVentasTable);

document.querySelector("#ventas-table tbody").addEventListener("click", (e) => {
  const btn = e.target.closest(".row-btn");
  if (!btn) return;
  const id = Number(btn.dataset.id);

  if (btn.dataset.action === "edit-venta") {
    const venta = ventas.find((v) => v.id === id);
    if (venta) abrirModalVenta(venta);
  }
  if (btn.dataset.action === "delete-venta") {
    pedirConfirmacion("venta", id, "Vas a eliminar esta venta permanentemente.");
  }
});

/* --- Modal editar venta --- */
const ventaModalBackdrop = document.getElementById("venta-modal-backdrop");
const ventaEditForm = document.getElementById("venta-edit-form");

function abrirModalVenta(venta) {
  document.getElementById("venta-edit-id").value = venta.id;
  document.getElementById("venta-edit-producto").value = venta.producto_id;
  document.getElementById("venta-edit-cantidad").value = venta.cantidad;
  document.getElementById("venta-edit-fecha").value = venta.fecha;
  ventaModalBackdrop.classList.remove("is-hidden");
}

function cerrarModalVenta() {
  ventaModalBackdrop.classList.add("is-hidden");
  ventaEditForm.reset();
}

document.getElementById("close-venta-modal").addEventListener("click", cerrarModalVenta);
document.getElementById("cancel-venta-edit").addEventListener("click", cerrarModalVenta);
ventaModalBackdrop.addEventListener("click", (e) => {
  if (e.target === ventaModalBackdrop) cerrarModalVenta();
});

ventaEditForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("venta-edit-id").value;
  const productoId = Number(document.getElementById("venta-edit-producto").value);
  const cantidad = Number(document.getElementById("venta-edit-cantidad").value);
  const fecha = document.getElementById("venta-edit-fecha").value;

  const producto = productos.find((p) => p.id === productoId);
  if (!producto || !cantidad || cantidad <= 0 || !fecha) {
    showToast("Completá todos los campos correctamente.", "error");
    return;
  }

  const total = producto.precio * cantidad;
  const btn = ventaEditForm.querySelector("button[type=submit]");
  btn.disabled = true;

  try {
    const { error } = await window.supabaseClient
      .from("ventas")
      .update({
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        cantidad,
        precio_unitario: producto.precio,
        total,
        fecha,
      })
      .eq("id", id);
    if (error) throw error;

    showToast("Venta actualizada correctamente.", "ok");
    cerrarModalVenta();
    await cargarVentas();
    renderVentasTable();
    renderDashboard();
  } catch (err) {
    showToast("Error al actualizar la venta: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

/* ============================================================
   CONFIRMACIÓN DE ELIMINACIÓN (genérica)
   ============================================================ */

const confirmBackdrop = document.getElementById("confirm-modal-backdrop");

function pedirConfirmacion(tipo, id, texto) {
  pendingDelete = { tipo, id };
  document.getElementById("confirm-text").textContent = texto;
  confirmBackdrop.classList.remove("is-hidden");
}

document.getElementById("confirm-cancel").addEventListener("click", () => {
  pendingDelete = null;
  confirmBackdrop.classList.add("is-hidden");
});

confirmBackdrop.addEventListener("click", (e) => {
  if (e.target === confirmBackdrop) {
    pendingDelete = null;
    confirmBackdrop.classList.add("is-hidden");
  }
});

document.getElementById("confirm-accept").addEventListener("click", async () => {
  if (!pendingDelete) return;
  const { tipo, id } = pendingDelete;
  const btn = document.getElementById("confirm-accept");
  btn.disabled = true;

  try {
    const tabla = tipo === "gasto" ? "gastos" : "ventas";
    const { error } = await window.supabaseClient.from(tabla).delete().eq("id", id);
    if (error) throw error;

    showToast(`${tipo === "gasto" ? "Gasto" : "Venta"} eliminado correctamente.`, "ok");

    if (tipo === "gasto") {
      await cargarGastos();
      renderGastosTable();
    } else {
      await cargarVentas();
      renderVentasTable();
    }
    renderDashboard();
  } catch (err) {
    showToast("Error al eliminar: " + err.message, "error");
  } finally {
    btn.disabled = false;
    pendingDelete = null;
    confirmBackdrop.classList.add("is-hidden");
  }
});

/* ============================================================
   REPORTES
   ============================================================ */

function renderReportes() {
  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
  const totalVentas = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  const ganancia = totalVentas - totalGastos;

  document.getElementById("rep-gastos").textContent = formatGs(totalGastos);
  document.getElementById("rep-ventas").textContent = formatGs(totalVentas);
  document.getElementById("rep-ganancia").textContent = formatGs(ganancia);

  const tbodyG = document.querySelector("#rep-gastos-table tbody");
  tbodyG.innerHTML = gastos
    .map(
      (g) => `<tr>
        <td>${formatFecha(g.fecha)}</td>
        <td>${escapeHtml(g.concepto)}</td>
        <td class="num">${formatGs(g.monto)}</td>
        <td>${escapeHtml(g.usuario_nombre)}</td>
      </tr>`
    )
    .join("") || `<tr><td colspan="4" style="text-align:center;color:var(--tinta-suave);padding:20px;">Sin gastos registrados</td></tr>`;

  const tbodyV = document.querySelector("#rep-ventas-table tbody");
  tbodyV.innerHTML = ventas
    .map(
      (v) => `<tr>
        <td>${formatFecha(v.fecha)}</td>
        <td>${escapeHtml(v.producto_nombre)} ×${v.cantidad}</td>
        <td class="num">${formatGs(v.total)}</td>
        <td>${escapeHtml(v.usuario_nombre)}</td>
      </tr>`
    )
    .join("") || `<tr><td colspan="4" style="text-align:center;color:var(--tinta-suave);padding:20px;">Sin ventas registradas</td></tr>`;
}

document.getElementById("export-txt-btn").addEventListener("click", exportarReporteTxt);

function exportarReporteTxt() {
  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
  const totalVentas = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  const ganancia = totalVentas - totalGastos;

  const fechaHoy = new Date().toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
  const horaHoy = new Date().toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });

  let txt = "";
  txt += "==========================================\n";
  txt += "          REPORTE SAN JUAN\n";
  txt += "==========================================\n";
  txt += `Fecha: ${fechaHoy} ${horaHoy}\n`;
  txt += `Usuario: ${currentUser?.fullName || "—"}\n`;
  txt += "------------------------------------------\n";
  txt += `Total Gastos:   ${formatGs(totalGastos)}\n`;
  txt += `Total Ventas:   ${formatGs(totalVentas)}\n`;
  txt += `Ganancia Neta:  ${formatGs(ganancia)}\n`;
  txt += "==========================================\n\n";

  txt += "DETALLE DE GASTOS\n";
  txt += "------------------------------------------\n";
  if (gastos.length === 0) {
    txt += "(sin registros)\n";
  } else {
    gastos.forEach((g) => {
      txt += `${formatFecha(g.fecha)} | ${g.concepto} | ${formatGs(g.monto)} | ${g.usuario_nombre}\n`;
    });
  }

  txt += "\nDETALLE DE VENTAS\n";
  txt += "------------------------------------------\n";
  if (ventas.length === 0) {
    txt += "(sin registros)\n";
  } else {
    ventas.forEach((v) => {
      txt += `${formatFecha(v.fecha)} | ${v.producto_nombre} x${v.cantidad} | ${formatGs(v.total)} | ${v.usuario_nombre}\n`;
    });
  }

  txt += "\n==========================================\n";
  txt += "Gracias por acompañar la Noche de San Juan 🔥\n";

  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte-san-juan-${hoyISO()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("Reporte exportado correctamente.", "ok");
}

/* ============================================================
   INICIO
   ============================================================ */

document.getElementById("gasto-fecha")?.setAttribute("max", hoyISO());

// Ejecutar initAuthState cuando esté todo listo
(async () => {
  await ensureSupabaseReady();
  await initAuthState();
})();