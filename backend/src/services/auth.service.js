// src/services/auth.service.js
// Verifica que el usuario autenticado es dueño del negocio solicitado.
// Esta función se llama desde los controllers protegidos.

const supabase = require('../config/supabase');

/**
 * Busca el negocio por slug y verifica que el owner_id coincide
 * con el usuario autenticado. Lanza un error con statusCode si falla.
 */
async function verifyBusinessOwnership(slug, userId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, slug, owner_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    const err = new Error('Negocio no encontrado');
    err.statusCode = 404;
    throw err;
  }

  // Verificación crítica de seguridad:
  // el usuario del token debe ser el dueño del negocio
  if (data.owner_id !== userId) {
    const err = new Error('No tienes permiso para gestionar este negocio');
    err.statusCode = 403;
    throw err;
  }

  return data;
}

module.exports = { verifyBusinessOwnership };