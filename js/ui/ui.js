/* Arcadia POS — reusable UI building blocks */
(function () {
  const App = (window.App = window.App || {});
  const U = App.utils;
  const S = App.store;
  const { esc, $ } = U;
  const UI = (App.ui = {});
  const I = (n, c) => App.icon(n, c);

  /* ---------- Modals (stackable) ---------- */
  const stack = [];
  UI.modal = ({ title = '', sub = '', body = '', footer = '', size = 'md', onOpen, onClose, dismissible = true } = {}) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header class="modal-head">
          <div><h3>${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ''}</div>
          <button class="icon-btn" data-close aria-label="Close">${I('x')}</button>
        </header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const api = {
      el: wrap.querySelector('.modal'),
      close(result) {
        const i = stack.indexOf(api);
        if (i >= 0) stack.splice(i, 1);
        wrap.classList.remove('open');
        setTimeout(() => wrap.remove(), 180);
        onClose && onClose(result);
      },
    };
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && dismissible) api.close(); });
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => api.close()));
    stack.push(api);
    onOpen && onOpen(api.el, api);
    const f = api.el.querySelector('[autofocus], input:not([type=hidden]):not([readonly]), select, textarea');
    if (f) setTimeout(() => f.focus(), 60);
    return api;
  };
  UI.closeTopModal = () => { const m = stack[stack.length - 1]; if (m) { m.close(); return true; } return false; };
  UI.hasModal = () => stack.length > 0;

  UI.confirm = ({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false, input = null, requireText = null } = {}) =>
    new Promise((resolve) => {
      let done = false;
      const m = UI.modal({
        title, size: 'sm',
        body: `${message ? `<p class="muted">${message}</p>` : ''}
          ${input ? `<label class="field"><span>${esc(input.label)}</span>${input.multiline ? `<textarea id="cfInput" rows="3" placeholder="${esc(input.placeholder || '')}"></textarea>` : `<input id="cfInput" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}">`}</label>` : ''}
          ${requireText ? `<label class="field"><span>Type <b>${esc(requireText)}</b> to confirm</span><input id="cfText" autocomplete="off"></label>` : ''}`,
        footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cfOk">${esc(confirmText)}</button>`,
        onClose: () => { if (!done) resolve(false); },
      });
      const ok = m.el.querySelector('#cfOk');
      const go = () => {
        const v = input ? m.el.querySelector('#cfInput').value.trim() : true;
        if (input && input.required && !v) { U.toast(`${input.label} is required`, 'danger'); return; }
        if (requireText && m.el.querySelector('#cfText').value.trim() !== requireText) { U.toast('Confirmation text does not match', 'danger'); return; }
        done = true; m.close(); resolve(v === '' ? true : v);
      };
      ok.onclick = go;
      m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); go(); } });
    });

  /* ---------- Small pieces ---------- */
  UI.badge = (text, tone = 'muted') => `<span class="badge b-${tone}">${esc(text)}</span>`;
  UI.empty = (title, sub = '', icon = 'box', action = '') => `<div class="empty">${I(icon)}<strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}${action}</div>`;
  UI.stat = (label, value, { hint = '', tone = '', icon = '' } = {}) =>
    `<div class="stat ${tone ? 'stat-' + tone : ''}">${icon ? `<div class="stat-ico">${I(icon)}</div>` : ''}<div><span class="stat-label">${esc(label)}</span><strong class="stat-value">${value}</strong>${hint ? `<span class="stat-hint">${hint}</span>` : ''}</div></div>`;
  UI.tabs = (items, active, attr = 'data-tab') => `<div class="tabs">${items.map(([id, label, count]) => `<button class="tab ${id === active ? 'active' : ''}" ${attr}="${id}">${esc(label)}${count != null ? `<span class="tab-count">${count}</span>` : ''}</button>`).join('')}</div>`;
  UI.conditionBadge = (c) => UI.badge(c || '—', c === 'New' ? 'success' : c === 'Refurbished' ? 'info' : 'warning');
  UI.statusBadge = (s) => {
    const map = { completed: ['Completed', 'success'], void: ['Void', 'danger'], ordered: ['Ordered', 'info'], partial: ['Partial', 'warning'], received: ['Received', 'success'], cancelled: ['Cancelled', 'muted'], open: ['Open', 'success'], closed: ['Closed', 'muted'], draft: ['In progress', 'warning'], finalized: ['Finalized', 'success'], discarded: ['Discarded', 'muted'] };
    const rs = App.REPAIR_STATUSES.find((x) => x.id === s);
    if (rs) return UI.badge(rs.label, rs.tone);
    const [l, t] = map[s] || [s, 'muted'];
    return UI.badge(l, t);
  };
  UI.stockBadge = (p) => p.stock <= 0 ? UI.badge('Out', 'danger') : App.svc.isLow(p) ? UI.badge(`${p.stock} low`, 'warning') : UI.badge(String(p.stock), 'success');
  UI.payOptions = (value = 'cash', extra = []) => [...App.PAYMENT_METHODS.map((m) => [m.id, m.label]), ...extra].map(([id, l]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${esc(l)}</option>`).join('');
  UI.payTiles = (name, value = 'cash') => `<div class="pay-tiles">${App.PAYMENT_METHODS.map((m) => `<label class="pay-tile"><input type="radio" name="${name}" value="${m.id}" ${m.id === value ? 'checked' : ''}><span>${I(m.icon)}${esc(m.label)}</span></label>`).join('')}</div>`;
  UI.options = (list, value, placeholder) => `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${list.map((x) => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}`;
  UI.productThumb = (p) => {
    const cat = p.category || '';
    const icon = cat === 'Console' ? 'gamepad' : cat === 'Games' ? 'sparkles' : cat === 'Controller' ? 'gamepad' : cat === 'Gift Cards' ? 'card' : cat === 'Repair Parts' ? 'wrench' : cat === 'Collectibles' ? 'star' : 'box';
    const hue = [...(p.platform || cat)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
    return `<div class="thumb" style="--h:${hue}">${I(icon)}</div>`;
  };

  /* ---------- Product typeahead ---------- */
  UI.productPicker = (host, { placeholder = 'Search product, SKU, serial or barcode…', filter = () => true, allowNew = false, onPick, onNew, showCost = false } = {}) => {
    host.classList.add('typeahead');
    host.innerHTML = `<div class="input-icon">${I('search')}<input type="search" autocomplete="off" placeholder="${esc(placeholder)}"></div><div class="ta-list hidden"></div>`;
    const input = host.querySelector('input');
    const list = host.querySelector('.ta-list');
    let items = [], idx = 0;
    const render = () => {
      const q = input.value.trim();
      if (!q) { list.classList.add('hidden'); return; }
      items = S.filter('products', (p) => p.active !== false && filter(p) && U.match(q, p.name, p.sku, p.serial, p.barcode, p.platform, p.category)).slice(0, 8);
      idx = 0;
      list.innerHTML = items.map((p, i) => `<button type="button" class="ta-item ${i === idx ? 'active' : ''}" data-i="${i}">
          ${UI.productThumb(p)}<div class="ta-main"><strong>${esc(p.name)}</strong><span>${esc(p.sku)}${p.serial ? ' · SN ' + esc(p.serial) : ''} · ${esc(p.platform || p.category)} · ${esc(p.condition)}${p.ownership === 'consignment' ? ' · Consignment' : ''}</span></div>
          <div class="ta-side"><strong>${U.money(p.price)}</strong><span>${p.stock} in stock${showCost && App.svc.can('inventory.cost') ? ' · cost ' + U.money(p.cost) : ''}</span></div></button>`).join('')
        + (allowNew ? `<button type="button" class="ta-item ta-new" data-new>${I('plus')}<div class="ta-main"><strong>Create new item “${esc(q)}”</strong><span>A new SKU is generated when the transaction completes</span></div></button>` : '')
        || `<div class="ta-none">No match</div>`;
      list.classList.remove('hidden');
    };
    const choose = (i) => { const p = items[i]; if (!p) return; input.value = ''; list.classList.add('hidden'); onPick && onPick(p); };
    input.addEventListener('input', U.debounce(render, 80));
    input.addEventListener('focus', render);
    input.addEventListener('keydown', (e) => {
      const btns = [...list.querySelectorAll('.ta-item')];
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(btns.length - 1, idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const q = input.value.trim();
        const exact = S.find('products', (p) => p.active !== false && filter(p) && q && (p.sku.toLowerCase() === q.toLowerCase() || (p.barcode && p.barcode === q) || (p.serial && U.normSerial(p.serial) === U.normSerial(q))));
        if (exact) { input.value = ''; list.classList.add('hidden'); onPick && onPick(exact); return; }
        const b = btns[idx];
        if (b?.dataset.new != null) { const v = input.value.trim(); input.value = ''; list.classList.add('hidden'); onNew && onNew(v); }
        else choose(idx);
        return;
      } else if (e.key === 'Escape') { list.classList.add('hidden'); return; }
      else return;
      btns.forEach((b, i) => b.classList.toggle('active', i === idx));
    });
    list.addEventListener('mousedown', (e) => {
      const b = e.target.closest('.ta-item');
      if (!b) return;
      e.preventDefault();
      if (b.dataset.new != null) { const v = input.value.trim(); input.value = ''; list.classList.add('hidden'); onNew && onNew(v); }
      else choose(+b.dataset.i);
    });
    input.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 120));
    return { focus: () => input.focus(), input };
  };

  /* ---------- Customers ---------- */
  UI.customerChip = (id, { required = false, label = 'Customer' } = {}) => {
    const c = id ? S.get('customers', id) : null;
    return `<button type="button" class="customer-chip ${c ? 'set' : required ? 'missing' : ''}" data-act="pick-customer">
      <span class="avatar sm">${c ? esc(U.initials(c.name)) : I('user')}</span>
      <span class="cc-main"><small>${esc(label)}${required ? ' *' : ''}</small><strong>${c ? esc(c.name) : required ? 'Select customer' : 'Walk-in customer'}</strong>${c ? `<em>${esc(c.phone || 'No phone')}${S.settings().loyalty_enabled ? ` · ${U.int(c.points)} pts` : ''}</em>` : ''}</span>
      ${I('chevronDown')}</button>`;
  };
  UI.pickCustomer = ({ allowWalkIn = true } = {}) => new Promise((resolve) => {
    let done = false;
    const m = UI.modal({
      title: 'Select customer', size: 'md',
      body: `<div class="input-icon">${I('search')}<input id="cpSearch" type="search" placeholder="Search name, phone or email…" autocomplete="off"></div>
        <div class="cp-list" id="cpList"></div>`,
      footer: `${allowWalkIn ? `<button class="btn ghost" id="cpWalk">Walk-in (no customer)</button>` : '<span></span>'}<button class="btn primary" id="cpNew">${I('plus')} New customer</button>`,
      onClose: () => { if (!done) resolve(undefined); },
    });
    const list = m.el.querySelector('#cpList');
    const render = () => {
      const q = m.el.querySelector('#cpSearch').value;
      const rows = S.filter('customers', (c) => U.match(q, c.name, c.phone, c.email, c.ic_no)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 40);
      list.innerHTML = rows.map((c) => `<button class="cp-item" data-id="${c.id}"><span class="avatar sm">${esc(U.initials(c.name))}</span><span><strong>${esc(c.name)}</strong><em>${esc(c.phone || 'No phone')}${c.type === 'online' ? ' · ' + esc(c.channel || 'Online') : ''}</em></span>${S.settings().loyalty_enabled ? `<span class="muted small">${U.int(c.points)} pts</span>` : ''}</button>`).join('') || UI.empty('No customers found', 'Create a new one below', 'users');
    };
    render();
    m.el.querySelector('#cpSearch').addEventListener('input', render);
    list.addEventListener('click', (e) => { const b = e.target.closest('.cp-item'); if (!b) return; done = true; m.close(); resolve(b.dataset.id); });
    m.el.querySelector('#cpWalk')?.addEventListener('click', () => { done = true; m.close(); resolve(null); });
    m.el.querySelector('#cpNew').addEventListener('click', async () => {
      const q = m.el.querySelector('#cpSearch').value.trim();
      const c = await UI.customerForm(/^[\d +-]+$/.test(q) ? { phone: q } : { name: q });
      if (c) { done = true; m.close(); resolve(c.id); }
    });
  });
  UI.customerForm = (existing = {}) => new Promise((resolve) => {
    let done = false;
    const e = existing;
    const m = UI.modal({
      title: e.id ? 'Edit customer' : 'New customer', size: 'md',
      body: `<form id="cuForm" class="form-grid">
        <label class="field span-2"><span>Full name *</span><input name="name" required value="${esc(e.name || '')}"></label>
        <label class="field"><span>Phone / WhatsApp</span><input name="phone" inputmode="tel" value="${esc(e.phone || '')}" placeholder="012-345 6789"></label>
        <label class="field"><span>Email</span><input name="email" type="email" value="${esc(e.email || '')}"></label>
        <label class="field"><span>Customer type</span><select name="type">${UI.options([['registered', 'Registered (in-store)'], ['online', 'Online']], e.type || 'registered')}</select></label>
        <label class="field"><span>Online channel</span><select name="channel">${UI.options(['', 'WhatsApp', 'Instagram', 'TikTok', 'Facebook', 'Shopee', 'Website'], e.channel || '')}</select></label>
        <label class="field span-2"><span>IC / Passport no. <small class="muted">(needed when buying used goods from them)</small></span><input name="ic_no" value="${esc(e.ic_no || '')}"></label>
        <label class="field span-2"><span>Address</span><textarea name="address" rows="2">${esc(e.address || '')}</textarea></label>
        <label class="field span-2"><span>Notes</span><textarea name="notes" rows="2" placeholder="Preferences, favourite platform…">${esc(e.notes || '')}</textarea></label>
      </form>`,
      footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="cuSave">Save customer</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const save = async () => {
      const fd = Object.fromEntries(new FormData(m.el.querySelector('#cuForm')));
      try { const c = await App.svc.saveCustomer({ ...e, ...fd }); done = true; m.close(); U.toast('Customer saved', 'success'); resolve(c); }
      catch (err) { U.toast(err.message, 'danger'); }
    };
    m.el.querySelector('#cuSave').onclick = save;
    m.el.querySelector('#cuForm').onsubmit = (ev) => { ev.preventDefault(); save(); };
  });

  /* ---------- Cash counter (denominations) ---------- */
  UI.cashCounter = (target) => new Promise((resolve) => {
    const cur = S.settings().currency;
    const denoms = [100, 50, 20, 10, 5, 1, 0.5, 0.2, 0.1, 0.05];
    let done = false;
    const m = UI.modal({
      title: 'Count cash drawer', sub: 'Enter the number of notes/coins of each denomination.', size: 'sm',
      body: `<div class="denoms">${denoms.map((d) => `<label class="denom"><span>${cur} ${d < 1 ? d.toFixed(2) : d}</span><input type="number" min="0" step="1" data-d="${d}" placeholder="0"><em data-t="${d}">—</em></label>`).join('')}</div>
        <div class="total-row big"><span>Total</span><strong id="dnTotal">${U.money(0)}</strong></div>`,
      footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="dnUse">Use this amount</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const calc = () => {
      let t = 0; const counts = {};
      m.el.querySelectorAll('[data-d]').forEach((i) => { const d = +i.dataset.d, n = U.int(i.value); counts[d] = n; t += d * n; m.el.querySelector(`[data-t="${d}"]`).textContent = n ? U.money(d * n) : '—'; });
      m.el.querySelector('#dnTotal').textContent = U.money(t);
      return { total: U.r2(t), counts };
    };
    m.el.addEventListener('input', calc);
    m.el.querySelector('#dnUse').onclick = () => { const r = calc(); done = true; m.close(); if (target) target.value = r.total.toFixed(2); resolve(r); };
  });

  /* ---------- Simple table ---------- */
  UI.table = (head, rows, emptyHtml) => `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th${h.startsWith('>') ? ' class="num"' : ''}>${esc(h.replace(/^>/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}">${emptyHtml || UI.empty('Nothing here yet')}</td></tr>`}</tbody></table></div>`;
})();
