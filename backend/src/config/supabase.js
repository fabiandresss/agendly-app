// src/config/supabase.js
// Este archivo crea y exporta la conexión a Supabase
// Se importa en cualquier parte del código que necesite hablar con la DB

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;