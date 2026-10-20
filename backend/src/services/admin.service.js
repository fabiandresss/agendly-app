'use strict';

const supabase      = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { todayStr, isValidDateStr, toMinutes } = require('../utils/time');

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

/** Valida y normaliza los campos de un servicio. `partial` = solo valida lo enviado. */
function validateServiceFields(f, partial) {
  const out = {};
  if (!partial || f.name !== undefined) {
    const name = String(f.name ?? '').trim();
    if (!name || name.length > 100) throw badRequest('El nombre del servicio debe tener entre 1 y 100 caracteres');
    out.name = name;
  }
  if (!partial || f.duration_min !== undefined) {
    const dur = Number(f.duration_min);
    if (!Number.isInteger(dur) || dur < 5 || dur > 480) throw badRequest('La duración debe ser un entero entre 5 y 480 minutos');
    out.duration_min = dur;
  }
  if (f.price !== undefined) {
    const price = Number(f.price);
    if (!Number.isFinite(price) || price < 0) throw badRequest('El precio no puede ser negativo');
    out.price = price;
  } else if (!partial) {
    out.price = 0;
  }
  if (f.description !== undefined) out.description = f.description ? String(f.description).trim() : null;
  if (f.is_active !== undefined)   out.is_active = Boolean(f.is_active);
  return out;
}

/** Lanza 404 si el profesional no pertenece al negocio. */
async function assertProfessionalInBusiness(businessId, professionalId) {
  const { data, error } = await supabase
    .from('professionals')
    .select('id')
    .eq('id', professionalId)
    .eq('business_id', businessId)
    .maybeSingle();

  // 22P02 = UUID mal formado en la URL → se trata como "no encontrado"
  if (error && error.code !== '22P02') throw error;
  if (!data) {
    const err = new Error('Profesional no encontrado');
    err.statusCode = 404;
    throw err;
  }
}

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
  const clean = validateServiceFields(fields, false);

  const { data, error } = await supabase
    .from('services')
    .insert({ business_id: businessId, ...clean })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateService(businessId, serviceId, fields) {
  // Solo permitir actualizar campos específicos — nunca business_id
  const allowed = ['name', 'description', 'duration_min', 'price', 'is_active'];
  const picked  = Object.fromEntries(
    Object.entries(fields ?? {}).filter(([k]) => allowed.includes(k))
  );
  if (Object.keys(picked).length === 0) throw badRequest('No hay campos válidos para actualizar');
  const updates = validateServiceFields(picked, true);

  const { data, error } = await supabase
    .from('services')
    .update(updates)
    .eq('id', serviceId)
    .eq('business_id', businessId)   // seguridad: solo toca sus propios servicios
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116' || error.code === '22P02') {
      const err = new Error('Servicio no encontrado');
      err.statusCode = 404;
      throw err;
    }
    throw error;
  }
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
  if (!String(name ?? '').trim()) throw badRequest('El nombre es requerido');

  const { data, error } = await supabase
    .from('professionals')
    .insert({
      business_id: businessId,
      name:        String(name).trim(),
      email:       email || null,
      phone:       phone || null,
      bio:         bio   || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateProfessional(businessId, professionalId, fields) {
  const allowed = ['name', 'email', 'phone', 'bio', 'is_active'];
  const updates = Object.fromEntries(
    Object.entries(fields ?? {}).filter(([k]) => allowed.includes(k))
  );
  if (Object.keys(updates).length === 0) throw badRequest('No hay campos válidos para actualizar');
  if (updates.name !== undefined && !String(updates.name).trim()) throw badRequest('El nombre es requerido');

  const { data, error } = await supabase
    .from('professionals')
    .update(updates)
    .eq('id', professionalId)
    .eq('business_id', businessId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116' || error.code === '22P02') {
      const err = new Error('Profesional no encontrado');
      err.statusCode = 404;
      throw err;
    }
    throw error;
  }
  return data;
}

// ─── HORARIOS ────────────────────────────────────────────────────
// Usamos PUT (reemplazar todo) en lugar de PATCH por fila.
// Es más simple: envías el array completo de tramos
// y reemplazamos todos los de ese profesional de una vez.

async function getSchedules(businessId, professionalId) {
  await assertProfessionalInBusiness(businessId, professionalId);

  const { data, error } = await supabase
    .from('schedules')
    .select('id, day_of_week, start_time, end_time')
    .eq('professional_id', professionalId)
    .order('day_of_week')
    .order('start_time');

  if (error) throw error;
  return data;
}

/**
 * Reemplaza todos los horarios de un profesional.
 * @param {Array} schedules - [{day_of_week, start_time, end_time}]
 */
async function replaceSchedules(businessId, professionalId, schedules) {
  await assertProfessionalInBusiness(businessId, professionalId);

  // Validar y normalizar cada horario antes de tocar la DB
  const normalized = schedules.map(s => {
    const day = Number(s.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw badRequest(`day_of_week inválido: ${s.day_of_week}`);
    }
    if (!TIME_REGEX.test(s.start_time ?? '') || !TIME_REGEX.test(s.end_time ?? '')) {
      throw badRequest('start_time y end_time son requeridos con formato HH:MM');
    }
    const start = s.start_time.slice(0, 5);
    const end   = s.end_time.slice(0, 5);
    if (toMinutes(start) >= toMinutes(end)) {
      throw badRequest(`start_time debe ser menor que end_time (día ${day})`);
    }
    return { day_of_week: day, start_time: start, end_time: end };
  });

  // Tramos del mismo día no pueden solaparse
  const byDay = {};
  for (const s of normalized) (byDay[s.day_of_week] ??= []).push(s);
  for (const [day, rows] of Object.entries(byDay)) {
    rows.sort((x, y) => toMinutes(x.start_time) - toMinutes(y.start_time));
    for (let i = 1; i < rows.length; i++) {
      if (toMinutes(rows[i].start_time) < toMinutes(rows[i - 1].end_time)) {
        throw badRequest(`Los horarios del día ${day} se solapan`);
      }
    }
  }

  // Eliminar horarios existentes y reemplazar — todo en secuencia
  const { error: deleteErr } = await supabase
    .from('schedules')
    .delete()
    .eq('professional_id', professionalId);

  if (deleteErr) throw deleteErr;

  if (normalized.length === 0) return [];

  const rows = normalized.map(s => ({ professional_id: professionalId, ...s }));

  const { data, error: insertErr } = await supabase
    .from('schedules')
    .insert(rows)
    .select();

  if (insertErr) throw insertErr;
  return data;
}

// ─── NEGOCIO ─────────────────────────────────────────────────────

async function updateBusiness(businessId, fields) {
  const allowed = ['name', 'phone', 'address', 'description', 'photo_url', 'instagram', 'facebook', 'whatsapp_contact', 'cancellation_min_hours'];
  const updates = Object.fromEntries(
    Object.entries(fields ?? {}).filter(([k]) => allowed.includes(k))
  );
  if (Object.keys(updates).length === 0) throw badRequest('No hay campos válidos para actualizar');
  if (updates.name !== undefined && !String(updates.name).trim()) throw badRequest('El nombre es requerido');
  if (updates.cancellation_min_hours !== undefined) {
    const h = Number(updates.cancellation_min_hours);
    if (!Number.isInteger(h) || h < 0 || h > 168) throw badRequest('La anticipación debe ser un entero entre 0 y 168 horas');
    updates.cancellation_min_hours = h;
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(updates)
    .eq('id', businessId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── FOTO DEL NEGOCIO ────────────────────────────────────────────

const PHOTO_BUCKET = 'business-photos';
const PHOTO_MAX_BYTES = 1024 * 1024;

function detectImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

async function ensurePhotoBucket() {
  const { error } = await supabaseAdmin.storage.createBucket(PHOTO_BUCKET, { public: true, fileSizeLimit: PHOTO_MAX_BYTES });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

// Borra del Storage la foto anterior solo si es una de las que subimos nosotros.
async function removeStoredPhoto(url) {
  const marker = `/${PHOTO_BUCKET}/`;
  const i = typeof url === 'string' ? url.indexOf(marker) : -1;
  if (i === -1) return;
  await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([decodeURIComponent(url.slice(i + marker.length).split('?')[0])]);
}

async function uploadBusinessPhoto(biz, buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw badRequest('No se recibió ninguna imagen');
  if (buf.length > PHOTO_MAX_BYTES) throw badRequest('La imagen no puede pesar más de 1 MB');
  const img = detectImage(buf);
  if (!img) throw badRequest('Formato no válido. Usa una imagen JPG, PNG o WebP');

  await ensurePhotoBucket();
  const path = `${biz.id}/logo-${Date.now()}.${img.ext}`;
  const { error: upErr } = await supabaseAdmin.storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: img.type, cacheControl: '31536000' });
  if (upErr) throw upErr;
  const { data: pub } = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(path);

  const { data: prev } = await supabase.from('businesses').select('photo_url').eq('id', biz.id).single();
  const updated = await updateBusiness(biz.id, { photo_url: pub.publicUrl });
  await removeStoredPhoto(prev?.photo_url).catch(() => {});
  return updated;
}

async function deleteBusinessPhoto(biz) {
  const { data: prev } = await supabase.from('businesses').select('photo_url').eq('id', biz.id).single();
  const { data, error } = await supabase.from('businesses').update({ photo_url: null }).eq('id', biz.id).select().single();
  if (error) throw error;
  await removeStoredPhoto(prev?.photo_url).catch(() => {});
  return data;
}

// ─── BLOQUEOS ────────────────────────────────────────────────────

async function listBlocks(businessId) {
  const { data, error } = await supabase
    .from('blocks')
    .select('id, name, start_date, end_date, professional_id')
    .eq('business_id', businessId)
    .gte('end_date', todayStr())
    .order('start_date');
  if (error) throw error;
  return data;
}

async function createBlock(businessId, fields) {
  const { name, start_date, end_date, professional_id } = fields;

  if (!isValidDateStr(start_date) || !isValidDateStr(end_date)) {
    throw badRequest('Las fechas deben tener formato YYYY-MM-DD');
  }
  if (start_date > end_date) throw badRequest('start_date debe ser antes que end_date');
  if (professional_id) await assertProfessionalInBusiness(businessId, professional_id);

  const { data, error } = await supabase
    .from('blocks')
    .insert({
      business_id:     businessId,
      name:            String(name).trim(),
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

// ─── SERVICIOS POR PROFESIONAL ───────────────────────────────────

async function getProfessionalServices(businessId, professionalId) {
  await assertProfessionalInBusiness(businessId, professionalId);

  const { data, error } = await supabaseAdmin
    .from('professional_services')
    .select('service_id, services(id, name, duration_min, price)')
    .eq('professional_id', professionalId);
  if (error) throw error;
  return data.map(r => r.services).filter(Boolean);
}

async function setProfessionalServices(businessId, professionalId, serviceIds) {
  await assertProfessionalInBusiness(businessId, professionalId);
  serviceIds = [...new Set(serviceIds)];

  if (serviceIds.length > 0) {
    const { data: svcs, error: svcErr } = await supabaseAdmin
      .from('services')
      .select('id')
      .eq('business_id', businessId)
      .in('id', serviceIds);
    if (svcErr) throw svcErr;
    if (svcs.length !== serviceIds.length) {
      throw badRequest('Uno o más servicios no pertenecen a este negocio');
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

module.exports = {
  listServices, createService, updateService,
  listProfessionals, createProfessional, updateProfessional,
  getSchedules, replaceSchedules,
  updateBusiness, uploadBusinessPhoto, deleteBusinessPhoto,
  listBlocks, createBlock, deleteBlock,
  getProfessionalServices, setProfessionalServices,
};
