import { db, $, $$, money, esc, toast, S, iniciarPagina, cargarCatalogo, suscribir, fmtTime } from "./core.js";

const ABIERTOS = ["abierto", "enviado", "preparando", "listo", "entregado"];
let listosPrev = 0;
let timersInterval = null;

const byCreado = (a, b) => new Date(a.creado) - new Date(b.creado);

function estadoMesa(m) {
  const todos = S.pedidos.filter(p => p.mesa_id === m.id);
  const activos = todos.filter(p => ABIERTOS.includes(p.estado));
  if (m.estado === "espera_pago") return ["cuenta", "Pidió cuenta"];
  if (activos.some(p => p.estado === "abierto" || p.estado === "enviado")) return ["nuevo", "En cola"];
  if (activos.some(p => p.estado === "preparando")) return ["prep", "Preparando"];
  if (activos.some(p => p.estado === "listo")) return ["listo", "¡Listo!"];
  if (activos.some(p => p.estado === "entregado")) return ["entregado", "Entregado"];
  return ["", "Libre"];
}

function montarVista() {
  $("#vista").innerHTML = `
    <div class="split">
      <div>
        <h2>Mesas</h2><div class="mesas" id="mesas"></div>
        <h2>Menú</h2>
        <div class="chips" id="chips"></div>
        <div class="prods" id="prods"></div>
        <p class="vacio" id="menuVacio" hidden>El menú está vacío. Regístralo en Administración.</p>
      </div>
      <aside>
        <p class="card vacio" id="ph">Toca una mesa para tomar o revisar su pedido.</p>
        <div id="panel" hidden>
          <div class="card"><h2 id="tTit"></h2><div id="tLn"></div>
            <div class="tot"><span>Total</span><span id="tTot">$0</span></div>
            <button class="btn pri w" id="send" disabled>Enviar a cocina</button></div>
          <div class="card" id="cursoCard" style="margin-top:12px" hidden><h3>Pedidos de esta mesa</h3><div id="cursoL"></div></div>
          <button class="btn pri w" id="cuentaBtn" style="margin-top:12px" hidden>Pedir la cuenta</button>
        </div>
      </aside>
    </div>`;

  $("#send").onclick = enviarPedido;
  $("#cuentaBtn").onclick = pedirCuenta;
  $("#mesas").onclick = (e) => { const b = e.target.closest(".m"); if (b) abrirMesa(+b.dataset.id); };
  $("#tLn").onclick = (e) => {
    const b = e.target.closest("[data-q]"); if (!b) return;
    agregarProducto(+b.dataset.q, +b.dataset.d);
  };
  $("#tLn").oninput = async (e) => {
    if (e.target.dataset.o === undefined) return;
    const d = S.detalles.find(x => x.id === +e.target.dataset.o);
    if (d && d.nota !== e.target.value) {
      d.nota = e.target.value;
      await db.from("detallepedido").update({ nota: e.target.value }).eq("id", d.id);
    }
  };
  $("#cursoL").onclick = async (e) => {
    const b = e.target.closest("[data-e]"); if (!b) return;
    await db.from("pedido").update({ estado: "entregado" }).eq("id", b.dataset.e);
    toast("Pedido entregado");
    await cargarDatos();
    resolverPedido(); renderMesas(); renderCurso(); renderBell();
  };
}

async function cargarDatos() {
  const [m, p] = await Promise.all([
    db.from("mesa").select("*").order("numero"),
    db.from("pedido")
      .select("*, mesa(numero), detallepedido(cantidad, nota, precio_unitario, producto(nombre))")
      .order("creado")
  ]);
  S.mesas = m.data ?? [];
  S.pedidos = p.data ?? [];
  if (S.mesa) S.mesa = S.mesas.find(x => x.id === S.mesa.id) ?? null;
}

function resolverPedido() {
  if (!S.mesa) { S.pedido = null; S.detalles = []; return; }
  const deMesa = S.pedidos.filter(p => p.mesa_id === S.mesa.id && p.estado !== "pagado");
  const abierto = deMesa.filter(p => p.estado === "abierto").sort(byCreado).pop();
  S.pedido = abierto || deMesa.sort(byCreado).pop() || null;
  S.detalles = S.pedido?.detallepedido ?? [];
}

function renderMesas() {
  const cont = $("#mesas"); if (!cont) return;
  cont.innerHTML = S.mesas.map(m => {
    const [c, t] = estadoMesa(m);
    return `<button class="m ${c} ${S.mesa?.id === m.id ? "sel" : ""}" data-id="${m.id}" aria-label="Mesa ${m.numero}, ${t}"><b>${m.numero}</b><small>${m.capacidad ?? 4} puestos</small><em>${t}</em></button>`;
  }).join("");
}

async function abrirMesa(id) {
  S.mesa = S.mesas.find(m => m.id === id) ?? null;
  if (!S.mesa) return;
  resolverPedido();
  $("#ph").hidden = true; $("#panel").hidden = false;
  renderMesas(); pintarMenuMesa(); pintarCuenta(); renderCurso();
}

function pintarMenuMesa() {
  if (!S.mesa) return;
  const dis = S.prods.filter(p => p.disponible !== false && (p.stock == null || p.stock > 0));
  const cs = S.cats.filter(c => dis.some(p => p.categoria_id === c.id));
  $("#menuVacio").hidden = cs.length > 0;
  if (!cs.some(c => c.id === S.cat)) S.cat = cs[0]?.id ?? null;
  $("#chips").innerHTML = cs.map(c => `<button class="chip ${c.id === S.cat ? "on" : ""}" data-c="${c.id}">${esc(c.nombre)}</button>`).join("");
  $("#prods").innerHTML = dis.filter(p => p.categoria_id === S.cat).map(p =>
    `<button class="prod" data-p="${p.id}"><b>${esc(p.nombre)}</b>${p.descripcion ? `<small>${esc(p.descripcion)}</small>` : ""}<span>${money(p.precio)}</span>${p.stock != null ? `<small>Disponibles: ${p.stock}</small>` : ""}</button>`
  ).join("");
  $("#chips").onclick = (e) => { const c = e.target.closest("[data-c]"); if (c) { S.cat = +c.dataset.c; pintarMenuMesa(); } };
  $("#prods").onclick = (e) => { const p = e.target.closest("[data-p]"); if (p) agregarProducto(+p.dataset.p); };
}

async function agregarProducto(productoId, delta = 1) {
  if (!S.mesa) return toast("Selecciona una mesa primero");
  if (S.pedido && S.pedido.estado !== "abierto") return toast("El pedido ya fue enviado a cocina");
  const prod = S.prods.find(p => p.id === productoId);
  if (!prod) return;

  const existe = S.detalles.find(d => d.producto_id === productoId);
  const actual = existe?.cantidad ?? 0;
  if (delta > 0 && prod.stock != null && actual + delta > prod.stock) {
    return toast(`No hay más stock de ${prod.nombre}`);
  }

  if (!S.pedido) {
    const { data, error } = await db.from("pedido").insert({ mesa_id: S.mesa.id, mesero_id: S.user.id }).select().single();
    if (error) return toast(error.message);
    S.pedido = data;
    await db.from("mesa").update({ estado: "ocupada" }).eq("id", S.mesa.id);
  }

  if (existe) {
    const nueva = existe.cantidad + delta;
    if (nueva <= 0) await db.from("detallepedido").delete().eq("id", existe.id);
    else await db.from("detallepedido").update({ cantidad: nueva }).eq("id", existe.id);
  } else if (delta > 0) {
    await db.from("detallepedido").insert({ pedido_id: S.pedido.id, producto_id: productoId, precio_unitario: prod.precio, cantidad: 1 });
  }

  await cargarDatos();
  resolverPedido(); renderMesas(); pintarCuenta(); renderCurso();
}

function pintarCuenta() {
  if (!S.mesa) return;
  const abierto = !S.pedido || S.pedido.estado === "abierto";
  const total = S.detalles.reduce((s, d) => s + d.cantidad * d.precio_unitario, 0);
  $("#tTit").textContent = `Mesa ${S.mesa.numero}`;
  $("#tLn").innerHTML = S.detalles.length ? S.detalles.map(d =>
    `<div class="ln"><b>${d.cantidad}× ${esc(d.producto?.nombre)}</b><b>${money(d.cantidad * d.precio_unitario)}</b>
    ${abierto
      ? `<div class="st"><button class="btn sm" data-q="${d.producto_id}" data-d="-1" aria-label="Quitar uno">−</button><button class="btn sm" data-q="${d.producto_id}" data-d="1" aria-label="Agregar uno">+</button>
         <input data-o="${d.id}" maxlength="120" placeholder="Observaciones (opcional)" value="${esc(d.nota)}" aria-label="Observaciones"></div>`
      : (d.nota ? `<small class="st">${esc(d.nota)}</small>` : "")}</div>`
  ).join("") : `<p class="vacio">Agrega productos de la carta para armar el pedido.</p>`;
  $("#tTot").textContent = money(total);
  $("#send").disabled = !(abierto && S.detalles.length);
}

function renderCurso() {
  if (!S.mesa) return;
  const todos = S.pedidos.filter(p => p.mesa_id === S.mesa.id);
  const activos = todos.filter(p => ["abierto", "enviado", "preparando", "listo"].includes(p.estado));
  $("#cursoCard").hidden = !todos.length;
  $("#cursoL").innerHTML = todos.map(p =>
    `<div class="cr"><span class="est ${p.estado}">${p.estado}</span>
      <span style="flex:1">${(p.detallepedido ?? []).reduce((s, l) => s + l.cantidad, 0)} productos · ${money((p.detallepedido ?? []).reduce((s, l) => s + l.cantidad * l.precio_unitario, 0))}</span>
      ${p.estado === "listo" ? `<button class="btn pri sm" data-e="${p.id}">Entregar</button>` : ""}
      <details><summary>Ver productos</summary>${(p.detallepedido ?? []).map(l => `<div class="dl"><span>${l.cantidad}× ${esc(l.producto?.nombre)}${l.nota ? `<small>${esc(l.nota)}</small>` : ""}</span><b>${money(l.cantidad * l.precio_unitario)}</b></div>`).join("")}</details></div>`
  ).join("");
  const hayEntregado = todos.some(p => p.estado === "entregado");
  $("#cuentaBtn").hidden = !(activos.length === 0 && hayEntregado && S.mesa.estado !== "espera_pago");
}

async function enviarPedido() {
  if (!S.pedido || !S.detalles.length) return;
  const { error } = await db.from("pedido").update({ estado: "enviado" }).eq("id", S.pedido.id);
  if (error) return toast(error.message);
  toast(`Pedido de la Mesa ${S.mesa.numero} enviado a cocina`);
  await cargarDatos(); resolverPedido(); renderMesas(); pintarCuenta(); renderCurso();
}

async function pedirCuenta() {
  if (!S.mesa) return;
  const { error } = await db.from("mesa").update({ estado: "espera_pago" }).eq("id", S.mesa.id);
  if (error) return toast(error.message);
  toast(`Mesa ${S.mesa.numero} pasó a caja`);
  await cargarDatos(); renderMesas(); renderCurso();
}

function renderBell() {
  const bellN = $("#bellN"); if (!bellN) return;
  const ls = S.pedidos.filter(p => p.estado === "listo").sort(byCreado);
  bellN.textContent = ls.length;
  const av = $("#av"); if (!av) return;
  av.innerHTML = `<h3>Pedidos listos</h3>` + (ls.map(p =>
    `<button data-bm="${p.mesa_id}"><b>Mesa ${p.mesa?.numero ?? p.mesa_id}</b><span>${(p.detallepedido ?? []).reduce((s, l) => s + l.cantidad, 0)} productos · ${fmtTime(new Date(p.creado).getTime())}</span></button>`
  ).join("") || `<p class="vacio">No hay pedidos esperando entrega.</p>`);
  if (ls.length > listosPrev) toast(`Mesa ${ls[ls.length - 1].mesa?.numero ?? ls[ls.length - 1].mesa_id}: pedido listo para entregar`);
  listosPrev = ls.length;
}

function startTimers() {
  if (timersInterval) clearInterval(timersInterval);
  timersInterval = setInterval(() => {
    $$(".tm").forEach(t => t.textContent = fmtTime(+t.dataset.t));
  }, 1000);
}

iniciarPagina(["mesero", "admin"], async () => {
  await cargarCatalogo();
  montarVista();
  await cargarDatos();
  renderMesas(); renderCurso(); renderBell(); pintarMenuMesa();
  if (S.mesa) abrirMesa(S.mesa.id);
  startTimers();

  suscribir(async () => {
    await cargarDatos();
    resolverPedido(); renderMesas(); renderCurso(); renderBell();
    if (S.mesa) pintarCuenta();
  });

  $("#bellBtn").onclick = (e) => { e.stopPropagation(); $("#av").hidden = !$("#av").hidden; };
  document.onclick = (e) => { if (!e.target.closest(".bell")) $("#av").hidden = true; };
  $("#av").onclick = (e) => {
    const b = e.target.closest("[data-bm]"); if (!b) return;
    $("#av").hidden = true;
    abrirMesa(+b.dataset.bm);
  };
});