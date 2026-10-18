// ui.js — componentes de interfaz propios (reemplazan los controles nativos del navegador,
// que no se pueden estilizar): selector de fecha y menú desplegable.
//
//   <input type="hidden" id="fecha" data-datepicker data-placeholder="Selecciona una fecha">
//   <select id="pro" data-dropdown="avatars"> … </select>
//
// Son compatibles con el código existente: siguen usándose .value, .min, .max, .disabled,
// y se disparan los eventos "input" y "change" al elegir. Si se cambia el valor o las opciones
// por código, el componente se actualiza solo.
(function () {
  'use strict';

  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  var pad = function (n) { return String(n).padStart(2, '0'); };
  var toISO = function (y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); };            // m: 0-11
  var parseISO = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
  var daysIn = function (y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); };
  var weekdayMon0 = function (y, m, d) { return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7; };   // lunes = 0
  var addDays = function (iso, n) { var p = parseISO(iso); var d = new Date(Date.UTC(p.y, p.m, p.d + n)); return toISO(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
  var addMonths = function (iso, n) { var p = parseISO(iso); var d = new Date(Date.UTC(p.y, p.m + n, 1)); var dim = daysIn(d.getUTCFullYear(), d.getUTCMonth()); return toISO(d.getUTCFullYear(), d.getUTCMonth(), Math.min(p.d, dim)); };
  var todayISO = function () {
    if (typeof todayLocal === 'function') return todayLocal();
    var t = new Date(); return toISO(t.getFullYear(), t.getMonth(), t.getDate());
  };
  var longDate = function (iso) { var p = parseISO(iso); return new Date(Date.UTC(p.y, p.m, p.d, 12)).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  var shortDate = function (iso) { var p = parseISO(iso); return new Date(Date.UTC(p.y, p.m, p.d, 12)).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
  var isMobile = function () { return window.matchMedia('(max-width: 640px)').matches; };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  var textEsc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ── Ventana flotante (una sola abierta a la vez) ─────────────────
  var current = null;   // { pop, anchor, backdrop, onClose }

  function closePop() {
    if (!current) return;
    var c = current; current = null;
    c.pop.remove();
    if (c.backdrop) c.backdrop.remove();
    c.anchor.classList.remove('open');
    c.anchor.setAttribute('aria-expanded', 'false');
    if (c.onClose) c.onClose();
  }

  function place() {
    if (!current) return;
    var pop = current.pop, anchor = current.anchor;
    if (isMobile()) { pop.classList.add('sheet'); pop.style.left = pop.style.top = pop.style.minWidth = ''; return; }
    pop.classList.remove('sheet');
    var r = anchor.getBoundingClientRect();
    pop.style.minWidth = Math.max(r.width, current.minWidth || 0) + 'px';
    var pw = pop.offsetWidth, ph = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.min(Math.max(8, r.left), Math.max(8, vw - pw - 8));
    var top = r.bottom + 8;
    if (top + ph > vh - 8) top = (r.top - 8 - ph >= 8) ? r.top - 8 - ph : Math.max(8, vh - ph - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function openPop(anchor, pop, opts) {
    closePop();
    opts = opts || {};
    var backdrop = null;
    if (isMobile()) { backdrop = el('div', 'ui-backdrop'); document.body.appendChild(backdrop); backdrop.addEventListener('mousedown', function (e) { e.preventDefault(); closePop(); }); }
    document.body.appendChild(pop);
    current = { pop: pop, anchor: anchor, backdrop: backdrop, onClose: opts.onClose, minWidth: opts.minWidth };
    anchor.classList.add('open');
    anchor.setAttribute('aria-expanded', 'true');
    place();
  }

  document.addEventListener('mousedown', function (e) {
    if (current && !current.pop.contains(e.target) && !current.anchor.contains(e.target)) closePop();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) { e.preventDefault(); var a = current.anchor; closePop(); a.focus(); }
  });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', function (e) { if (current && !current.pop.contains(e.target)) place(); }, true);

  // Intercepta .value para refrescar el componente cuando el código lo cambia
  var nativeValue = {
    input:  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'),
    select: Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value'),
  };
  function watchValue(node, kind, refresh) {
    var desc = nativeValue[kind];
    Object.defineProperty(node, 'value', {
      configurable: true,
      get: function () { return desc.get.call(this); },
      set: function (v) { desc.set.call(this, v); refresh(); },
    });
  }
  function fire(node) {
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ══════════════ SELECTOR DE FECHA ══════════════
  function enhanceDate(input) {
    if (input._ui) return;
    input._ui = true;

    var wrap = el('div', 'ui-dp');
    var field = el('button', 'ui-field');
    field.type = 'button';
    field.setAttribute('aria-haspopup', 'dialog');
    field.setAttribute('aria-expanded', 'false');
    field.innerHTML = '<i class="ti ti-calendar lead"></i><span class="txt"></span><i class="ti ti-chevron-down caret"></i>';
    wrap.appendChild(field);
    input.insertAdjacentElement('afterend', wrap);
    var txt = field.querySelector('.txt');
    var placeholder = input.getAttribute('data-placeholder') || 'Selecciona una fecha';
    var labelId = input.id ? 'lbl-' + input.id : '';

    function refresh() {
      var v = input.value;
      txt.textContent = parseISO(v) ? shortDate(v) : placeholder;
      txt.classList.toggle('ph', !parseISO(v));
      field.disabled = input.disabled;
    }
    watchValue(input, 'input', refresh);
    new MutationObserver(refresh).observe(input, { attributes: true, attributeFilter: ['disabled', 'value'] });
    refresh();

    var bound = function (name) { var v = input.getAttribute(name); return parseISO(v) ? v : null; };

    function open() {
      var minI = bound('min'), maxI = bound('max'), selected = parseISO(input.value) ? input.value : null, today = todayISO();
      var view = selected || (minI && minI > today ? minI : today);        // mes que se muestra (cualquier día de ese mes)
      var mode = 'days';                                                   // 'days' | 'months'
      var focusISO = selected || view;
      var pop = el('div', 'ui-pop ui-dp-pop');
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Elegir fecha');

      function disabledDay(iso) { return (minI && iso < minI) || (maxI && iso > maxI); }

      function select(iso) {
        if (disabledDay(iso)) return;
        nativeValue.input.set.call(input, iso);
        refresh();
        fire(input);
        closePop();
        field.focus();
      }

      function render() {
        var p = parseISO(view);
        var html = '<div class="sheet-title">Elegir fecha</div><div class="dp-head">';
        var prevOff, nextOff;
        if (mode === 'days') {
          var firstThis = toISO(p.y, p.m, 1), lastPrev = addDays(firstThis, -1), lastThis = toISO(p.y, p.m, daysIn(p.y, p.m)), firstNext = addDays(lastThis, 1);
          prevOff = minI && lastPrev < minI; nextOff = maxI && firstNext > maxI;
          html += '<button type="button" class="dp-nav" data-nav="-1" aria-label="Mes anterior"' + (prevOff ? ' disabled' : '') + '><i class="ti ti-chevron-left"></i></button>' +
                  '<button type="button" class="dp-title" data-mode="months" aria-label="Elegir mes y año">' + cap(MONTHS[p.m]) + ' ' + p.y + '<i class="ti ti-chevron-down"></i></button>' +
                  '<button type="button" class="dp-nav" data-nav="1" aria-label="Mes siguiente"' + (nextOff ? ' disabled' : '') + '><i class="ti ti-chevron-right"></i></button>';
        } else {
          prevOff = minI && p.y <= parseISO(minI).y; nextOff = maxI && p.y >= parseISO(maxI).y;
          html += '<button type="button" class="dp-nav" data-nav="-12" aria-label="Año anterior"' + (prevOff ? ' disabled' : '') + '><i class="ti ti-chevron-left"></i></button>' +
                  '<button type="button" class="dp-title" data-mode="days">' + p.y + '<i class="ti ti-chevron-up"></i></button>' +
                  '<button type="button" class="dp-nav" data-nav="12" aria-label="Año siguiente"' + (nextOff ? ' disabled' : '') + '><i class="ti ti-chevron-right"></i></button>';
        }
        html += '</div>';

        if (mode === 'days') {
          html += '<div class="dp-week">' + WEEK.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div><div class="dp-grid" role="grid">';
          var lead = weekdayMon0(p.y, p.m, 1), dim = daysIn(p.y, p.m);
          var start = addDays(toISO(p.y, p.m, 1), -lead);
          for (var i = 0; i < 42; i++) {
            var iso = addDays(start, i), q = parseISO(iso), out = q.m !== p.m, dis = disabledDay(iso);
            var cls = 'dp-day' + (out ? ' out' : '') + (iso === today ? ' today' : '') + (iso === selected ? ' sel' : '') + (dis ? ' dis' : '');
            html += '<button type="button" class="' + cls + '" data-iso="' + iso + '" tabindex="' + (iso === focusISO ? 0 : -1) + '"' + (dis ? ' disabled' : '') +
                    ' aria-label="' + textEsc(longDate(iso)) + '"' + (iso === selected ? ' aria-selected="true"' : '') + '>' + q.d + '</button>';
          }
          html += '</div>';
          var todayDis = disabledDay(today);
          html += '<div class="dp-foot"><button type="button" class="dp-link" data-today' + (todayDis ? ' disabled' : '') + '>Hoy</button>' +
                  (input.hasAttribute('data-clearable') && selected ? '<button type="button" class="dp-link muted" data-clear>Borrar</button>' : '') + '</div>';
        } else {
          html += '<div class="dp-months">' + MONTHS_SHORT.map(function (mn, idx) {
            var first = toISO(p.y, idx, 1), last = toISO(p.y, idx, daysIn(p.y, idx));
            var dis = (minI && last < minI) || (maxI && first > maxI);
            var cur = idx === p.m;
            return '<button type="button" class="dp-month' + (cur ? ' sel' : '') + '" data-month="' + idx + '"' + (dis ? ' disabled' : '') + '>' + cap(mn) + '</button>';
          }).join('') + '</div>';
        }
        pop.innerHTML = html;
        if (isMobile()) pop.classList.add('sheet');
      }

      function focusDay() { var b = pop.querySelector('.dp-day[data-iso="' + focusISO + '"]'); if (b && !b.disabled) b.focus({ preventScroll: true }); else { var any = pop.querySelector('.dp-day:not([disabled])'); if (any) any.focus({ preventScroll: true }); } }
      function moveFocus(iso) {
        if (disabledDay(iso)) { var step = iso < focusISO ? 1 : -1; while (disabledDay(iso) && iso !== focusISO) iso = addDays(iso, step); if (disabledDay(iso)) return; }
        focusISO = iso;
        var p = parseISO(iso), v = parseISO(view);
        if (p.y !== v.y || p.m !== v.m) { view = iso; render(); }
        else { pop.querySelectorAll('.dp-day').forEach(function (b) { b.tabIndex = b.dataset.iso === iso ? 0 : -1; }); }
        focusDay();
        place();
      }

      pop.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.iso) return select(b.dataset.iso);
        if (b.hasAttribute('data-today')) return select(today);
        if (b.hasAttribute('data-clear')) { nativeValue.input.set.call(input, ''); refresh(); fire(input); closePop(); field.focus(); return; }
        if (b.dataset.nav) { view = addMonths(view, +b.dataset.nav); render(); place(); return; }
        if (b.dataset.mode) { mode = b.dataset.mode; render(); place(); return; }
        if (b.dataset.month != null) { var p = parseISO(view); view = toISO(p.y, +b.dataset.month, 1); mode = 'days'; focusISO = view; render(); place(); focusDay(); }
      });
      pop.addEventListener('keydown', function (e) {
        var b = e.target.closest('.dp-day'); if (!b) return;
        var map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (map[e.key]) { e.preventDefault(); moveFocus(addDays(b.dataset.iso, map[e.key])); }
        else if (e.key === 'PageUp') { e.preventDefault(); moveFocus(addMonths(b.dataset.iso, e.shiftKey ? -12 : -1)); }
        else if (e.key === 'PageDown') { e.preventDefault(); moveFocus(addMonths(b.dataset.iso, e.shiftKey ? 12 : 1)); }
        else if (e.key === 'Home') { e.preventDefault(); moveFocus(addDays(b.dataset.iso, -weekdayMon0(parseISO(b.dataset.iso).y, parseISO(b.dataset.iso).m, parseISO(b.dataset.iso).d))); }
        else if (e.key === 'End') { e.preventDefault(); moveFocus(addDays(b.dataset.iso, 6 - weekdayMon0(parseISO(b.dataset.iso).y, parseISO(b.dataset.iso).m, parseISO(b.dataset.iso).d))); }
      });

      render();
      openPop(field, pop);
      focusDay();
    }

    field.addEventListener('click', function () { if (current && current.anchor === field) closePop(); else open(); });
    field.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' && !current) { e.preventDefault(); open(); } });
  }

  // ══════════════ MENÚ DESPLEGABLE ══════════════
  function initials(name) { return name.split(/\s+/).filter(Boolean).map(function (w) { return w.charAt(0); }).join('').toUpperCase().slice(0, 2) || '?'; }

  function enhanceSelect(sel) {
    if (sel._ui) return;
    sel._ui = true;
    var avatars = (sel.getAttribute('data-dropdown') || '').indexOf('avatars') !== -1;

    var wrap = el('div', 'ui-dd');
    var field = el('button', 'ui-field');
    field.type = 'button';
    field.setAttribute('aria-haspopup', 'listbox');
    field.setAttribute('aria-expanded', 'false');
    field.innerHTML = '<span class="lead-slot"></span><span class="txt"></span><i class="ti ti-chevron-down caret"></i>';
    wrap.appendChild(field);
    sel.insertAdjacentElement('beforebegin', wrap);
    sel.style.display = 'none';
    var txt = field.querySelector('.txt'), lead = field.querySelector('.lead-slot');

    function leadHTML(opt) {
      if (!avatars) return '';
      return opt && opt.value === '' ? '<span class="ui-av all"><i class="ti ti-users"></i></span>' : '<span class="ui-av">' + textEsc(initials(opt ? opt.textContent : '')) + '</span>';
    }
    function refresh() {
      var opt = sel.options[sel.selectedIndex];
      txt.textContent = opt ? opt.textContent : '';
      lead.innerHTML = leadHTML(opt);
      lead.style.display = avatars ? '' : 'none';
      field.disabled = sel.disabled;
    }
    watchValue(sel, 'select', refresh);
    new MutationObserver(refresh).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
    refresh();

    function open() {
      var pop = el('div', 'ui-pop ui-dd-pop');
      pop.setAttribute('role', 'listbox');
      var title = sel.getAttribute('aria-label') || sel.getAttribute('data-title') || '';
      var html = title ? '<div class="sheet-title">' + textEsc(title) + '</div>' : '<div class="sheet-title">Elegir</div>';
      html += '<div class="dd-list">';
      Array.prototype.forEach.call(sel.options, function (o, i) {
        if (o.hidden) return;
        var on = i === sel.selectedIndex;
        html += '<button type="button" role="option" class="ui-opt' + (on ? ' sel' : '') + '" data-i="' + i + '"' + (o.disabled ? ' disabled' : '') + (on ? ' aria-selected="true"' : '') + ' tabindex="' + (on ? 0 : -1) + '">' +
                leadHTML(o) + '<span class="o-txt">' + textEsc(o.textContent) + '</span>' + (on ? '<i class="ti ti-check o-check"></i>' : '') + '</button>';
      });
      pop.innerHTML = html + '</div>';
      if (isMobile()) pop.classList.add('sheet');

      function choose(i) {
        var changed = sel.selectedIndex !== i;
        sel.selectedIndex = i;
        refresh();
        closePop();
        field.focus();
        if (changed) fire(sel);
      }
      var focusables = function () { return Array.prototype.slice.call(pop.querySelectorAll('.ui-opt:not([disabled])')); };
      pop.addEventListener('click', function (e) { var b = e.target.closest('.ui-opt'); if (b && !b.disabled) choose(+b.dataset.i); });
      pop.addEventListener('keydown', function (e) {
        var items = focusables(), idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, idx + 1)].focus({ preventScroll: true }); items[Math.min(items.length - 1, idx + 1)].scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, idx - 1)].focus({ preventScroll: true }); items[Math.max(0, idx - 1)].scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'Home') { e.preventDefault(); items[0].focus({ preventScroll: true }); }
        else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus({ preventScroll: true }); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (document.activeElement.dataset.i) choose(+document.activeElement.dataset.i); }
        else if (e.key === 'Tab') { closePop(); }
      });

      openPop(field, pop, { minWidth: 200 });
      var selected = pop.querySelector('.ui-opt.sel') || pop.querySelector('.ui-opt');
      if (selected) { selected.focus({ preventScroll: true }); var list = pop; list.scrollTop = Math.max(0, selected.offsetTop - 60); }
    }

    field.addEventListener('click', function () { if (current && current.anchor === field) closePop(); else open(); });
    field.addEventListener('keydown', function (e) { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !current) { e.preventDefault(); open(); } });
  }

  // ── Inicio ───────────────────────────────────────────────────────
  function init(root) {
    (root || document).querySelectorAll('input[data-datepicker]').forEach(enhanceDate);
    (root || document).querySelectorAll('select[data-dropdown]').forEach(enhanceSelect);
  }
  window.UI = { init: init, closePop: closePop };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
})();
