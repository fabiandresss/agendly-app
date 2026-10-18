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

const WHATSAPP_FROM = (() => {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) return from;
  return from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
})();

// Remitente de los correos. 'onboarding@resend.dev' es el remitente de PRUEBA
// de Resend (solo entrega al correo del dueño de la cuenta). En producción
// define EMAIL_FROM con un dominio verificado en Resend.
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

const getFrontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5500').replace(/\/+$/, '');

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
  return `whatsapp:${String(phone).replace(/[^\d+]/g, '')}`;
}

/** Escapa texto del usuario antes de meterlo en HTML (emails). */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  if (!twilioClient || !WHATSAPP_FROM || !to) return false;

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

function buildClientConfirmationWA({ clientName, businessName, serviceName, professionalName, scheduledAt, cancelToken, frontendUrl }) {
  const dateReadable  = formatDateTime(scheduledAt);
  const cancelLink    = `${frontendUrl}/cancel.html?token=${cancelToken}`;
  const reschedLink   = `${frontendUrl}/reschedule.html?token=${cancelToken}`;

  return [
    `✅ *Reserva registrada en ${businessName}*`,
    ``,
    `Hola ${clientName}, tu hora quedó agendada (el negocio la confirmará pronto):`,
    ``,
    `📋 *Servicio:* ${serviceName}`,
    `👤 *Profesional:* ${professionalName}`,
    `📅 *Fecha y hora:* ${dateReadable}`,
    ``,
    `🔄 Reagendar: ${reschedLink}`,
    `❌ Cancelar: ${cancelLink}`,
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

function buildReminderWA({ clientName, businessName, serviceName, professionalName, scheduledAt, cancelToken, frontendUrl }) {
  const lines = [
    `⏰ *Recordatorio de tu reserva*`,
    ``,
    `Hola ${clientName}, te recordamos tu hora en *${businessName}*:`,
    ``,
    `📋 *Servicio:* ${serviceName}`,
    `👤 *Profesional:* ${professionalName}`,
    `📅 *Fecha y hora:* ${formatDateTime(scheduledAt)}`,
  ];

  if (cancelToken) {
    lines.push(
      ``,
      `🔄 Reagendar: ${frontendUrl}/reschedule.html?token=${cancelToken}`,
      `❌ Cancelar: ${frontendUrl}/cancel.html?token=${cancelToken}`,
    );
  }

  lines.push(``, `_Mensaje automático de AGENDLY_`);
  return lines.join('\n');
}

/**
 * Genera el HTML del email de confirmación.
 * Diseño minimalista compatible con la mayoría de clientes de email.
 */
function buildConfirmationEmailHTML(data) {
  const clientName       = escapeHtml(data.clientName);
  const businessName     = escapeHtml(data.businessName);
  const serviceName      = escapeHtml(data.serviceName);
  const professionalName = escapeHtml(data.professionalName);
  const dateReadable     = escapeHtml(formatDateTime(data.scheduledAt));
  const cancelLink       = `${data.frontendUrl}/cancel.html?token=${encodeURIComponent(data.cancelToken)}`;
  const reschedLink      = `${data.frontendUrl}/reschedule.html?token=${encodeURIComponent(data.cancelToken)}`;

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f8f7ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e3ff;">
        <tr>
          <td style="background:#4f46e5;padding:28px 40px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">AGENDLY</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Confirmación de reserva</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 20px;font-size:15px;color:#1e1b4b;">
              Hola <strong>${clientName}</strong>, tu reserva en <strong>${businessName}</strong> fue registrada.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7ff;border-radius:12px;border:1px solid #e5e3ff;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <table width="100%" cellpadding="6" cellspacing="0">
                  <tr>
                    <td style="color:#6b7280;font-size:12px;width:120px;">Servicio</td>
                    <td style="color:#1e1b4b;font-size:14px;font-weight:600;">${serviceName}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;font-size:12px;">Profesional</td>
                    <td style="color:#1e1b4b;font-size:14px;font-weight:600;">${professionalName}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;font-size:12px;">Fecha y hora</td>
                    <td style="color:#4f46e5;font-size:14px;font-weight:700;">${dateReadable}</td>
                  </tr>
                </table>
              </td></tr>
            </table>
            <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
              Si necesitas cambiar o cancelar tu reserva, puedes hacerlo hasta el día de la cita.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:8px;background:#eef2ff;">
                  <a href="${reschedLink}" style="display:inline-block;padding:10px 20px;color:#4f46e5;font-size:13px;font-weight:600;text-decoration:none;">
                    Reagendar mi reserva
                  </a>
                </td>
                <td width="10"></td>
                <td style="border-radius:8px;background:#fee2e2;">
                  <a href="${cancelLink}" style="display:inline-block;padding:10px 20px;color:#dc2626;font-size:13px;font-weight:600;text-decoration:none;">
                    Cancelar mi reserva
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f7ff;padding:16px 40px;text-align:center;border-top:1px solid #e5e3ff;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">Enviado automáticamente por AGENDLY</p>
          </td>
        </tr>
      </table>
    </td></tr>
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
  const frontendUrl  = getFrontendUrl();
  const cancelToken  = appointment.cancel_token;

  const waMessage = buildClientConfirmationWA({
    clientName:       appointment.client_name,
    businessName,
    serviceName,
    professionalName,
    scheduledAt:      appointment.scheduled_at,
    cancelToken,
    frontendUrl,
  });

  const htmlMessage = buildConfirmationEmailHTML({
    clientName:       appointment.client_name,
    businessName,
    serviceName,
    professionalName,
    scheduledAt:      appointment.scheduled_at,
    cancelToken,
    frontendUrl,
  });

  return Promise.allSettled([
    sendWhatsApp(appointment.client_phone, waMessage),
    sendEmail(
      appointment.client_email,
      `✅ Reserva registrada en ${businessName}`,
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
  const frontendUrl = getFrontendUrl();

  const message = buildReminderWA({
    clientName:       appointment.client_name,
    businessName:     appointment.businesses?.name    ?? 'el negocio',
    serviceName:      appointment.services?.name      ?? 'tu servicio',
    professionalName: appointment.professionals?.name ?? 'tu profesional',
    scheduledAt:      appointment.scheduled_at,
    cancelToken:      appointment.cancel_token ?? null,
    frontendUrl,
  });

  return sendWhatsApp(appointment.client_phone, message);
}

/**
 * Notifica al dueño que una reserva fue cancelada por el cliente.
 */
async function notifyOwnerCancellation(appointment, businessName) {
  if (!appointment.businesses?.phone) return false;

  const message = [
    `🚫 *Reserva cancelada en ${businessName}*`,
    ``,
    `El cliente canceló su reserva:`,
    ``,
    `👤 *Cliente:* ${appointment.client_name}`,
    `📋 *Servicio:* ${appointment.services?.name ?? '—'}`,
    `👤 *Profesional:* ${appointment.professionals?.name ?? '—'}`,
    `📅 *Fecha:* ${formatDateTime(appointment.scheduled_at)}`,
    ``,
    `_Cancelado desde el link de la reserva_`,
  ].join('\n');

  return sendWhatsApp(appointment.businesses.phone, message);
}

/**
 * Notifica al cliente que su reserva fue reagendada.
 */
async function notifyClientRescheduled(appointment) {
  const frontendUrl = getFrontendUrl();
  const cancelLink  = `${frontendUrl}/cancel.html?token=${appointment.cancel_token}`;
  const reschedLink = `${frontendUrl}/reschedule.html?token=${appointment.cancel_token}`;

  const message = [
    `🔄 *Reserva reagendada en ${appointment.businesses?.name ?? 'el negocio'}*`,
    ``,
    `Hola ${appointment.client_name}, tu hora fue actualizada:`,
    ``,
    `📋 *Servicio:* ${appointment.services?.name ?? '—'}`,
    `👤 *Profesional:* ${appointment.professionals?.name ?? '—'}`,
    `📅 *Nueva fecha:* ${formatDateTime(appointment.scheduled_at)}`,
    ``,
    `🔄 Reagendar: ${reschedLink}`,
    `❌ Cancelar: ${cancelLink}`,
    ``,
    `_Mensaje automático de AGENDLY_`,
  ].join('\n');

  return sendWhatsApp(appointment.client_phone, message);
}

module.exports = {
  sendWhatsApp,
  sendEmail,
  notifyAppointmentCreated,
  notifyOwnerNewAppointment,
  notifyAppointmentReminder,
  notifyOwnerCancellation,
  notifyClientRescheduled,
};