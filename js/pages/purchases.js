/* Purchasing — suppliers, purchase orders, receiving (GRN), supplier payments */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  let tab = 'orders';
  const newLine = () => ({ key: U.uid(), product_id: null, name: '', category: 'Games', platform: '', condition: 'New', qty: 1, unit_cost: '', sell_price: '' });
  const draft = { supplier_id: '', invoice_no: '', expected_at: '', notes: '', lines: [], shipping: 0, discount: 0, paid: 0, pay_method: 'bank' };

  App.page('purchases', {
    title: 'Purchasing', sub: 'Order from suppliers, receive stock with landed cost',
    render(el) {
      const pos = S.all('purchase_orders').sort((a, b) => b.at.localeCompare(a.at));
      const open = pos.filter((p) => ['ordered', 'partial'].includes(p.status));
      const owed = U.sum(pos.filter((p) => p.status !== 'cancelled'), (p) => p.total - p.paid);
      el.innerHTML = `
        <div class="stats small">
          ${UI.stat('Open orders', open.length, { hint: `${open.filter((p) => p.status === 'partial').length} partially received` })}
          ${UI.stat('Owed to suppliers', U.money(owed), { tone: owed > 0 ? 'warning' : '' })}
          ${UI.stat('Received this month', U.money(U.sum(pos.filter((p) => p.status !== 'cancelled' && p.at >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()), (p) => p.total)), { hint: 'PO value' })}
          ${UI.stat('Suppliers', S.all('suppliers').length)}
        </div>
        ${UI.tabs([['orders', 'Purchase orders', open.length], ['new', 'New purchase order'], ['suppliers', 'Suppliers']], tab)}
        <div id="puBody"></div>`;
      el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; App.rerender(); }));
      const body = el.querySelector('#puBody');
      if (tab === 'orders') orders(body, pos);
      if (tab === 'new') newPO(body);
      if (tab === 'suppliers') suppliers(body);
    },
  });

  function orders(body, pos) {
    body.innerHTML = `<section class="card">${UI.table(['PO', 'Supplier', 'Date', 'Received', '>Total', '>Balance', 'Status', ''], pos.map((p) => {
      const q = p.lines.reduce((a, l) => a + l.qty, 0), r = p.lines.reduce((a, l) => a + l.received_qty, 0);
      return `<tr class="clickable" data-po="${p.id}"><td><strong>${esc(p.no)}</strong>${p.invoice_no ? `<div class="muted small">Inv ${esc(p.invoice_no)}</div>` : ''}</td><td>${esc(p.supplier_name)}</td><td>${U.fmtDate(p.at)}${p.expected_at && p.status !== 'received' ? `<div class="muted small">ETA ${U.fmtDate(p.expected_at)}</div>` : ''}</td>
        <td><div class="progress"><div style="width:${q ? (r / q) * 100 : 0}%"></div></div><span class="muted small">${r}/${q} units</span></td><td class="num">${U.money(p.total)}</td><td class="num ${p.total - p.paid > 0 ? 'warning-text' : ''}">${U.money(p.total - p.paid)}</td><td>${UI.statusBadge(p.status)}</td><td>${I('chevronRight')}</td></tr>`;
    }), UI.empty('No purchase orders yet', 'Create one from the “New purchase order” tab', 'truck'))}</section>`;
    body.onclick = (e) => { const r = e.target.closest('[data-po]'); if (r) poDetail(r.dataset.po); };
  }

  function newPO(body) {
    const s = S.settings();
    if (!draft.lines.length) draft.lines.push(newLine());
    const draw = () => {
      const t = svc.poTotals(draft.lines.filter((l) => l.name), draft.shipping, draft.discount);
      body.innerHTML = `<div class="split-layout">
        <div class="stack">
          <section class="card"><div class="form-grid cols-3">
            <label class="field"><span>Supplier *</span><div class="input-group"><select id="poSup">${UI.options(S.all('suppliers').map((x) => [x.id, x.name]), draft.supplier_id, 'Select supplier')}</select><button class="btn ghost" id="poNewSup" title="New supplier">${I('plus')}</button></div></label>
            <label class="field"><span>Supplier invoice no.</span><input id="poInv" value="${esc(draft.invoice_no)}"></label>
            <label class="field"><span>Expected delivery</span><input id="poEta" type="date" value="${esc(draft.expected_at)}"></label>
            <label class="field span-3"><span>Notes</span><input id="poNotes" value="${esc(draft.notes)}" placeholder="Payment terms, delivery notes…"></label>
          </div></section>
          <section class="card"><div class="card-head"><div><h3>Order lines</h3><p>Stock enters inventory only when received.</p></div></div>
            <div class="po-lines">${draft.lines.map((l, i) => `<div class="po-line" data-k="${l.key}">
              ${l.name ? `<div class="po-name"><strong>${esc(l.name)}</strong><span class="muted small">${l.product_id ? esc(S.get('products', l.product_id)?.sku) : 'New SKU on receipt'}</span></div>
                ${l.product_id ? '' : `<select data-f="category">${UI.options(s.categories, l.category)}</select><select data-f="platform">${UI.options(s.platforms, l.platform, 'Platform')}</select>`}
                <label class="mini"><span>Qty</span><input data-f="qty" type="number" min="1" value="${l.qty}"></label>
                <label class="mini"><span>Unit cost</span><input data-f="unit_cost" type="number" min="0" step=".01" value="${l.unit_cost}"></label>
                <label class="mini"><span>Sell price</span><input data-f="sell_price" type="number" min="0" step=".01" value="${l.sell_price}"></label>
                <strong class="po-total">${U.money(U.num(l.unit_cost) * U.int(l.qty))}</strong>` : `<div class="po-pick grow" data-pick="${l.key}"></div>`}
              <button class="icon-btn" data-rm="${i}">${I('trash')}</button></div>`).join('')}</div>
            <button class="btn ghost dashed" id="poAdd">${I('plus')} Add line</button>
          </section>
        </div>
        <aside class="card sticky summary">
          <div class="card-head"><div><h3>Order summary</h3></div></div>
          <div class="totals"><div><span>Subtotal</span><span>${U.money(t.subtotal)}</span></div></div>
          <div class="form-grid"><label class="field"><span>Shipping</span><input id="poShip" type="number" min="0" step=".01" value="${draft.shipping}"></label><label class="field"><span>Discount</span><input id="poDisc" type="number" min="0" step=".01" value="${draft.discount}"></label></div>
          <div class="grand-total"><span>PO total</span><strong>${U.money(t.total)}</strong></div>
          <p class="muted small">Shipping & discount are spread across units as <b>landed cost</b> so your margins are real.</p>
          <div class="form-grid"><label class="field"><span>Paid now</span><input id="poPaid" type="number" min="0" step=".01" value="${draft.paid}"></label><label class="field"><span>Method</span><select id="poPM">${UI.payOptions(draft.pay_method)}</select></label></div>
          <button class="btn primary block lg" id="poGo">${I('check')} Create purchase order</button>
        </aside></div>`;
      body.querySelectorAll('[data-pick]').forEach((h) => {
        const l = draft.lines.find((x) => x.key === h.dataset.pick);
        UI.productPicker(h, { allowNew: true, showCost: true, filter: (p) => p.ownership !== 'consignment' && !p.serial, placeholder: 'Search product or type a new one…',
          onPick: (p) => { Object.assign(l, { product_id: p.id, name: p.name, category: p.category, platform: p.platform, condition: p.condition, unit_cost: p.cost || '', sell_price: p.price }); draw(); },
          onNew: (name) => { l.name = name; draw(); } });
      });
      const bindV = (id, k, num) => { const x = body.querySelector(id); x.onchange = () => { draft[k] = num ? U.num(x.value) : x.value; draw(); }; };
      bindV('#poSup', 'supplier_id'); bindV('#poInv', 'invoice_no'); bindV('#poEta', 'expected_at'); bindV('#poNotes', 'notes'); bindV('#poShip', 'shipping', 1); bindV('#poDisc', 'discount', 1); bindV('#poPaid', 'paid', 1); bindV('#poPM', 'pay_method');
      body.querySelectorAll('.po-line [data-f]').forEach((x) => (x.onchange = () => { const l = draft.lines.find((y) => y.key === x.closest('[data-k]').dataset.k); l[x.dataset.f] = x.value; draw(); }));
      body.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { draft.lines.splice(+b.dataset.rm, 1); if (!draft.lines.length) draft.lines.push(newLine()); draw(); }));
      body.querySelector('#poAdd').onclick = () => { draft.lines.push(newLine()); draw(); };
      body.querySelector('#poNewSup').onclick = async () => { const sp = await supplierForm(); if (sp) { draft.supplier_id = sp.id; draw(); } };
      body.querySelector('#poGo').onclick = async () => {
        try {
          const po = await svc.createPO({ ...draft, lines: draft.lines.filter((l) => l.name) });
          Object.assign(draft, { supplier_id: '', invoice_no: '', expected_at: '', notes: '', lines: [], shipping: 0, discount: 0, paid: 0 });
          tab = 'orders'; App.rerender(); U.toast(`${po.no} created`, 'success'); poDetail(po.id);
        } catch (e) { U.toast(e.message, 'danger'); }
      };
    };
    draw();
  }

  function poDetail(id) {
    const po = S.get('purchase_orders', id);
    const closed = ['received', 'cancelled'].includes(po.status);
    const factor = svc.poTotals(po.lines, po.shipping, po.discount).landedFactor;
    const m = UI.modal({
      title: `${po.no} · ${po.supplier_name}`, sub: `${UI.statusBadge(po.status)} ${po.invoice_no ? ' · Invoice ' + esc(po.invoice_no) : ''}`, size: 'lg',
      body: `${UI.table(['Item', '>Ordered', '>Received', '>Unit cost', '>Landed', !closed ? '>Receive now' : ''], po.lines.map((l, i) => `<tr><td><strong>${esc(l.name)}</strong><div class="muted small">${esc(l.category)}${l.platform ? ' · ' + esc(l.platform) : ''}</div></td><td class="num">${l.qty}</td><td class="num">${l.received_qty}</td><td class="num">${U.money(l.unit_cost)}</td><td class="num">${U.money(l.unit_cost * factor)}</td><td class="num">${!closed ? `<input type="number" class="qty-input" min="0" max="${l.qty - l.received_qty}" value="${l.qty - l.received_qty}" data-rcv="${i}" ${l.qty - l.received_qty <= 0 ? 'disabled' : ''}>` : ''}</td></tr>`))}
        ${!closed ? `<label class="field"><span>Receiving note</span><input id="rcNote" placeholder="e.g. 2 boxes damaged, rest OK"></label>` : ''}
        <div class="grid-2 mt">
          <div class="kv boxed"><div><span>Total</span><strong>${U.money(po.total)}</strong></div><div><span>Paid</span><strong>${U.money(po.paid)}</strong></div><div><span>Balance</span><strong class="${po.total - po.paid > 0 ? 'warning-text' : ''}">${U.money(po.total - po.paid)}</strong></div></div>
          <div><h4 class="mini-title">Receipts (GRN)</h4>${po.receipts.map((r) => `<div class="list-row"><div><strong>${esc(r.no)}</strong><span class="muted small">${U.fmtDateTime(r.at)} · ${esc(r.by)} · ${r.lines.reduce((a, x) => a + x.qty, 0)} units${r.note ? ' · ' + esc(r.note) : ''}</span></div></div>`).join('') || '<p class="muted small">Nothing received yet.</p>'}
            <h4 class="mini-title mt-s">Payments</h4>${po.payments.map((p) => `<div class="list-row"><div><strong>${U.money(p.amount)}</strong><span class="muted small">${U.fmtDate(p.at)} · ${App.paymentLabel(p.method)}</span></div></div>`).join('') || '<p class="muted small">No payments.</p>'}
          </div>
        </div>`,
      footer: `<button class="btn ghost" id="poPrint">${I('printer')} Print PO</button>
        ${po.status === 'ordered' && !po.paid ? '<button class="btn ghost danger-text" id="poCancel">Cancel PO</button>' : ''}
        ${po.status !== 'cancelled' && po.total - po.paid > 0 ? `<button class="btn ghost" id="poPay">${I('wallet')} Record payment</button>` : ''}
        ${!closed ? `<button class="btn primary" id="poRcv">${I('check')} Receive stock</button>` : ''}`,
    });
    m.el.querySelector('#poPrint').onclick = () => App.docs.show('po', po);
    m.el.querySelector('#poRcv')?.addEventListener('click', async () => {
      const rows = [...m.el.querySelectorAll('[data-rcv]')].map((x) => ({ idx: +x.dataset.rcv, qty: U.int(x.value) }));
      try { await svc.receivePO(id, rows, m.el.querySelector('#rcNote').value); m.close(); App.rerender(); U.toast('Stock received & inventory updated', 'success'); } catch (e) { U.toast(e.message, 'danger'); }
    });
    m.el.querySelector('#poPay')?.addEventListener('click', async () => {
      const pm = UI.modal({ title: 'Supplier payment', size: 'sm', body: `<label class="field"><span>Amount</span><input id="ppAmt" type="number" step=".01" value="${(po.total - po.paid).toFixed(2)}"></label><label class="field"><span>Method</span><select id="ppM">${UI.payOptions('bank')}</select></label>`, footer: '<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ppGo">Record</button>' });
      pm.el.querySelector('#ppGo').onclick = async () => { try { await svc.payPO(id, pm.el.querySelector('#ppAmt').value, pm.el.querySelector('#ppM').value); pm.close(); m.close(); App.rerender(); poDetail(id); U.toast('Payment recorded', 'success'); } catch (e) { U.toast(e.message, 'danger'); } };
    });
    m.el.querySelector('#poCancel')?.addEventListener('click', async () => {
      const reason = await UI.confirm({ title: 'Cancel PO', confirmText: 'Cancel PO', danger: true, input: { label: 'Reason', required: true } });
      if (!reason) return;
      try { await svc.cancelPO(id, reason); m.close(); App.rerender(); } catch (e) { U.toast(e.message, 'danger'); }
    });
  }

  function suppliers(body) {
    const rows = S.all('suppliers').sort((a, b) => a.name.localeCompare(b.name));
    body.innerHTML = `<section class="card"><div class="card-head"><div><h3>Suppliers & consignors</h3></div><button class="btn primary" id="spNew">${I('plus')} New supplier</button></div>
      ${UI.table(['Name', 'Contact', 'Phone / email', '>Purchased', '>Owed', ''], rows.map((s) => { const p = S.filter('purchase_orders', (x) => x.supplier_id === s.id && x.status !== 'cancelled'); return `<tr><td><strong>${esc(s.name)}</strong>${s.notes ? `<div class="muted small">${esc(s.notes)}</div>` : ''}</td><td>${esc(s.contact || '—')}</td><td>${esc(s.phone || '')}<div class="muted small">${esc(s.email || '')}</div></td><td class="num">${U.money(U.sum(p, (x) => x.total))}</td><td class="num">${U.money(U.sum(p, (x) => x.total - x.paid))}</td><td><button class="icon-btn" data-sedit="${s.id}">${I('edit')}</button></td></tr>`; }))}</section>`;
    body.querySelector('#spNew').onclick = async () => { if (await supplierForm()) App.rerender(); };
    body.onclick = async (e) => { const b = e.target.closest('[data-sedit]'); if (b && (await supplierForm(S.get('suppliers', b.dataset.sedit)))) App.rerender(); };
  }
  function supplierForm(sp = {}) {
    return new Promise((resolve) => {
      let done = false;
      const m = UI.modal({ title: sp.id ? 'Edit supplier' : 'New supplier', size: 'md', onClose: () => !done && resolve(null),
        body: `<form id="sf" class="form-grid"><label class="field span-2"><span>Company / name *</span><input name="name" value="${esc(sp.name || '')}"></label><label class="field"><span>Contact person</span><input name="contact" value="${esc(sp.contact || '')}"></label><label class="field"><span>Phone</span><input name="phone" value="${esc(sp.phone || '')}"></label><label class="field span-2"><span>Email</span><input name="email" value="${esc(sp.email || '')}"></label><label class="field span-2"><span>Address</span><input name="address" value="${esc(sp.address || '')}"></label><label class="field span-2"><span>Notes / terms</span><input name="notes" value="${esc(sp.notes || '')}"></label></form>`,
        footer: '<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="sfGo">Save</button>' });
      m.el.querySelector('#sfGo').onclick = async () => { try { const r = await svc.saveSupplier({ ...sp, ...Object.fromEntries(new FormData(m.el.querySelector('#sf'))) }); done = true; m.close(); resolve(r); U.toast('Supplier saved', 'success'); } catch (e) { U.toast(e.message, 'danger'); } };
    });
  }
  App.supplierForm = supplierForm;
})();
