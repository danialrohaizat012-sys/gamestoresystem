/* Settings — white-label branding, rules, staff, data, Supabase, audit */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  let tab = 'store';
  const ACCENTS = ['#7c5cff', '#2563eb', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#111827'];

  App.page('settings', {
    title: 'Settings', sub: 'Make it yours — every store gets its own brand, rules and team',
    render(el) {
      const s = S.settings();
      el.innerHTML = `${UI.tabs([['store', 'Store & brand'], ['rules', 'Sales rules'], ['lists', 'Categories'], ['staff', 'Staff & access'], ['data', 'Data & backup'], ['cloud', 'Supabase'], ['audit', 'Audit log']], tab)}<div id="stBody"></div>`;
      el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; App.rerender(); }));
      const body = el.querySelector('#stBody');
      ({ store, rules, lists, staff, data, cloud, audit })[tab](body, s);
    },
  });

  const saveSettings = async (patch) => { await S.upsert('settings', { ...S.settings(), ...patch, id: 'store' }); await svc.audit('settings.update', Object.keys(patch).join(', ')); U.toast('Settings saved', 'success'); App.applyBrand(); };
  const formData = (form) => Object.fromEntries([...form.querySelectorAll('[name]')].map((x) => [x.name, x.type === 'checkbox' ? x.checked : x.type === 'number' ? U.num(x.value) : x.value]));

  function store(body, s) {
    body.innerHTML = `<div class="grid-2-1"><section class="card"><form id="sf" class="form-grid">
        <label class="field span-2"><span>Store name (shown everywhere)</span><input name="store_name" value="${esc(s.store_name)}"></label>
        <label class="field"><span>Registered / legal name</span><input name="legal_name" value="${esc(s.legal_name)}"></label>
        <label class="field"><span>Registration no. (SSM)</span><input name="registration_no" value="${esc(s.registration_no)}"></label>
        <label class="field span-2"><span>Tagline</span><input name="tagline" value="${esc(s.tagline)}"></label>
        <label class="field span-2"><span>Address</span><textarea name="address" rows="2">${esc(s.address)}</textarea></label>
        <label class="field"><span>Phone</span><input name="phone" value="${esc(s.phone)}"></label>
        <label class="field"><span>Email</span><input name="email" value="${esc(s.email)}"></label>
        <label class="field"><span>Website / socials</span><input name="website" value="${esc(s.website)}"></label>
        <label class="field"><span>Currency symbol</span><input name="currency" value="${esc(s.currency)}"></label>
        <label class="field"><span>Phone country code</span><input name="country_code" value="${esc(s.country_code)}"></label>
        <div class="span-2 logo-studio">
          <div class="ls-preview" id="lsPrev"></div>
          <div class="ls-controls">
            <div class="field"><span>Logo style</span><div class="seg" id="lsMode">${[['pixel', 'Pixel mark'], ['letters', 'Letters'], ['image', 'Upload logo']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${(s.logo_mode || 'pixel') === k ? 'active' : ''}">${l}</button>`).join('')}</div></div>
            <div class="field ls-pixel"><span>Pixel icon</span><div class="icon-pick">${Object.keys(App.brand.ICONS).map((k) => `<button type="button" data-icon="${k}" class="${(s.logo_icon || 'anchor') === k ? 'on' : ''}" title="${k}">${App.brand.pixelSvg(k, s.accent, s.accent2)}</button>`).join('')}</div></div>
            <label class="field ls-letters"><span>Logo letters (1–3)</span><input name="logo_text" maxlength="3" value="${esc(s.logo_text)}"></label>
            <div class="field ls-image"><span>Logo image <small class="muted">(PNG/JPG/SVG, square works best)</small></span><div class="row gap-s"><label class="btn ghost">${App.icon('upload')} Choose file<input type="file" accept="image/*" id="lsFile" hidden></label>${s.logo_image ? '<button type="button" class="btn ghost sm danger-text" id="lsClear">Remove</button>' : ''}</div></div>
            <input type="hidden" name="logo_mode" value="${esc(s.logo_mode || 'pixel')}"><input type="hidden" name="logo_icon" value="${esc(s.logo_icon || 'anchor')}"><input type="hidden" name="logo_image" value="${esc(s.logo_image || '')}">
            <div class="field"><span>Brand colours</span><div class="swatches">${ACCENTS.map((c) => `<button type="button" class="swatch ${c === s.accent ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}<input type="color" name="accent" value="${esc(s.accent)}" title="Primary"><input type="color" name="accent2" value="${esc(s.accent2 || '#22d3ee')}" title="Secondary"></div></div>
          </div>
        </div>
        <label class="field"><span>Receipt paper</span><select name="receipt_paper">${UI.options([['80mm', 'Thermal 80mm'], ['a4', 'A4 / Letter']], s.receipt_paper)}</select></label>
        <label class="field span-2"><span>Receipt footer / terms</span><textarea name="receipt_footer" rows="3">${esc(s.receipt_footer)}</textarea></label>
      </form><div class="row end"><button class="btn primary" id="sfSave">Save store profile</button></div></section>
      <section class="card"><div class="card-head"><div><h3>Live preview</h3><p>Receipt header</p></div></div><div id="sfPrev" class="doc-preview small"></div></section></div>`;
    const form = body.querySelector('#sf');
    const prev = () => {
      const d = formData(form);
      const studio = body.querySelector('.logo-studio');
      studio.dataset.mode = d.logo_mode;
      body.querySelector('#lsPrev').innerHTML = `<div class="ls-card">${App.brand.mark('xl', d)}${App.brand.wordmark(d, 'lg')}<span class="pixel-tag">${esc(d.tagline)}</span></div><div class="ls-small"><div class="ls-chip">${App.brand.mark('', d)}<span>${App.brand.wordmark(d)}</span></div><div class="ls-chip light">${App.brand.mark('', d)}<span>${App.brand.wordmark(d)}</span></div></div>`;
      body.querySelectorAll('[data-icon]').forEach((b) => (b.innerHTML = App.brand.pixelSvg(b.dataset.icon, d.accent, d.accent2)));
      document.documentElement.style.setProperty('--accent2', d.accent2);
      body.querySelector('#sfPrev').innerHTML = `<div class="doc paper-80mm"><header class="doc-head"><div class="doc-logo">${App.brand.mark('', d)}</div><div><h2>${esc(d.store_name)}</h2><p>${esc(d.legal_name)} · ${esc(d.registration_no)}</p><p>${esc(d.address).replace(/\n/g, '<br>')}</p><p>${esc(d.phone)}</p></div></header><footer class="doc-foot">${esc(d.receipt_footer)}</footer></div>`; document.documentElement.style.setProperty('--accent', d.accent); };
    body.querySelector('#lsMode').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; form.logo_mode.value = b.dataset.mode; body.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('active', x === b)); prev(); };
    body.querySelectorAll('[data-icon]').forEach((b) => (b.onclick = () => { form.logo_icon.value = b.dataset.icon; body.querySelectorAll('[data-icon]').forEach((x) => x.classList.toggle('on', x === b)); prev(); }));
    body.querySelector('#lsFile').onchange = async (e) => { try { form.logo_image.value = await App.brand.readLogo(e.target.files[0]); form.logo_mode.value = 'image'; body.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('active', x.dataset.mode === 'image')); prev(); U.toast('Logo loaded — press Save', 'success'); } catch (er) { U.toast(er.message, 'danger'); } };
    body.querySelector('#lsClear')?.addEventListener('click', () => { form.logo_image.value = ''; form.logo_mode.value = 'pixel'; body.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('active', x.dataset.mode === 'pixel')); prev(); });
    form.oninput = prev; prev();
    body.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { form.accent.value = b.dataset.c; body.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b)); prev(); }));
    body.querySelector('#sfSave').onclick = () => saveSettings(formData(form));
  }

  function rules(body, s) {
    body.innerHTML = `<section class="card narrow"><form id="rf" class="form-grid">
      <h4 class="span-2 mini-title">Tax</h4>
      <label class="chip-check span-2"><input type="checkbox" name="tax_enabled" ${s.tax_enabled ? 'checked' : ''}><span>Charge sales tax (e.g. SST)</span></label>
      <label class="field"><span>Tax label</span><input name="tax_label" value="${esc(s.tax_label)}"></label>
      <label class="field"><span>Rate (%)</span><input type="number" name="tax_rate" step=".01" value="${s.tax_rate}"></label>
      <label class="chip-check span-2"><input type="checkbox" name="tax_inclusive" ${s.tax_inclusive ? 'checked' : ''}><span>Shelf prices already include tax</span></label>
      <h4 class="span-2 mini-title">Warranty & returns</h4>
      <label class="field"><span>Default warranty — new items (days)</span><input type="number" name="warranty_new_days" value="${s.warranty_new_days}"></label>
      <label class="field"><span>Default warranty — used items (days)</span><input type="number" name="warranty_used_days" value="${s.warranty_used_days}"></label>
      <label class="field"><span>Default repair warranty (days)</span><input type="number" name="warranty_repair_days" value="${s.warranty_repair_days}"></label>
      <label class="field"><span>Refund / exchange window (days)</span><input type="number" name="refund_window_days" value="${s.refund_window_days}"></label>
      <h4 class="span-2 mini-title">Loyalty & cash</h4>
      <label class="chip-check"><input type="checkbox" name="loyalty_enabled" ${s.loyalty_enabled ? 'checked' : ''}><span>Loyalty points</span></label>
      <label class="field"><span>Points per ${esc(s.currency)}1 spent</span><input type="number" step=".1" name="loyalty_rate" value="${s.loyalty_rate}"></label>
      <label class="chip-check span-2"><input type="checkbox" name="require_shift_for_cash" ${s.require_shift_for_cash ? 'checked' : ''}><span>Require an open shift for any cash movement (recommended)</span></label>
    </form><div class="row end"><button class="btn primary" id="rfSave">Save rules</button></div></section>`;
    body.querySelector('#rfSave').onclick = () => saveSettings(formData(body.querySelector('#rf')));
  }

  function lists(body, s) {
    const editor = (key, label, locked = []) => `<section class="card"><div class="card-head"><div><h3>${label}</h3></div></div>
      <div class="tag-list">${s[key].map((v, i) => `<span class="tag">${esc(v)}${locked.includes(v) ? '' : `<button data-del="${key}:${i}">${I('x')}</button>`}</span>`).join('')}</div>
      <div class="input-group mt-s"><input id="add-${key}" placeholder="Add ${label.toLowerCase().replace(/s$/, '')}"><button class="btn ghost" data-add="${key}">Add</button></div></section>`;
    body.innerHTML = `<div class="grid-2">${editor('categories', 'Categories', ['Repair Parts', 'Gift Cards'])}${editor('platforms', 'Platforms')}</div><p class="muted small">Removing a category does not change existing products. SKU prefixes come from the first 3 letters for custom categories.</p>`;
    body.onclick = async (e) => {
      const d = e.target.closest('[data-del]'), a = e.target.closest('[data-add]');
      if (d) { const [k, i] = d.dataset.del.split(':'); const arr = [...s[k]]; arr.splice(+i, 1); await saveSettings({ [k]: arr }); App.rerender(); }
      if (a) { const k = a.dataset.add; const v = body.querySelector(`#add-${k}`).value.trim(); if (!v || s[k].includes(v)) return; await saveSettings({ [k]: [...s[k], v] }); App.rerender(); }
    };
  }

  function staff(body) {
    const rows = S.all('staff');
    body.innerHTML = `<div class="grid-2-1"><section class="card"><div class="card-head"><div><h3>Team</h3><p>Each person signs in with their own PIN — every transaction records who did it.</p></div><button class="btn primary" id="sfNew">${I('plus')} Add staff</button></div>
      ${UI.table(['Name', 'Role', 'Status', ''], rows.map((x) => `<tr><td><div class="prod-cell"><span class="avatar" style="background:${esc(x.color)}">${esc(U.initials(x.name))}</span><strong>${esc(x.name)}</strong></div></td><td>${esc(App.ROLES[x.role]?.label)}</td><td>${x.active === false ? UI.badge('Disabled', 'muted') : UI.badge('Active', 'success')}</td><td><button class="icon-btn" data-ed="${x.id}">${I('edit')}</button></td></tr>`))}</section>
      <section class="card"><div class="card-head"><div><h3>What each role can do</h3></div></div>
        <div class="role-matrix">${Object.entries(App.ROLES).map(([k, r]) => `<div><strong>${r.label}</strong><span class="muted small">${r.perms.includes('*') ? 'Everything, incl. settings, backdating, reset' : r.perms.map((p) => p.replace('_', ' ').replace('.', ': ')).join(', ')}</span></div>`).join('')}</div></section></div>`;
    const form = (x = {}) => {
      const m = UI.modal({ title: x.id ? 'Edit staff' : 'Add staff', size: 'sm',
        body: `<label class="field"><span>Name</span><input id="sName" value="${esc(x.name || '')}"></label><label class="field"><span>Role</span><select id="sRole">${UI.options(Object.entries(App.ROLES).map(([k, r]) => [k, r.label]), x.role || 'cashier')}</select></label><label class="field"><span>PIN (4–6 digits)</span><input id="sPin" inputmode="numeric" maxlength="6" value="" placeholder="${x.id ? 'Leave blank to keep' : ''}"></label><label class="field"><span>Colour</span><input type="color" id="sCol" value="${esc(x.color || '#7c5cff')}"></label>${x.id ? `<label class="chip-check"><input type="checkbox" id="sAct" ${x.active !== false ? 'checked' : ''}><span>Active</span></label>` : ''}`,
        footer: '<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="sGo">Save</button>' });
      m.el.querySelector('#sGo').onclick = async () => {
        const name = m.el.querySelector('#sName').value.trim(), pin = m.el.querySelector('#sPin').value.trim(), role = m.el.querySelector('#sRole').value;
        if (!name) return U.toast('Name required', 'danger');
        if ((!x.id || pin) && !/^\d{4,6}$/.test(pin)) return U.toast('PIN must be 4–6 digits', 'danger');
        if (pin && S.find('staff', (y) => y.pin === pin && y.id !== x.id)) return U.toast('That PIN is used by someone else', 'danger');
        const active = m.el.querySelector('#sAct') ? m.el.querySelector('#sAct').checked : true;
        const owners = S.filter('staff', (y) => y.role === 'owner' && y.active !== false && y.id !== x.id);
        if (x.role === 'owner' && (role !== 'owner' || !active) && !owners.length) return U.toast('Keep at least one active owner', 'danger');
        await S.upsert('staff', { ...x, id: x.id || U.uid(), name, role, color: m.el.querySelector('#sCol').value, active, ...(pin ? { pin } : {}) });
        await svc.audit('staff.save', `${name} (${role})`);
        m.close(); App.rerender();
      };
    };
    body.querySelector('#sfNew').onclick = () => form();
    body.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => form(S.get('staff', b.dataset.ed))));
  }

  function data(body, s) {
    const counts = App.TABLES.map((t) => [t, S.all(t).length]);
    const bytes = (() => { try { let n = 0; for (const k in localStorage) if (k.startsWith(App.config.storagePrefix)) n += (localStorage.getItem(k) || '').length; return n; } catch { return 0; } })();
    body.innerHTML = `<div class="grid-2">
      <section class="card"><div class="card-head"><div><h3>Backup & restore</h3><p>Everything lives in this browser until Supabase is connected. Back up regularly.</p></div></div>
        <div class="kv boxed"><div><span>Storage used</span><strong>${(bytes / 1024).toFixed(0)} KB of ~5,000 KB</strong></div><div><span>Backend</span><strong>${esc(S.adapter.name)}</strong></div></div>
        <div class="row gap-s wrap mt"><button class="btn primary" id="bkJson">${I('download')} Full backup (.json)</button><label class="btn ghost">${I('upload')} Restore backup<input type="file" accept=".json" id="bkFile" hidden></label></div>
        <h4 class="mini-title mt">Export a table as CSV</h4>
        <div class="input-group"><select id="bkTable">${UI.options(counts.map(([t, n]) => [t, `${t} (${n})`]))}</select><button class="btn ghost" id="bkCsv">${I('download')} CSV</button></div>
      </section>
      <section class="card"><div class="card-head"><div><h3>Go live</h3><p>${s.go_live_at ? `Live since ${U.fmtDate(s.go_live_at)}` : 'Currently in demo / setup mode'}</p></div>${s.go_live_at ? UI.badge('LIVE', 'success') : UI.badge('SETUP', 'warning')}</div>
        ${!s.go_live_at ? `<p class="muted small">Going live wipes demo transactions, resets stock to zero and document numbering, keeps your products, customers, suppliers & staff, then locks the reset button permanently.</p>
          <label class="chip-check"><input type="checkbox" id="glKeepStock"><span>Keep current stock quantities (e.g. you've already entered real stock)</span></label>
          <button class="btn danger mt" id="glGo">${I('zap')} Go live</button>` : '<p class="muted small">Reset is locked. Use stock adjustments and voids for corrections — every change stays auditable.</p>'}
        <hr>
        <h4 class="mini-title">Demo tools</h4>
        <div class="row gap-s wrap"><button class="btn ghost danger-text" id="dmReset" ${s.go_live_at ? 'disabled' : ''}>Reload fresh demo data</button><button class="btn ghost danger-text" id="dmWipe" ${s.go_live_at ? 'disabled' : ''}>Factory reset (empty store)</button></div>
      </section></div>`;
    body.querySelector('#bkJson').onclick = async () => { U.download(`${s.store_name.replace(/\W+/g, '-').toLowerCase()}-backup-${U.dateKey()}.json`, JSON.stringify({ app: App.config.appName, version: App.config.version, exported_at: U.nowISO(), data: S.snapshot() }, null, 1), 'application/json'); await svc.audit('data.backup', 'Full backup exported'); };
    body.querySelector('#bkCsv').onclick = () => { const t = body.querySelector('#bkTable').value; U.download(`${t}-${U.dateKey()}.csv`, U.toCSV(S.all(t)), 'text/csv'); };
    body.querySelector('#bkFile').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        if (!json.data || !Array.isArray(json.data.products)) throw new Error('Not an Arcadia POS backup file.');
        if (!(await UI.confirm({ title: 'Restore backup?', message: `This replaces ALL data in this browser with the backup from ${U.fmtDateTime(json.exported_at)}.`, confirmText: 'Restore', danger: true, requireText: 'RESTORE' }))) return;
        await S.replaceAll(json.data); U.toast('Backup restored', 'success'); setTimeout(() => location.reload(), 600);
      } catch (er) { U.toast(er.message, 'danger'); }
    };
    body.querySelector('#glGo')?.addEventListener('click', async () => {
      if (!(await UI.confirm({ title: 'Go live now?', message: 'All demo/test transactions are permanently deleted. Download a backup first if unsure.', confirmText: 'Go live', danger: true, requireText: 'GO LIVE' }))) return;
      const keep = body.querySelector('#glKeepStock').checked;
      await S.tx(async () => {
        for (const t of ['sales', 'buys', 'trades', 'repairs', 'after_sales', 'purchase_orders', 'consignments', 'consignment_settlements', 'shifts', 'cash_ledger', 'stock_takes', 'counters', 'held_carts']) for (const r of [...S.all(t)]) await S.remove(t, r.id);
        for (const m of [...S.all('stock_moves')]) await S.remove('stock_moves', m.id);
        for (const p of S.all('products')) {
          if (keep && p.stock > 0) await S.insert('stock_moves', { at: U.nowISO(), product_id: p.id, sku: p.sku, product_name: p.name, delta: p.stock, before: 0, after: p.stock, ref_type: 'opening', ref_no: 'GO-LIVE', reason: 'Opening stock at go-live', staff_name: App.session.staff.name });
          else await S.update('products', p.id, { stock: 0 });
        }
        for (const c of S.all('customers')) await S.update('customers', c.id, { points: 0 });
        await S.upsert('settings', { ...S.settings(), go_live_at: U.nowISO() });
      });
      await svc.audit('system.go_live', keep ? 'Kept stock' : 'Stock reset to 0');
      U.toast('You are live!', 'success'); App.rerender();
    });
    const wipe = async (reseed) => {
      if (!(await UI.confirm({ title: reseed ? 'Reload demo data?' : 'Factory reset?', message: 'Everything in this browser is erased.', confirmText: 'Erase', danger: true, requireText: 'RESET' }))) return;
      await S.adapter.wipe(App.TABLES);
      try { sessionStorage.clear(); } catch {}
      if (reseed) { location.reload(); return; }
      await S.replaceAll({ settings: [{ ...App.DEFAULT_SETTINGS, store_name: 'My Game Store', legal_name: '', registration_no: '', address: '', phone: '', email: '', website: '', logo_text: 'GS' }], staff: [{ id: U.uid(), name: 'Owner', role: 'owner', pin: '1234', color: '#7c5cff', active: true }] });
      location.reload();
    };
    body.querySelector('#dmReset').onclick = () => wipe(true);
    body.querySelector('#dmWipe').onclick = () => wipe(false);
  }

  function cloud(body) {
    const c = App.config;
    body.innerHTML = `<div class="grid-2-1"><section class="card"><div class="card-head"><div><h3>Supabase connection</h3><p>Cloud sync for multiple counters, branches and devices.</p></div>${UI.badge(c.backend === 'supabase' ? 'Connected' : 'Local mode', c.backend === 'supabase' ? 'success' : 'warning')}</div>
      <ol class="howto">
        <li>Create a project at <b>supabase.com</b> (Singapore region recommended for Malaysia).</li>
        <li>Open <b>SQL Editor</b> and run <code>supabase/schema.sql</code> from this repository — it creates every table, indexes and row-level security.</li>
        <li>In <code>js/core/config.js</code> set <code>backend: 'supabase'</code> and paste the project URL & anon key.</li>
        <li>Uncomment the supabase-js script tag in <code>index.html</code>.</li>
        <li>Export a JSON backup here, then import it with <code>supabase/import-backup.md</code> to migrate your data.</li>
      </ol>
      <p class="muted small">The app talks to one data adapter interface, so switching backends doesn't touch any screen or business rule.</p></section>
      <section class="card"><div class="card-head"><div><h3>Current backend</h3></div></div><div class="kv"><div><span>Adapter</span><strong>${esc(S.adapter.name)}</strong></div><div><span>Tables</span><strong>${App.TABLES.length}</strong></div><div><span>Records</span><strong>${App.TABLES.reduce((a, t) => a + S.all(t).length, 0)}</strong></div></div></section></div>`;
  }

  function audit(body) {
    const rows = S.all('audit_log').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
    body.innerHTML = `<section class="card"><div class="card-head"><div><h3>Audit log</h3><p>Sensitive actions: voids, adjustments, overrides, settings, staff, backups.</p></div></div>
      ${UI.table(['When', 'Who', 'Action', 'Detail'], rows.map((r) => `<tr><td>${U.fmtDateTime(r.at)}</td><td>${esc(r.staff_name)}</td><td>${UI.badge(r.action, 'muted')}</td><td>${esc(r.detail)}</td></tr>`), UI.empty('Nothing logged yet', '', 'shield'))}</section>`;
  }
})();
