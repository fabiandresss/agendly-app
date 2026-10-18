// src/config/supabase.js
// Este archivo crea y exporta la conexión a Supabase
// Se importa en cualquier parte del código que necesite hablar con la DB

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY');
}

const authOptions = {
  auth: {
    autoRefreshToken:   false,
    persistSession:     false,
    detectSessionInUrl: false,
  },
};

const supabase = createClient(supabaseUrl, supabaseKey, authOptions);

/**
 * Cliente desechable para verificar credenciales (signInWithPassword).
 * IMPORTANTE: nunca llamar signInWithPassword sobre el cliente compartido:
 * Supabase guardaría la sesión en memoria y TODAS las consultas siguientes
 * se ejecutarían con el token del último usuario que inició sesión.
 */
function createAuthClient() {
  return createClient(supabaseUrl, supabaseKey, authOptions);
}

module.exports = supabase;
module.exports.createAuthClient = createAuthClient;
