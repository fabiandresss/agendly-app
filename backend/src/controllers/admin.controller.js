'use strict';

const adminService = require('../services/admin.service');
const authService  = require('../services/auth.service');
const handle       = require('../utils/handle');

const owned = req => authService.verifyBusinessOwnership(req.params.slug, req.user.id);

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// ─── SERVICIOS ───────────────────────────────────────────────────

const listServices = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await adminService.listServices(biz.id) });
}, 'Error al obtener los servicios');

const createService = handle(async (req, res) => {
  const { name, description, duration_min, price } = req.body;
  if (!name || !duration_min) throw badRequest('name y duration_min son requeridos');
  const biz = await owned(req);
  res.status(201).json({ data: await adminService.createService(biz.id, { name, description, duration_min, price }) });
}, 'Error al crear el servicio');

const updateService = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await adminService.updateService(biz.id, req.params.id, req.body) });
}, 'Error al actualizar el servicio');

// ─── PROFESIONALES ───────────────────────────────────────────────

const listProfessionals = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await adminService.listProfessionals(biz.id) });
}, 'Error al obtener los profesionales');

const createProfessional = handle(async (req, res) => {
  const { name, email, phone, bio } = req.body;
  if (!name) throw badRequest('name es requerido');
  const biz = await owned(req);
  res.status(201).json({ data: await adminService.createProfessional(biz.id, { name, email, phone, bio }) });
}, 'Error al crear el profesional');

const updateProfessional = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await adminService.updateProfessional(biz.id, req.params.id, req.body) });
}, 'Error al actualizar el profesional');

// ─── HORARIOS ────────────────────────────────────────────────────

const getSchedules = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await adminService.getSchedules(biz.id, req.params.professionalId) });
}, 'Error al obtener los horarios');

const replaceSchedules = handle(async (req, res) => {
  const { schedules } = req.body;
  if (!Array.isArray(schedules)) throw badRequest('schedules debe ser un array');
  const biz = await owned(req);
  res.json({ data: await adminService.replaceSchedules(biz.id, req.params.professionalId, schedules) });
}, 'Error al guardar los horarios');

// ─── NEGOCIO Y BLOQUEOS ──────────────────────────────────────────

const updateBusiness = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await adminService.updateBusiness(biz.id, req.body) });
}, 'Error al actualizar el negocio');

const listBlocks = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await adminService.listBlocks(biz.id) });
}, 'Error al obtener los bloqueos');

const createBlock = handle(async (req, res) => {
  const { name, start_date, end_date, professional_id } = req.body;
  if (!name || !start_date || !end_date) throw badRequest('name, start_date y end_date son requeridos');
  const biz = await owned(req);
  res.status(201).json({ data: await adminService.createBlock(biz.id, { name, start_date, end_date, professional_id }) });
}, 'Error al crear el bloqueo');

const deleteBlock = handle(async (req, res) => {
  const biz = await owned(req);
  await adminService.deleteBlock(biz.id, req.params.id);
  res.json({ message: 'Bloqueo eliminado' });
}, 'Error al eliminar el bloqueo');

// ─── SERVICIOS POR PROFESIONAL ───────────────────────────────────

const getProfessionalServices = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await adminService.getProfessionalServices(biz.id, req.params.professionalId) });
}, 'Error al obtener los servicios del profesional');

const setProfessionalServices = handle(async (req, res) => {
  const { serviceIds } = req.body;
  if (!Array.isArray(serviceIds) || serviceIds.some(id => typeof id !== 'string')) {
    throw badRequest('serviceIds debe ser un array de ids');
  }
  const biz = await owned(req);
  res.json({ data: await adminService.setProfessionalServices(biz.id, req.params.professionalId, serviceIds) });
}, 'Error al asignar los servicios');

module.exports = {
  listServices, createService, updateService,
  listProfessionals, createProfessional, updateProfessional,
  getSchedules, replaceSchedules,
  updateBusiness,
  listBlocks, createBlock, deleteBlock,
  getProfessionalServices, setProfessionalServices,
};
