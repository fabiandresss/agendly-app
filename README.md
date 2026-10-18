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

Variables en [`backend/.env.example`](backend/.env.example). Las imprescindibles son las de Supabase;
sin Twilio/Resend la app funciona, solo que no envía notificaciones.

### Frontend

Sirve la carpeta `frontend/` con cualquier servidor estático (por ejemplo la extensión *Live Server*
de VS Code, puerto 5500).

- En `localhost` el frontend usa `http://localhost:3000` como API.
- En producción edita `AGENDLY_PROD_API` en [`frontend/config.js`](frontend/config.js) con la URL de tu backend,
  y define `FRONTEND_URL` y `CORS_ORIGIN` en el `.env` del backend.

## Páginas

| Página | Para quién | Qué hace |
|---|---|---|
| `register.html`, `login.html` | Dueño | Crear cuenta / iniciar sesión |
| `onboarding.html` | Dueño | Crea el negocio, servicios y profesionales (con horario lun–vie 9–18 por defecto) |
| `app.html?negocio=slug` | Dueño | Panel: dashboard, reservas, servicios, profesionales, horarios, bloqueos, clientes, configuración |
| `profile.html?negocio=slug` | Público | Perfil del negocio |
| `index.html?negocio=slug` | Cliente | Reservar hora |
| `cancel.html?token=…`, `reschedule.html?token=…` | Cliente | Cancelar / reagendar con el link recibido |

`admin.html` y `dashboard.html` son la primera versión del panel; hoy todo vive en `app.html`.

## Reglas de agenda

- Todas las horas se calculan en la zona `BUSINESS_TIMEZONE` (por defecto `America/Santiago`),
  sin importar la zona del servidor.
- Un profesional puede tener varios tramos por día. La reserva debe caber completa en un tramo.
- Los **bloqueos** (feriados, vacaciones) cierran la agenda del negocio o de un profesional.
- Un profesional sin servicios asignados ofrece todos.
- Un recordatorio por WhatsApp sale ~24 h antes de cada reserva pendiente o confirmada.

## Pruebas manuales

[`backend/test.http`](backend/test.http) tiene peticiones de ejemplo (extensión *REST Client* de VS Code).
