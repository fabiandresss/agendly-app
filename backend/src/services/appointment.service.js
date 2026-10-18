// services/appointment.service.js
// Lógica de negocio para reservas: validaciones de disponibilidad y creación.
// Todas las decisiones de calendario se toman en la zona horaria del negocio
// (ver utils/time.js), no en la del servidor.

const crypto   = require('crypto');
const supabase = require('../config/supabase');
const {
  partsInTz, zonedToUtc, weekdayOf, dayRange, toMinutes,
} = require('../utils/time');

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Postgres: exclusion_violation. La tabla appointments tiene la restricción
// appointments_no_overlap (ver backend/db/anti-doble-reserva.sql): aunque dos
// clientes pasen la validación a la vez, la base rechaza la segunda reserva.
const EXCLUSION_VIOLATION = '23P01';

function throwIfOverlap(error) {
  if (error && error.code === EXCLUSION_VIOLATION) {
    throw httpError('El profesional ya tiene una reserva en ese horario', 409);
  }
}

// ─────────────────────────────────────────────────────────
//  VALIDACIONES DE HORARIO / BLOQUEOS / CONFLICTOS
// ─────────────────────────────────────────────────────────

/**
 * Devuelve los tramos de trabajo del profesional para un día de la semana.
 * Puede haber más de un tramo por día (ej: 09-13 y 15-19).
 */
async function getScheduleRows(professionalId, dayOfWeek) {
  const { data, error } = await supabase
    .from('schedules')
    .select('start_time, end_time')
    .eq('professional_id', professionalId)
    .eq('day_of_week', dayOfWeek)
    .order('start_time');

  if (error) throw error;
  return data ?? [];
}

/**
 * Verifica que la reserva [scheduledAt, scheduledAt + durationMin] cabe
 * COMPLETA dentro de algún tramo de trabajo del profesional.
 */
async function isProfessionalAvailableBySchedule(professionalId, scheduledAt, durationMin = 0) {
  const p    = partsInTz(new Date(scheduledAt));
  const rows = await getScheduleRows(professionalId, p.weekday);

  const startMin = p.hour * 60 + p.minute;
  const endMin   = startMin + durationMin;

  return rows.some(r => startMin >= toMinutes(r.start_time) && endMin <= toMinutes(r.end_time));
}

/**
 * Busca un bloqueo (feriado, vacaciones…) que afecte al negocio completo o
 * al profesional en una fecha "YYYY-MM-DD". Retorna el bloqueo o null.
 */
async function getBlockForDate(businessId, professionalId, dateStr) {
  const { data, error } = await supabase
    .from('blocks')
    .select('id, name, professional_id')
    .eq('business_id', businessId)
    .lte('start_date', dateStr)
    .gte('end_date', dateStr);

  if (error) throw error;
  return (data ?? []).find(b => !b.professional_id || b.professional_id === professionalId) ?? null;
}

/**
 * ¿El profesional ofrece este servicio?
 * Sin filas en professional_services se entiende que ofrece todos
 * (misma regla que usa la disponibilidad y el listado público).
 */
async function professionalOffersService(professionalId, serviceId) {
  const { data, error } = await supabase
    .from('professional_services')
    .select('service_id')
    .eq('professional_id', professionalId);

  if (error) throw error;
  if (!data || data.length === 0) return true;
  return data.some(r => r.service_id === serviceId);
}

/**
 * Verifica que el profesional no tenga otra reserva en ese bloque de tiempo.
 * Detecta solapamientos: si la nueva reserva empieza antes de que termine la anterior.
 * @param {string} [excludeId] - id de una reserva a ignorar (al reagendar)
 */
async function hasProfessionalConflict(professionalId, scheduledAt, endsAt, excludeId = null) {
  let query = supabase
    .from('appointments')
    .select('id')
    .eq('professional_id', professionalId)
    .in('status', ['pending', 'confirmed'])
    .lt('scheduled_at', endsAt)    // la existente empieza antes de que termine la nueva
    .gt('ends_at', scheduledAt)    // la existente termina después de que empieza la nueva
    .limit(1);

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) throw error;
  return data.length > 0; // true = hay conflicto
}

/**
 * Valida todas las reglas de agenda para una hora solicitada.
 * Lanza un error con statusCode 409 si algo no se cumple.
 */
async function assertSlotBookable({ businessId, professionalId, serviceId, scheduled, durationMin, excludeId = null }) {
  if (serviceId && !(await professionalOffersService(professionalId, serviceId))) {
    throw httpError('Este profesional no ofrece ese servicio', 409);
  }

  const block = await getBlockForDate(businessId, professionalId, partsInTz(scheduled).dateStr);
  if (block) {
    throw httpError(`No hay atención ese día (${block.name})`, 409);
  }

  if (!(await isProfessionalAvailableBySchedule(professionalId, scheduled, durationMin))) {
    throw httpError('El profesional no trabaja en ese horario', 409);
  }

  const endsAt = new Date(scheduled.getTime() + durationMin * 60 * 1000);
  if (await hasProfessionalConflict(professionalId, scheduled.toISOString(), endsAt.toISOString(), excludeId)) {
    throw httpError('El profesional ya tiene una reserva en ese horario', 409);
  }
}

// ─────────────────────────────────────────────────────────
//  CRUD DE RESERVAS
// ─────────────────────────────────────────────────────────

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
      client_email:    clientEmail || null,
      scheduled_at:    scheduledAt,
      ends_at:         endsAt,
      status:          'pending',
      notes:           notes || null,
      cancel_token:    crypto.randomUUID(),
    })
    .select() // retorna el registro creado
    .single();

  throwIfOverlap(error);
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
      service_id,
      professional_id,
      services      ( name, duration_min, price ),
      professionals ( name )
    `)
    .eq('business_id', businessId)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return data;
}

// Reserva con todo lo necesario para validar y para avisar al cliente
const APPT_SELECT = `
  id, status, scheduled_at, ends_at, professional_id, service_id, cancel_token,
  client_name, client_phone, client_email,
  businesses(id, name, slug, phone, cancellation_min_hours),
  services(id, name, duration_min),
  professionals(name)
`;

/**
 * Actualiza el estado de una reserva del negocio.
 * Retorna { appointment, previousStatus } — appointment incluye los datos
 * relacionados (negocio, servicio, profesional) para poder notificar al cliente.
 */
async function updateAppointmentStatus(appointmentId, businessId, newStatus) {
  const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!validStatuses.includes(newStatus)) {
    throw httpError(`Estado inválido: ${newStatus}`, 400);
  }

  const { data: current, error: findErr } = await supabase
    .from('appointments')
    .select(APPT_SELECT)
    .eq('id', appointmentId)
    .eq('business_id', businessId)   // seguridad: solo toca reservas de este negocio
    .maybeSingle();

  // 22P02 = UUID mal formado en la URL
  if (findErr && findErr.code !== '22P02') throw findErr;
  if (!current) throw httpError('Reserva no encontrada', 404);

  const previousStatus = current.status;
  if (previousStatus === newStatus) return { appointment: current, previousStatus };

  const { error } = await supabase
    .from('appointments')
    .update({ status: newStatus })
    .eq('id', appointmentId)
    .eq('business_id', businessId);

  // Reactivar una reserva cancelada puede chocar con otra ya tomada en ese horario
  throwIfOverlap(error);
  if (error) throw error;

  return { appointment: { ...current, status: newStatus }, previousStatus };
}

// ─────────────────────────────────────────────────────────
//  DISPONIBILIDAD HORARIA
// ─────────────────────────────────────────────────────────

/**
 * Obtiene las reservas activas de un profesional para un día.
 * Solo trae reservas pending y confirmed — las canceladas no bloquean slots.
 * Incluye las que empiezan el día anterior pero se extienden hasta este día.
 *
 * @param {string} professionalId
 * @param {string} dateStr - "YYYY-MM-DD" (día del negocio)
 */
async function getBookedSlotsForDay(professionalId, dateStr, excludeId = null) {
  const { start, end } = dayRange(dateStr);

  let query = supabase
    .from('appointments')
    .select('scheduled_at, ends_at')
    .eq('professional_id', professionalId)
    .in('status', ['pending', 'confirmed'])
    .lt('scheduled_at', end.toISOString())
    .gt('ends_at', start.toISOString());

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
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
 * @param {string} dateStr      - Día "YYYY-MM-DD" (zona del negocio)
 * @param {string} startTime    - "HH:MM" hora de inicio (ej: "09:00")
 * @param {string} endTime      - "HH:MM" hora de cierre (ej: "18:00")
 * @param {number} durationMin  - Duración del servicio en minutos
 * @param {number} intervalMin  - Cada cuántos minutos generar un bloque
 * @returns {Array<{start: Date, end: Date, label: string}>}
 */
function generateCandidateSlots(dateStr, startTime, endTime, durationMin, intervalMin) {
  const slots = [];
  const openMinutes  = toMinutes(startTime);
  const closeMinutes = toMinutes(endTime);

  for (let current = openMinutes; current + durationMin <= closeMinutes; current += intervalMin) {
    const pad   = n => String(n).padStart(2, '0');
    const label = `${pad(Math.floor(current / 60))}:${pad(current % 60)}`;

    const start = zonedToUtc(dateStr, label);
    const end   = new Date(start.getTime() + durationMin * 60 * 1000);

    slots.push({ start, end, label });
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
 * @param {number} [params.intervalMin]    - Intervalo entre slots (15 o 30)
 * @param {string} [params.excludeId]      - Reserva a ignorar (la que se está reagendando)
 */
async function getAvailableSlots({ businessId, professionalId, serviceId, date, intervalMin, excludeId = null }) {
  const { data: service, error: svcErr } = await supabase
    .from('services')
    .select('duration_min, name')
    .eq('id', serviceId)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .single();

  if (svcErr || !service) {
    throw httpError('Servicio no encontrado o inactivo', 404);
  }

  const base = { date, service_name: service.name, duration_min: service.duration_min, interval_min: null };

  if (!(await professionalOffersService(professionalId, serviceId))) {
    return { ...base, available: false, reason: 'Este profesional no ofrece ese servicio', slots: [] };
  }

  const block = await getBlockForDate(businessId, professionalId, date);
  if (block) {
    return { ...base, available: false, reason: `No hay atención este día (${block.name})`, slots: [] };
  }

  const scheduleRows = await getScheduleRows(professionalId, weekdayOf(date));
  if (scheduleRows.length === 0) {
    return { ...base, available: false, reason: 'El profesional no trabaja este día', slots: [] };
  }

  const duration = service.duration_min;
  const interval = intervalMin && intervalMin < duration ? intervalMin : duration;

  const candidates = scheduleRows.flatMap(r =>
    generateCandidateSlots(date, r.start_time, r.end_time, duration, interval)
  );

  if (!candidates.length) {
    return { ...base, interval_min: interval, available: false, reason: 'La duración del servicio no cabe en el horario disponible', slots: [] };
  }

  const bookedSlots = await getBookedSlotsForDay(professionalId, date, excludeId);
  const now = new Date();

  // Sin horas pasadas (hoy), sin choques con reservas y sin duplicados entre tramos
  const slots = [...new Set(
    candidates
      .filter(c => c.start > now && !hasConflictWithBookings(c, bookedSlots))
      .map(c => c.label)
  )].sort();

  return {
    ...base,
    interval_min: interval,
    available:    slots.length > 0,
    reason:       slots.length > 0 ? null : 'No quedan horarios disponibles este día',
    slots,
  };
}

// ─────────────────────────────────────────────────────────
//  CANCELAR / REAGENDAR
// ─────────────────────────────────────────────────────────

/** Busca una reserva por su token (el que recibe el cliente en sus links). */
async function findByToken(token) {
  const { data, error } = await supabase
    .from('appointments')
    .select(APPT_SELECT)
    .eq('cancel_token', token)
    .maybeSingle();

  // 22P02 = token con formato inválido
  if (error && error.code !== '22P02') throw error;
  if (!data) throw httpError('Reserva no encontrada o token inválido', 404);
  return data;
}

/**
 * Política de anticipación mínima del negocio para cambios hechos por el cliente.
 * @returns {{ min_hours: number, deadline: string|null, can_modify: boolean }}
 */
function modificationPolicy(appt) {
  const minHours = appt.businesses?.cancellation_min_hours ?? 0;
  const deadline = new Date(new Date(appt.scheduled_at).getTime() - minHours * 3600 * 1000);
  return {
    min_hours:  minHours,
    deadline:   minHours > 0 ? deadline.toISOString() : null,
    can_modify: new Date() <= deadline && new Date(appt.scheduled_at) > new Date(),
  };
}

/** Lanza 409 si el cliente ya no está a tiempo de cancelar/reagendar online. */
function assertClientCanModify(appt, verb) {
  if (new Date(appt.scheduled_at) < new Date()) {
    throw httpError(`No se puede ${verb} una reserva pasada`, 409);
  }
  const { min_hours, can_modify } = modificationPolicy(appt);
  if (!can_modify) {
    const phone = appt.businesses?.phone;
    throw httpError(
      `Ya no puedes ${verb} esta reserva por internet: el negocio lo permite hasta ${min_hours} ` +
      `${min_hours === 1 ? 'hora' : 'horas'} antes de la cita.` +
      (phone ? ` Contáctalos al ${phone}.` : ' Contacta directamente al negocio.'),
      409
    );
  }
}

/** Datos de una reserva para las páginas de cancelar/reagendar, con su política. */
async function getByToken(token) {
  const appt = await findByToken(token);
  if (appt.status === 'cancelled') throw httpError('Esta reserva ya fue cancelada', 409);
  if (appt.status === 'completed') throw httpError('Esta reserva ya fue completada', 409);

  return {
    id:            appt.id,
    client_name:   appt.client_name,
    scheduled_at:  appt.scheduled_at,
    status:        appt.status,
    businesses:    { name: appt.businesses.name, slug: appt.businesses.slug, phone: appt.businesses.phone },
    services:      appt.services,
    professionals: { id: appt.professional_id, name: appt.professionals.name },
    policy:        modificationPolicy(appt),
  };
}

/** El cliente cancela con su link. Respeta la anticipación mínima del negocio. */
async function cancelByToken(token) {
  const appt = await findByToken(token);

  if (appt.status === 'cancelled') throw httpError('Esta reserva ya fue cancelada', 409);
  if (appt.status === 'completed') throw httpError('No se puede cancelar una reserva completada', 409);
  assertClientCanModify(appt, 'cancelar');

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appt.id);

  if (error) throw error;
  return { ...appt, status: 'cancelled' };
}

/**
 * Mueve una reserva a otra hora (núcleo común del reagendar del cliente y del dueño).
 * Aplica las mismas reglas que una reserva nueva y resetea el recordatorio.
 */
async function moveAppointment(appt, scheduled, newStatus) {
  if (scheduled < new Date()) throw httpError('No puedes reagendar en una fecha pasada', 400);

  const duration = appt.services.duration_min;
  const endsAt   = new Date(scheduled.getTime() + duration * 60 * 1000);

  // Mismas reglas que una reserva nueva (horario, bloqueos, conflictos),
  // ignorando la propia reserva.
  await assertSlotBookable({
    businessId:     appt.businesses.id,
    professionalId: appt.professional_id,
    serviceId:      appt.service_id,
    scheduled,
    durationMin:    duration,
    excludeId:      appt.id,
  });

  const { error } = await supabase
    .from('appointments')
    .update({
      scheduled_at:  scheduled.toISOString(),
      ends_at:       endsAt.toISOString(),
      status:        newStatus,
      reminder_sent: false, // la nueva fecha necesita su propio recordatorio
    })
    .eq('id', appt.id);

  throwIfOverlap(error);
  if (error) throw error;

  return { ...appt, scheduled_at: scheduled.toISOString(), ends_at: endsAt.toISOString(), status: newStatus };
}

/**
 * El cliente reagenda con su link. Respeta la anticipación mínima y deja la
 * reserva en "pending" (el negocio debe volver a confirmarla).
 * @param {Date} scheduled - nueva fecha/hora (ya parseada y válida)
 */
async function rescheduleByToken(token, scheduled) {
  const appt = await findByToken(token);

  if (appt.status === 'cancelled') throw httpError('Esta reserva fue cancelada y no puede reagendarse', 409);
  if (appt.status === 'completed') throw httpError('No se puede reagendar una reserva completada', 409);
  assertClientCanModify(appt, 'reagendar');

  return moveAppointment(appt, scheduled, 'pending');
}

/**
 * El dueño reagenda desde el panel. Sin anticipación mínima y conserva el estado.
 * @param {Date} scheduled - nueva fecha/hora (ya parseada y válida)
 */
async function rescheduleByOwner(appointmentId, businessId, scheduled) {
  const { data: appt, error } = await supabase
    .from('appointments')
    .select(APPT_SELECT)
    .eq('id', appointmentId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error && error.code !== '22P02') throw error;
  if (!appt) throw httpError('Reserva no encontrada', 404);
  if (appt.status === 'cancelled') throw httpError('Una reserva cancelada no puede reagendarse', 409);
  if (appt.status === 'completed') throw httpError('Una reserva completada no puede reagendarse', 409);

  return moveAppointment(appt, scheduled, appt.status);
}

module.exports = {
  isProfessionalAvailableBySchedule,
  hasProfessionalConflict,
  assertSlotBookable,
  createAppointment,
  getAppointmentsByBusiness,
  updateAppointmentStatus,
  getAvailableSlots,
  getByToken,
  cancelByToken,
  rescheduleByToken,
  rescheduleByOwner,
};
