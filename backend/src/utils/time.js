// src/utils/time.js
// Utilidades de fecha/hora en la zona horaria del negocio.
//
// El servidor puede correr en UTC (Render, Railway, etc.), así que NUNCA hay
// que usar getDay()/getHours()/toTimeString() para decisiones de negocio:
// siempre se calculan en la zona horaria configurada.

'use strict';

const TZ = process.env.BUSINESS_TIMEZONE || 'America/Santiago';

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Descompone un instante en sus partes de calendario en la zona del negocio. */
function partsInTz(date) {
  const p = {};
  for (const { type, value } of formatter.formatToParts(date)) p[type] = value;
  const year = Number(p.year), month = Number(p.month), day = Number(p.day);
  const hour = Number(p.hour) % 24, minute = Number(p.minute), second = Number(p.second);
  const pad = n => String(n).padStart(2, '0');
  return {
    year, month, day, hour, minute, second,
    dateStr: `${year}-${pad(month)}-${pad(day)}`,
    timeStr: `${pad(hour)}:${pad(minute)}`,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(), // 0=domingo
  };
}

/** Diferencia (ms) entre la hora local de la zona y UTC en un instante dado. */
function tzOffsetMs(utcMs) {
  const p = partsInTz(new Date(utcMs));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** "YYYY-MM-DD" + "HH:MM" (hora de la zona del negocio) → Date (instante UTC). */
function zonedToUtc(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi]    = timeStr.split(':').map(Number);
  const guess  = Date.UTC(y, mo - 1, d, h, mi, 0);
  let result   = guess - tzOffsetMs(guess);
  // Segunda pasada: corrige si cruzamos un cambio de horario (DST)
  result = guess - tzOffsetMs(result);
  return new Date(result);
}

/**
 * Interpreta el scheduledAt que envía el cliente.
 * - "2026-04-16T14:00" (sin zona) → hora de la zona del negocio.
 * - "2026-04-16T14:00:00-04:00" / "...Z" → se respeta tal cual.
 * Retorna null si no es una fecha válida.
 */
function parseScheduledAt(input) {
  if (typeof input !== 'string' || !input) return null;
  const naive = input.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  const date  = naive ? zonedToUtc(naive[1], naive[2]) : new Date(input);
  return isNaN(date.getTime()) ? null : date;
}

/** Fecha de hoy ("YYYY-MM-DD") en la zona del negocio. */
function todayStr() {
  return partsInTz(new Date()).dateStr;
}

/** Día de la semana (0=domingo) de una fecha "YYYY-MM-DD". */
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Suma días a una fecha "YYYY-MM-DD". */
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Rango UTC [start, end) que cubre el día completo en la zona del negocio. */
function dayRange(dateStr) {
  return {
    start: zonedToUtc(dateStr, '00:00'),
    end:   zonedToUtc(addDays(dateStr, 1), '00:00'),
  };
}

/** "HH:MM" o "HH:MM:SS" → minutos desde medianoche. */
function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** Valida que una fecha "YYYY-MM-DD" exista de verdad (rechaza 2026-02-31). */
function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

module.exports = {
  TZ, partsInTz, zonedToUtc, parseScheduledAt, todayStr, weekdayOf,
  addDays, dayRange, toMinutes, isValidDateStr,
};
