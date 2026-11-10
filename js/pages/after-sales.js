/* After-sales: refunds, exchanges, warranty claims against the original sale */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  const st = { q: '', saleId: null, action: 'refund', sel: {}, newItems: [], method: 'cash', reason: '', wLine: null, issue: '', resolution: 'repair', replacement: null, hist: '' };

  App.afterSalesOpen = (saleId) => { Object.assign(st, { saleId, sel: {}, newItems: [] }); App.go('after_sales'); };

  App.page('after_sales', {
    title: 'After-Sales', sub: 'Refunds, exchanges and warranty claims — always linked to the original receipt',
    render(el) {
      const draw = () => {
        const sale = st.saleId ? S.get('sales', st.saleId) : null;
        const results = st.q ? S.filter('sales', (s) => s.status === 'completed' && U.match(st.q, s.no, s.customer_name, s.customer_phone, ...s.lines.map((l) => l.serial + ' ' + l.name))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8) : [];
        const win = U.int(S.settings().refund_window_days);
        const age = sale ? Math.floor((Date.now() - new Date(sale.at).getTime()) / 86400000) : 0;
        const hist = S.filter('after_sales', (a) => !st.hist || a.kind === st.hist).sort((a, b) => b.at.localeCompare(a.at));
        el.innerHTML = `
          <div class="split-layout">
            <div class="stack">
              <section class="card">
                <div class="card-head"><div><h3>1 · Find the original sale</h3><p>Search by invoice no., customer name, phone or serial number.</p></div></div>
                <div class="input-icon">${I('search')}<input id="asQ" type="search" value="${esc(st.q)}" placeholder="INV-… / 012… / serial"></div>
                ${results.length ? `<div class="list mt-s">${results.map((s) => `<button class="list-row btn-row ${s.id === st.saleId ? 'active' : ''}" data-sale="${s.id}"><div><strong>${esc(s.no)}</strong><span class="muted small">${esc(s.customer_name)} · ${U.fmtDate(s.at)} · ${s.lines.length} line(s)</span></div><strong>${U.money(s.total)}</strong></button>`).join('')}</div>` : st.q ? '<p class="muted small mt-s">No completed sale found.</p>' : ''}
              </section>
              ${sale ? `
              <section class="card">
                <div class="card-head"><div><h3>2 · ${esc(sale.no)}</h3><p>${esc(sale.customer_name)} · ${U.fmtDateTime(sale.at)} · ${age} day(s) ago</p></div><button class="btn ghost sm" id="asView">${I('receipt')} Receipt</button></div>
                ${age > win ? `<div class="banner warning">${I('alert')}<div><strong>Outside the ${win}-day refund window</strong><span>Refunds and exchanges need manager approval. Warranty claims are still allowed while warranty is valid.</span></div></div>` : ''}
                <div class="line-select">${sale.lines.map((l, i) => {
                  const left = svc.returnable(sale, i);
                  const wOk = l.warranty_until && new Date(l.warranty_until) > new Date();
                  const sel = st.sel[i];
                  return `<div class="ls-row ${left <= 0 ? 'disabled' : ''} ${sel ? 'on' : ''}">
                    ${st.action !== 'warranty' ? `<input type="checkbox" data-sel="${i}" ${sel ? 'checked' : ''} ${left <= 0 ? 'disabled' : ''}>` : `<input type="radio" name="wl" data-wl="${i}" ${st.wLine === i ? 'checked' : ''} ${left <= 0 ? 'disabled' : ''}>`}
                    <div class="ls-main"><strong>${esc(l.name)}</strong><span>${esc(l.sku)}${l.serial ? ' · SN ' + esc(l.serial) : ''} · ${l.qty} × ${U.money(svc.lineUnitPaid(l))} paid</span>
                      <span>${l.warranty_days ? (wOk ? UI.badge('Warranty until ' + U.fmtDate(l.warranty_until), 'success') : UI.badge('Warranty expired', 'muted')) : UI.badge('No warranty', 'muted')} ${l.returned_qty ? UI.badge(`${l.returned_qty} returned`, 'warning') : ''}</span></div>
                    ${sel && st.action !== 'warranty' ? `<div class="ls-opts"><label>Qty <input type="number" min="1" max="${left}" value="${sel.qty}" data-qty="${i}"></label><label class="chip-check"><input type="checkbox" data-restock="${i}" ${sel.restock ? 'checked' : ''}><span>Back to stock</span></label></div>` : ''}
                  </div>`; }).join('')}</div>
              </section>` : `<section class="card">${UI.empty('Pick a sale to begin', 'Refunds and exchanges always reference the original receipt so stock and cash stay correct.', 'undo')}</section>`}
            </div>
            <aside class="card sticky summary">
              <div class="card-head"><div><h3>3 · Action</h3></div></div>
              <div class="seg block">${[['refund', 'Refund'], ['exchange', 'Exchange'], ['warranty', 'Warranty']].map(([k, l]) => `<button data-action="${k}" class="${st.action === k ? 'active' : ''}">${l}</button>`).join('')}</div>
              <div id="asForm">${sale ? actionForm(sale) : '<p class="muted small">Select a sale first.</p>'}</div>
            </aside>
          </div>
          <section class="card">
            <div class="card-head"><div><h3>After-sales history</h3><p>${hist.length} record(s)</p></div>${UI.tabs([['', 'All'], ['refund', 'Refunds'], ['exchange', 'Exchanges'], ['warranty', 'Warranty']], st.hist, 'data-hist')}</div>
            ${UI.table(['No.', 'Type', 'Original', 'Customer', 'Date', '>Amount', ''], hist.slice(0, 100).map((a) => `<tr class="clickable" data-adoc="${a.id}"><td><strong>${esc(a.no)}</strong></td><td>${UI.badge(a.kind, a.kind === 'refund' ? 'danger' : a.kind === 'exchange' ? 'violet' : 'info')}</td><td>${esc(a.sale_no)}</td><td>${esc(a.customer_name)}</td><td>${U.fmtDate(a.at)}</td><td class="num">${a.kind === 'refund' ? '-' + U.money(a.refund_amount) : a.kind === 'exchange' ? U.money(a.difference, { sign: true }) : a.resolution === 'repair' ? esc(a.repair_no || 'Repair') : 'Replaced'}</td><td>${I('chevronRight')}</td></tr>`), UI.empty('No after-sales records', '', 'undo'))}
          </section>`;
        bind(el, sale);
      };

      const actionForm = (sale) => {
        const chosen = Object.entries(st.sel).map(([i, v]) => ({ line_idx: +i, ...v }));
        const credit = U.sum(chosen, (r) => svc.lineUnitPaid(sale.lines[r.line_idx]) * r.qty);
        if (st.action === 'refund') return `
          <div class="sum-lines">${chosen.map((r) => `<div><span>${esc(sale.lines[r.line_idx].name)} × ${r.qty}</span><strong>${U.money(svc.lineUnitPaid(sale.lines[r.line_idx]) * r.qty)}</strong></div>`).join('') || '<p class="muted small">Tick the items being returned.</p>'}</div>
          <label class="field"><span>Refund via</span><select id="asMethod">${UI.payOptions(st.method)}</select></label>
          <label class="field"><span>Reason *</span><input id="asReason" value="${esc(st.reason)}" placeholder="e.g. Defective on arrival, wrong item"></label>
          <div class="grand-total danger"><span>Refund</span><strong>${U.money(credit)}</strong></div>
          <button class="btn danger block lg" id="asGo" ${chosen.length ? '' : 'disabled'}>Process refund</button>`;
        if (st.action === 'exchange') {
          const newTotal = U.sum(st.newItems, (l) => l.unit_price * l.qty);
          const diff = U.r2(newTotal - credit);
          return `
          <div class="sum-lines">${chosen.map((r) => `<div><span>↩ ${esc(sale.lines[r.line_idx].name)} × ${r.qty}</span><strong>-${U.money(svc.lineUnitPaid(sale.lines[r.line_idx]) * r.qty)}</strong></div>`).join('') || '<p class="muted small">Tick the items being returned.</p>'}
            ${st.newItems.map((l, i) => `<div><span>→ ${esc(S.get('products', l.product_id).name)} × ${l.qty} <button class="link danger-text" data-nrm="${i}">remove</button></span><strong>${U.money(l.unit_price * l.qty)}</strong></div>`).join('')}</div>
          <div id="asPick"></div>
          ${diff ? `<label class="field"><span>${diff > 0 ? 'Customer pays difference via' : 'Refund difference via'}</span><select id="asMethod">${UI.payOptions(st.method)}</select></label>` : ''}
          <label class="field"><span>Reason</span><input id="asReason" value="${esc(st.reason)}" placeholder="e.g. Wrong size / platform"></label>
          <div class="grand-total"><span>${diff > 0 ? 'Customer pays' : diff < 0 ? 'Refund to customer' : 'Even exchange'}</span><strong>${U.money(Math.abs(diff))}</strong></div>
          <button class="btn primary block lg" id="asGo" ${chosen.length && st.newItems.length ? '' : 'disabled'}>Complete exchange</button>`;
        }
        const l = st.wLine != null ? sale.lines[st.wLine] : null;
        return `
          ${l ? `<div class="kv boxed"><div><span>Item</span><strong>${esc(l.name)}</strong></div><div><span>Warranty</span><strong>${l.warranty_until ? U.fmtDate(l.warranty_until) : 'None'}</strong></div></div>` : '<p class="muted small">Choose the faulty item.</p>'}
          <label class="field"><span>Fault description *</span><textarea id="asIssue" rows="2">${esc(st.issue)}</textarea></label>
          <div class="seg block">${[['repair', 'Send for repair'], ['replace', 'Replace unit']].map(([k, lab]) => `<button data-res="${k}" class="${st.resolution === k ? 'active' : ''}">${lab}</button>`).join('')}</div>
          ${st.resolution === 'replace' ? `<div class="mt-s"><span class="muted small">Replacement (defaults to the same SKU if in stock):</span><div id="asRep"></div>${st.replacement ? `<p class="small">→ <b>${esc(S.get('products', st.replacement).name)}</b></p>` : ''}</div>` : '<p class="muted small mt-s">Creates a zero-charge repair ticket linked to this claim.</p>'}
          <button class="btn primary block lg mt" id="asGo" ${l ? '' : 'disabled'}>Register claim</button>`;
      };

      const bind = (el, sale) => {
        const q = el.querySelector('#asQ');
        q.oninput = U.debounce(() => { st.q = q.value; draw(); const n = el.querySelector('#asQ'); n.focus(); n.setSelectionRange(st.q.length, st.q.length); }, 200);
        el.querySelectorAll('[data-sale]').forEach((b) => (b.onclick = () => { st.saleId = b.dataset.sale; st.sel = {}; st.wLine = null; st.newItems = []; draw(); }));
        el.querySelector('#asView')?.addEventListener('click', () => App.docs.show('sale', sale));
        el.querySelectorAll('[data-action]').forEach((b) => (b.onclick = () => { st.action = b.dataset.action; draw(); }));
        el.querySelectorAll('[data-hist]').forEach((b) => (b.onclick = () => { st.hist = b.dataset.hist; draw(); }));
        el.querySelectorAll('[data-adoc]').forEach((r) => (r.onclick = () => { const a = S.get('after_sales', r.dataset.adoc); App.docs.show(a.kind, a); }));
        if (!sale) return;
        el.querySelectorAll('[data-sel]').forEach((c) => (c.onchange = () => { const i = +c.dataset.sel; if (c.checked) st.sel[i] = { qty: svc.returnable(sale, i), restock: true }; else delete st.sel[i]; draw(); }));
        el.querySelectorAll('[data-qty]').forEach((c) => (c.onchange = () => { const i = +c.dataset.qty; st.sel[i].qty = U.clamp(U.int(c.value), 1, svc.returnable(sale, i)); draw(); }));
        el.querySelectorAll('[data-restock]').forEach((c) => (c.onchange = () => { st.sel[+c.dataset.restock].restock = c.checked; }));
        el.querySelectorAll('[data-wl]').forEach((c) => (c.onchange = () => { st.wLine = +c.dataset.wl; st.replacement = null; draw(); }));
        el.querySelectorAll('[data-res]').forEach((b) => (b.onclick = () => { st.resolution = b.dataset.res; draw(); }));
        el.querySelectorAll('[data-nrm]').forEach((b) => (b.onclick = () => { st.newItems.splice(+b.dataset.nrm, 1); draw(); }));
        el.querySelector('#asMethod')?.addEventListener('change', (e) => (st.method = e.target.value));
        el.querySelector('#asReason')?.addEventListener('input', (e) => (st.reason = e.target.value));
        el.querySelector('#asIssue')?.addEventListener('input', (e) => (st.issue = e.target.value));
        if (el.querySelector('#asPick')) UI.productPicker(el.querySelector('#asPick'), { placeholder: 'Add replacement item…', filter: (p) => p.stock > 0, onPick: (p) => { const ex = st.newItems.find((x) => x.product_id === p.id); if (ex && !p.serial && ex.qty < p.stock) ex.qty++; else if (!ex) st.newItems.push({ product_id: p.id, qty: 1, unit_price: p.price }); draw(); } });
        if (el.querySelector('#asRep')) UI.productPicker(el.querySelector('#asRep'), { placeholder: 'Choose replacement…', filter: (p) => p.stock > 0, onPick: (p) => { st.replacement = p.id; draw(); } });
        el.querySelector('#asGo')?.addEventListener('click', async () => {
          const returns = Object.entries(st.sel).map(([i, v]) => ({ line_idx: +i, qty: v.qty, restock: v.restock }));
          try {
            let doc;
            if (st.action === 'refund') {
              if (!(await UI.confirm({ title: 'Confirm refund', message: `Refund ${U.money(U.sum(returns, (r) => svc.lineUnitPaid(sale.lines[r.line_idx]) * r.qty))} via ${App.paymentLabel(st.method)}?`, confirmText: 'Refund', danger: true }))) return;
              doc = await svc.refund({ sale_id: sale.id, returns, method: st.method, reason: st.reason });
            } else if (st.action === 'exchange') {
              doc = await svc.exchange({ sale_id: sale.id, returns, newItems: st.newItems, method: st.method, reason: st.reason });
            } else {
              doc = await svc.warrantyClaim({ sale_id: sale.id, line_idx: st.wLine, issue: st.issue, resolution: st.resolution, replacement_id: st.resolution === 'replace' ? st.replacement || (S.get('products', sale.lines[st.wLine].product_id)?.stock > 0 ? sale.lines[st.wLine].product_id : null) : null });
            }
            Object.assign(st, { sel: {}, newItems: [], reason: '', issue: '', wLine: null, replacement: null });
            draw();
            U.toast(`${doc.no} recorded`, 'success');
            App.docs.show(doc.kind, doc);
          } catch (e) { U.toast(e.message, 'danger'); }
        });
      };
      draw();
    },
  });
})();
