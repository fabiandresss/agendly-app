/* Reconocimiento de clientes: une las reservas que corresponden a la misma persona aunque
   los datos no estén escritos igual ("David" y "David Astorga", "+56 9 4966 3900" y "949663900").

   Dos reservas son del mismo cliente cuando comparten un dato de contacto (teléfono o correo)
   Y los nombres son compatibles. El contacto solo no basta: dos personas pueden compartir un
   teléfono (familia, pareja) y deben seguir siendo clientes distintos. El nombre solo tampoco:
   dos "Juan Pérez" con teléfonos distintos se consideran personas distintas.

   Funciona en el navegador (window.AgendlyClients) y en Node (require) para poder probarlo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AgendlyClients = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

  /** Nombre → palabras en minúscula, sin tildes ni signos ni partículas ("de", "del"…). */
  function nameTokens(name) {
    return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-zñ\s]/g, ' ').split(/\s+/).filter(t => t && !PARTICLES.has(t));
  }

  /** Teléfono → últimos 9 dígitos (ignora +56, espacios y guiones). '' si es demasiado corto. */
  function phoneKey(phone) {
    const d = String(phone ?? '').replace(/\D/g, '');
    return d.length >= 8 ? d.slice(-9) : '';
  }

  function emailKey(email) { return String(email ?? '').trim().toLowerCase(); }

  /** Distancia de edición con transposiciones (un cambio de letras = 1). */
  function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }

  /** ¿Dos palabras son la misma? Igual, inicial ("a" ~ "astorga"), abreviatura ("fran" ~ "francisco") o errata de una letra. */
  function sameWord(a, b) {
    if (a === b) return true;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    if (s.length === 1) return l[0] === s;
    if (s.length >= 3 && l.startsWith(s)) return true;
    return s.length >= 5 && editDistance(a, b) <= 1;
  }

  /** Nombres compatibles: todas las palabras del más corto aparecen en el más largo. */
  function namesCompatible(ta, tb) {
    const [s, l] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    return s.length > 0 && s.every(w => l.some(x => sameWord(w, x)));
  }

  const sameTokens = (a, b) => a.length === b.length && a.every((w, i) => w === b[i]);

  /**
   * Agrupa las reservas por cliente.
   * @param {Array} appts reservas con client_name, client_phone, client_email y scheduled_at
   * @returns {Array} clientes { name, phone, email, aliases, phones, emails, appts, count, last }
   *                  ordenados por cantidad de reservas y por la última visita
   */
  function groupClients(appts) {
    const clusters = [];
    const ordered = [...appts].sort((x, y) => String(x.scheduled_at).localeCompare(String(y.scheduled_at)));

    for (const a of ordered) {
      const tokens = nameTokens(a.client_name), phone = phoneKey(a.client_phone), email = emailKey(a.client_email);
      const cands = clusters.filter(c =>
        ((phone && c.phones.has(phone)) || (email && c.emails.has(email))) && namesCompatible(tokens, c.tokens));

      // Si varios clientes encajan (p. ej. "David" frente a "David Astorga" y "David Pérez" con el mismo
      // teléfono) se prefiere el de nombre idéntico y luego el que tenga más reservas.
      cands.sort((x, y) => (sameTokens(tokens, y.tokens) - sameTokens(tokens, x.tokens)) || (y.appts.length - x.appts.length));
      let c = cands[0];
      if (!c) { c = { appts: [], phones: new Set(), emails: new Set(), tokens }; clusters.push(c); }

      c.appts.push(a);
      if (phone) c.phones.add(phone);
      if (email) c.emails.add(email);
      if (tokens.length > c.tokens.length) c.tokens = tokens; // el nombre más completo manda
    }

    return clusters.map(c => {
      const last = c.appts[c.appts.length - 1];
      // Nombre a mostrar: el más completo (más palabras, más letras); a igualdad, el más usado y luego el más reciente.
      const names = new Map();
      c.appts.forEach((a, i) => {
        const n = String(a.client_name ?? '').trim().replace(/\s+/g, ' ');
        const key = nameTokens(n).join(' ');
        const e = names.get(key) ?? { n, words: nameTokens(n).length, chars: key.length, uses: 0, at: 0 };
        e.uses++; e.at = i; names.set(key, e);
      });
      const byRank = [...names.values()].sort((x, y) => y.words - x.words || y.chars - x.chars || y.uses - x.uses || y.at - x.at);
      const phones = new Map();
      c.appts.forEach(a => { const k = phoneKey(a.client_phone); if (k) phones.set(k, a.client_phone); });
      const emails = new Map();
      c.appts.forEach(a => { const k = emailKey(a.client_email); if (k) emails.set(k, a.client_email); });
      const email = [...c.appts].reverse().map(a => a.client_email).find(Boolean);
      return {
        name: byRank[0].n,
        phone: last.client_phone,
        email: email ?? null,
        aliases: byRank.slice(1).map(x => x.n),
        phones: [...phones.values()].filter(p => phoneKey(p) !== phoneKey(last.client_phone)),
        emails: [...emails.values()].filter(e => emailKey(e) !== emailKey(email)),
        appts: c.appts,
        count: c.appts.length,
        last: last.scheduled_at,
      };
    }).sort((x, y) => y.count - x.count || y.last.localeCompare(x.last));
  }

  return { groupClients, nameTokens, phoneKey, namesCompatible };
});
