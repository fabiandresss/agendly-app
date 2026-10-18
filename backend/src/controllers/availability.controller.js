// src/controllers/availability.controller.js
// Valida los parámetros de la request y llama al service de disponibilidad.

const supabase            = require('../config/supabase');
const businessService     = require('../services/business.service');
const appointmentService  = require('../services/appointment.service');
const { todayStr, isValidDateStr } = require('../utils/time');

/**
 * GET /api/availability
 * Query params requeridos: businessSlug, professionalId, serviceId, date
 * Query params opcionales: interval (15 o 30)
 */
async function getAvailability(req, res) {
  try {
    const { businessSlug, professionalId, serviceId, date, interval } = req.query;

    const missing = [];
    if (!businessSlug)   missing.push('businessSlug');
    if (!professionalId) missing.push('professionalId');
    if (!serviceId)      missing.push('serviceId');
    if (!date)           missing.push('date');
    if (missing.length)  return res.status(400).json({ error: 'Faltan parámetros', missing });

    if (!isValidDateStr(date)) {
      return res.status(400).json({ error: 'Formato de fecha inválido. Usar YYYY-MM-DD' });
    }

    // Comparación de strings "YYYY-MM-DD" en la zona horaria del negocio
    if (date < todayStr()) {
      return res.status(400).json({ error: 'No se puede consultar disponibilidad en fechas pasadas' });
    }

    const intervalMin = interval ? parseInt(interval, 10) : null;
    if (interval && ![15, 30].includes(intervalMin)) {
      return res.status(400).json({ error: 'El intervalo debe ser 15 o 30' });
    }

    const business = await businessService.getBusinessBySlug(businessSlug);
    if (!business) return res.status(404).json({ error: 'Negocio no encontrado' });

    const { data: professional, error: proErr } = await supabase
      .from('professionals')
      .select('id, name')
      .eq('id', professionalId)
      .eq('business_id', business.id)
      .eq('is_active', true)
      .single();
    if (proErr || !professional) return res.status(404).json({ error: 'Profesional no encontrado' });

    const result = await appointmentService.getAvailableSlots({
      businessId: business.id,
      professionalId,
      serviceId,
      date,
      intervalMin,
    });

    res.json({
      date:            result.date,
      business:        business.name,
      professional:    professional.name,
      service_name:    result.service_name,
      duration_min:    result.duration_min,
      interval_min:    result.interval_min,
      available:       result.available,
      reason:          result.reason ?? null,
      slots:           result.slots,
      total_available: result.slots.length,
    });

  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[availability.controller]', err.message);
    res.status(code).json({ error: code === 500 ? 'Error al consultar la disponibilidad' : err.message });
  }
}

module.exports = { getAvailability };
