# AGENDLY

Plataforma de reservas online para negocios (barberías, peluquerías, spas, clínicas…).
Cada negocio tiene su página pública con un `slug`; sus clientes reservan sin crear cuenta
y reciben confirmación y recordatorio por WhatsApp (Twilio) y correo (Resend).

## Estructura

```
backend/    API REST (Node.js + Express 5 + Supabase)
frontend/   Páginas HTML estáticas (sin build)
```

## Puesta en marcha

### Backend

```bash
cd backend
npm install
cp .env.example .env     # completa los valores
npm start                # o: node index.js
```

**Base de datos:** en Supabase → SQL Editor ejecuta una sola vez cada script de [`backend/db/`](backend/db):

- [`anti-doble-reserva.sql`](backend/db/anti-doble-reserva.sql): impide que un profesional tenga dos reservas
  activas que se solapen, incluso si dos clientes reservan a la vez.
- [`cancelacion-anticipacion.sql`](backend/db/cancelacion-anticipacion.sql): agrega la anticipación mínima
  (en horas) para cancelar/reagendar, configurable por negocio.

Variables en [`backend/.env.example`](backend/.env.example). Las imprescindibles son las de Supabase;
sin Twilio/Resend la app funciona, solo que no envía notificaciones.

### Frontend

Sirve la carpeta `frontend/` con cualquier servidor estático (por ejemplo la extensión *Live Server*
de VS Code, puerto 5500). Alternativa sin instalar nada y sin caché:

```bash
python .claude/dev_server.py 5500 frontend
```

- En `localhost` el frontend usa `http://localhost:3000` como API.
- En producción edita `AGENDLY_PROD_API` en [`frontend/config.js`](frontend/config.js) con la URL de tu backend,
  y define `FRONTEND_URL` y `CORS_ORIGIN` en el `.env` del backend.

## Páginas

| Página | Para quién | Qué hace |
|---|---|---|
| `register.html`, `login.html` | Dueño | Crear cuenta / iniciar sesión |
| `forgot-password.html`, `reset-password.html` | Dueño | Recuperar contraseña con un enlace enviado por correo |
| `onboarding.html` | Dueño | Crea el negocio, servicios y profesionales (con horario lun–vie 9–18 por defecto) |
| `app.html?negocio=slug` | Dueño | Panel: dashboard, reservas, **calendario** (día, semana, mes y año), servicios, profesionales, horarios, bloqueos, clientes, configuración |
| `profile.html?negocio=slug` | Público | Perfil del negocio |
| `index.html?negocio=slug` | Cliente | Reservar hora: encabezado del negocio (foto, tipo, descripción, contacto y redes), flujo de 4 pasos y resumen lateral con duración, total y política de cancelación |
| `cancel.html?token=…`, `reschedule.html?token=…` | Cliente | Cancelar / reagendar con el link recibido |


## Modo móvil

Todas las páginas están pensadas para celular (probadas en 375 px, tablet y escritorio):

- Campos de 16 px (evita el zoom automático de iPhone) y botones/enlaces de al menos 40 px de alto.
- Página de reservas del cliente: encabezado compacto con el nombre y contacto del negocio, horarios en 4 columnas
  y botones Volver/Continuar fijos al pie de la pantalla (al alcance del pulgar).
- En el panel, el menú lateral es un cajón con fondo oscuro, y las reservas se muestran como tarjetas con sus
  acciones a la vista en vez de una tabla con scroll lateral.
- Calendario en celular: **Día** y **Semana** pasan a una agenda por día, **Mes** muestra puntos de color por
  estado (se toca un día para abrirlo) y **Año** apila los 12 meses.
- Los modales se abren como hoja inferior y hacen scroll interno si el contenido es largo.

## Reglas de agenda

- Todas las horas se calculan en la zona `BUSINESS_TIMEZONE` (por defecto `America/Santiago`),
  sin importar la zona del servidor.
- Un profesional puede tener varios tramos por día. La reserva debe caber completa en un tramo.
- Los **bloqueos** (feriados, vacaciones) cierran la agenda del negocio o de un profesional.
- Un profesional sin servicios asignados ofrece todos.
- **Reservas vencidas:** una reserva pendiente cuya fecha ya pasó nunca se confirmó, así que se muestra como
  **Vencida** y ya no se puede confirmar, reagendar ni cancelar (el servidor lo rechaza). No cuenta como pendiente
  ni como ingreso proyectado; en Reservas tiene su propio filtro y en el calendario se ven al activar
  "Ver canceladas y vencidas". Una reserva confirmada que ya pasó solo se puede marcar como completada.
- **Cancelar / reagendar:** el cliente puede hacerlo con su link hasta N horas antes (por defecto 2; se cambia en
  Configuración → Mi negocio → Cancelaciones; 0 = sin restricción). Si ya no está a tiempo, la página le muestra el
  teléfono del negocio. El dueño siempre puede cancelar y reagendar desde el panel, sin esa restricción.
- **Calendario** con cuatro vistas (se recuerda la última usada):
  - **Día**: una columna por profesional, con las reservas según su hora y duración.
  - **Semana**: lunes a domingo, con línea de la hora actual; clic en el encabezado de un día para abrirlo.
  - **Mes**: cuadrícula con las reservas de cada día y "+N más"; clic en un día para abrirlo.
  - **Año**: 12 mini-meses con mapa de calor según la cantidad de reservas; clic en un mes o un día para bajar de nivel.

  Todas permiten filtrar por profesional, ver canceladas y muestran los bloqueos (feriados, vacaciones) sombreados.
  Al hacer clic en una reserva se abre su detalle con las acciones de confirmar, completar, reagendar y cancelar.
- **Avisos al cliente:** recibe WhatsApp (y correo si lo dejó) cuando el dueño confirma, cancela o reagenda su reserva.
- **Recuperar contraseña:** el enlace del correo es de un solo uso y vence en 1 hora. Los correos salen por Resend:
  en producción define `EMAIL_FROM` con un dominio verificado, o solo llegarán al dueño de la cuenta de Resend.
- Doble reserva imposible: la base de datos rechaza una reserva que se solape con otra activa del mismo profesional.
- Un recordatorio por WhatsApp sale ~24 h antes de cada reserva pendiente o confirmada.

## Pruebas manuales

[`backend/test.http`](backend/test.http) tiene peticiones de ejemplo (extensión *REST Client* de VS Code).
