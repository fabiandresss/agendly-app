// controllers/business.controller.js
// Recibe req/res, valida entradas, llama al service, devuelve respuesta HTTP.
// NO contiene lógica de negocio — solo coordinación.

const businessService = require('../services/business.service');

async function getBusinessBySlug(req, res) {
  try {
    const { slug } = req.params;
    const business = await businessService.getBusinessBySlug(slug);

    if (!business) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    res.json({ data: business });
  } catch (err) {
    console.error('[business.controller] getBusinessBySlug:', err.message);
    res.status(500).json({ error: 'Error al obtener el negocio' });
  }
}

async function getServices(req, res) {
  try {
    const { slug } = req.params;

    // Primero verificamos que el negocio existe
    const business = await businessService.getBusinessBySlug(slug);
    if (!business) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    const services = await businessService.getServicesByBusiness(business.id);
    res.json({ data: services });
  } catch (err) {
    console.error('[business.controller] getServices:', err.message);
    res.status(500).json({ error: 'Error al obtener los servicios' });
  }
}

async function getProfessionals(req, res) {
  try {
    const { slug } = req.params;

    const business = await businessService.getBusinessBySlug(slug);
    if (!business) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    const professionals = await businessService.getProfessionalsByBusiness(business.id);
    res.json({ data: professionals });
  } catch (err) {
    console.error('[business.controller] getProfessionals:', err.message);
    res.status(500).json({ error: 'Error al obtener los profesionales' });
  }
}

async function getProfessionalsByService(req, res) {
  try {
    const { slug, serviceId } = req.params;
    const business = await businessService.getBusinessBySlug(slug);
    if (!business) return res.status(404).json({ error: 'Negocio no encontrado' });
    const data = await businessService.getProfessionalsByService(business.id, serviceId);
    res.json({ data });
  } catch (err) {
    console.error('[business.controller] getProfessionalsByService:', err.message);
    res.status(500).json({ error: 'Error al obtener los profesionales' });
  }
}

module.exports = { getBusinessBySlug, getServices, getProfessionals, getProfessionalsByService };