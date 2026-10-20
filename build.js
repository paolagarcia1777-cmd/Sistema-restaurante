/**
 * build.js — Se ejecuta en el build de Cloudflare Pages.
 * Genera js/config.js a partir de variables de entorno para no subir
 * credenciales al repositorio (js/config.js está en .gitignore).
 *
 * Requeridas en Cloudflare Pages → Settings → Environment variables
 * (en Production Y Preview):
 *   SUPABASE_URL  (o SUPABASE_PROJECT_URL / VITE_SUPABASE_URL)
 *   SUPABASE_KEY  (o SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY)
 *
 * Acepta alias de nombre para evitar el error de "variable vacía".
 *
 * Seguridad (fail-closed): la key se incrusta en el JS público, por lo que
 * NUNCA debe ser privada. El build SOLO acepta formatos públicos conocidos
 * (sb_publishable_… o un JWT con role="anon"); cualquier otro formato aborta.
 */
const fs = require('fs');
const path = require('path');

const pick = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return '';
};

const cfg = {
  SUPABASE_URL: pick('SUPABASE_URL', 'SUPABASE_PROJECT_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL'),
  SUPABASE_KEY: pick('SUPABASE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLIC_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
};

const missing = Object.keys(cfg).filter(k => !cfg[k]);
if (missing.length) {
  const seen = Object.keys(process.env).filter(k => /SUPABASE|ADMIN/i.test(k));
  console.error('FALTAN variables de entorno: ' + missing.join(', '));
  console.error('Variables SUPABASE/ADMIN detectadas en este build: ' + (seen.length ? seen.join(', ') : '(ninguna)'));
  console.error('Ve a Settings → Environment variables (Production y Preview) y usa exactamente esos nombres.');
  process.exit(1);
}

if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(cfg.SUPABASE_URL.replace(/\/$/, '') + '')) {
  console.warn('Aviso: SUPABASE_URL no parece una https://<proyecto>.supabase.co');
}

const b64url = s => s.replace(/-/g, '+').replace(/_/g, '/');
function assertPublicKey(key) {
  const k = String(key).trim();
  if (/^sb_secret_/i.test(k) || /service_role/i.test(k)) {
    console.error('ERROR: SUPABASE_KEY es una clave PRIVADA (sb_secret_ / service_role). No puede ir al navegador. Abortando.');
    process.exit(1);
  }
  if (/^sb_publishable_/i.test(k)) return 'publishable';
  if (k.split('.').length === 3 && /^eyJ/.test(k)) {
    let role = '';
    try {
      const payload = JSON.parse(Buffer.from(b64url(k.split('.')[1]), 'base64').toString('utf8'));
      role = payload && payload.role ? String(payload.role) : '';
    } catch (e) { /* payload ilegible => se rechaza abajo */ }
    if (role === 'anon') return 'jwt:anon';
    console.error('ERROR: el JWT de SUPABASE_KEY tiene role="' + (role || 'desconocido') + '" (se espera "anon"). No puede ir al navegador. Abortando.');
    process.exit(1);
  }
  console.error('ERROR: SUPABASE_KEY tiene un formato desconocido (se espera sb_publishable_… o un JWT anon). Por seguridad no se incrusta en el JS público. Abortando.');
  process.exit(1);
}
const keyKind = assertPublicKey(cfg.SUPABASE_KEY);

const out = path.join(__dirname, 'js', 'config.js');
const body =
  '/* Generado por build.js en Cloudflare Pages. No editar ni subir a Git. */\n' +
  'window.CONFIG = Object.freeze({\n' +
  '  SUPABASE_URL: ' + JSON.stringify(cfg.SUPABASE_URL) + ',\n' +
  '  SUPABASE_KEY: ' + JSON.stringify(cfg.SUPABASE_KEY) + '\n' +
  '});\n';

fs.writeFileSync(out, body, 'utf8');
console.log('Generado ' + out + ' (key: ' + keyKind + ', ' + cfg.SUPABASE_KEY.length + ' caracteres)');