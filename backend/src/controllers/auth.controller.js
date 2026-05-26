// src/controllers/auth.controller.js
// Maneja registro y login usando Supabase Auth.

const supabaseAdmin  = require('../config/supabaseAdmin');
const supabase       = require('../config/supabase');
const businessService = require('../services/business.service');

/**
 * POST /api/auth/register
 * Body: { email, password, businessSlug }
 * Crea el usuario en Supabase Auth y lo asocia al negocio.
 */
async function register(req, res) {
  try {
    const { email, password, confirmPassword, firstName, lastName } = req.body;

    // Validaciones
    if (!email || !password || !confirmPassword || !firstName || !lastName) {
      return res.status(400).json({
        error: 'Todos los campos son requeridos',
        fields: { email: !email, password: !password, confirmPassword: !confirmPassword, firstName: !firstName, lastName: !lastName }
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'El formato del email no es válido' });
    }

    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return res.status(409).json({ error: 'Este email ya está registrado' });
      }
      throw authError;
    }

    res.status(201).json({
      message: 'Cuenta creada correctamente',
      userId: authData.user.id
    });

  } catch (err) {
    console.error('[auth.controller] register:', err.message);
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Devuelve el access_token JWT que el frontend usará en cada request.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // No revelar si el email existe o no — mensaje genérico
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    res.json({
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id:    data.user.id,
        email: data.user.email,
      },
    });

  } catch (err) {
    console.error('[auth.controller] login:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
}

/**
 * POST /api/auth/setup-business
 * Crea el negocio del usuario recién registrado.
 * Solo se llama una vez, desde el onboarding.
 */
async function setupBusiness(req, res) {
  try {
    const {
      name, slug, businessType, address, phone,
      services, professionals
    } = req.body;

    const userId = req.user.id;

    // Validar campos mínimos
    if (!name || !slug || !businessType) {
      return res.status(400).json({ error: 'name, slug y businessType son requeridos' });
    }

    // Validar formato del slug
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug)) {
      return res.status(400).json({
        error: 'El slug solo puede contener letras minúsculas, números y guiones'
      });
    }

    // Verificar que el slug no esté tomado
    const existing = await businessService.getBusinessBySlug(slug);
    if (existing) {
      return res.status(409).json({ error: 'Este slug ya está en uso, elige otro' });
    }

    // Verificar que el usuario no tenga ya un negocio
    const { data: existingBiz } = await require('../config/supabase')
      .from('businesses')
      .select('id')
      .eq('owner_id', userId)
      .single();

    if (existingBiz) {
      return res.status(409).json({ error: 'Ya tienes un negocio registrado' });
    }

    const supabase = require('../config/supabase');

    // 1. Crear el negocio
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .insert({
        name,
        slug,
        business_type: businessType,
        address:  address  || null,
        phone:    phone    || null,
        owner_id: userId,
        plan:     'free',
        is_active: true
      })
      .select()
      .single();

    if (bizError) throw bizError;

    // 2. Crear servicios si se enviaron
    if (services && services.length > 0) {
      const serviceRows = services
        .filter(s => s.name && s.duration_min)
        .map(s => ({
          business_id:  business.id,
          name:         s.name,
          description:  s.description || null,
          duration_min: parseInt(s.duration_min),
          price:        parseFloat(s.price) || 0,
          is_active:    true
        }));

      if (serviceRows.length > 0) {
        const { error: svcErr } = await supabase.from('services').insert(serviceRows);
        if (svcErr) throw svcErr;
      }
    }

    // 3. Crear profesionales si se enviaron
    if (professionals && professionals.length > 0) {
      const proRows = professionals
        .filter(p => p.name)
        .map(p => ({
          business_id: business.id,
          name:        p.name,
          email:       p.email || null,
          phone:       p.phone || null,
          bio:         p.bio   || null,
          is_active:   true
        }));

      if (proRows.length > 0) {
        const { error: proErr } = await supabase.from('professionals').insert(proRows);
        if (proErr) throw proErr;
      }
    }

    res.status(201).json({
      message: 'Negocio configurado correctamente',
      business: { id: business.id, name: business.name, slug: business.slug }
    });

  } catch (err) {
    console.error('[auth.controller] setupBusiness:', err.message);
    res.status(500).json({ error: err.message || 'Error al configurar el negocio' });
  }
}

async function getMyBusiness(req, res) {
  try {
    const supabase = require('../config/supabase');
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, slug, business_type, phone, address, plan')
      .eq('owner_id', req.user.id)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'No tienes un negocio registrado' });
    }

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { register, login, setupBusiness, getMyBusiness };