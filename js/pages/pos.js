/* Point of Sale */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);

  const st = { cart: [], customer_id: null, discount: 0, discMode: 'amt', note: '', cat: '', platform: '', q: '' };
  App.posSetCustomer = (id) => { st.customer_id = id; };

  function addToCart(p) {
    if (!p) return;
    if (p.stock <= 0) return U.toast(`${p.name} is out of stock`, 'danger');
    const line = st.cart.find((l) => l.product_id === p.id);
    if (line) {
      if (line.qty + 1 > p.stock) return U.toast(`Only ${p.stock} in stock`, 'danger');
      line.qty++;
    } else st.cart.push({ product_id: p.id, qty: 1, unit_price: p.price });
    drawCart();
    bump();
  }
  const bump = () => { const f = document.querySelector('.cart-fab'); if (f) { f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump'); } };
  const discountAmt = (sub) => st.discMode === 'pct' ? U.r2(sub * U.clamp(U.num(st.discount), 0, 100) / 100) : U.clamp(U.num(st.discount), 0, sub);
  const quote = () => svc.priceLines(st.cart.map((l) => ({ ...l })), 0).subtotal;
  const priced = () => { const sub = quote(); return svc.priceLines(st.cart.map((l) => ({ ...l })), discountAmt(sub)); };

  let root;
  App.page('pos', {
    title: 'Point of Sale', sub: 'Scan or search, tap to add, F9 to pay',
    render(el) {
      root = el;
      const s = S.settings();
      el.innerHTML = `
        <div class="pos">
          <section class="pos-catalog">
            <div class="pos-toolbar">
              <div class="input-icon grow">${I('scan')}<input id="posQ" type="search" placeholder="Scan barcode or search product, SKU, serial…  ( / )" autocomplete="off" value="${esc(st.q)}"></div>
              <select id="posPlat" class="w-auto">${UI.options(s.platforms, st.platform, 'All platforms')}</select>
            </div>
            <div class="chips" id="posCats">${['', ...s.categories.filter((c) => c !== 'Repair Parts')].map((c) => `<button class="chip-btn ${c === st.cat ? 'active' : ''}" data-cat="${esc(c)}">${esc(c || 'All')}</button>`).join('')}</div>
            <div class="product-grid" id="posGrid"></div>
          </section>
          <aside class="pos-cart" id="posCart"></aside>
        </div>
        <button class="cart-fab" id="cartFab"></button>`;
      drawGrid();
      drawCart();
      const q = el.querySelector('#posQ');
      q.addEventListener('input', U.debounce(() => { st.q = q.value; drawGrid(); }, 90));
      q.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const v = q.value.trim();
        if (!v) return;
        const exact = S.find('products', (p) => p.active !== false && (p.sku.toLowerCase() === v.toLowerCase() || (p.barcode && p.barcode === v) || (p.serial && U.normSerial(p.serial) === U.normSerial(v))));
        const list = visible();
        const hit = exact || (list.length === 1 ? list[0] : null);
        if (hit) { addToCart(hit); q.value = ''; st.q = ''; drawGrid(); }
      });
      el.querySelector('#posPlat').onchange = (e) => { st.platform = e.target.value; drawGrid(); };
      el.querySelector('#posCats').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; st.cat = b.dataset.cat; el.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('active', x === b)); drawGrid(); };
      el.querySelector('#posGrid').onclick = (e) => { const c = e.target.closest('[data-pid]'); if (c) addToCart(S.get('products', c.dataset.pid)); };
      el.querySelector('#cartFab').onclick = () => document.body.classList.add('cart-open');
      setTimeout(() => window.matchMedia('(min-width: 900px)').matches && q.focus(), 50);
    },
    onKey(e) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); root.querySelector('#posQ')?.focus(); }
      if (e.key === 'F9') { e.preventDefault(); openPayment(); }
    },
  });

  const visible = () => S.filter('products', (p) => p.active !== false && p.category !== 'Repair Parts' && (!st.cat || p.category === st.cat) && (!st.platform || p.platform === st.platform) && U.match(st.q, p.name, p.sku, p.serial, p.barcode, p.platform))
    .sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.name.localeCompare(b.name));

  function drawGrid() {
    const g = root.querySelector('#posGrid');
    const list = visible().slice(0, 120);
    g.innerHTML = list.map((p) => {
      const inCart = st.cart.find((l) => l.product_id === p.id)?.qty || 0;
      return `<button class="p-card ${p.stock <= 0 ? 'out' : ''}" data-pid="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
        ${UI.productThumb(p)}${inCart ? `<span class="p-incart">${inCart}</span>` : ''}
        <div class="p-tags">${p.platform ? `<span>${esc(p.platform)}</span>` : ''}${p.condition !== 'New' ? `<span class="warn">${esc(p.condition)}</span>` : ''}${p.ownership === 'consignment' ? '<span class="info">Consign</span>' : ''}</div>
        <strong class="p-name">${esc(p.name)}</strong>
        <span class="p-sku">${esc(p.sku)}${p.serial ? ' · SN' : ''}</span>
        <div class="p-foot"><b>${U.money(p.price)}</b><em class="${p.stock <= 0 ? 'danger' : svc.isLow(p) ? 'warn' : ''}">${p.stock <= 0 ? 'Out' : p.stock + ' left'}</em></div>
      </button>`;
    }).join('') || UI.empty('No products match', 'Try another search or category', 'search');
  }

  function drawCart() {
    const c = root.querySelector('#posCart');
    if (!c) return;
    const pr = priced();
    const held = S.all('held_carts').length;
    const canPrice = svc.can('pos.price');
    c.innerHTML = `
      <div class="cart-head">
        <div><h3>Current sale</h3><span class="muted small">${((n) => `${n} item${n === 1 ? '' : 's'}`)(st.cart.reduce((a, l) => a + l.qty, 0))}</span></div>
        <div class="row gap-xs">
          <button class="icon-btn" data-act="resume" title="Held sales">${I('history')}${held ? `<span class="dot-badge">${held}</span>` : ''}</button>
          <button class="icon-btn" data-act="hold" title="Hold sale" ${st.cart.length ? '' : 'disabled'}>${I('pause')}</button>
          <button class="icon-btn" data-act="clear" title="Clear" ${st.cart.length ? '' : 'disabled'}>${I('trash')}</button>
          <button class="icon-btn only-mobile" data-act="close-cart">${I('x')}</button>
        </div>
      </div>
      ${UI.customerChip(st.customer_id)}
      <div class="cart-lines">
        ${pr.lines.map((l, i) => { const p = S.get('products', l.product_id); return `
          <div class="cart-line">
            <div class="cl-main"><strong>${esc(p?.name)}</strong><span>${esc(p?.sku)}${p?.serial ? ' · SN ' + esc(p.serial) : ''} · ${esc(p?.condition)}</span>
              <div class="cl-price">${canPrice ? `<input type="number" step=".01" min="0" class="price-input" data-price="${i}" value="${l.unit_price}">` : `<span>${U.money(l.unit_price)}</span>`}<span class="muted">each</span></div></div>
            <div class="cl-side">
              <div class="stepper"><button data-dec="${i}">${I('minus')}</button><span>${l.qty}</span><button data-inc="${i}" ${p?.serial || l.qty >= (p?.stock || 0) ? 'disabled' : ''}>${I('plus')}</button></div>
              <strong>${U.money(l.total)}</strong>
            </div>
            <button class="cl-remove" data-rm="${i}" title="Remove">${I('x')}</button>
          </div>`; }).join('') || `<div class="cart-empty">${I('cart')}<strong>Cart is empty</strong><span>Tap a product or scan a barcode</span></div>`}
      </div>
      <div class="cart-foot">
        <div class="disc-row">
          <label>Discount</label>
          <div class="input-group"><input type="number" min="0" step=".01" id="discIn" value="${st.discount || ''}" placeholder="0"><div class="seg sm"><button data-dm="amt" class="${st.discMode === 'amt' ? 'active' : ''}">${esc(S.settings().currency)}</button><button data-dm="pct" class="${st.discMode === 'pct' ? 'active' : ''}">%</button></div></div>
        </div>
        <div class="totals">
          <div><span>Subtotal</span><span>${U.money(pr.subtotal)}</span></div>
          ${pr.discount ? `<div><span>Discount</span><span class="danger">-${U.money(pr.discount)}</span></div>` : ''}
          ${pr.tax ? `<div><span>${esc(S.settings().tax_label)} ${S.settings().tax_inclusive ? '(included)' : ''}</span><span>${U.money(pr.tax)}</span></div>` : ''}
          <div class="grand"><span>Total</span><span>${U.money(pr.total)}</span></div>
        </div>
        <button class="btn primary xl block" data-act="pay" ${st.cart.length ? '' : 'disabled'}>Charge ${U.money(pr.total)} <kbd>F9</kbd></button>
      </div>`;
    const fab = root.querySelector('#cartFab');
    fab.innerHTML = `${I('cart')}<span>${((n) => `${n} item${n === 1 ? '' : 's'}`)(st.cart.reduce((a, l) => a + l.qty, 0))}</span><strong>${U.money(pr.total)}</strong>`;
    fab.classList.toggle('hidden', !st.cart.length);
    bindCart(c);
    drawGridCounts();
  }
  const drawGridCounts = () => root.querySelectorAll('[data-pid]').forEach((b) => {
    const n = st.cart.find((l) => l.product_id === b.dataset.pid)?.qty || 0;
    let badge = b.querySelector('.p-incart');
    if (n && !badge) { badge = document.createElement('span'); badge.className = 'p-incart'; b.appendChild(badge); }
    if (badge) { if (n) badge.textContent = n; else badge.remove(); }
  });

  function bindCart(c) {
    c.onclick = async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.inc != null) { const l = st.cart[+t.dataset.inc]; const p = S.get('products', l.product_id); if (l.qty < p.stock) l.qty++; drawCart(); }
      else if (t.dataset.dec != null) { const l = st.cart[+t.dataset.dec]; l.qty--; if (l.qty <= 0) st.cart.splice(+t.dataset.dec, 1); drawCart(); }
      else if (t.dataset.rm != null) { st.cart.splice(+t.dataset.rm, 1); drawCart(); }
      else if (t.dataset.dm) { st.discMode = t.dataset.dm; drawCart(); }
      else if (t.dataset.act === 'pick-customer') { const id = await UI.pickCustomer(); if (id !== undefined) { st.customer_id = id; drawCart(); } }
      else if (t.dataset.act === 'clear') { if (await UI.confirm({ title: 'Clear cart?', confirmText: 'Clear', danger: true })) reset(); }
      else if (t.dataset.act === 'hold') hold();
      else if (t.dataset.act === 'resume') resume();
      else if (t.dataset.act === 'pay') openPayment();
      else if (t.dataset.act === 'close-cart') document.body.classList.remove('cart-open');
    };
    c.querySelector('#discIn').onchange = (e) => {
      const v = U.num(e.target.value);
      const sub = quote();
      const amt = st.discMode === 'pct' ? sub * v / 100 : v;
      if (amt > sub * 0.3 && !svc.can('pos.price')) { U.toast('Discounts above 30% need a manager', 'danger'); e.target.value = st.discount || ''; return; }
      st.discount = v; drawCart();
    };
    c.querySelectorAll('[data-price]').forEach((inp) => (inp.onchange = () => { const l = st.cart[+inp.dataset.price]; l.unit_price = Math.max(0, U.r2(inp.value)); drawCart(); }));
  }

  function reset() { Object.assign(st, { cart: [], customer_id: null, discount: 0, discMode: 'amt', note: '' }); drawCart(); drawGrid(); document.body.classList.remove('cart-open'); }

  async function hold() {
    const label = await UI.confirm({ title: 'Hold this sale', message: 'Park the cart and serve another customer. Stock is not reserved.', confirmText: 'Hold', input: { label: 'Label', placeholder: 'e.g. Guy in red shirt / table 2', value: st.customer_id ? S.get('customers', st.customer_id)?.name : '' } });
    if (!label) return;
    await S.insert('held_carts', { label: label === true ? 'Held sale' : label, cart: U.clone(st.cart), customer_id: st.customer_id, discount: st.discount, discMode: st.discMode, staff_name: App.session.staff.name });
    reset(); U.toast('Sale held', 'success');
  }
  function resume() {
    const rows = S.all('held_carts');
    const m = UI.modal({
      title: 'Held sales', size: 'md',
      body: rows.length ? `<div class="list">${rows.map((h) => `<div class="list-row"><div><strong>${esc(h.label)}</strong><span class="muted small">${h.cart.reduce((a, l) => a + l.qty, 0)} items · ${esc(h.staff_name)} · ${U.relTime(h.created_at)}</span></div><div class="row gap-xs"><button class="btn sm ghost" data-del="${h.id}">${I('trash')}</button><button class="btn sm primary" data-res="${h.id}">Resume</button></div></div>`).join('')}</div>` : UI.empty('No held sales', '', 'pause'),
    });
    m.el.onclick = async (e) => {
      const r = e.target.closest('[data-res]'), d = e.target.closest('[data-del]');
      if (d) { await S.remove('held_carts', d.dataset.del); m.close(); resume(); return; }
      if (!r) return;
      if (st.cart.length && !(await UI.confirm({ title: 'Replace current cart?', message: 'The current cart will be discarded.', confirmText: 'Replace' }))) return;
      const h = S.get('held_carts', r.dataset.res);
      const cart = h.cart.filter((l) => { const p = S.get('products', l.product_id); return p && p.stock > 0; }).map((l) => ({ ...l, qty: Math.min(l.qty, S.get('products', l.product_id).stock) }));
      if (cart.length < h.cart.length) U.toast('Some items are no longer in stock and were removed', 'danger');
      Object.assign(st, { cart, customer_id: h.customer_id, discount: h.discount, discMode: h.discMode });
      await S.remove('held_carts', h.id);
      m.close(); drawCart(); drawGrid();
    };
  }

  function openPayment() {
    if (!st.cart.length) return;
    const pr = priced();
    let mode = 'single', method = 'cash', split = [{ method: 'cash', amount: '' }, { method: 'qr', amount: '' }];
    const quick = () => { const t = pr.total; const opts = [t, Math.ceil(t / 10) * 10, Math.ceil(t / 50) * 50, Math.ceil(t / 100) * 100]; return [...new Set(opts.map((x) => U.r2(x)))]; };
    const m = UI.modal({
      title: 'Take payment', size: 'md',
      body: `<div class="pay-due"><span>Amount due</span><strong>${U.money(pr.total)}</strong>${st.customer_id ? `<em>${esc(S.get('customers', st.customer_id).name)}</em>` : '<em>Walk-in customer</em>'}</div>
        <div class="seg block" id="payMode"><button class="active" data-mode="single">Single payment</button><button data-mode="split">Split payment</button></div>
        <div id="payBody"></div>
        <label class="field"><span>Note on receipt (optional)</span><input id="payNote" value="${esc(st.note)}" placeholder="e.g. Gift wrap, delivery to…"></label>`,
      footer: `<button class="btn ghost" data-close>Back</button><button class="btn primary lg" id="payGo">${I('check')} Complete sale</button>`,
    });
    const body = m.el.querySelector('#payBody');
    const draw = () => {
      if (mode === 'single') {
        body.innerHTML = `${UI.payTiles('pm', method)}
          ${method === 'cash' ? `<label class="field"><span>Cash received</span><input type="number" step=".01" min="0" id="tendered" placeholder="${pr.total.toFixed(2)}" inputmode="decimal"></label>
            <div class="chips">${quick().map((v) => `<button class="chip-btn" data-q="${v}">${U.money(v)}</button>`).join('')}</div>
            <div class="change-box" id="changeBox"><span>Change</span><strong>${U.money(0)}</strong></div>` : ''}`;
        body.querySelectorAll('[name=pm]').forEach((r) => (r.onchange = () => { method = r.value; draw(); }));
        const t = body.querySelector('#tendered');
        const upd = () => { const v = U.num(t.value); const ch = v ? U.r2(v - pr.total) : 0; const box = body.querySelector('#changeBox'); box.classList.toggle('neg', ch < 0); box.querySelector('strong').textContent = ch < 0 ? `Short ${U.money(-ch)}` : U.money(ch); };
        if (t) { t.oninput = upd; body.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { t.value = b.dataset.q; upd(); })); setTimeout(() => t.focus(), 30); }
      } else {
        const paid = U.sum(split, (s) => U.num(s.amount));
        const left = U.r2(pr.total - paid);
        body.innerHTML = `<div class="split-rows">${split.map((s, i) => `<div class="split-row"><select data-sm="${i}">${UI.payOptions(s.method)}</select><input type="number" step=".01" min="0" data-sa="${i}" value="${s.amount}" placeholder="0.00"><button class="btn ghost sm" data-fill="${i}" title="Fill remaining">=</button>${split.length > 2 ? `<button class="icon-btn" data-srm="${i}">${I('x')}</button>` : ''}</div>`).join('')}</div>
          <button class="btn ghost sm" id="addSplit">${I('plus')} Add method</button>
          <div class="change-box ${left !== 0 ? 'neg' : 'ok'}"><span>${left > 0 ? 'Remaining' : left < 0 ? 'Over by' : 'Balanced'}</span><strong>${U.money(Math.abs(left))}</strong></div>`;
        body.querySelectorAll('[data-sm]').forEach((x) => (x.onchange = () => { split[+x.dataset.sm].method = x.value; }));
        body.querySelectorAll('[data-sa]').forEach((x) => (x.onchange = () => { split[+x.dataset.sa].amount = x.value; draw(); }));
        body.querySelectorAll('[data-fill]').forEach((x) => (x.onclick = () => { const i = +x.dataset.fill; const others = U.sum(split.filter((_, j) => j !== i), (s) => U.num(s.amount)); split[i].amount = Math.max(0, U.r2(pr.total - others)).toFixed(2); draw(); }));
        body.querySelectorAll('[data-srm]').forEach((x) => (x.onclick = () => { split.splice(+x.dataset.srm, 1); draw(); }));
        body.querySelector('#addSplit').onclick = () => { split.push({ method: 'card', amount: '' }); draw(); };
      }
    };
    m.el.querySelector('#payMode').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; mode = b.dataset.mode; m.el.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('active', x === b)); draw(); };
    draw();
    const go = async () => {
      const btn = m.el.querySelector('#payGo');
      let payments, tendered = 0;
      if (mode === 'single') {
        payments = [{ method, amount: pr.total }];
        if (method === 'cash') { tendered = U.num(m.el.querySelector('#tendered').value) || pr.total; if (tendered < pr.total) return U.toast('Cash received is less than the total', 'danger'); }
      } else payments = split.map((s) => ({ method: s.method, amount: U.num(s.amount) }));
      btn.disabled = true;
      try {
        const sale = await svc.completeSale({ items: st.cart, customer_id: st.customer_id, discount: pr.discount, payments, tendered, note: m.el.querySelector('#payNote').value.trim() });
        m.close();
        reset();
        U.toast(`Sale ${sale.no} completed`, 'success');
        App.docs.show('sale', sale, { after: { label: 'New sale', run: () => root.querySelector('#posQ')?.focus() } });
      } catch (e) { U.toast(e.message, 'danger'); btn.disabled = false; }
    };
    m.el.querySelector('#payGo').onclick = go;
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'tendered') { e.preventDefault(); go(); } });
  }
})();
