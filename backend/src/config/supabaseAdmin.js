// src/config/supabaseAdmin.js
// Cliente con privilegios de administrador.
// SOLO usar en el backend — nunca en el frontend.

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl      = process.env.SUPABASE_URL;
const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAdminKey) {
  throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el archivo .env');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseAdminKey, {
  auth: {
    autoRefreshToken: false,
    persistSession:   false,
  },
});

module.exports = supabaseAdmin;