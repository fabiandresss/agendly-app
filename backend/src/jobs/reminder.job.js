// src/jobs/reminder.job.js
// Job programado que busca reservas de las próximas 24 horas y envía recordatorios.
//
// Se ejecuta cada hora en punto (cron: "0 * * * *").
// Usa reminder_sent para garantizar que cada cliente recibe exactamente
// un recordatorio, sin importar cuántas veces corra el job.

'use strict';

const cron         = require('node-cron');
const supabase     = require('../config/supabase');
const notification = require('../services/notification.service');
const { TZ }       = require('../utils/time');

const HOURS_AHEAD = 24;

/**
 * Lógica principal del job.
 * Se puede llamar también manualmente para pruebas.
 *
 * Busca reservas que ocurren en las próximas 24 horas y aún no recibieron
 * recordatorio. Al correr cada hora, cada cliente lo recibe ~24h antes
 * (y no a medianoche, como pasaba al buscar "todo el día de mañana").
 */
async function runReminderJob() {
  console.log(`[reminder.job] Ejecutando — ${new Date().toISOString()}`);

  const now   = new Date();
  const limit = new Date(now.getTime() + HOURS_AHEAD * 60 * 60 * 1000);

  try {
    // Reservas pendientes o confirmadas que NO hayan recibido recordatorio
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        client_name,
        client_phone,
        scheduled_at,
        cancel_token,
        businesses    ( name ),
        services      ( name ),
        professionals ( name )
      `)
      .in('status', ['pending', 'confirmed'])
      .eq('reminder_sent', false)
      .gt('scheduled_at', now.toISOString())
      .lte('scheduled_at', limit.toISOString());

    if (error) {
      console.error('[reminder.job] Error al consultar reservas:', error.message);
      return;
    }

    if (!appointments || appointments.length === 0) {
      console.log('[reminder.job] Sin recordatorios para enviar');
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
 */
function scheduleReminderJob() {
  cron.schedule('0 * * * *', runReminderJob, {
    timezone: TZ,
  });

  console.log('[reminder.job] Programado — corre cada hora en punto');
}

module.exports = { scheduleReminderJob, runReminderJob };