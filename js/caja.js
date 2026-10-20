import { db, $, $$, money, esc, toast, S, iniciarPagina, suscribir } from "./core.js";

const ABIERTOS = ["abierto", "enviado", "preparando", "listo", "entregado"];
let pagoMesa = null;
let medioPago = null;

const pedidosMesa = (mesaId) => S.pedidos.filter(p => p.mesa_id === mesaId && ABIERTOS.includes(p.estado));
const itemsMesa = (mesaId) => pedidosMesa(mesaId).flatMap(p => p.detallepedido ?? []);
const totalMesa = (mesaId) => itemsMesa(mesaId).reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
const countMesa = (mesaId) => itemsMesa(mesaId).reduce((s, l) => s + l.cantidad, 0);

function buildFacturaHTML(mesaNumero, mesaId, estado = "Pendiente de pago", medio = "—") {
  const items = itemsMesa(mesaId);
  const total = items.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
  const now = new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });
  return `<div style="display:flex;justify-content:space-between;border-bottom:2px solid var(--ember);padding-bottom:12px">
    <h3>Fogón Criollo · Factura de consumo</h3>
    <div style="text-align:right"><b>Mesa ${mesaNumero}</b><small>${now}</small></div></div>
    <table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
    <tbody>${items.map(l => `<tr><td>${esc(l.producto?.nombre)}${l.nota ? `<small>${esc(l.nota)}</small>` : ""}</td><td>${l.cantidad}</td><td>${money(l.precio_unitario)}</td><td>${money(l.cantidad * l.precio_unitario)}</td></tr>`).join("")}</tbody></table>
    <div class="tot"><span>Total</span><span>${money(total)}</span></div>
    <p><b>Estado de pago:</b> ${esc(estado)}<br><b>Medio de pago:</b> ${esc(medio)}</p>
    <div class="fo"><button class="btn" id="fCerrar">Cerrar</button><button class="btn pri" id="fPrint">Imprimir factura</button></div>`;
}

function montarVista() {
  $("#vista").innerHTML = `<h2>Caja</h2><div class="cajal" id="caja"></div>`;
}

async function cargarCaja() {
  const [m, p] = await Promise.all([
    db.from("mesa").select("*").order("numero"),
    db.from("pedido")
      .select("*, mesa(numero), detallepedido(cantidad, precio_unitario, nota, producto(nombre))")
      .order("creado")
  ]);
  S.mesas = m.data ?? [];
  S.pedidos = p.data ?? [];
  renderCaja();
}

function renderCaja() {
  const cont = $("#caja"); if (!cont) return;
  const enEspera = S.mesas.filter(m => m.estado === "espera_pago");
  if (!enEspera.length) {
    cont.innerHTML = `<p class="card vacio">Ninguna mesa ha pedido la cuenta todavía.</p>`;
    return;
  }
  cont.innerHTML = enEspera.map(m => `<div class="cj"><i>${m.numero}</i><div><small>${countMesa(m.id)} productos</small><b style="font-size:20px">${money(totalMesa(m.id))}</b></div>
    <button class="btn" data-f="${m.id}">Factura</button><button class="btn pri" data-c="${m.id}">Cobrar</button></div>`).join("");
}

function showFactura(mesaId, estado = "Pendiente de pago", medio = "—") {
  const mesa = S.mesas.find(m => m.id === mesaId);
  $("#fBox").innerHTML = buildFacturaHTML(mesa?.numero ?? mesaId, mesaId, estado, medio);
  $("#fOv").hidden = false;
  $("#fCerrar").onclick = () => $("#fOv").hidden = true;
  $("#fPrint").onclick = () => window.print();
}

function showPagoModal(mesaId) {
  pagoMesa = mesaId;
  medioPago = null;
  const mesa = S.mesas.find(m => m.id === mesaId);
  $("#pMesa").textContent = `Mesa ${mesa?.numero ?? mesaId}`;
  $("#pTot").textContent = money(totalMesa(mesaId));
  $$("#med button").forEach(b => b.classList.remove("on"));
  $("#pOk").disabled = true;
  $("#pOv").hidden = false;
}

iniciarPagina(["caja", "admin"], async () => {
  montarVista();
  suscribir(cargarCaja);
  await cargarCaja();

  $("#caja").onclick = (e) => {
    const f = e.target.closest("[data-f]"), c = e.target.closest("[data-c]");
    if (f) showFactura(+f.dataset.f);
    if (c) showPagoModal(+c.dataset.c);
  };

  $("#med").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    medioPago = b.dataset.m.toLowerCase();   // efectivo / tarjeta / transferencia
    $$("#med button").forEach(x => x.classList.toggle("on", x === b));
    $("#pOk").disabled = false;
  };

  $("#pNo").onclick = () => { $("#pOv").hidden = true; pagoMesa = null; };

  $("#pOk").onclick = async () => {
    if (pagoMesa === null || !medioPago) return;
    const mesaId = pagoMesa;
    const pedidos = pedidosMesa(mesaId);
    if (!pedidos.length) { $("#pOv").hidden = true; return toast("Esta mesa no tiene consumo pendiente"); }

    $("#pOv").hidden = true;
    showFactura(mesaId, "Pagado", medioPago);   // se arma antes de cambiar los estados

    const total = itemsMesa(mesaId).reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
    const { error } = await db.from("factura").insert({
      mesa_id: mesaId,
      cajero_id: S.user.id,
      total,
      metodo_pago: medioPago
    });
    if (error) { toast("No se pudo registrar la factura: " + error.message); pagoMesa = null; await cargarCaja(); return; }

    const { error: e2 } = await db.from("pedido").update({ estado: "pagado" })
      .eq("mesa_id", mesaId).in("estado", ABIERTOS);
    if (e2) { toast("No se pudo cerrar los pedidos: " + e2.message); pagoMesa = null; await cargarCaja(); return; }

    await db.from("mesa").update({ estado: "libre" }).eq("id", mesaId);
    pagoMesa = null;
    toast(`Pago de la mesa registrado (${medioPago})`);
    await cargarCaja();
  };
});