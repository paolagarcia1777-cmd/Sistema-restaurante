import { db, $, $$, money, esc, toast, S, iniciarPagina, cargarCatalogo } from "./core.js";

let editando = null;
const STOCK_BAJO = 5;

async function vUsuarios() {
  const { data } = await db.from("perfil").select("*").order("nombre");
  const roles = ["admin", "mesero", "cocina", "caja", "pendiente"];
  $("#vista").innerHTML = `<div class="split"><div class="panel"><h2>Usuarios</h2>
    ${(data ?? []).map(u => `<div class="fila" data-u="${u.id}"><span><b>${esc(u.nombre)}</b><br><small>${esc(u.email)}</small></span>
      <select>${roles.map(r => `<option ${r === u.rol ? "selected" : ""}>${r}</option>`).join("")}</select>
      <button class="btn sm danger" data-a="delU" ${u.id === S.user.id ? "disabled" : ""}>Eliminar</button></div>`).join("")}
    </div><aside class="panel"><h2>Nuevo usuario</h2><div class="form">
      <input id="uNombre" placeholder="Nombre"><input id="uEmail" type="email" placeholder="Correo"><input id="uPass" type="password" placeholder="Contraseña (mín. 6)">
      <select id="uRol"><option>mesero</option><option>cocina</option><option>caja</option><option>admin</option></select>
      <button class="btn pri" id="addU">Crear usuario</button></div></aside></div>`;
  $("#addU").onclick = async () => {
    const { error } = await db.rpc("admin_crear_usuario", { p_email: $("#uEmail").value, p_password: $("#uPass").value, p_nombre: $("#uNombre").value.trim(), p_rol: $("#uRol").value });
    if (error) return toast(error.message);
    toast("Usuario creado"); vUsuarios();
  };
  $("#vista").onchange = async (e) => {
    const f = e.target.closest("[data-u]"); if (!f) return;
    const { error } = await db.from("perfil").update({ rol: e.target.value }).eq("id", f.dataset.u);
    toast(error ? error.message : "Rol actualizado");
  };
  $("#vista").onclick = async (e) => {
    if (e.target.dataset.a !== "delU") return;
    const f = e.target.closest("[data-u]");
    if (!confirm("¿Eliminar este usuario? No podrá volver a entrar.")) return;
    const { error } = await db.rpc("admin_eliminar_usuario", { p_id: f.dataset.u });
    toast(error ? error.message : "Usuario eliminado"); vUsuarios();
  };
}

const nomCat = (id) => S.cats.find(c => c.id === id)?.nombre ?? "—";

function limpiarProd() {
  editando = null;
  $("#pTit").textContent = "Nuevo producto";
  ["#pNom", "#pDes", "#pPre"].forEach(s => $(s).value = "");
  $("#pSto").value = "0";
  $("#pErr").textContent = "";
  $("#pCanc").hidden = true;
  $("#pGuard").textContent = "Guardar producto";
}

function renderAdmin() {
  const prevCat = $("#pCat").value;
  $("#pCat").innerHTML = S.cats.length
    ? S.cats.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")
    : `<option value="">Sin categorías</option>`;
  if (prevCat) $("#pCat").value = prevCat;

  $("#tCat").innerHTML = S.cats.map(c =>
    `<tr><td>${esc(c.nombre)}</td><td>${c.orden ?? "—"}</td><td>${S.prods.filter(p => p.categoria_id === c.id).length}</td><td><button class="lk" data-dc="${c.id}">Eliminar</button></td></tr>`
  ).join("") || `<tr><td colspan="4" class="vacio">Todavía no hay categorías.</td></tr>`;

  const low = S.prods.filter(p => p.stock != null && p.stock <= STOCK_BAJO);
  $("#alertas").innerHTML = low.map(p => p.stock === 0
    ? `<div class="al ag"><b>Agotado:</b> ${esc(p.nombre)}</div>`
    : `<div class="al"><b>Stock bajo:</b> ${esc(p.nombre)} tiene ${p.stock} unidades.</div>`).join("");

  $("#tProd").innerHTML = [...S.prods]
    .sort((a, b) => nomCat(a.categoria_id).localeCompare(nomCat(b.categoria_id)) || a.nombre.localeCompare(b.nombre))
    .map(p => `<tr><td>${esc(p.nombre)}${p.descripcion ? `<small>${esc(p.descripcion)}</small>` : ""}</td><td>${esc(nomCat(p.categoria_id))}</td><td>${money(p.precio)}</td><td><b>${p.stock ?? "—"}</b></td>
      <td><button class="lk" data-pe="${p.id}">Editar</button><button class="lk" data-pd="${p.id}">Eliminar</button></td></tr>`
    ).join("") || `<tr><td colspan="5" class="vacio">Todavía no hay productos.</td></tr>`;
}

async function vMenu() {
  await cargarCatalogo();
  $("#vista").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2>Gestión del menú · <span id="who"></span></h2><button class="btn sm" id="logout">Cerrar sesión</button></div>
    <div class="adm">
      <div>
        <div class="card f"><h3>Nueva categoría</h3>
          <input id="cNom" placeholder="Nombre" aria-label="Nombre de la categoría">
          <input id="cOrd" type="number" min="1" value="1" aria-label="Orden de aparición">
          <button class="btn pri" id="cGuard">Guardar categoría</button><p class="msg" id="cErr"></p></div>
        <div class="card f"><h3 id="pTit">Nuevo producto</h3>
          <select id="pCat" aria-label="Categoría"></select>
          <input id="pNom" placeholder="Nombre del plato" aria-label="Nombre">
          <textarea id="pDes" placeholder="Descripción" aria-label="Descripción"></textarea>
          <input id="pPre" type="number" min="0" step="100" placeholder="Precio" aria-label="Precio">
          <input id="pSto" type="number" min="0" step="1" value="0" aria-label="Cantidad disponible">
          <button class="btn pri" id="pGuard">Guardar producto</button>
          <button class="btn" id="pCanc" hidden>Cancelar</button><p class="msg" id="pErr"></p></div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px"><h3>Categorías</h3>
          <table><thead><tr><th>Nombre</th><th>Orden</th><th>Productos</th><th></th></tr></thead><tbody id="tCat"></tbody></table></div>
        <div class="card"><h3>Productos</h3><div id="alertas"></div>
          <table><thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th></th></tr></thead><tbody id="tProd"></tbody></table></div>
      </div>
    </div>`;

  $("#who").textContent = S.perfil?.nombre ?? "—";
  $("#logout").onclick = async () => { await db.auth.signOut(); location.replace("index.html"); };

  $("#cGuard").onclick = async () => {
    const nombre = $("#cNom").value.trim(), orden = parseInt($("#cOrd").value, 10) || 1;
    $("#cErr").textContent = "";
    if (!nombre) return $("#cErr").textContent = "El nombre es obligatorio.";
    if (S.cats.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) return $("#cErr").textContent = "Ya existe esa categoría.";
    let { error } = await db.from("categoria").insert({ nombre, orden });
    if (error) ({ error } = await db.from("categoria").insert({ nombre }));   // BD sin columna "orden"
    if (error) return $("#cErr").textContent = error.message;
    $("#cNom").value = ""; await cargarCatalogo(); renderAdmin(); toast(`Categoría "${nombre}" registrada`);
  };

  $("#pGuard").onclick = async () => {
    const cat = parseInt($("#pCat").value, 10);
    const base = { nombre: $("#pNom").value.trim(), precio: parseFloat($("#pPre").value), categoria_id: cat };
    const extra = { descripcion: $("#pDes").value.trim(), stock: parseInt($("#pSto").value, 10) };
    $("#pErr").textContent = "";
    if (!cat) return $("#pErr").textContent = "Registra primero una categoría.";
    if (!base.nombre) return $("#pErr").textContent = "El nombre es obligatorio.";
    if (!(base.precio >= 0)) return $("#pErr").textContent = "Escribe un precio válido.";
    if (!(extra.stock >= 0)) return $("#pErr").textContent = "Escribe una cantidad válida.";

    let error;
    if (editando) {
      ({ error } = await db.from("producto").update({ ...base, ...extra }).eq("id", editando));
      if (error) ({ error } = await db.from("producto").update(base).eq("id", editando));
    } else {
      ({ error } = await db.from("producto").insert({ ...base, ...extra }));
      if (error) ({ error } = await db.from("producto").insert(base));
    }
    if (error) return $("#pErr").textContent = error.message;

    const nombre = base.nombre;
    limpiarProd(); await cargarCatalogo(); renderAdmin(); toast(`Producto "${nombre}" guardado`);
  };

  $("#pCanc").onclick = limpiarProd;

  $("#vista").onclick = async (e) => {
    const dc = e.target.closest("[data-dc]"), pe = e.target.closest("[data-pe]"), pd = e.target.closest("[data-pd]");
    if (dc) {
      const c = S.cats.find(x => x.id === +dc.dataset.dc);
      const n = S.prods.filter(p => p.categoria_id === c.id).length;
      if (n) return toast(`"${c.nombre}" tiene ${n} productos, muévelos o elimínalos primero`);
      if (confirm(`¿Eliminar la categoría "${c.nombre}"?`)) {
        const { error } = await db.from("categoria").delete().eq("id", c.id);
        if (error) return toast(error.message);
        await cargarCatalogo(); renderAdmin();
      }
    }
    if (pe) {
      const p = S.prods.find(x => x.id === +pe.dataset.pe);
      editando = p.id; $("#pTit").textContent = "Editar producto";
      $("#pCat").value = p.categoria_id; $("#pNom").value = p.nombre; $("#pDes").value = p.descripcion ?? "";
      $("#pPre").value = p.precio; $("#pSto").value = p.stock ?? 0;
      $("#pCanc").hidden = false; $("#pGuard").textContent = "Guardar cambios"; $("#pNom").focus();
    }
    if (pd) {
      const p = S.prods.find(x => x.id === +pd.dataset.pd);
      if (confirm(`¿Eliminar "${p.nombre}" de la carta?`)) {
        const { error } = await db.from("producto").delete().eq("id", p.id);
        if (error) return toast("No se puede eliminar: ya está en pedidos. Desmárcalo como disponible.");
        if (editando === p.id) limpiarProd();
        await cargarCatalogo(); renderAdmin();
      }
    }
  };

  renderAdmin();
}

function ir(v) {
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  $("#vista").onclick = null; $("#vista").onchange = null;
  (v === "menu" ? vMenu : vUsuarios)();
}

iniciarPagina(["admin"], async () => {
  $("#tabs").insertAdjacentHTML("afterbegin", '<button data-v="usuarios">Usuarios</button><button data-v="menu">Menú</button>');
  $("#tabs").addEventListener("click", (e) => e.target.dataset.v && ir(e.target.dataset.v));
  ir("usuarios");
});