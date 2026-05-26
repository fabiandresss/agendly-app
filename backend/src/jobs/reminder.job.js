// src/jobs/reminder.job.js
// Job programado que busca reservas del día siguiente y envía recordatorios.
//
// Se ejecuta cada hora en punto (cron: "0 * * * *").
// Usa reminder_sent para garantizar que cada cliente recibe exactamente
// un recordatorio, sin importar cuántas veces corra el job.

'use strict';

const cron         = require('node-cron');
const supabase     = require('../config/supabase');
const notification = require('../services/notification.service');

/**
 * Calcula el rango de timestamps que cubre "mañana completo"
 * en la timezone configurada (America/Santiago).
 *
 * Retorna { start: Date, end: Date } en UTC, que es lo que
 * Supabase almacena internamente.
 */
function getTomorrowRange() {
  const now      = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  // Inicio: mañana a las 00:00:00 hora local
  const start = new Date(tomorrow);
  start.setHours(0, 0, 0, 0);

  // Fin: mañana a las 23:59:59 hora local
  const end = new Date(tomorrow);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Lógica principal del job.
 * Se puede llamar también manualmente para pruebas.
 */
async function runReminderJob() {
  console.log(`[reminder.job] Ejecutando — ${new Date().toISOString()}`);

  const { start, end } = getTomorrowRange();

  try {
    // Buscar reservas confirmadas de mañana que NO hayan recibido recordatorio
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        client_name,
        client_phone,
        scheduled_at,
        businesses    ( name ),
        services      ( name ),
        professionals ( name )
      `)
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .gte('scheduled_at', start.toISOString())
      .lte('scheduled_at', end.toISOString());

    if (error) {
      console.error('[reminder.job] Error al consultar reservas:', error.message);
      return;
    }

    if (!appointments || appointments.length === 0) {
      console.log('[reminder.job] Sin recordatorios para enviar hoy');
      return;
    }

    console.log(`[reminder.job] ${appointments.length} recordatorio(s) a enviar`);

    // Procesar cada reserva de forma secuencial para no saturar la API de Twilio
    for (const appointment of appointments) {
      try {
        const sent = await notification.notifyAppointmentReminder(appointment);

        if (sent) {
          // Marcar como enviado SOLO si el WhatsApp llegó correctamente
          // Así si falla, el próximo ciclo del job lo reintenta
          const { error: updateError } = await supabase
            .from('appointments')
            .update({ reminder_sent: true })
            .eq('id', appointment.id);

          if (updateError) {
            console.error(
              `[reminder.job] No se pudo marcar reminder_sent para ${appointment.id}:`,
              updateError.message
            );
          } else {
            console.log(`[reminder.job] Recordatorio enviado → ${appointment.client_name} (${appointment.client_phone})`);
          }
        } else {
          // El servicio de notificación devolvió false — lo registramos
          // pero NO marcamos reminder_sent, el job lo intentará de nuevo
          console.warn(`[reminder.job] Falló envío → ${appointment.client_name} — se reintentará`);
        }

      } catch (apptErr) {
        // Error inesperado en una reserva — continuar con las demás
        console.error(`[reminder.job] Error en reserva ${appointment.id}:`, apptErr.message);
      }
    }

    console.log('[reminder.job] Ciclo completado');

  } catch (err) {
    // Error general del job — no debe tumbar el servidor
    console.error('[reminder.job] Error general:', err.message);
  }
}

/**
 * Registra el job en el scheduler de node-cron.
 * "0 * * * *" = al inicio de cada hora (00:00, 01:00, 02:00...)
 *
 * En producción podrías cambiarlo a "0 9 * * *" para que corra
 * una vez al día a las 9am, ya que las reservas tienen 24h de anticipación.
 */
function scheduleReminderJob() {
  cron.schedule('0 * * * *', runReminderJob, {
    timezone: 'America/Santiago',
  });

  console.log('[reminder.job] Programado — corre cada hora en punto');
}

module.exports = { scheduleReminderJob, runReminderJob };