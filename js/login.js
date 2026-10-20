import { db, $, RUTAS } from "./core.js";

async function redirigir() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;
  const { data } = await db.from("perfil").select("rol").eq("id", session.user.id).single();
  if (data && RUTAS[data.rol]) return location.replace(RUTAS[data.rol]);
  $("#loginMsg").textContent = "Tu usuario aún no tiene rol asignado. Habla con el administrador.";
  await db.auth.signOut();
}

$("#btnLogin").onclick = async () => {
  const msg = $("#loginMsg"), btn = $("#btnLogin");
  msg.textContent = "";
  const email = $("#email").value.trim(), pass = $("#pass").value;
  if (!email || !pass) return (msg.textContent = "Escribe correo y contraseña.");
  btn.disabled = true;
  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false;
  if (error) return (msg.textContent = error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message);
  redirigir();
};

$("#pass").onkeydown = (e) => { if (e.key === "Enter") $("#btnLogin").click(); };
$("#verPass").onchange = (e) => { $("#pass").type = e.target.checked ? "text" : "password"; };
redirigir();