// services/business.service.js
// Toda la lógica relacionada con negocios vive aquí.
// Esta capa NO sabe nada de HTTP: no usa req, res, ni status codes.

const supabase = require('../config/supabase');

/**
 * Busca un negocio por su slug público.
 * Retorna null si no existe o está inactivo.
 */
async function getBusinessBySlug(slug) {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, slug, phone, email, address, plan')
    .eq('slug', slug)
    .eq('is_active', true)
    .single(); // espera exactamente 1 resultado

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
 * Retorna los profesionales activos de un negocio.
 */
async function getProfessionalsByService(businessId, serviceId) {
  const { data, error } = await supabase
    .from('professional_services')
    .select('professionals!inner(id, name, bio, is_active)')
    .eq('professionals.business_id', businessId)
    .eq('professionals.is_active', true)
    .eq('service_id', serviceId);
  if (error) throw error;
  return data.map(r => r.professionals);
}

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

/**
 * Asocia un usuario recién registrado con su negocio.
 * Se llama desde el controller de registro.
 */
async function setBusinessOwner(slug, userId) {
  const { data, error } = await supabase
    .from('businesses')
    .update({ owner_id: userId })
    .eq('slug', slug)
    .is('owner_id', null)   // solo si aún no tiene dueño (seguridad)
    .select()
    .single();

  if (error || !data) {
    const err = new Error('No se pudo asociar el negocio. Verifica el slug o que no tenga ya un dueño asignado.');
    err.statusCode = 400;
    throw err;
  }

  return data;
}

module.exports = {
  getBusinessBySlug,
  getServicesByBusiness,
  getProfessionalsByBusiness,
  setBusinessOwner,
  getProfessionalsByService,
};

