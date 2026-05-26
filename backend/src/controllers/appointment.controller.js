// controllers/appointment.controller.js

const businessService    = require('../services/business.service');
const appointmentService = require('../services/appointment.service');
const authService = require('../services/auth.service');
const notificationService = require('../services/notification.service');

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

    // ── Validar formato de fecha ──
    const scheduled = new Date(scheduledAt);
    if (isNaN(scheduled.getTime())) {
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
    const supabase = require('../config/supabase');
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

    // ── Verificar horario del profesional ──
    const inSchedule = await appointmentService.isProfessionalAvailableBySchedule(
      professionalId, scheduled
    );
    if (!inSchedule) {
      return res.status(409).json({ error: 'El profesional no trabaja en ese horario' });
    }

    // ── Verificar conflicto con otras reservas ──
    const hasConflict = await appointmentService.hasProfessionalConflict(
      professionalId, scheduled.toISOString(), endsAt.toISOString()
    );
    if (hasConflict) {
      return res.status(409).json({ error: 'El profesional ya tiene una reserva en ese horario' });
    }

    // ── Crear la reserva ──
    const appointment = await appointmentService.createAppointment({
      businessId:     business.id,
      serviceId,
      professionalId,
      clientName,
      clientPhone,
      clientEmail,
      scheduledAt:    scheduled.toISOString(),
      endsAt:         endsAt.toISOString(),
      notes,
    });

    // ── Responder al cliente INMEDIATAMENTE ──
    // La notificación se envía DESPUÉS de responder.
    // El cliente no espera a que Twilio termine.
    res.status(201).json({
      message: 'Reserva creada exitosamente',
      data:    appointment,
    });


    // ── Notificaciones — fire and forget ──────────────────────────
    // Se ejecutan DESPUÉS de responder. Si fallan, no afectan a nada.
    // Promise.allSettled garantiza que ambas corren aunque una falle.

    Promise.allSettled([

      // 1. WhatsApp + Email al cliente
      notificationService
        .notifyAppointmentCreated(appointment, business.name, service.name, professional.name)
        .catch(err => console.error('[controller] notifyAppointmentCreated:', err.message)),

      // 2. WhatsApp al dueño del negocio
      notificationService
        .notifyOwnerNewAppointment(appointment, business, service.name, professional.name)
        .catch(err => console.error('[controller] notifyOwnerNewAppointment:', err.message)),

    ]);
    // ─────────────────────────────────────────────────────────────

  } catch (err) {
    console.error('[appointment.controller] createAppointment:', err.message);
    res.status(500).json({ error: 'Error al crear la reserva' });
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
    res.status(code).json({ error: err.message });
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

    // Obtener el negocio directamente sin pasar por verifyBusinessOwnership
    // para dar un mensaje de error más claro
    const supabase = require('../config/supabase');
    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('slug', businessSlug)
      .eq('is_active', true)
      .single();

    if (bizErr || !business) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    if (business.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para gestionar este negocio' });
    }

    const updated = await appointmentService.updateAppointmentStatus(id, business.id, status);
    res.json({ message: 'Estado actualizado', data: updated });

  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[appointment.controller] updateStatus:', err.message);
    res.status(code).json({ error: err.message });
  }
}

module.exports = { createAppointment, getAppointments, updateStatus };