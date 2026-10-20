// Dirección de la aplicación de Agendly (login, registro, páginas legales).
//  - En tu computador (localhost) apunta a http://localhost:5500/.
//  - En producción CAMBIA ESTA LÍNEA por la URL pública del panel,
//    por ejemplo 'https://app.tudominio.cl/' (con / al final).
var AGENDLY_PROD_APP = '';

var AGENDLY_APP = (function () {
  var h = location.hostname;
  var isLocal = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '';
  return isLocal ? 'http://localhost:5500/' : (AGENDLY_PROD_APP || '/');
})();

// Todo enlace con data-app="pagina.html" apunta a esa página de la aplicación.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-app]').forEach(function (a) {
    a.href = AGENDLY_APP + a.getAttribute('data-app');
  });
});
