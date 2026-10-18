'use strict';

const dashboardService = require('../services/dashboard.service');
const authService      = require('../services/auth.service');
const handle           = require('../utils/handle');

const owned = req => authService.verifyBusinessOwnership(req.params.slug, req.user.id);

const getSummary = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await dashboardService.getSummary(biz.id) });
}, 'Error al obtener el resumen');

const getByPeriod = handle(async (req, res) => {
  const { period = 'day', limit = '14' } = req.query;
  const bad = message => Object.assign(new Error(message), { statusCode: 400 });

  if (!['day', 'week', 'month'].includes(period)) throw bad('period debe ser day, week o month');
  const n = parseInt(limit, 10);
  if (!Number.isInteger(n) || n < 1 || n > 120) throw bad('limit debe ser un entero entre 1 y 120');

  const biz = await owned(req);
  res.json({ data: await dashboardService.getByPeriod(biz.id, period, n) });
}, 'Error al obtener las reservas por período');

const getTopServices = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await dashboardService.getTopServices(biz.id) });
}, 'Error al obtener los servicios más pedidos');

const getTopProfessionals = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await dashboardService.getTopProfessionals(biz.id) });
}, 'Error al obtener los profesionales más pedidos');

const getHourlyDistribution = handle(async (req, res) => {
  const biz = await owned(req);
  res.json({ data: await dashboardService.getHourlyDistribution(biz.id) });
}, 'Error al obtener la distribución horaria');

module.exports = { getSummary, getByPeriod, getTopServices, getTopProfessionals, getHourlyDistribution };
