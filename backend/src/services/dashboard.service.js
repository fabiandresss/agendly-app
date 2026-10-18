'use strict';

const supabase = require('../config/supabase');
const { partsInTz, todayStr, addDays, zonedToUtc } = require('../utils/time');

const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

async function getSummary(businessId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('status, scheduled_at, ends_at, services(price, duration_min)')
    .eq('business_id', businessId);

  if (error) throw error;

  // Una reserva pendiente cuya fecha ya pasó está "vencida": nunca se confirmó, no
  // cuenta como pendiente ni como ingreso proyectado.
  const nowMs     = Date.now();
  const isPast    = a => new Date(a.ends_at ?? a.scheduled_at).getTime() < nowMs;
  const total     = data.length;
  const pending   = data.filter(a => a.status === 'pending' && !isPast(a)).length;
  const expired   = data.filter(a => a.status === 'pending' && isPast(a)).length;
  const confirmed = data.filter(a => a.status === 'confirmed').length;
  const completed = data.filter(a => a.status === 'completed').length;
  const cancelled = data.filter(a => a.status === 'cancelled').length;

  const resolved         = completed + cancelled;
  const cancellationRate = resolved > 0 ? Math.round((cancelled / resolved) * 100) : 0;
  const completionRate   = resolved > 0 ? Math.round((completed / resolved) * 100) : 0;

  const estimatedRevenue = data
    .filter(a => a.status === 'completed' && a.services?.price)
    .reduce((s, a) => s + parseFloat(a.services.price), 0);

  const projectedRevenue = data
    .filter(a => (a.status === 'confirmed' || a.status === 'pending') && !isPast(a) && a.services?.price)
    .reduce((s, a) => s + parseFloat(a.services.price), 0);

  const totalMinutes = data
    .filter(a => a.status === 'completed' && a.services?.duration_min)
    .reduce((s, a) => s + a.services.duration_min, 0);

  // "Últimos N días" = reservas con fecha entre hace N días y ahora (sin futuras)
  const now          = Date.now();
  const DAY_MS       = 24 * 60 * 60 * 1000;
  const inLastDays   = (a, n) => {
    const t = new Date(a.scheduled_at).getTime();
    return t >= now - n * DAY_MS && t <= now;
  };
  const last30       = data.filter(a => inLastDays(a, 30)).length;
  const last7        = data.filter(a => inLastDays(a, 7)).length;

  // Hora pico (hora con más reservas)
  const hourCounts = {};
  data.forEach(a => {
    const h = partsInTz(new Date(a.scheduled_at)).hour;
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

  // Día de la semana con más reservas
  const dayCounts = { 0:0,1:0,2:0,3:0,4:0,5:0,6:0 };
  data.forEach(a => { dayCounts[partsInTz(new Date(a.scheduled_at)).weekday]++; });
  const peakDay = data.length ? Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0] : null;

  // Promedio de reservas por día (últimos 30 días)
  const avgPerDay = last30 > 0 ? (last30 / 30).toFixed(1) : '0';

  return {
    total, pending, expired, confirmed, completed, cancelled,
    last_30_days:       last30,
    last_7_days:        last7,
    cancellation_rate:  cancellationRate,
    completion_rate:    completionRate,
    estimated_revenue:  estimatedRevenue,
    projected_revenue:  projectedRevenue,
    total_minutes_served: totalMinutes,
    avg_per_day:        parseFloat(avgPerDay),
    peak_hour:          peakHour ? `${peakHour[0]}:00` : null,
    peak_day:           peakDay  ? DAY_NAMES[parseInt(peakDay[0], 10)] : null,
  };
}

async function getByPeriod(businessId, period = 'day', limit = 14) {
  // Inicio del rango = hoy (zona del negocio) menos N períodos
  const today = todayStr();
  let fromDate;
  if (period === 'day')   fromDate = addDays(today, -limit);
  if (period === 'week')  fromDate = addDays(today, -limit * 7);
  if (period === 'month') {
    const [y, m] = today.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - limit, 1));
    fromDate = d.toISOString().slice(0, 10);
  }
  const from = zonedToUtc(fromDate, '00:00');

  const { data, error } = await supabase
    .from('appointments')
    .select('scheduled_at, status, services(price)')
    .eq('business_id', businessId)
    .gte('scheduled_at', from.toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) throw error;

  const groups = {};
  data.forEach(appt => {
    const p = partsInTz(new Date(appt.scheduled_at));
    let key;
    if (period === 'day') {
      key = p.dateStr;
    } else if (period === 'week') {
      // Lunes de esa semana
      key = addDays(p.dateStr, p.weekday === 0 ? -6 : 1 - p.weekday);
    } else {
      key = p.dateStr.slice(0, 7);
    }

    if (!groups[key]) groups[key] = { period: key, total: 0, completed: 0, cancelled: 0, revenue: 0 };
    groups[key].total++;
    if (appt.status === 'completed') groups[key].completed++;
    if (appt.status === 'cancelled') groups[key].cancelled++;
    if (appt.status === 'completed' && appt.services?.price) {
      groups[key].revenue += parseFloat(appt.services.price);
    }
  });

  return Object.values(groups).sort((a, b) => a.period.localeCompare(b.period));
}

async function getTopServices(businessId, limit = 5) {
  const { data, error } = await supabase
    .from('appointments')
    .select('service_id, status, services(name, price)')
    .eq('business_id', businessId);

  if (error) throw error;

  const counts = {};
  data.forEach(appt => {
    const id    = appt.service_id;
    const name  = appt.services?.name  ?? 'Desconocido';
    const price = appt.services?.price ?? 0;
    if (!counts[id]) counts[id] = { service_id: id, name, price, count: 0, revenue: 0 };
    counts[id].count++;
    if (appt.status === 'completed') counts[id].revenue += parseFloat(price);
  });

  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function getTopProfessionals(businessId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('professional_id, status, professionals(name), services(price)')
    .eq('business_id', businessId);

  if (error) throw error;

  const map = {};
  data.forEach(a => {
    const id   = a.professional_id;
    const name = a.professionals?.name ?? '—';
    if (!map[id]) map[id] = { id, name, total: 0, completed: 0, revenue: 0 };
    map[id].total++;
    if (a.status === 'completed') {
      map[id].completed++;
      if (a.services?.price) map[id].revenue += parseFloat(a.services.price);
    }
  });

  return Object.values(map).sort((a, b) => b.total - a.total);
}

async function getHourlyDistribution(businessId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('scheduled_at')
    .eq('business_id', businessId)
    .neq('status', 'cancelled');

  if (error) throw error;

  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, label: `${String(i).padStart(2,'0')}:00`, count: 0 }));
  data.forEach(a => { hours[partsInTz(new Date(a.scheduled_at)).hour].count++; });
  return hours.filter(h => h.count > 0 || (h.hour >= 8 && h.hour <= 20));
}

module.exports = { getSummary, getByPeriod, getTopServices, getTopProfessionals, getHourlyDistribution };