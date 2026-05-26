// services/appointment.service.js
// Lógica de negocio para reservas: validaciones de disponibilidad y creación.

const supabase = require('../config/supabase');

/**
 * Verifica que el profesional trabaja ese día y en ese horario.
 */
async function isProfessionalAvailableBySchedule(professionalId, scheduledAt) {
  const date = new Date(scheduledAt);
  const dayOfWeek = date.getDay(); // 0=domingo, 1=lunes...
  
  // Formato HH:MM para comparar con los horarios guardados
  const timeStr = date.toTimeString().substring(0, 5);

  const { data, error } = await supabase
    .from('schedules')
    .select('id')
    .eq('professional_id', professionalId)
    .eq('day_of_week', dayOfWeek)
    .lte('start_time', timeStr) // start_time <= timeStr
    .gte('end_time', timeStr)   // end_time >= timeStr
    .single();

  if (error && error.code === 'PGRST116') return false; // no hay horario ese día
  if (error) throw error;
  return !!data;
}

/**
 * Verifica que el profesional no tenga otra reserva en ese bloque de tiempo.
 * Detecta solapamientos: si la nueva reserva empieza antes de que termine la anterior.
 */
async function hasProfessionalConflict(professionalId, scheduledAt, endsAt) {
  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .eq('professional_id', professionalId)
    .in('status', ['pending', 'confirmed'])
    .lt('scheduled_at', endsAt)    // la existente empieza antes de que termine la nueva
    .gt('ends_at', scheduledAt)    // la existente termina después de que empieza la nueva
    .limit(1);

  if (error) throw error;
  return data.length > 0; // true = hay conflicto
}

/**
 * Crea una nueva reserva.
 * Asume que las validaciones previas ya pasaron.
 */
async function createAppointment({
  businessId,
  serviceId,
  professionalId,
  clientName,
  clientPhone,
  clientEmail,
  scheduledAt,
  endsAt,
  notes,
}) {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      business_id:     businessId,
      service_id:      serviceId,
      professional_id: professionalId,
      client_name:     clientName,
      client_phone:    clientPhone,
      client_email:    clientEmail,
      scheduled_at:    scheduledAt,
      ends_at:         endsAt,
      status:          'pending',
      notes:           notes || null,
    })
    .select() // retorna el registro creado
    .single();

  if (error) throw error;
  return data;
}

/**
 * Retorna todas las reservas de un negocio con datos relacionados.
 * Usa "joins" de Supabase para traer nombre del servicio y profesional.
 */
async function getAppointmentsByBusiness(businessId) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id,
      client_name,
      client_phone,
      client_email,
      scheduled_at,
      ends_at,
      status,
      notes,
      services      ( name, duration_min, price ),
      professionals ( name )
    `)
    .eq('business_id', businessId)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Actualiza el estado de una reserva.
 * Valida que el nuevo estado sea uno de los valores permitidos.
 */
async function updateAppointmentStatus(appointmentId, businessId, newStatus) {
  const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!validStatuses.includes(newStatus)) {
    const err = new Error(`Estado inválido: ${newStatus}`);
    err.statusCode = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('appointments')
    .update({ status: newStatus })
    .eq('id', appointmentId)
    .eq('business_id', businessId)   // seguridad: solo toca reservas de este negocio
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      const err = new Error('Reserva no encontrada');
      err.statusCode = 404;
      throw err;
    }
    throw error;
  }

  return data;
}

// ─────────────────────────────────────────────────────────
//  DISPONIBILIDAD HORARIA
// ─────────────────────────────────────────────────────────

/**
 * Obtiene el horario laboral del profesional para un día específico.
 * Retorna null si el profesional no trabaja ese día.
 *
 * @param {string} professionalId - UUID del profesional
 * @param {Date}   date           - Fecha a consultar
 */

async function getProfessionalScheduleForDay(professionalId, date) {
  // Usar getDay() sobre fecha local es correcto siempre que
  // el objeto Date se construya con hora local (T12:00:00 sin Z)
  const dayOfWeek = new Date(date).getDay();

  const { data, error } = await supabase
    .from('schedules')
    .select('start_time, end_time')
    .eq('professional_id', professionalId)
    .eq('day_of_week', dayOfWeek);

  if (error) throw error;

  // Retornar el primer horario encontrado para ese día
  // (usamos .select() sin .single() para evitar el error PGRST116)
  if (!data || data.length === 0) return null;
  return data[0];
}

/**
 * Obtiene todas las reservas activas de un profesional para un día.
 * Solo trae reservas pending y confirmed — las canceladas no bloquean slots.
 *
 * @param {string} professionalId
 * @param {Date}   date           - El día a consultar (hora local)
 */

async function getBookedSlotsForDay(professionalId, date) {
  const d = new Date(date);

  // Construir inicio y fin del día en hora local
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

  const { data, error } = await supabase
    .from('appointments')
    .select('scheduled_at, ends_at')
    .eq('professional_id', professionalId)
    .in('status', ['pending', 'confirmed'])
    .gte('scheduled_at', dayStart.toISOString())
    .lte('scheduled_at', dayEnd.toISOString());

  if (error) throw error;

  return data.map(appt => ({
    start: new Date(appt.scheduled_at),
    end:   new Date(appt.ends_at),
  }));
}

/**
 * Genera todos los bloques de tiempo candidatos entre apertura y cierre.
 * El último bloque válido es aquel que termina exactamente en o antes del cierre.
 *
 * @param {Date}   baseDate     - El día base
 * @param {string} startTime    - "HH:MM" hora de inicio (ej: "09:00")
 * @param {string} endTime      - "HH:MM" hora de cierre (ej: "18:00")
 * @param {number} durationMin  - Duración del servicio en minutos
 * @param {number} intervalMin  - Cada cuántos minutos generar un bloque (15 o 30)
 * @returns {Array<{start: Date, end: Date, label: string}>}
 */
function generateCandidateSlots(baseDate, startTime, endTime, durationMin, intervalMin) {
  const slots = [];

  // Convertir "HH:MM" a minutos desde medianoche para operar con aritmética simple
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH,   endM  ] = endTime.split(':').map(Number);
  const openMinutes  = startH * 60 + startM;
  const closeMinutes = endH   * 60 + endM;

  // Iterar desde apertura hasta el último bloque que cabe antes del cierre
  for (let current = openMinutes; current + durationMin <= closeMinutes; current += intervalMin) {
    const slotStartH = Math.floor(current / 60);
    const slotStartM = current % 60;

    const slotEndMinutes = current + durationMin;
    const slotEndH = Math.floor(slotEndMinutes / 60);
    const slotEndM = slotEndMinutes % 60;

    // Construir objetos Date reales usando la fecha base
    const slotStart = new Date(baseDate);
    slotStart.setHours(slotStartH, slotStartM, 0, 0);

    const slotEnd = new Date(baseDate);
    slotEnd.setHours(slotEndH, slotEndM, 0, 0);

    // Label para la respuesta: "09:00", "09:30", etc.
    const label = `${String(slotStartH).padStart(2, '0')}:${String(slotStartM).padStart(2, '0')}`;

    slots.push({ start: slotStart, end: slotEnd, label });
  }

  return slots;
}

/**
 * Verifica si un bloque candidato se solapa con alguna reserva existente.
 *
 * La condición matemática de solapamiento entre [A,B] y [C,D] es:
 *   A < D  AND  C < B
 *
 * Usamos < estricto (no <=) para permitir reservas consecutivas:
 * una que termina a las 10:00 y otra que empieza a las 10:00 NO se solapan.
 *
 * @param {{start: Date, end: Date}} candidate - Bloque a evaluar
 * @param {Array<{start: Date, end: Date}>} bookedSlots - Reservas existentes
 */
function hasConflictWithBookings(candidate, bookedSlots) {
  return bookedSlots.some(booked =>
    candidate.start < booked.end && booked.start < candidate.end
  );
}

/**
 * Función principal de disponibilidad.
 * Orquesta todos los pasos y retorna los slots disponibles.
 *
 * @param {object} params
 * @param {string} params.businessId       - UUID del negocio
 * @param {string} params.professionalId   - UUID del profesional
 * @param {string} params.serviceId        - UUID del servicio
 * @param {string} params.date             - Fecha en formato "YYYY-MM-DD"
 * @param {number} [params.intervalMin=30] - Intervalo entre slots (15 o 30)
 *
 * @returns {{ slots: string[], date: string, unavailable: boolean }}
 */

async function getAvailableSlots({ businessId, professionalId, serviceId, date, intervalMin }) {
  // 1. Duración del servicio
  const { data: service, error: svcErr } = await supabase
    .from('services')
    .select('duration_min, name')
    .eq('id', serviceId)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .single();

  if (svcErr || !service) {
    const err = new Error('Servicio no encontrado o inactivo');
    err.statusCode = 404;
    throw err;
  }

  // 2. Verificar asignación profesional ↔ servicio
  // Solo si la tabla tiene datos — si está vacía, permitimos igual
  const { data: psRows } = await supabase
    .from('professional_services')
    .select('service_id')
    .eq('professional_id', professionalId);

  // Si el profesional tiene servicios asignados, verificar que este esté incluido
  if (psRows && psRows.length > 0) {
    const hasService = psRows.some(r => r.service_id === serviceId);
    if (!hasService) {
      return {
        date,
        available: false,
        reason:    'Este profesional no ofrece ese servicio',
        slots:     [],
      };
    }
  }
  // Si psRows está vacío asumimos que aún no se han asignado servicios
  // y no bloqueamos la disponibilidad

  // 3. Construir fecha base en hora local
  const [year, month, day] = date.split('-').map(Number);
  const baseDate = new Date(year, month - 1, day, 12, 0, 0);

  // 4. Horario del profesional ese día
  const schedule = await getProfessionalScheduleForDay(professionalId, baseDate);
  if (!schedule) {
    return {
      date,
      available: false,
      reason:    'El profesional no trabaja este día',
      slots:     [],
    };
  }

  const duration = service.duration_min;
  const interval = intervalMin && intervalMin < duration ? intervalMin : duration;

  // 5. Generar candidatos
  const candidates = generateCandidateSlots(
    baseDate,
    schedule.start_time,
    schedule.end_time,
    duration,
    interval
  );

  if (!candidates.length) {
    return {
      date,
      available: false,
      reason:    'La duración del servicio no cabe en el horario disponible',
      slots:     [],
    };
  }

  // 6. Reservas existentes
  const bookedSlots = await getBookedSlotsForDay(professionalId, baseDate);

  // 7. Filtrar
  const availableSlots = candidates
    .filter(c => !hasConflictWithBookings(c, bookedSlots))
    .map(c => c.label);

  return {
    date,
    available:    availableSlots.length > 0,
    service_name: service.name,
    duration_min: duration,
    interval_min: interval,
    slots:        availableSlots,
  };
}

module.exports = {
  isProfessionalAvailableBySchedule,
  hasProfessionalConflict,
  createAppointment,
  getAppointmentsByBusiness,
  updateAppointmentStatus,
  getAvailableSlots,         // nueva
};