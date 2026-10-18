// controllers/appointment.controller.js

const supabase            = require('../config/supabase');
const businessService     = require('../services/business.service');
const appointmentService  = require('../services/appointment.service');
const authService         = require('../services/auth.service');
const notificationService = require('../services/notification.service');
const { parseScheduledAt } = require('../utils/time');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;

async function createAppointment(req, res) {
  try {
    const {
      businessSlug,
      serviceId,
      professionalId,
      clientName,
      clientPhone,
      clientEmail,
      scheduledAt,
      notes,
    } = req.body;

    // ── Validaciones de campos requeridos ──
    const requiredFields = { businessSlug, serviceId, professionalId, clientName, clientPhone, scheduledAt };
    const missing = Object.entries(requiredFields)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (missing.length > 0) {
      return res.status(400).json({ error: 'Faltan campos requeridos', fields: missing });
    }

    // ── Validar formato de los datos del cliente ──
    const name  = String(clientName).trim();
    const phone = String(clientPhone).replace(/[\s\-().]/g, '');
    const email = clientEmail ? String(clientEmail).trim() : null;
    const note  = notes ? String(notes).trim().slice(0, 500) : null;

    if (!name || name.length > 100) {
      return res.status(400).json({ error: 'El nombre debe tener entre 1 y 100 caracteres' });
    }
    if (!PHONE_REGEX.test(phone)) {
      return res.status(400).json({ error: 'El teléfono no es válido (ej: +56912345678)' });
    }
    if (email && (!EMAIL_REGEX.test(email) || email.length > 254)) {
      return res.status(400).json({ error: 'El formato del email no es válido' });
    }

    // ── Validar fecha ──
    const scheduled = parseScheduledAt(scheduledAt);
    if (!scheduled) {
      return res.status(400).json({ error: 'El formato de scheduledAt no es válido' });
    }
    if (scheduled < new Date()) {
      return res.status(400).json({ error: 'No se puede reservar en una fecha pasada' });
    }

    // ── Verificar que el negocio existe ──
    const business = await businessService.getBusinessBySlug(businessSlug);
    if (!business) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    // ── Verificar que el servicio existe y pertenece al negocio ──
    const { data: service, error: svcError } = await supabase
      .from('services')
      .select('id, name, duration_min')
      .eq('id', serviceId)
      .eq('business_id', business.id)
      .eq('is_active', true)
      .single();

    if (svcError || !service) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    // ── Verificar que el profesional existe y pertenece al negocio ──
    const { data: professional, error: proError } = await supabase
      .from('professionals')
      .select('id, name')
      .eq('id', professionalId)
      .eq('business_id', business.id)
      .eq('is_active', true)
      .single();

    if (proError || !professional) {
      return res.status(404).json({ error: 'Profesional no encontrado' });
    }

    // ── Calcular ends_at usando la duración del servicio ──
    const endsAt = new Date(scheduled.getTime() + service.duration_min * 60 * 1000);

    // ── Reglas de agenda: servicio ofrecido, bloqueos, horario laboral, conflictos ──
    await appointmentService.assertSlotBookable({
      businessId:     business.id,
      professionalId,
      serviceId,
      scheduled,
      durationMin:    service.duration_min,
    });

    // ── Crear la reserva ──
    const appointment = await appointmentService.createAppointment({
      businessId:     business.id,
      serviceId,
      professionalId,
      clientName:     name,
      clientPhone:    phone,
      clientEmail:    email,
      scheduledAt:    scheduled.toISOString(),
      endsAt:         endsAt.toISOString(),
      notes:          note,
    });

    // ── Responder al cliente INMEDIATAMENTE ──
    // La notificación se envía DESPUÉS de responder.
    // El cliente no espera a que Twilio termine.
    res.status(201).json({
      message: 'Reserva creada exitosamente',
      data:    appointment,
    });

    // ── Notificaciones — fire and forget ──
    // Si fallan, no afectan a nada. allSettled garantiza que ambas corren.
    Promise.allSettled([
      notificationService.notifyAppointmentCreated(appointment, business.name, service.name, professional.name),
      notificationService.notifyOwnerNewAppointment(appointment, business, service.name, professional.name),
    ]).then(results => {
      results.forEach(r => {
        if (r.status === 'rejected') console.error('[controller] notificación:', r.reason?.message);
      });
    });

  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[appointment.controller] createAppointment:', err.message);
    res.status(code).json({ error: code === 500 ? 'Error al crear la reserva' : err.message });
  }
}

async function getAppointments(req, res) {
  try {
    const { slug } = req.params;

    // req.user viene del middleware — ya está verificado
    const business = await authService.verifyBusinessOwnership(slug, req.user.id);
    const appointments = await appointmentService.getAppointmentsByBusiness(business.id);

    res.json({ data: appointments });

  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[appointment.controller] getAppointments:', err.message);
    res.status(code).json({ error: code === 500 ? 'Error al obtener las reservas' : err.message });
  }
}

async function updateStatus(req, res) {
  try {
    const { id }         = req.params;
    const { status, businessSlug } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'El campo status es requerido' });
    }
    if (!businessSlug) {
      return res.status(400).json({ error: 'El campo businessSlug es requerido' });
    }

    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Estado inválido. Valores permitidos: ${validStatuses.join(', ')}` });
    }

    const business = await authService.verifyBusinessOwnership(businessSlug, req.user.id);
    const updated  = await appointmentService.updateAppointmentStatus(id, business.id, status);
    res.json({ message: 'Estado actualizado', data: updated });

  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[appointment.controller] updateStatus:', err.message);
    res.status(code).json({ error: code === 500 ? 'Error al actualizar el estado' : err.message });
  }
}

async function cancelByToken(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token requerido' });
    }

    const data = await appointmentService.cancelByToken(token);
    res.json({ message: 'Reserva cancelada correctamente', data: { id: data.id, status: data.status } });

    // Avisar al dueño (fire and forget)
    notificationService
      .notifyOwnerCancellation(data, data.businesses?.name ?? 'tu negocio')
      .catch(err => console.error('[controller] notifyOwnerCancellation:', err.message));

  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[appointment.controller] cancelByToken:', err.message);
    res.status(code).json({ error: code === 500 ? 'Error al cancelar la reserva' : err.message });
  }
}

async function getByToken(req, res) {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token requerido' });

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, client_name, scheduled_at, status,
        businesses(name, slug),
        services(id, name, duration_min),
        professionals(id, name)
      `)
      .eq('cancel_token', token)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (data.status === 'cancelled') return res.status(409).json({ error: 'Esta reserva ya fue cancelada' });
    if (data.status === 'completed') return res.status(409).json({ error: 'Esta reserva ya fue completada' });

    res.json({ data });
  } catch (err) {
    console.error('[appointment.controller] getByToken:', err.message);
    res.status(500).json({ error: 'Error al obtener la reserva' });
  }
}

async function rescheduleByToken(req, res) {
  try {
    const { token }       = req.query;
    const { scheduledAt } = req.body;

    if (!token)       return res.status(400).json({ error: 'Token requerido' });
    if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt es requerido' });

    const scheduled = parseScheduledAt(scheduledAt);
    if (!scheduled) return res.status(400).json({ error: 'El formato de scheduledAt no es válido' });

    const data = await appointmentService.rescheduleByToken(token, scheduled);

    res.json({
      message: 'Reserva reagendada correctamente',
      data: { id: data.id, scheduled_at: data.scheduled_at, ends_at: data.ends_at, status: data.status },
    });

    // Notificar al cliente (fire and forget)
    notificationService
      .notifyClientRescheduled(data)
      .catch(err => console.error('[controller] notifyClientRescheduled:', err.message));

  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[appointment.controller] rescheduleByToken:', err.message);
    res.status(code).json({ error: code === 500 ? 'Error al reagendar la reserva' : err.message });
  }
}

module.exports = { createAppointment, getAppointments, updateStatus, cancelByToken, getByToken, rescheduleByToken };
