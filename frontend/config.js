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
