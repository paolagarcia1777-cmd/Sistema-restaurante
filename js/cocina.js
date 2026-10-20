import { db, $, $$, esc, toast, S, iniciarPagina, suscribir, fmtTime } from "./core.js";

let timersInterval = null;

function tarjeta(p) {
  const creado = new Date(p.creado).getTime();
  const urgente = Date.now() - creado > 300000;
  const btn = p.estado === "enviado"
    ? `<button class="btn sm w" data-a="${p.id}">Iniciar preparación</button>`
    : p.estado === "preparando"
      ? `<button class="btn pri sm w" data-a="${p.id}">Marcar listo</button>`
      : `<small>Esperando al mesero</small>`;
  return `<div class="kt${urgente ? " urg" : ""}"><div class="kh"><b>Mesa ${p.mesa?.numero ?? "—"}</b><span class="tm" data-t="${creado}">${fmtTime(creado)}</span></div>
    <ul>${p.detallepedido.map(l => `<li>${l.cantidad}× ${esc(l.producto?.nombre)}${l.nota ? `<small>${esc(l.nota)}</small>` : ""}</li>`).join("")}</ul>${btn}</div>`;
}

function montarVista() {
  $("#vista").innerHTML = `<h2>Cocina</h2><div class="kds">
    <div><h3>Nuevos (<span id="n1">0</span>)</h3><div id="k1"></div></div>
    <div><h3>En preparación (<span id="n2">0</span>)</h3><div id="k2"></div></div>
    <div><h3>Listos (<span id="n3">0</span>)</h3><div id="k3"></div></div>
  </div>`;
}

function renderCocina() {
  [["enviado", "k1", "n1"], ["preparando", "k2", "n2"], ["listo", "k3", "n3"]].forEach(([estado, contId, countId]) => {
    const g = S.pedidos.filter(p => p.estado === estado).sort((a, b) => new Date(a.creado) - new Date(b.creado));
    const cont = $(`#${contId}`); if (cont) cont.innerHTML = g.map(tarjeta).join("") || `<p class="vacio">Sin pedidos</p>`;
    const cnt = $(`#${countId}`); if (cnt) cnt.textContent = g.length;
  });
}

async function cargarPedidos() {
  const { data } = await db.from("pedido")
    .select("*, mesa(numero), detallepedido(cantidad, nota, producto(nombre))")
    .in("estado", ["enviado", "preparando", "listo"])
    .order("creado");
  S.pedidos = data ?? [];
  renderCocina();
}

function startTimers() {
  if (timersInterval) clearInterval(timersInterval);
  timersInterval = setInterval(() => {
    $$(".tm").forEach(t => t.textContent = fmtTime(+t.dataset.t));
  }, 1000);
}

iniciarPagina(["cocina", "admin"], async () => {
  montarVista();
  suscribir(cargarPedidos);
  await cargarPedidos();
  startTimers();

  $("#vista").onclick = async (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const nuevoEstado = b.closest("#k1") ? "preparando" : "listo";
    await db.from("pedido").update({ estado: nuevoEstado }).eq("id", b.dataset.a);
    toast(nuevoEstado === "listo" ? "Pedido listo, avisando al mesero" : "Pedido en preparación");
    cargarPedidos();
  };
});