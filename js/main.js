/* Arcadia POS — app shell: boot, sign-in, navigation, command palette */
(function () {
  const App = (window.App = window.App || {});
  const U = App.utils;
  const S = App.store;
  const svc = App.svc;
  const { esc, $ } = U;
  const I = (n, c) => App.icon(n, c);


  const NAV = [
    ['Overview', [['dashboard', 'Dashboard', 'home', null]]],
    ['Sell', [['pos', 'Point of Sale', 'cart', 'pos'], ['trade', 'Trade-In', 'trade', 'trade'], ['buy', 'Buy from Customer', 'buy', 'buy'], ['repairs', 'Repairs', 'wrench', 'repairs'], ['after_sales', 'After-Sales', 'undo', 'after_sales']]],
    ['Stock', [['inventory', 'Inventory', 'box', 'inventory'], ['purchases', 'Purchasing', 'truck', 'purchases'], ['consignment', 'Consignment', 'layers', 'consignment'], ['stock_take', 'Stock Take', 'clipboard', 'stock_take']]],
    ['Records', [['transactions', 'Transactions', 'receipt', 'transactions'], ['customers', 'Customers', 'users', 'customers'], ['reports', 'Reports', 'chart', 'reports']]],
    ['Cash', [['shift', 'Shift & Cash', 'wallet', 'shift']]],
  ];
  const allNav = () => NAV.flatMap(([, items]) => items).concat([['settings', 'Settings', 'settings', '*']]);
  const allowed = (perm) => !perm || (perm === '*' ? svc.isOwner() : svc.can(perm));

  /* ---------- Theme & brand ---------- */
  App.applyBrand = () => {
    const s = S.settings();
    const root = document.documentElement;
    root.style.setProperty('--accent', s.accent || '#7c5cff');
    root.style.setProperty('--accent2', s.accent2 || '#22d3ee');
    document.title = `${s.store_name} · ${App.config.appName}`;
    const sig = JSON.stringify([s.store_name, s.logo_mode, s.logo_icon, s.logo_text, s.accent, s.accent2, (s.logo_image || '').length, s.tagline]);
    if (App._brandSig === sig) return;
    App._brandSig = sig;
    U.$$('[data-brand-wordmark]').forEach((el) => (el.innerHTML = App.brand.wordmark(s)));
    U.$$('[data-brand-logo]').forEach((el) => (el.innerHTML = App.brand.mark('', s)));
    U.$$('[data-brand-tagline]').forEach((el) => (el.textContent = s.tagline || ''));
    App.brand.favicon(s);
  };
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('arcadia_theme', t); } catch {}
    const b = $('#themeBtn'); if (b) b.innerHTML = I(t === 'dark' ? 'sun' : 'moon');
  };
  const initTheme = () => { let t = 'dark'; try { t = localStorage.getItem('arcadia_theme') || 'dark'; } catch {} setTheme(t); };

  /* ---------- Sign-in (staff PIN) ---------- */
  const showLogin = () => {
    App.session.staff = null;
    try { sessionStorage.removeItem('arcadia_staff'); } catch {}
    $('#app').classList.add('hidden');
    const el = $('#login');
    el.classList.remove('hidden');
    const s = S.settings();
    const staff = S.filter('staff', (x) => x.active !== false);
    let chosen = null, pin = '';
    const draw = () => {
      el.innerHTML = `
        <div class="login-shell">
          <section class="login-hero">
            <div class="pixel-field" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 37) % 100};--y:${(i * 53) % 100};--d:${(i % 5) * 0.7}s"></i>`).join('')}</div>
            <div class="hero-top">${App.brand.mark('hero-mark')}</div>
            <div class="hero-mid">
              <span class="pixel-tag">${esc(App.config.appName)} · Game Store OS</span>
              <h1>${App.brand.wordmark(s, 'xl')}</h1>
              <p>${esc(s.tagline)}</p>
              <div class="hero-pills">${[['cart', 'Sell'], ['trade', 'Trade-in'], ['buy', 'Buy-back'], ['wrench', 'Repairs']].map(([ic, l]) => `<span>${I(ic)}${l}</span>`).join('')}</div>
            </div>
            <div class="hero-foot">${esc(String(s.address || '').split(/\n/)[0])}${s.phone ? ' · ' + esc(s.phone) : ''}</div>
          </section>
          <section class="login-card">
            <div class="login-mobile-brand">${App.brand.mark()}${App.brand.wordmark(s)}</div>
            ${!chosen ? `
              <div><h2>Who's on shift?</h2><p class="muted">Tap your name and enter your PIN</p></div>
              <div class="staff-grid">${staff.map((x) => `<button class="staff-tile" data-id="${x.id}"><span class="avatar lg" style="background:${esc(x.color || 'var(--accent)')}">${esc(U.initials(x.name))}</span><strong>${esc(x.name)}</strong><span>${esc(App.ROLES[x.role]?.label || x.role)}</span></button>`).join('')}</div>
              ${!s.go_live_at ? `<p class="login-hint">${I('info')} Demo PINs — Owner 1234 · Manager 2222 · Cashier 0000 · Technician 1111</p>` : ''}`
            : `
              <button class="btn ghost sm" id="lgBack">${I('chevronLeft')} Back</button>
              <div class="pin-who"><span class="avatar lg" style="background:${esc(chosen.color || 'var(--accent)')}">${esc(U.initials(chosen.name))}</span><div><strong>${esc(chosen.name)}</strong><span>${esc(App.ROLES[chosen.role]?.label)}</span></div></div>
              <div class="pin-dots">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
              <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div>`}
            <p class="login-foot">${esc(App.config.appName)} v${App.config.version} · ${esc(S.adapter.name)}</p>
          </section>
        </div>`;
    };
    const tryPin = () => {
      if (pin.length < 4) return;
      if (String(chosen.pin) === pin) { signIn(chosen); return; }
      if (pin.length >= String(chosen.pin).length) { el.querySelector('.pin-dots')?.classList.add('shake'); U.toast('Wrong PIN', 'danger'); pin = ''; setTimeout(draw, 300); }
    };
    el.onclick = (e) => {
      const t = e.target.closest('[data-id]');
      if (t) { chosen = S.get('staff', t.dataset.id); pin = ''; draw(); return; }
      if (e.target.closest('#lgBack')) { chosen = null; draw(); return; }
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (k == null) return;
      if (k === 'C') pin = ''; else if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 6) pin += k;
      draw(); tryPin();
    };
    el.onkeydown = null;
    document.onkeydown = (e) => {
      if (!chosen || !$('#app').classList.contains('hidden')) return;
      if (/^\d$/.test(e.key) && pin.length < 6) { pin += e.key; draw(); tryPin(); }
      else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); }
      else if (e.key === 'Escape') { chosen = null; draw(); }
    };
    draw();
  };
  const signIn = (staff) => {
    App.session.staff = staff;
    App.session.backdate = null;
    try { sessionStorage.setItem('arcadia_staff', staff.id); } catch {}
    document.onkeydown = globalKeys;
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    buildShell();
    const want = location.hash.replace('#/', '');
    route(App.pages[want] && allowed(allNav().find((n) => n[0] === want)?.[3]) ? want : staff.role === 'technician' ? 'repairs' : staff.role === 'cashier' ? 'pos' : 'dashboard');
    U.toast(`Welcome, ${staff.name.split(' ')[0]}`, 'success');
  };

  /* ---------- Shell ---------- */
  const buildShell = () => {
    const st = App.session.staff;
    $('#sidebarNav').innerHTML = NAV.map(([group, items]) => {
      const vis = items.filter((n) => allowed(n[3]));
      if (!vis.length) return '';
      return `<div class="nav-group"><div class="nav-label">${esc(group)}</div>${vis.map(([id, label, icon]) => `<a href="#/${id}" class="nav-item" data-nav="${id}">${I(icon)}<span>${esc(label)}</span><em class="nav-badge" data-badge="${id}"></em></a>`).join('')}</div>`;
    }).join('') + (svc.isOwner() ? `<div class="nav-group"><a href="#/settings" class="nav-item" data-nav="settings">${I('settings')}<span>Settings</span></a></div>` : '');
    $('#userBox').innerHTML = `<span class="avatar" style="background:${esc(st.color || 'var(--accent)')}">${esc(U.initials(st.name))}</span><div><strong>${esc(st.name)}</strong><span>${esc(App.ROLES[st.role]?.label)}</span></div><button class="icon-btn" id="lockBtn" title="Lock / switch user">${I('lock')}</button>`;
    $('#lockBtn').onclick = showLogin;
    $('#backdateBtn').classList.toggle('hidden', !svc.isOwner());
    const mob = [['dashboard', 'Home', 'home', null], ['pos', 'Sell', 'cart', 'pos'], ['repairs', 'Repairs', 'wrench', 'repairs'], ['inventory', 'Stock', 'box', 'inventory'], ['__more', 'More', 'menu', null]];
    $('#mobileNav').innerHTML = mob.filter((n) => allowed(n[3])).map(([id, l, ic]) => id === '__more' ? `<button data-more>${I(ic)}<span>${l}</span></button>` : `<a href="#/${id}" data-nav="${id}">${I(ic)}<span>${l}</span></a>`).join('');
    App.applyBrand();
    updateShell();
  };
  const updateShell = () => {
    if (!App.session.staff) return;
    const sh = svc.currentShift();
    const chip = $('#shiftChip');
    chip.className = `chip ${sh ? 'chip-success' : 'chip-warning'}`;
    chip.innerHTML = `<i class="dot"></i>${sh ? `Shift open · ${U.money(svc.shiftSummary(sh).expected)}` : 'Shift closed'}`;
    chip.classList.toggle('hidden', !svc.can('shift'));
    const ready = S.filter('repairs', (r) => r.status === 'ready').length;
    const low = S.filter('products', (p) => p.active !== false && p.ownership !== 'consignment' && svc.isLow(p)).length;
    const setB = (id, v, tone = '') => { const b = document.querySelector(`[data-badge="${id}"]`); if (b) { b.textContent = v || ''; b.className = `nav-badge ${tone}`; } };
    setB('repairs', ready, 'success');
    setB('inventory', low, 'warning');
    setB('stock_take', svc.activeStockTake() ? '•' : '', 'warning');
    const b = App.session.backdate;
    $('#backdateBar').classList.toggle('hidden', !b);
    if (b) $('#backdateBar').innerHTML = `${I('alert')}<span><b>Backdated entry mode</b> — new transactions will be dated <b>${U.fmtDateTime(b.at)}</b> and won't touch the cash drawer. Reason: ${esc(b.reason)}</span><button class="btn sm" id="bdOff">Turn off</button>`;
    $('#bdOff')?.addEventListener('click', () => { App.session.backdate = null; updateShell(); });
  };
  App.updateShell = updateShell;

  /* ---------- Router ---------- */
  let current = null;
  const route = (id) => {
    if (location.hash !== `#/${id}`) { history.replaceState(null, '', `#/${id}`); }
    render(id);
  };
  App.go = (id) => { location.hash = `#/${id}`; };
  const render = (id) => {
    const nav = allNav().find((n) => n[0] === id);
    const page = App.pages[id];
    if (!page || !nav || !allowed(nav[3])) { if (id !== 'dashboard') return route('dashboard'); }
    current = id;
    U.$$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === id));
    $('#pageTitle').textContent = page.title;
    $('#pageSub').textContent = typeof page.sub === 'function' ? page.sub() : page.sub || '';
    const main = $('#view');
    main.className = `view view-${id}`;
    main.innerHTML = '';
    document.body.classList.remove('nav-open');
    try { page.render(main); } catch (e) { console.error(e); main.innerHTML = App.ui.empty('Something went wrong', e.message, 'alert'); }
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  };
  App.rerender = () => current && render(current);
  App.currentPage = () => current;
  window.addEventListener('hashchange', () => { if (App.session.staff) render(location.hash.replace('#/', '') || 'dashboard'); });

  /* ---------- Backdate (owner only) ---------- */
  const openBackdate = async () => {
    const b = App.session.backdate;
    const m = App.ui.modal({
      title: 'Backdated entry', sub: 'For migrating old records or entering transactions missed earlier. Owner only — every entry is flagged on receipts and reports.', size: 'sm',
      body: `<label class="field"><span>Transaction date & time</span><input type="datetime-local" id="bdAt" value="${b ? U.localInputValue(b.at) : U.localInputValue(U.addDays(new Date(), -1))}" max="${U.localInputValue()}"></label>
        <label class="field"><span>Reason *</span><input id="bdReason" value="${esc(b?.reason || '')}" placeholder="e.g. Migrating July records from old POS"></label>`,
      footer: `${b ? '<button class="btn ghost" id="bdStop">Turn off</button>' : '<button class="btn ghost" data-close>Cancel</button>'}<button class="btn primary" id="bdGo">Enable backdated mode</button>`,
    });
    m.el.querySelector('#bdStop')?.addEventListener('click', () => { App.session.backdate = null; m.close(); updateShell(); });
    m.el.querySelector('#bdGo').onclick = () => {
      const at = new Date(m.el.querySelector('#bdAt').value);
      const reason = m.el.querySelector('#bdReason').value.trim();
      if (Number.isNaN(at.getTime())) return U.toast('Pick a date', 'danger');
      if (at > new Date()) return U.toast('Date cannot be in the future', 'danger');
      if (!reason) return U.toast('Reason is required', 'danger');
      App.session.backdate = { at: at.toISOString(), reason };
      m.close(); updateShell();
    };
  };

  /* ---------- Command palette ---------- */
  const openPalette = () => {
    if (!App.session.staff) return;
    const m = App.ui.modal({
      title: 'Quick search', size: 'md',
      body: `<div class="input-icon">${I('search')}<input id="cmdQ" placeholder="Pages, products, customers, receipt no…" autocomplete="off"></div><div id="cmdList" class="cmd-list"></div>`,
    });
    const list = m.el.querySelector('#cmdList');
    let items = [], idx = 0;
    const draw = () => {
      const q = m.el.querySelector('#cmdQ').value.trim();
      const pages = allNav().filter((n) => allowed(n[3]) && App.pages[n[0]] && U.match(q, n[1])).map((n) => ({ icon: n[2], title: n[1], sub: 'Go to page', run: () => App.go(n[0]) }));
      const res = [...pages];
      if (q) {
        S.filter('products', (p) => p.active !== false && U.match(q, p.name, p.sku, p.serial, p.barcode)).slice(0, 6).forEach((p) => res.push({ icon: 'box', title: p.name, sub: `${p.sku} · ${U.money(p.price)} · ${p.stock} in stock`, run: () => { App.inventoryFocus = p.id; App.go('inventory'); } }));
        if (svc.can('customers')) S.filter('customers', (c) => U.match(q, c.name, c.phone)).slice(0, 4).forEach((c) => res.push({ icon: 'user', title: c.name, sub: c.phone || 'Customer', run: () => { App.customerFocus = c.id; App.go('customers'); } }));
        const docs = [['sale', 'sales'], ['buy', 'buys'], ['trade', 'trades'], ['repair', 'repairs']];
        docs.forEach(([k, t]) => S.filter(t, (x) => x.no && x.no.toLowerCase().includes(q.toLowerCase())).slice(0, 3).forEach((x) => res.push({ icon: 'receipt', title: x.no, sub: `${x.customer_name} · ${U.fmtDateTime(x.at)}`, run: () => App.docs.show(k === 'repair' ? (x.status === 'collected' ? 'repair' : 'repair_intake') : k, x) })));
      }
      items = res.slice(0, 14); idx = 0;
      list.innerHTML = items.map((it, i) => `<button class="cmd-item ${i === idx ? 'active' : ''}" data-i="${i}">${I(it.icon)}<span><strong>${esc(it.title)}</strong><em>${esc(it.sub)}</em></span>${I('chevronRight')}</button>`).join('') || App.ui.empty('No results');
    };
    const run = (i) => { const it = items[i]; if (!it) return; m.close(); it.run(); };
    m.el.querySelector('#cmdQ').addEventListener('input', draw);
    m.el.querySelector('#cmdQ').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = U.clamp(idx + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1); list.querySelectorAll('.cmd-item').forEach((b, i) => b.classList.toggle('active', i === idx)); }
      if (e.key === 'Enter') { e.preventDefault(); run(idx); }
    });
    list.addEventListener('click', (e) => { const b = e.target.closest('.cmd-item'); if (b) run(+b.dataset.i); });
    draw();
  };

  const globalKeys = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape' && App.ui.closeTopModal()) { e.preventDefault(); return; }
    if (e.key === 'F2' && svc.can('pos')) { e.preventDefault(); App.go('pos'); return; }
    const page = App.pages[current];
    if (page?.onKey && !App.ui.hasModal()) page.onKey(e);
  };

  /* ---------- Boot ---------- */
  const boot = async () => {
    initTheme();
    const sp = document.querySelector('.splash-mark'); if (sp) sp.innerHTML = App.brand.pixelSvg('anchor', '#7c5cff', '#22d3ee');
    try {
      await S.init();
      const first = await App.ensureFirstRun();
      if (first) U.toast('Demo store loaded — explore freely, reset anytime in Settings.', 'success');
    } catch (e) {
      console.error(e);
      document.body.innerHTML = `<div class="fatal">${I('alert')}<h2>Could not start</h2><p>${esc(e.message)}</p></div>`;
      return;
    }
    App.applyBrand();
    S.on(() => { updateShell(); App.applyBrand(); });
    $('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    $('#paletteBtn').onclick = openPalette;
    $('#backdateBtn').onclick = openBackdate;
    $('#shiftChip').onclick = () => App.go('shift');
    $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
    $('#scrim').onclick = () => document.body.classList.remove('nav-open');
    $('#mobileNav').addEventListener('click', (e) => { if (e.target.closest('[data-more]')) document.body.classList.add('nav-open'); });
    setTheme(document.documentElement.dataset.theme);
    let sid = null; try { sid = sessionStorage.getItem('arcadia_staff'); } catch {}
    const st = sid && S.get('staff', sid);
    if (st && st.active !== false) signIn(st); else showLogin();
    document.getElementById('splash')?.classList.add('gone');
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  };
  document.addEventListener('DOMContentLoaded', boot);
})();
