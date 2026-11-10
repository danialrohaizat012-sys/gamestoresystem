/* Buy from Customer + Trade-In (share the intake item editor) */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);

  /* ---------------- intake item editor ---------------- */
  const newItem = () => ({ key: U.uid(), product_id: null, name: '', category: 'Games', platform: '', condition: 'Used', serial: '', qty: 1, unit_price: '', sell_price: '', qc: {}, qc_notes: '' });
  const qcList = (cat) => App.QC_TEMPLATES[cat] || App.QC_TEMPLATES._default;

  function itemCard(it, i, { priceLabel = 'Offer price / unit' } = {}) {
    const s = S.settings();
    const p = it.product_id ? S.get('products', it.product_id) : null;
    const qc = qcList(it.category);
    const fails = qc.filter((q) => it.qc[q] === 'fail').length;
    const done = qc.filter((q) => it.qc[q]).length;
    return `<div class="intake card" data-key="${it.key}">
      <div class="intake-head"><span class="step-n">${i + 1}</span><strong>${esc(it.name || 'New item')}</strong>${p ? UI.badge('Existing SKU ' + p.sku, 'info') : it.name ? UI.badge('New SKU', 'violet') : ''}<button class="icon-btn" data-rm-item="${it.key}" title="Remove">${I('trash')}</button></div>
      ${!it.name ? `<div class="picker" data-picker="${it.key}"></div><p class="muted small">Search the catalogue to merge into an existing SKU, or type a new name and choose “Create new item”.</p>` : `
      <div class="form-grid cols-4">
        <label class="field span-2"><span>Item name</span><input data-f="name" value="${esc(it.name)}" ${p ? 'readonly' : ''}></label>
        <label class="field"><span>Category</span><select data-f="category" ${p ? 'disabled' : ''}>${UI.options(s.categories, it.category)}</select></label>
        <label class="field"><span>Platform</span><select data-f="platform" ${p ? 'disabled' : ''}>${UI.options(s.platforms, it.platform, '—')}</select></label>
        <label class="field"><span>Condition</span><select data-f="condition">${UI.options(['Used', 'Refurbished', 'New'], it.condition)}</select></label>
        <label class="field"><span>Serial no.</span><input data-f="serial" value="${esc(it.serial)}" placeholder="Required for consoles"></label>
        <label class="field"><span>Qty</span><input data-f="qty" type="number" min="1" step="1" value="${it.qty}" ${it.serial ? 'disabled' : ''}></label>
        <label class="field"><span>${esc(priceLabel)}</span><input data-f="unit_price" type="number" min="0" step=".01" value="${it.unit_price}" placeholder="0.00"></label>
        <label class="field"><span>Resell price / unit</span><input data-f="sell_price" type="number" min="0" step=".01" value="${it.sell_price}" placeholder="${p ? p.price : '0.00'}"></label>
        <div class="field span-3 margin-hint">${marginHint(it)}</div>
      </div>
      <details class="qc" ${fails ? 'open' : ''}><summary>${I('shield')} Quality check <span class="muted">${done}/${qc.length} checked</span>${fails ? UI.badge(fails + ' failed', 'danger') : done === qc.length ? UI.badge('All checked', 'success') : ''}</summary>
        <div class="qc-grid">${qc.map((q) => `<div class="qc-row"><span>${esc(q)}</span><div class="seg sm">${['pass', 'fail', 'na'].map((v) => `<button type="button" class="${it.qc[q] === v ? 'active qc-' + v : ''}" data-qc="${esc(q)}" data-v="${v}">${v === 'na' ? 'N/A' : v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div></div>`).join('')}
        <label class="field"><span>QC notes</span><input data-f="qc_notes" value="${esc(it.qc_notes)}" placeholder="Scratches, missing parts, account status…"></label></div>
      </details>`}
    </div>`;
  }
  const marginHint = (it) => {
    const buy = U.num(it.unit_price), sell = U.num(it.sell_price) || U.num(S.get('products', it.product_id)?.price);
    if (!buy || !sell) return '<span class="muted small">Enter offer and resell price to see the expected margin.</span>';
    const mg = sell - buy;
    return `<span class="small ${mg < 0 ? 'danger' : 'success'}">Expected margin ${U.money(mg)} / unit (${U.pct((mg / sell) * 100)})</span>`;
  };

  function bindItems(host, items, redraw, onTotals) {
    host.querySelectorAll('[data-picker]').forEach((ph) => {
      const it = items.find((x) => x.key === ph.dataset.picker);
      UI.productPicker(ph, {
        allowNew: true, placeholder: 'Search product / SKU or type a new item name…',
        onPick: (p) => { Object.assign(it, { product_id: p.serial ? null : p.id, name: p.name, category: p.category, platform: p.platform, condition: p.condition === 'New' ? 'Used' : p.condition, sell_price: p.price }); redraw(); },
        onNew: (name) => { it.name = name; redraw(); },
      });
    });
    host.oninput = (e) => {
      const card = e.target.closest('[data-key]'); const f = e.target.dataset.f;
      if (!card || !f) return;
      const it = items.find((x) => x.key === card.dataset.key);
      it[f] = e.target.value;
      if (f === 'unit_price' || f === 'sell_price' || f === 'qty') { card.querySelector('.margin-hint').innerHTML = marginHint(it); onTotals(); }
    };
    host.onchange = (e) => {
      const card = e.target.closest('[data-key]'); const f = e.target.dataset.f;
      if (!card || !f) return;
      const it = items.find((x) => x.key === card.dataset.key);
      it[f] = e.target.value;
      if (f === 'serial') { if (it.serial) it.qty = 1; redraw(); }
      if (f === 'category') redraw();
    };
    host.onclick = (e) => {
      const q = e.target.closest('[data-qc]');
      if (q) { const it = items.find((x) => x.key === q.closest('[data-key]').dataset.key); it.qc[q.dataset.qc] = it.qc[q.dataset.qc] === q.dataset.v ? undefined : q.dataset.v; redraw(); return; }
      const rm = e.target.closest('[data-rm-item]');
      if (rm) { const i = items.findIndex((x) => x.key === rm.dataset.rmItem); items.splice(i, 1); if (!items.length) items.push(newItem()); redraw(); }
    };
  }
  const validItems = (items) => items.filter((i) => i.name);
  const checkQc = async (items) => {
    const failing = items.filter((it) => qcList(it.category).some((q) => it.qc[q] === 'fail'));
    if (!failing.length) return true;
    return UI.confirm({ title: 'Some QC checks failed', message: `${failing.map((i) => esc(i.name)).join(', ')} failed one or more checks. Make sure the offer reflects the faults. Continue?`, confirmText: 'Continue anyway' });
  };

  /* ---------------- Buy from customer ---------------- */
  const buy = { customer_id: null, id_no: '', items: [newItem()], method: 'cash', note: '' };
  App.page('buy', {
    title: 'Buy from Customer', sub: 'Purchase pre-owned games, consoles & accessories with QC and seller ID',
    render(el) {
      const draw = () => {
        const total = U.sum(validItems(buy.items), (i) => U.num(i.unit_price) * U.int(i.qty || 1));
        const cu = buy.customer_id ? S.get('customers', buy.customer_id) : null;
        el.innerHTML = `
          <div class="split-layout">
            <div class="stack">
              <section class="card"><div class="card-head"><div><h3>Seller</h3><p>Second-hand purchases must record the seller's identity.</p></div></div>
                <div class="form-grid">
                  <div class="span-1">${UI.customerChip(buy.customer_id, { required: true, label: 'Seller' })}</div>
                  <label class="field"><span>IC / Passport no. *</span><input id="byId" value="${esc(buy.id_no || cu?.ic_no || '')}" placeholder="e.g. 900101-14-5678"></label>
                </div>
              </section>
              <div id="byItems" class="stack">${buy.items.map((it, i) => itemCard(it, i)).join('')}</div>
              <button class="btn ghost dashed" id="byAdd">${I('plus')} Add another item</button>
            </div>
            <aside class="card sticky summary">
              <div class="card-head"><div><h3>Purchase summary</h3><p>${validItems(buy.items).length} item(s)</p></div></div>
              <div class="sum-lines">${validItems(buy.items).map((i) => `<div><span>${esc(i.name)} × ${U.int(i.qty || 1)}</span><strong>${U.money(U.num(i.unit_price) * U.int(i.qty || 1))}</strong></div>`).join('') || '<p class="muted small">No items yet</p>'}</div>
              <label class="field"><span>Pay seller via</span><select id="byMethod">${UI.payOptions(buy.method)}</select></label>
              <label class="field"><span>Internal note</span><input id="byNote" value="${esc(buy.note)}"></label>
              <div class="grand-total"><span>Total payable</span><strong id="byTotal">${U.money(total)}</strong></div>
              <button class="btn primary block lg" id="byGo">${I('check')} Complete purchase & stock in</button>
              <button class="btn ghost block sm" id="byClear">Clear draft</button>
            </aside>
          </div>`;
        bindItems(el.querySelector('#byItems'), buy.items, draw, () => { el.querySelector('#byTotal').textContent = U.money(U.sum(validItems(buy.items), (i) => U.num(i.unit_price) * U.int(i.qty || 1))); });
        el.querySelector('#byAdd').onclick = () => { buy.items.push(newItem()); draw(); };
        el.querySelector('#byMethod').onchange = (e) => (buy.method = e.target.value);
        el.querySelector('#byNote').oninput = (e) => (buy.note = e.target.value);
        el.querySelector('#byId').oninput = (e) => (buy.id_no = e.target.value);
        el.querySelector('[data-act=pick-customer]').onclick = async () => { const id = await UI.pickCustomer({ allowWalkIn: false }); if (id) { buy.customer_id = id; buy.id_no = S.get('customers', id).ic_no || buy.id_no; draw(); } };
        el.querySelector('#byClear').onclick = () => { Object.assign(buy, { customer_id: null, id_no: '', items: [newItem()], note: '' }); draw(); };
        el.querySelector('#byGo').onclick = async () => {
          const items = validItems(buy.items);
          if (!buy.id_no.trim()) return U.toast('Record the seller IC / passport number', 'danger');
          if (items.some((i) => !U.num(i.unit_price))) return U.toast('Enter an offer price for every item', 'danger');
          if (items.some((i) => i.category === 'Console' && !i.serial)) { if (!(await UI.confirm({ title: 'Console without serial?', message: 'Serial numbers protect you against stolen goods and warranty fraud. Continue without?', confirmText: 'Continue' }))) return; }
          if (!(await checkQc(items))) return;
          try {
            const cu = S.get('customers', buy.customer_id);
            if (cu && !cu.ic_no) await S.update('customers', cu.id, { ic_no: buy.id_no.trim() });
            const doc = await svc.completeBuy({ customer_id: buy.customer_id, seller_id_no: buy.id_no.trim(), items, method: buy.method, note: buy.note });
            Object.assign(buy, { customer_id: null, id_no: '', items: [newItem()], note: '' });
            draw();
            U.toast(`${doc.no} — stock updated`, 'success');
            App.docs.show('buy', doc);
          } catch (e) { U.toast(e.message, 'danger'); }
        };
      };
      draw();
    },
  });

  /* ---------------- Trade-in ---------------- */
  const tr = { customer_id: null, id_no: '', inItems: [newItem()], out: [], method: 'cash', note: '' };
  App.page('trade', {
    title: 'Trade-In', sub: 'Customer trades items towards something from your shelf',
    render(el) {
      const summary = () => {
        const t = svc.tradeTotals(validItems(tr.inItems), tr.out);
        return `<div class="card-head"><div><h3>Trade summary</h3></div></div>
              <div class="totals">
                <div><span>Items taken</span><span>${U.money(t.totalOut)}</span></div>
                <div><span>Trade-in value</span><span class="success">-${U.money(t.totalIn)}</span></div>
              </div>
              <div class="trade-balance ${t.direction}"><span>${t.direction === 'customer_pays' ? 'Customer pays' : t.direction === 'store_pays' ? 'You pay customer' : 'Even trade'}</span><strong>${U.money(Math.abs(t.balance))}</strong></div>
              ${t.balance ? `<label class="field"><span>Settle balance via</span><select id="trMethod">${UI.payOptions(tr.method)}</select></label>` : ''}
              <label class="field"><span>Internal note</span><input id="trNote" value="${esc(tr.note)}"></label>
              <button class="btn primary block lg" id="trGo">${I('check')} Complete trade-in</button>
              <button class="btn ghost block sm" id="trClear">Clear draft</button>`;
      };
      const drawSummary = () => {
        const box = el.querySelector('#trSum');
        box.innerHTML = summary();
        box.querySelector('#trMethod')?.addEventListener('change', (e) => (tr.method = e.target.value));
        box.querySelector('#trNote').oninput = (e) => (tr.note = e.target.value);
        box.querySelector('#trClear').onclick = () => { Object.assign(tr, { customer_id: null, id_no: '', inItems: [newItem()], out: [], note: '' }); draw(); };
        box.querySelector('#trGo').onclick = complete;
      };
      const complete = async () => {
          const ins = validItems(tr.inItems);
          if (ins.some((i) => !U.num(i.unit_price))) return U.toast('Enter a trade value for every trade-in item', 'danger');
          if (!(await checkQc(ins))) return;
          try {
            const doc = await svc.completeTrade({ customer_id: tr.customer_id, seller_id_no: tr.id_no.trim(), inItems: ins, outItems: tr.out, method: tr.method, note: tr.note });
            Object.assign(tr, { customer_id: null, id_no: '', inItems: [newItem()], out: [], note: '' });
            draw();
            U.toast(`${doc.no} completed`, 'success');
            App.docs.show('trade', doc);
          } catch (e) { U.toast(e.message, 'danger'); }
      };
      const draw = () => {
        const ins = validItems(tr.inItems);
        const t = svc.tradeTotals(ins, tr.out);
        el.innerHTML = `
          <div class="split-layout">
            <div class="stack">
              <section class="card"><div class="card-head"><div><h3>Customer</h3><p>Who is trading in?</p></div></div>
                <div class="form-grid"><div>${UI.customerChip(tr.customer_id, { required: true })}</div>
                <label class="field"><span>IC / Passport no.</span><input id="trId" value="${esc(tr.id_no)}" placeholder="Recommended for consoles"></label></div>
              </section>
              <div class="section-head"><h3>${I('arrowDown')} Customer gives (trade in)</h3><span class="muted">${U.money(t.totalIn)}</span></div>
              <div id="trIn" class="stack">${tr.inItems.map((it, i) => itemCard(it, i, { priceLabel: 'Trade value / unit' })).join('')}</div>
              <button class="btn ghost dashed" id="trAddIn">${I('plus')} Add trade-in item</button>
              <div class="section-head"><h3>${I('arrowUp')} Customer takes (from your stock)</h3><span class="muted">${U.money(t.totalOut)}</span></div>
              <section class="card">
                <div id="trPick"></div>
                <div class="cart-lines compact">${tr.out.map((l, i) => { const p = S.get('products', l.product_id); return `<div class="cart-line"><div class="cl-main"><strong>${esc(p.name)}</strong><span>${esc(p.sku)} · ${esc(p.condition)} · ${p.stock} in stock</span></div>
                  <div class="cl-side"><div class="stepper"><button data-odec="${i}">${I('minus')}</button><span>${l.qty}</span><button data-oinc="${i}" ${p.serial || l.qty >= p.stock ? 'disabled' : ''}>${I('plus')}</button></div>
                  ${svc.can('pos.price') ? `<input type="number" class="price-input" step=".01" data-oprice="${i}" value="${l.unit_price}">` : `<strong>${U.money(l.unit_price)}</strong>`}</div><button class="cl-remove" data-orm="${i}">${I('x')}</button></div>`; }).join('') || '<p class="muted small pad">Nothing selected — leave empty for a pure trade-in for cash/credit.</p>'}</div>
              </section>
            </div>
            <aside class="card sticky summary" id="trSum"></aside>
          </div>`;
        bindItems(el.querySelector('#trIn'), tr.inItems, draw, drawSummary);
        UI.productPicker(el.querySelector('#trPick'), {
          filter: (p) => p.stock > 0 && p.category !== 'Repair Parts', placeholder: 'Add item the customer takes…',
          onPick: (p) => { const l = tr.out.find((x) => x.product_id === p.id); if (l) { if (l.qty < p.stock && !p.serial) l.qty++; } else tr.out.push({ product_id: p.id, qty: 1, unit_price: p.price }); draw(); },
        });
        el.querySelector('#trAddIn').onclick = () => { tr.inItems.push(newItem()); draw(); };
        el.querySelector('#trId').oninput = (e) => (tr.id_no = e.target.value);
        el.querySelector('[data-act=pick-customer]').onclick = async () => { const id = await UI.pickCustomer({ allowWalkIn: false }); if (id) { tr.customer_id = id; tr.id_no = S.get('customers', id).ic_no || tr.id_no; draw(); } };
        el.querySelector('.cart-lines').onclick = (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.oinc != null) tr.out[+b.dataset.oinc].qty++;
          if (b.dataset.odec != null) { const l = tr.out[+b.dataset.odec]; l.qty--; if (l.qty <= 0) tr.out.splice(+b.dataset.odec, 1); }
          if (b.dataset.orm != null) tr.out.splice(+b.dataset.orm, 1);
          draw();
        };
        el.querySelectorAll('[data-oprice]').forEach((x) => (x.onchange = () => { tr.out[+x.dataset.oprice].unit_price = U.r2(x.value); draw(); }));
        drawSummary();
      };
      draw();
    },
  });
})();
