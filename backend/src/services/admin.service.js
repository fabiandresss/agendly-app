'use strict';

const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');

// ─── SERVICIOS ────────────────────────────────────────────────────

async function listServices(businessId) {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, description, duration_min, price, is_active')
    .eq('business_id', businessId)
    .order('name');
  if (error) throw error;
  return data;
}

async function createService(businessId, fields) {
  const { name, description, duration_min, price } = fields;

  const { data, error } = await supabase
    .from('services')
    .insert({ business_id: businessId, name, description, duration_min, price })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateService(businessId, serviceId, fields) {
  // Solo permitir actualizar campos específicos — nunca business_id
  const allowed = ['name', 'description', 'duration_min', 'price', 'is_active'];
  const updates = Object.fromEntries(
    Object.entries(fields).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabase
    .from('services')
    .update(updates)
    .eq('id', serviceId)
    .eq('business_id', businessId)   // seguridad: solo toca sus propios servicios
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── PROFESIONALES ────────────────────────────────────────────────

async function listProfessionals(businessId) {
  const { data, error } = await supabase
    .from('professionals')
    .select('id, name, email, phone, bio, is_active')
    .eq('business_id', businessId)
    .order('name');
  if (error) throw error;
  return data;
}

async function createProfessional(businessId, fields) {
  const { name, email, phone, bio } = fields;

  const { data, error } = await supabase
    .from('professionals')
    .insert({ business_id: businessId, name, email, phone, bio })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateProfessional(businessId, professionalId, fields) {
  const allowed = ['name', 'email', 'phone', 'bio', 'is_active'];
  const updates = Object.fromEntries(
    Object.entries(fields).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabase
    .from('professionals')
    .update(updates)
    .eq('id', professionalId)
    .eq('business_id', businessId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── HORARIOS ────────────────────────────────────────────────────
// Usamos PUT (reemplazar todo) en lugar de PATCH por fila.
// Es más simple: envías el array completo de días activos
// y reemplazamos los 7 días de ese profesional de una vez.

async function getSchedules(businessId, professionalId) {
  // Primero verificar que el profesional pertenece al negocio
  const { data: pro, error: proErr } = await supabase
    .from('professionals')
    .select('id')
    .eq('id', professionalId)
    .eq('business_id', businessId)
    .single();

  if (proErr || !pro) {
    const err = new Error('Profesional no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const { data, error } = await supabase
    .from('schedules')
    .select('id, day_of_week, start_time, end_time')
    .eq('professional_id', professionalId)
    .order('day_of_week');

  if (error) throw error;
  return data;
}

/**
 * Reemplaza todos los horarios de un profesional.
 * @param {Array} schedules - [{day_of_week, start_time, end_time}]
 */
async function replaceSchedules(businessId, professionalId, schedules) {
  // Verificar propiedad
  const { data: pro, error: proErr } = await supabase
    .from('professionals')
    .select('id')
    .eq('id', professionalId)
    .eq('business_id', businessId)
    .single();

  if (proErr || !pro) {
    const err = new Error('Profesional no encontrado');
    err.statusCode = 404;
    throw err;
  }

  // Validar cada horario antes de tocar la DB
  for (const s of schedules) {
    if (s.day_of_week < 0 || s.day_of_week > 6) {
      const err = new Error(`day_of_week inválido: ${s.day_of_week}`);
      err.statusCode = 400;
      throw err;
    }
    if (!s.start_time || !s.end_time) {
      const err = new Error('start_time y end_time son requeridos');
      err.statusCode = 400;
      throw err;
    }
    if (s.start_time >= s.end_time) {
      const err = new Error(`start_time debe ser menor que end_time (día ${s.day_of_week})`);
      err.statusCode = 400;
      throw err;
    }
  }

  // Eliminar horarios existentes y reemplazar — todo en secuencia
  const { error: deleteErr } = await supabase
    .from('schedules')
    .delete()
    .eq('professional_id', professionalId);

  if (deleteErr) throw deleteErr;

  if (schedules.length === 0) return [];

  const rows = schedules.map(s => ({
    professional_id: professionalId,
    day_of_week:     s.day_of_week,
    start_time:      s.start_time,
    end_time:        s.end_time,
  }));

  const { data, error: insertErr } = await supabase
    .from('schedules')
    .insert(rows)
    .select();

  if (insertErr) throw insertErr;
  return data;
}

// Agregar al final, antes del module.exports

async function updateBusiness(businessId, fields) {
  const allowed = ['name', 'phone', 'address'];
  const updates = Object.fromEntries(
    Object.entries(fields).filter(([k]) => allowed.includes(k))
  );
  const { data, error } = await supabase
    .from('businesses')
    .update(updates)
    .eq('id', businessId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listBlocks(businessId) {
  const { data, error } = await supabase
    .from('blocks')
    .select('id, name, start_date, end_date, professional_id')
    .eq('business_id', businessId)
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('start_date');
  if (error) throw error;
  return data;
}

async function createBlock(businessId, fields) {
  const { name, start_date, end_date, professional_id } = fields;
  const { data, error } = await supabase
    .from('blocks')
    .insert({
      business_id:     businessId,
      name,
      start_date,
      end_date,
      professional_id: professional_id || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteBlock(businessId, blockId) {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('id', blockId)
    .eq('business_id', businessId);
  if (error) throw error;
}

async function getProfessionalServices(professionalId) {
  const { data, error } = await supabase
    .from('professional_services')
    .select('service_id, services(id, name, duration_min, price)')
    .eq('professional_id', professionalId);
  if (error) throw error;
  return data.map(r => r.services);
}


async function setProfessionalServices(businessId, professionalId, serviceIds) {
  // Verificar propiedad
  const { data: pro, error: proErr } = await supabaseAdmin
    .from('professionals')
    .select('id')
    .eq('id', professionalId)
    .eq('business_id', businessId)
    .single();

  if (proErr || !pro) {
    const err = new Error('Profesional no encontrado');
    err.statusCode = 404;
    throw err;
  }

  if (serviceIds.length > 0) {
    const { data: svcs, error: svcErr } = await supabaseAdmin
      .from('services')
      .select('id')
      .eq('business_id', businessId)
      .in('id', serviceIds);
    if (svcErr) throw svcErr;
    if (svcs.length !== serviceIds.length) {
      const err = new Error('Uno o más servicios no pertenecen a este negocio');
      err.statusCode = 400;
      throw err;
    }
  }

  const { error: delErr } = await supabaseAdmin
    .from('professional_services')
    .delete()
    .eq('professional_id', professionalId);
  if (delErr) throw delErr;

  if (serviceIds.length > 0) {
    const rows = serviceIds.map(sid => ({
      professional_id: professionalId,
      service_id:      sid,
    }));
    const { error: insErr } = await supabaseAdmin
      .from('professional_services')
      .insert(rows);
    if (insErr) throw insErr;
  }

  return serviceIds;
}

async function getProfessionalServices(professionalId) {
  const { data, error } = await supabaseAdmin
    .from('professional_services')
    .select('service_id, services(id, name, duration_min, price)')
    .eq('professional_id', professionalId);
  if (error) throw error;
  return data.map(r => r.services);
}

module.exports = {
  listServices, createService, updateService,
  listProfessionals, createProfessional, updateProfessional,
  getSchedules, replaceSchedules,
  updateBusiness,
  listBlocks, createBlock, deleteBlock,
  getProfessionalServices, setProfessionalServices, getProfessionalServices
};