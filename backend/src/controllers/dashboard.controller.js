'use strict';

const dashboardService = require('../services/dashboard.service');
const authService      = require('../services/auth.service');

async function getSummary(req, res) {
  try {
    const biz  = await authService.verifyBusinessOwnership(req.params.slug, req.user.id);
    const data = await dashboardService.getSummary(biz.id);
    res.json({ data });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
}

async function getByPeriod(req, res) {
  try {
    const { period = 'day', limit = '14' } = req.query;
    if (!['day','week','month'].includes(period)) {
      return res.status(400).json({ error: 'period debe ser day, week o month' });
    }
    const biz  = await authService.verifyBusinessOwnership(req.params.slug, req.user.id);
    const data = await dashboardService.getByPeriod(biz.id, period, parseInt(limit));
    res.json({ data });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
}

async function getTopServices(req, res) {
  try {
    const biz  = await authService.verifyBusinessOwnership(req.params.slug, req.user.id);
    const data = await dashboardService.getTopServices(biz.id);
    res.json({ data });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
}

async function getTopProfessionals(req, res) {
  try {
    const biz  = await authService.verifyBusinessOwnership(req.params.slug, req.user.id);
    const data = await dashboardService.getTopProfessionals(biz.id);
    res.json({ data });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
}

async function getHourlyDistribution(req, res) {
  try {
    const biz  = await authService.verifyBusinessOwnership(req.params.slug, req.user.id);
    const data = await dashboardService.getHourlyDistribution(biz.id);
    res.json({ data });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
}

module.exports = { getSummary, getByPeriod, getTopServices, getTopProfessionals, getHourlyDistribution };