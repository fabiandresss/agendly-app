// services/business.service.js
// Toda la lógica relacionada con negocios vive aquí.
// Esta capa NO sabe nada de HTTP: no usa req, res, ni status codes.

const supabase      = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Busca un negocio por su slug público.
 * Retorna null si no existe o está inactivo.
 */
async function getBusinessBySlug(slug) {
  // Perfil completo (lo usan profile.html y la configuración del panel) y,
  // si la base aún no tiene las columnas opcionales, solo los campos básicos.
  const FULL  = 'id, name, slug, business_type, phone, email, address, plan, description, photo_url, instagram, facebook, whatsapp_contact, cancellation_min_hours';
  const BASIC = 'id, name, slug, phone, email, address, plan';

  const query = cols => supabase
    .from('businesses')
    .select(cols)
    .eq('slug', slug)
    .eq('is_active', true)
    .single(); // espera exactamente 1 resultado

  let { data, error } = await query(FULL);
  if (error && error.code === '42703') { // undefined_column
    console.warn('[business.service] Faltan columnas opcionales en businesses; usando campos básicos');
    ({ data, error } = await query(BASIC));
  }

  if (error) {
    // "PGRST116" es el código de Supabase para "0 filas encontradas"
    if (error.code === 'PGRST116') return null;
    throw error; // cualquier otro error es inesperado — lo propagamos
  }

  return data;
}

/**
 * Retorna los servicios activos de un negocio.
 */
async function getServicesByBusiness(businessId) {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, description, duration_min, price')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data;
}

/**
 * Retorna los profesionales activos que ofrecen un servicio.
 * Un profesional sin ningún servicio asignado se considera que ofrece todos
 * (misma regla que usa la disponibilidad), así un negocio recién creado
 * puede recibir reservas sin configuración extra.
 */
async function getProfessionalsByService(businessId, serviceId) {
  const professionals = await getProfessionalsByBusiness(businessId);
  if (professionals.length === 0) return [];

  const { data: links, error } = await supabaseAdmin
    .from('professional_services')
    .select('professional_id, service_id')
    .in('professional_id', professionals.map(p => p.id));

  if (error) throw error;

  const withAssignments = new Set(links.map(l => l.professional_id));
  const offering        = new Set(links.filter(l => l.service_id === serviceId).map(l => l.professional_id));

  return professionals.filter(p => !withAssignments.has(p.id) || offering.has(p.id));
}

/**
 * Retorna los profesionales activos de un negocio.
 */
async function getProfessionalsByBusiness(businessId) {
  const { data, error } = await supabase
    .from('professionals')
    .select('id, name, bio')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data;
}

module.exports = {
  getBusinessBySlug,
  getServicesByBusiness,
  getProfessionalsByBusiness,
  getProfessionalsByService,
};

