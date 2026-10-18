'use strict';

const adminService = require('../services/admin.service');
const authService  = require('../services/auth.service');

// ── Helper reutilizable ──────────────────────────────────────────
async function getVerifiedBusiness(slug, userId) {
  return authService.verifyBusinessOwnership(slug, userId);
}

// ─── SERVICIOS ───────────────────────────────────────────────────

async function listServices(req, res) {
  try {
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.listServices(biz.id);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function createService(req, res) {
  try {
    const { name, description, duration_min, price } = req.body;
    if (!name || !duration_min) {
      return res.status(400).json({ error: 'name y duration_min son requeridos' });
    }
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.createService(biz.id, { name, description, duration_min, price });
    res.status(201).json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function updateService(req, res) {
  try {
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.updateService(biz.id, req.params.id, req.body);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

// ─── PROFESIONALES ───────────────────────────────────────────────

async function listProfessionals(req, res) {
  try {
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.listProfessionals(biz.id);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function createProfessional(req, res) {
  try {
    const { name, email, phone, bio } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.createProfessional(biz.id, { name, email, phone, bio });
    res.status(201).json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function updateProfessional(req, res) {
  try {
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.updateProfessional(biz.id, req.params.id, req.body);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

// ─── HORARIOS ────────────────────────────────────────────────────

async function getSchedules(req, res) {
  try {
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.getSchedules(biz.id, req.params.professionalId);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function replaceSchedules(req, res) {
  try {
    const { schedules } = req.body;
    if (!Array.isArray(schedules)) {
      return res.status(400).json({ error: 'schedules debe ser un array' });
    }
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.replaceSchedules(biz.id, req.params.professionalId, schedules);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

// ─── NEGOCIO Y BLOQUEOS ──────────────────────────────────────────

async function updateBusiness(req, res) {
  try {
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.updateBusiness(biz.id, req.body);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function listBlocks(req, res) {
  try {
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.listBlocks(biz.id);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function createBlock(req, res) {
  try {
    const { name, start_date, end_date, professional_id } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, start_date y end_date son requeridos' });
    }
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.createBlock(biz.id, { name, start_date, end_date, professional_id });
    res.status(201).json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function deleteBlock(req, res) {
  try {
    const biz = await getVerifiedBusiness(req.params.slug, req.user.id);
    await adminService.deleteBlock(biz.id, req.params.id);
    res.json({ message: 'Bloqueo eliminado' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function getProfessionalServices(req, res) {
  try {
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.getProfessionalServices(biz.id, req.params.professionalId);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function setProfessionalServices(req, res) {
  try {
    const { serviceIds } = req.body;
    if (!Array.isArray(serviceIds) || serviceIds.some(id => typeof id !== 'string')) {
      return res.status(400).json({ error: 'serviceIds debe ser un array de ids' });
    }
    const biz  = await getVerifiedBusiness(req.params.slug, req.user.id);
    const data = await adminService.setProfessionalServices(biz.id, req.params.professionalId, serviceIds);
    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = {
  listServices, createService, updateService,
  listProfessionals, createProfessional, updateProfessional,
  getSchedules, replaceSchedules,
  updateBusiness,
  listBlocks, createBlock, deleteBlock,
  getProfessionalServices, setProfessionalServices,
};