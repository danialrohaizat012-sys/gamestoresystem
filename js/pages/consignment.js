/* Consignment — stock held for consignors; payable derived from real sales */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  let tab = 'stock';
  const draft = { supplier_id: '', reference: '', terms: 'Monthly settlement', expiry: '', items: [] };
  const newItem = () => ({ key: U.uid(), name: '', category: 'Console', platform: 'Retro', condition: 'Used', serial: '', qty: 1, consignment_cost: '', price: '' });

  App.page('consignment', {
    title: 'Consignment', sub: 'Sell other people’s items — never counted as your asset',
    render(el) {
      const ledger = svc.consignmentLedger();
      const stock = S.filter('products', (p) => p.ownership === 'consignment' && p.active !== false && p.stock > 0);
      el.innerHTML = `
        <div class="stats small">
          ${UI.stat('Units on shelf', stock.reduce((a, p) => a + p.stock, 0), { hint: `${stock.length} SKUs` })}
          ${UI.stat('Shelf value (consignor price)', U.money(U.sum(stock, (p) => p.stock * p.consignment_cost)), { hint: 'Excluded from your assets' })}
          ${UI.stat('Owed to consignors', U.money(U.sum(ledger, (r) => Math.max(0, r.outstanding))), { tone: 'warning', hint: 'From items already sold' })}
          ${UI.stat('Commission earned', U.money(U.sum(ledger, (r) => r.sales - r.due)), { tone: 'success', hint: 'Sales minus consignor share' })}
        </div>
        ${UI.tabs([['stock', 'On shelf', stock.length], ['receive', 'Receive items'], ['settle', 'Settlements']], tab)}
        <div id="csBody"></div>`;
      el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; App.rerender(); }));
      const body = el.querySelector('#csBody');
      if (tab === 'stock') {
        body.innerHTML = `<section class="card">${UI.table(['Item', 'Consignor', '>Consignor gets', '>Sell price', '>Your margin', '>On shelf', ''], stock.map((p) => `<tr><td><strong>${esc(p.name)}</strong><div class="muted small">${esc(p.sku)}${p.serial ? ' · SN ' + esc(p.serial) : ''}</div></td><td>${esc(S.get('suppliers', p.supplier_id)?.name || '—')}</td><td class="num">${U.money(p.consignment_cost)}</td><td class="num">${U.money(p.price)}</td><td class="num success">${U.money(p.price - p.consignment_cost)}</td><td class="num">${p.stock}</td><td><button class="btn ghost sm" data-ret="${p.id}">Return</button></td></tr>`), UI.empty('No consignment stock', 'Receive items from the “Receive items” tab', 'layers'))}</section>`;
        body.onclick = async (e) => {
          const b = e.target.closest('[data-ret]'); if (!b) return;
          const p = S.get('products', b.dataset.ret);
          const qty = await UI.confirm({ title: `Return to consignor`, message: `${esc(p.name)} — ${p.stock} on shelf.`, confirmText: 'Return', input: { label: 'Quantity to return', value: String(p.stock), required: true } });
          if (!qty) return;
          try { await svc.returnConsignment(p.id, U.int(qty)); App.rerender(); U.toast('Returned & removed from stock', 'success'); } catch (er) { U.toast(er.message, 'danger'); }
        };
      }
      if (tab === 'receive') receive(body);
      if (tab === 'settle') {
        const hist = S.all('consignment_settlements').sort((a, b) => b.at.localeCompare(a.at));
        body.innerHTML = `<section class="card"><div class="card-head"><div><h3>Payable by consignor</h3><p>Calculated live from completed sales minus returns — it can't drift out of sync.</p></div></div>
          ${UI.table(['Consignor', '>Units sold', '>Sales', '>Due to them', '>Paid', '>Outstanding', ''], ledger.map((r) => `<tr><td><strong>${esc(r.name)}</strong></td><td class="num">${r.sold_units}</td><td class="num">${U.money(r.sales)}</td><td class="num">${U.money(r.due)}</td><td class="num">${U.money(r.paid)}</td><td class="num ${r.outstanding > 0 ? 'warning-text' : r.outstanding < 0 ? 'danger' : ''}"><strong>${U.money(r.outstanding)}</strong>${r.outstanding < 0 ? '<div class="small">overpaid (credit)</div>' : ''}</td><td>${r.outstanding > 0 ? `<button class="btn primary sm" data-pay="${r.supplier_id}">Pay</button>` : ''}</td></tr>`), UI.empty('Nothing sold on consignment yet', '', 'layers'))}</section>
          <section class="card"><div class="card-head"><div><h3>Settlement history</h3></div></div>${UI.table(['No.', 'Consignor', 'Date', 'Method', '>Amount'], hist.map((h) => `<tr><td><strong>${esc(h.no)}</strong></td><td>${esc(h.supplier_name)}</td><td>${U.fmtDate(h.at)}</td><td>${App.paymentLabel(h.method)}</td><td class="num">${U.money(h.amount)}</td></tr>`))}</section>`;
        body.onclick = (e) => {
          const b = e.target.closest('[data-pay]'); if (!b) return;
          const r = ledger.find((x) => x.supplier_id === b.dataset.pay);
          const m = UI.modal({ title: `Pay ${esc(r.name)}`, size: 'sm', body: `<label class="field"><span>Amount</span><input id="stA" type="number" step=".01" value="${r.outstanding.toFixed(2)}"></label><label class="field"><span>Method</span><select id="stM">${UI.payOptions('bank')}</select></label><label class="field"><span>Note</span><input id="stN"></label>`, footer: '<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="stGo">Record payment</button>' });
          m.el.querySelector('#stGo').onclick = async () => { try { await svc.settleConsignment({ supplier_id: r.supplier_id, amount: m.el.querySelector('#stA').value, method: m.el.querySelector('#stM').value, note: m.el.querySelector('#stN').value }); m.close(); App.rerender(); U.toast('Settlement recorded', 'success'); } catch (e2) { U.toast(e2.message, 'danger'); } };
        };
      }
    },
  });

  function receive(body) {
    const s = S.settings();
    if (!draft.items.length) draft.items.push(newItem());
    const draw = () => {
      body.innerHTML = `<div class="split-layout"><div class="stack">
        <section class="card"><div class="form-grid cols-3">
          <label class="field"><span>Consignor *</span><div class="input-group"><select id="csSup">${UI.options(S.all('suppliers').map((x) => [x.id, x.name]), draft.supplier_id, 'Select consignor')}</select><button class="btn ghost" id="csNewSup">${I('plus')}</button></div></label>
          <label class="field"><span>Agreement / reference</span><input id="csRef" value="${esc(draft.reference)}"></label>
          <label class="field"><span>Settlement terms</span><select id="csTerms">${UI.options(['Pay per item sold', 'Weekly settlement', 'Monthly settlement', 'On request'], draft.terms)}</select></label>
        </div></section>
        ${draft.items.map((it, i) => `<section class="card" data-k="${it.key}"><div class="form-grid cols-4">
          <label class="field span-2"><span>Item ${i + 1} name *</span><input data-f="name" value="${esc(it.name)}" placeholder="e.g. Sega Mega Drive boxed"></label>
          <label class="field"><span>Category</span><select data-f="category">${UI.options(s.categories, it.category)}</select></label>
          <label class="field"><span>Platform</span><select data-f="platform">${UI.options(s.platforms, it.platform, '—')}</select></label>
          <label class="field"><span>Serial</span><input data-f="serial" value="${esc(it.serial)}"></label>
          <label class="field"><span>Qty</span><input data-f="qty" type="number" min="1" value="${it.qty}"></label>
          <label class="field"><span>Consignor gets / unit *</span><input data-f="consignment_cost" type="number" step=".01" value="${it.consignment_cost}"></label>
          <label class="field"><span>Sell price *</span><input data-f="price" type="number" step=".01" value="${it.price}"></label>
        </div><button class="btn ghost sm danger-text" data-rm="${i}">${I('trash')} Remove</button></section>`).join('')}
        <button class="btn ghost dashed" id="csAdd">${I('plus')} Add item</button></div>
        <aside class="card sticky summary"><div class="card-head"><div><h3>Receiving</h3></div></div>
          <div class="totals"><div><span>Consignor value</span><span>${U.money(U.sum(draft.items, (i) => U.num(i.consignment_cost) * U.int(i.qty)))}</span></div><div><span>Potential commission</span><span class="success">${U.money(U.sum(draft.items, (i) => (U.num(i.price) - U.num(i.consignment_cost)) * U.int(i.qty)))}</span></div></div>
          <button class="btn primary block lg" id="csGo">${I('check')} Receive on consignment</button>
          <p class="muted small">Items appear in POS like normal stock. When sold, the consignor share is added to their payable automatically.</p></aside></div>`;
      body.querySelectorAll('[data-k] [data-f]').forEach((x) => (x.onchange = () => { const it = draft.items.find((y) => y.key === x.closest('[data-k]').dataset.k); it[x.dataset.f] = x.value; draw(); }));
      body.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { draft.items.splice(+b.dataset.rm, 1); draw(); }));
      body.querySelector('#csAdd').onclick = () => { draft.items.push(newItem()); draw(); };
      body.querySelector('#csSup').onchange = (e) => (draft.supplier_id = e.target.value);
      body.querySelector('#csRef').oninput = (e) => (draft.reference = e.target.value);
      body.querySelector('#csTerms').onchange = (e) => (draft.terms = e.target.value);
      body.querySelector('#csNewSup').onclick = async () => { const sp = await App.supplierForm(); if (sp) { draft.supplier_id = sp.id; draw(); } };
      body.querySelector('#csGo').onclick = async () => {
        try {
          const r = await svc.receiveConsignment({ ...draft, items: draft.items.filter((i) => i.name.trim()) });
          Object.assign(draft, { supplier_id: '', reference: '', items: [] });
          tab = 'stock'; App.rerender(); U.toast(`${r.no} received`, 'success');
        } catch (e) { U.toast(e.message, 'danger'); }
      };
    };
    draw();
  }
})();
