// src/controllers/auth.controller.js
// Maneja registro, login, cambio de contraseña y configuración inicial del negocio.

const supabaseAdmin   = require('../config/supabaseAdmin');
const supabase        = require('../config/supabase');
const businessService = require('../services/business.service');
const notificationService = require('../services/notification.service');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_REGEX  = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Horario por defecto de cada profesional creado en el onboarding (lun–vie).
// Sin horario nadie podría reservar; el dueño lo ajusta después en el panel.
const DEFAULT_SCHEDULE = { days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00' };

/**
 * POST /api/auth/register
 * Body: { email, password, confirmPassword, firstName, lastName }
 * Crea el usuario en Supabase Auth. El negocio se crea después en el onboarding.
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

    if (!EMAIL_REGEX.test(email)) {
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
      // Supabase: code "email_exists" o mensaje "...has already been registered"
      if (authError.code === 'email_exists' || /already\s+(been\s+)?registered/i.test(authError.message)) {
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

    // Cliente desechable: ver comentario en config/supabase.js
    const { data, error } = await supabase.createAuthClient().auth.signInWithPassword({
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
 * POST /api/auth/forgot-password
 * Body: { email }
 * Envía un correo con un enlace de un solo uso para crear una contraseña nueva.
 * Responde SIEMPRE lo mismo, exista o no el email, para no revelar quién tiene cuenta.
 */
async function forgotPassword(req, res) {
  const GENERIC = { message: 'Si el correo está registrado, te enviamos un enlace para recuperar tu contraseña.' };

  try {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Ingresa un email válido' });
    }

    // Responder ya: el envío no debe delatar (por tiempo) si la cuenta existe
    res.json(GENERIC);

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) return; // email sin cuenta: no se envía nada

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5500').replace(/\/+$/, '');
    const link = `${frontendUrl}/reset-password.html?token=${encodeURIComponent(tokenHash)}`;

    const sent = await notificationService.sendPasswordResetEmail(email, link);
    if (!sent && process.env.NODE_ENV !== 'production') {
      // En desarrollo sin Resend configurado, el enlace se ve en la consola del backend
      console.log(`[auth] (dev) enlace de recuperación para ${email}: ${link}`);
    }
  } catch (err) {
    console.error('[auth.controller] forgotPassword:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'No pudimos procesar la solicitud' });
  }
}

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }
 * Canjea el token del correo (un solo uso, vence en 1 hora) y fija la contraseña nueva.
 */
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'El enlace y la nueva contraseña son requeridos' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    // Cliente desechable: ver comentario en config/supabase.js
    const { data, error: verifyErr } = await supabase.createAuthClient().auth.verifyOtp({
      token_hash: token,
      type:       'recovery',
    });
    if (verifyErr || !data?.user) {
      return res.status(400).json({ error: 'El enlace no es válido o ya venció. Solicita uno nuevo.' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, { password: newPassword });
    if (error) throw error;

    res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });

  } catch (err) {
    console.error('[auth.controller] resetPassword:', err.message);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
}

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 * Requiere sesión. Verifica la contraseña actual antes de cambiarla.
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'La contraseña actual y la nueva son requeridas' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    const { error: verifyErr } = await supabase.createAuthClient().auth.signInWithPassword({
      email:    req.user.email,
      password: currentPassword,
    });
    if (verifyErr) {
      return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password: newPassword });
    if (error) throw error;

    res.json({ message: 'Contraseña actualizada' });

  } catch (err) {
    console.error('[auth.controller] changePassword:', err.message);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
}

/**
 * POST /api/auth/setup-business
 * Crea el negocio del usuario recién registrado.
 * Solo se llama una vez, desde el onboarding.
 */
async function setupBusiness(req, res) {
  let createdBusinessId = null;

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

    if (!SLUG_REGEX.test(slug) || slug.length > 60) {
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
    const { data: existingBiz } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)
      .maybeSingle();

    if (existingBiz) {
      return res.status(409).json({ error: 'Ya tienes un negocio registrado' });
    }

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
    createdBusinessId = business.id;

    // 2. Crear servicios si se enviaron
    let createdServices = [];
    if (Array.isArray(services) && services.length > 0) {
      const serviceRows = services
        .filter(s => s.name && s.duration_min)
        .map(s => ({
          business_id:  business.id,
          name:         String(s.name).trim(),
          description:  s.description || null,
          duration_min: parseInt(s.duration_min, 10),
          price:        parseFloat(s.price) || 0,
          is_active:    true
        }))
        .filter(s => s.duration_min >= 5 && s.duration_min <= 480);

      if (serviceRows.length > 0) {
        const { data, error: svcErr } = await supabase.from('services').insert(serviceRows).select('id');
        if (svcErr) throw svcErr;
        createdServices = data;
      }
    }

    // 3. Crear profesionales si se enviaron
    let createdPros = [];
    if (Array.isArray(professionals) && professionals.length > 0) {
      const proRows = professionals
        .filter(p => p.name)
        .map(p => ({
          business_id: business.id,
          name:        String(p.name).trim(),
          email:       p.email || null,
          phone:       p.phone || null,
          bio:         p.bio   || null,
          is_active:   true
        }));

      if (proRows.length > 0) {
        const { data, error: proErr } = await supabase.from('professionals').insert(proRows).select('id');
        if (proErr) throw proErr;
        createdPros = data;
      }
    }

    // 4. Dejar el negocio listo para recibir reservas: cada profesional ofrece
    //    todos los servicios y tiene un horario base. Si esto falla no se
    //    revierte el negocio; el dueño puede configurarlo desde el panel.
    await setupDefaults(createdPros, createdServices);

    res.status(201).json({
      message: 'Negocio configurado correctamente',
      business: { id: business.id, name: business.name, slug: business.slug }
    });

  } catch (err) {
    console.error('[auth.controller] setupBusiness:', err.message);

    // Evitar un negocio a medio crear que bloquee un segundo intento
    // ("Ya tienes un negocio registrado"). Las filas hijas caen por cascada
    // o quedan huérfanas sin dueño visible.
    if (createdBusinessId) {
      await supabase.from('services').delete().eq('business_id', createdBusinessId);
      await supabase.from('professionals').delete().eq('business_id', createdBusinessId);
      await supabase.from('businesses').delete().eq('id', createdBusinessId);
    }

    res.status(500).json({ error: 'Error al configurar el negocio' });
  }
}

async function setupDefaults(professionals, services) {
  try {
    if (professionals.length && services.length) {
      const links = professionals.flatMap(p =>
        services.map(s => ({ professional_id: p.id, service_id: s.id }))
      );
      const { error } = await supabaseAdmin.from('professional_services').insert(links);
      if (error) throw error;
    }

    if (professionals.length) {
      const rows = professionals.flatMap(p =>
        DEFAULT_SCHEDULE.days.map(d => ({
          professional_id: p.id,
          day_of_week:     d,
          start_time:      DEFAULT_SCHEDULE.start_time,
          end_time:        DEFAULT_SCHEDULE.end_time,
        }))
      );
      const { error } = await supabase.from('schedules').insert(rows);
      if (error) throw error;
    }
  } catch (err) {
    console.warn('[auth.controller] setupDefaults (no crítico):', err.message);
  }
}

async function getMyBusiness(req, res) {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, slug, business_type, phone, address, plan')
      .eq('owner_id', req.user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'No tienes un negocio registrado' });
    }

    res.json({ data });
  } catch (err) {
    console.error('[auth.controller] getMyBusiness:', err.message);
    res.status(500).json({ error: 'Error al obtener tu negocio' });
  }
}

module.exports = { register, login, forgotPassword, resetPassword, changePassword, setupBusiness, getMyBusiness };
