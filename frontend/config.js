// config.js — configuración y utilidades compartidas por todas las páginas.
// Se carga con <script src="config.js"></script> ANTES del script de cada página.

// URL del backend.
//  - En tu computador (localhost) apunta a http://localhost:3000.
//  - En producción CAMBIA ESTA LÍNEA por la URL pública de tu backend,
//    por ejemplo 'https://agendly-api.onrender.com' (sin / al final).
var AGENDLY_PROD_API = '';

var AGENDLY_API = (function () {
  var h = location.hostname;
  var isLocal = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '';
  if (isLocal) return 'http://localhost:3000';
  return AGENDLY_PROD_API || location.origin;
})();

// Zona horaria del negocio (debe coincidir con BUSINESS_TIMEZONE del backend)
var AGENDLY_TZ = 'America/Santiago';

/** Escapa texto antes de insertarlo con innerHTML (evita inyección de HTML/JS). */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Fecha de hoy "YYYY-MM-DD" en hora local del navegador (toISOString usa UTC y se adelanta de noche). */
function todayLocal() {
  var d = new Date();
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// ── Campos de dinero ──────────────────────────────────────────────
// Cualquier <input data-money inputmode="numeric"> se formatea mientras se escribe:
// 10000 → $10.000 · 130000 → $130.000. Se lee con parseMoney() y se rellena con setMoney().

/** "$1.250.000" → 1250000 (ignora todo lo que no sea dígito). */
function parseMoney(value) {
  return parseInt(String(value == null ? '' : value).replace(/\D/g, ''), 10) || 0;
}

/** 130000 → "$130.000" (vacío si es 0). Separador de miles manual: es-CL no agrupa los 4 dígitos. */
function formatMoney(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  return n ? '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
}

/** Rellena un input de dinero con un valor numérico ya formateado. */
function setMoney(input, n) {
  input.value = formatMoney(n);
}

document.addEventListener('input', function (e) {
  var el = e.target;
  if (!el || !el.matches || !el.matches('input[data-money]')) return;

  // Máximo 9 dígitos (hasta $999.999.999)
  var digits = el.value.replace(/\D/g, '').slice(0, 9);
  var out = formatMoney(digits);
  if (out === el.value) return;

  // Mantiene el cursor junto al mismo dígito después de reformatear
  var typedBefore = el.value.slice(0, el.selectionStart == null ? el.value.length : el.selectionStart).replace(/\D/g, '').length;
  el.value = out;
  var pos = 0, seen = 0;
  while (pos < out.length && seen < typedBefore) { if (/\d/.test(out.charAt(pos))) seen++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch (err) { /* algunos navegadores no lo permiten */ }
});
