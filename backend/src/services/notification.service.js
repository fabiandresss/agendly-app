// src/services/notification.service.js
// Canal único de notificaciones de AGENDLY.
// Maneja WhatsApp (Twilio) y Email (Resend).
//
// REGLA CARDINAL: ninguna función de este archivo lanza excepciones.
// Los errores se registran y se retorna false. Así el flujo de
// reservas nunca se interrumpe por un fallo de notificación.

'use strict';

const twilio = require('twilio');
const { Resend } = require('resend');

// ─── Inicialización de clientes ───────────────────────────────────

const twilioClient = (() => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.warn('[notification] Twilio no configurado — WhatsApp desactivado');
    return null;
  }
  return twilio(sid, token);
})();

const resendClient = (() => {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[notification] Resend no configurado — Email desactivado');
    return null;
  }
  return new Resend(key);
})();

const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const EMAIL_FROM    = 'onboarding@resend.dev'; // cambia esto

// ─── Utilidades ───────────────────────────────────────────────────

/**
 * Formatea una fecha ISO a texto legible en español chileno.
 * Ejemplo: "martes 15 de abril a las 10:30"
 */
function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString('es-CL', {
    weekday:  'long',
    day:      'numeric',
    month:    'long',
    hour:     '2-digit',
    minute:   '2-digit',
    timeZone: 'America/Santiago',
  });
}

/**
 * Normaliza un número de teléfono al formato que espera Twilio.
 * "+56 9 1234 5678" → "whatsapp:+56912345678"
 */
function toWhatsAppNumber(phone) {
  return `whatsapp:${phone.replace(/\s/g, '')}`;
}

// ─── Capa de transporte ───────────────────────────────────────────
// sendWhatsApp y sendEmail son las únicas funciones que hablan
// con APIs externas. Todo lo demás las llama a ellas.

/**
 * Envía un mensaje de WhatsApp.
 * @param {string} to      - Número en formato "+56912345678"
 * @param {string} message - Texto del mensaje
 * @returns {Promise<boolean>}
 */
async function sendWhatsApp(to, message) {
  if (!twilioClient) return false;

  try {
    const result = await twilioClient.messages.create({
      from: WHATSAPP_FROM,
      to:   toWhatsAppNumber(to),
      body: message,
    });
    console.log(`[notification] WhatsApp OK → ${to} | SID: ${result.sid}`);
    return true;
  } catch (err) {
    console.error(`[notification] WhatsApp ERROR → ${to} | ${err.message}`);
    return false;
  }
}

/**
 * Envía un email con HTML.
 * @param {string} to      - Email destino
 * @param {string} subject - Asunto
 * @param {string} html    - Cuerpo en HTML
 * @returns {Promise<boolean>}
 */
async function sendEmail(to, subject, html) {
  if (!resendClient) return false;
  if (!to) return false;

  try {
    const { error } = await resendClient.emails.send({
      from:    EMAIL_FROM,
      to,
      subject,
      html,
    });
    if (error) throw new Error(error.message);
    console.log(`[notification] Email OK → ${to} | ${subject}`);
    return true;
  } catch (err) {
    console.error(`[notification] Email ERROR → ${to} | ${err.message}`);
    return false;
  }
}

// ─── Constructores de mensajes ────────────────────────────────────
// Separar el texto de la lógica de envío permite editarlos
// sin tocar código de infraestructura.

function buildClientConfirmationWA({ clientName, businessName, serviceName, professionalName, scheduledAt }) {
  return [
    `✅ *Reserva confirmada en ${businessName}*`,
    ``,
    `Hola ${clientName}, tu hora quedó agendada:`,
    ``,
    `📋 *Servicio:* ${serviceName}`,
    `👤 *Profesional:* ${professionalName}`,
    `📅 *Fecha y hora:* ${formatDateTime(scheduledAt)}`,
    ``,
    `Si necesitas cancelar, contáctanos directamente.`,
    ``,
    `_Mensaje automático de AGENDLY_`,
  ].join('\n');
}

function buildOwnerAlertWA({ clientName, clientPhone, serviceName, professionalName, scheduledAt, businessName }) {
  return [
    `🔔 *Nueva reserva en ${businessName}*`,
    ``,
    `📋 *Servicio:* ${serviceName}`,
    `👤 *Profesional:* ${professionalName}`,
    `📅 *Fecha y hora:* ${formatDateTime(scheduledAt)}`,
    ``,
    `👤 *Cliente:* ${clientName}`,
    `📱 *Teléfono:* ${clientPhone}`,
    ``,
    `_AGENDLY — Panel de administración_`,
  ].join('\n');
}

function buildReminderWA({ clientName, businessName, serviceName, professionalName, scheduledAt }) {
  return [
    `⏰ *Recordatorio de tu reserva mañana*`,
    ``,
    `Hola ${clientName}, te recordamos tu hora en *${businessName}*:`,
    ``,
    `📋 *Servicio:* ${serviceName}`,
    `👤 *Profesional:* ${professionalName}`,
    `📅 *Fecha y hora:* ${formatDateTime(scheduledAt)}`,
    ``,
    `Te esperamos. Si necesitas cancelar, avísanos con anticipación.`,
    ``,
    `_Mensaje automático de AGENDLY_`,
  ].join('\n');
}

/**
 * Genera el HTML del email de confirmación.
 * Diseño minimalista compatible con la mayoría de clientes de email.
 */
function buildConfirmationEmailHTML({ clientName, businessName, serviceName, professionalName, scheduledAt }) {
  const dateReadable = formatDateTime(scheduledAt);

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f8f7ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      border:1px solid #e5e3ff;">

          <!-- Header -->
          <tr>
            <td style="background:#4f46e5;padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">
                AGENDLY
              </h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">
                Confirmación de reserva
              </p>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 24px;font-size:16px;color:#1e1b4b;">
                Hola <strong>${clientName}</strong>, tu reserva en
                <strong>${businessName}</strong> está confirmada.
              </p>

              <!-- Detalle de la reserva -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f8f7ff;border-radius:12px;
                            border:1px solid #e5e3ff;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">

                    <table width="100%" cellpadding="6" cellspacing="0">
                      <tr>
                        <td style="color:#6b7280;font-size:13px;width:130px;">
                          Servicio
                        </td>
                        <td style="color:#1e1b4b;font-size:14px;font-weight:600;">
                          ${serviceName}
                        </td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;font-size:13px;">
                          Profesional
                        </td>
                        <td style="color:#1e1b4b;font-size:14px;font-weight:600;">
                          ${professionalName}
                        </td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;font-size:13px;">
                          Fecha y hora
                        </td>
                        <td style="color:#4f46e5;font-size:14px;font-weight:700;">
                          ${dateReadable}
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
                Si necesitas cancelar o reagendar tu hora, contáctanos
                directamente. Este es un mensaje automático, no respondas a él.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f7ff;padding:20px 40px;text-align:center;
                       border-top:1px solid #e5e3ff;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Enviado automáticamente por AGENDLY
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

// ─── API pública del service ──────────────────────────────────────
// Estas son las funciones que llaman los controllers y jobs.
// Cada una combina constructor de mensaje + transporte.

/**
 * Notifica al CLIENTE que su reserva fue creada.
 * Envía WhatsApp + Email si tiene correo.
 */
async function notifyAppointmentCreated(appointment, businessName, serviceName, professionalName) {
  const waMessage = buildClientConfirmationWA({
    clientName:       appointment.client_name,
    businessName,
    serviceName,
    professionalName,
    scheduledAt:      appointment.scheduled_at,
  });

  const htmlMessage = buildConfirmationEmailHTML({
    clientName:       appointment.client_name,
    businessName,
    serviceName,
    professionalName,
    scheduledAt:      appointment.scheduled_at,
  });

  // Lanzar ambos en paralelo — no esperamos a que terminen
  return Promise.allSettled([
    sendWhatsApp(appointment.client_phone, waMessage),
    sendEmail(
      appointment.client_email,
      `✅ Reserva confirmada en ${businessName}`,
      htmlMessage
    ),
  ]);
}

/**
 * Notifica al DUEÑO del negocio que llegó una nueva reserva.
 * Usa el business.phone como destino.
 */
async function notifyOwnerNewAppointment(appointment, business, serviceName, professionalName) {
  // Si el negocio no tiene teléfono registrado, no hay a dónde enviar
  if (!business.phone) {
    console.log(`[notification] Dueño sin teléfono — negocio: ${business.name}`);
    return false;
  }

  const message = buildOwnerAlertWA({
    clientName:       appointment.client_name,
    clientPhone:      appointment.client_phone,
    serviceName,
    professionalName,
    scheduledAt:      appointment.scheduled_at,
    businessName:     business.name,
  });

  return sendWhatsApp(business.phone, message);
}

/**
 * Envía el recordatorio de 24h al CLIENTE.
 * Llamada desde el reminder job, no desde el controller.
 *
 * @param {object} appointment - Debe incluir datos del servicio y profesional
 *                               (con join desde Supabase)
 */
async function notifyAppointmentReminder(appointment) {
  const message = buildReminderWA({
    clientName:       appointment.client_name,
    businessName:     appointment.businesses?.name    ?? 'el negocio',
    serviceName:      appointment.services?.name      ?? 'tu servicio',
    professionalName: appointment.professionals?.name ?? 'tu profesional',
    scheduledAt:      appointment.scheduled_at,
  });

  return sendWhatsApp(appointment.client_phone, message);
}

module.exports = {
  sendWhatsApp,
  sendEmail,
  notifyAppointmentCreated,
  notifyOwnerNewAppointment,
  notifyAppointmentReminder,
};