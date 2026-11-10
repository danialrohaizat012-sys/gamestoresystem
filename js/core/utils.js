/* Arcadia POS — generic helpers */
(function () {
  const App = (window.App = window.App || {});
  const U = (App.utils = {});

  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  U.esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  U.num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  U.int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
  U.r2 = (n) => Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;
  U.sum = (arr, fn = (x) => x) => U.r2(arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0));
  U.uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  U.nowISO = () => new Date().toISOString();
  U.clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  U.money = (n, { sign = false, plain = false } = {}) => {
    const cur = (App.store && App.store.settings().currency) || 'RM';
    const v = U.r2(n);
    const s = Math.abs(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (plain) return (v < 0 ? '-' : '') + s;
    const pre = v < 0 ? '-' : sign && v > 0 ? '+' : '';
    return `${pre}${cur} ${s}`;
  };
  U.pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

  /* Dates — always store ISO strings, render in local time */
  U.dateKey = (d = new Date()) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  U.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  U.startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  U.endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  U.fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  U.fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }) : '—');
  U.fmtDateTime = (d) => (d ? `${U.fmtDate(d)}, ${U.fmtTime(d)}` : '—');
  U.relTime = (d) => {
    if (!d) return '—';
    const s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
    return U.fmtDate(d);
  };
  U.localInputValue = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

  U.normalize = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  U.normSerial = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  U.cleanPhone = (phone) => {
    const cc = (App.store && App.store.settings().country_code) || '60';
    let n = String(phone || '').replace(/\D/g, '');
    if (!n) return '';
    if (n.startsWith('0')) n = cc + n.slice(1);
    else if (!n.startsWith(cc)) n = cc + n;
    return n;
  };
  U.initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  U.debounce = (fn, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});
  U.match = (q, ...fields) => { const n = U.normalize(q); if (!n) return true; const hay = U.normalize(fields.join(' ')); return n.split(' ').every((w) => hay.includes(w)); };

  /* Toasts */
  U.toast = (msg, tone = 'default') => {
    let wrap = U.$('#toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = `toast toast-${tone}`;
    el.innerHTML = `${App.icon(tone === 'success' ? 'check' : tone === 'danger' ? 'alert' : 'info')}<span>${U.esc(msg)}</span>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, tone === 'danger' ? 4200 : 2600);
  };

  U.download = (filename, content, mime = 'text/plain') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.toCSV = (rows) => {
    if (!rows.length) return '';
    const cols = [...rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set())];
    const cell = (v) => {
      if (v == null) return '';
      if (typeof v === 'object') v = JSON.stringify(v);
      v = String(v);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  };
  U.clone = (o) => JSON.parse(JSON.stringify(o));
})();
