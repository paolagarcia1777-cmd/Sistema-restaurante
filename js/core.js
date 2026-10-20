import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

// window.CONFIG lo define js/config.js (script clásico cargado antes de los módulos)
const CFG = window.CONFIG || {};
if (!CFG.SUPABASE_URL || !CFG.SUPABASE_KEY) {
  // No borrar la interfaz: mostrar el error sin romper la página
  const msg = document.querySelector("#loginMsg");
  const texto = "Falta js/config.js (SUPABASE_URL / SUPABASE_KEY). Recarga con Ctrl+Shift+R.";
  if (msg) msg.textContent = texto;
  console.error(texto);
  throw new Error(texto);
}

export const db = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
export const $ = (s) => document.querySelector(s);
export const $$ = (s) => [...document.querySelectorAll(s)];
export const money = (n) => "$" + Number(n).toLocaleString("es-CO");
const ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ENT[c]);
export const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2600); };
// Lanza el error de Supabase (si lo hay) y devuelve los datos
export const ck = ({ data, error }) => { if (error) throw error; return data; };
export const RUTAS = { admin: "admin.html", mesero: "mesero.html", cocina: "cocina.html", caja: "caja.html" };

export const S = { user: null, perfil: null, cats: [], prods: [], mesas: [], pedidos: [], mesa: null, pedido: null, detalles: [], cat: null };

export async function iniciarPagina(rolesPermitidos, alListo) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace("index.html");
  S.user = session.user;
  const { data } = await db.from("perfil").select("*").eq("id", S.user.id).single();
  if (!data || !rolesPermitidos.includes(data.rol)) return location.replace("index.html");
  S.perfil = data;
  $("#quien").textContent = `${data.nombre} · ${data.rol}`;
  $("#btnSalir").onclick = async () => { await db.auth.signOut(); location.replace("index.html"); };
  if (data.rol === "admin") {
    const aqui = (r) => location.pathname.endsWith(RUTAS[r]);
    $("#tabs").insertAdjacentHTML("beforeend", ["admin", "mesero", "cocina", "caja"]
      .filter((r) => !(r === "admin" && aqui("admin")))   // en el panel, las pestañas propias reemplazan a "Panel"
      .map((r) => `<a href="${RUTAS[r]}" class="${aqui(r) ? "on" : ""}">${r === "admin" ? "Panel" : r}</a>`).join(""));
  }
  await alListo();
}

export async function cargarCatalogo() {
  // "orden" puede no existir en la BD base: si falla, se ordena por nombre
  let c = await db.from("categoria").select("*").order("orden", { ascending: true });
  if (c.error) c = await db.from("categoria").select("*").order("nombre");
  const p = await db.from("producto").select("*").order("nombre");
  S.cats = c.data ?? [];
  S.prods = p.data ?? [];
  if (!S.cats.find((x) => x.id === S.cat)) S.cat = S.cats[0]?.id ?? null;
}

// Realtime con antirrebote + sondeo de respaldo (por si la tabla no está en la publicación realtime)
export function suscribir(cb, pollMs = 15000) {
  let t;
  const run = () => { clearTimeout(t); t = setTimeout(() => Promise.resolve(cb()).catch((e) => console.error(e)), 250); };
  db.channel("fogon-changes").on("postgres_changes", { event: "*", schema: "public" }, run).subscribe();
  setInterval(run, pollMs);
}

export const fmtTime = (ts) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};