/* Stock take — saved drafts, scan-to-count, safe finalize */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  let show = 'all', q = '';

  App.page('stock_take', {
    title: 'Stock Take', sub: 'Count shelves without freezing sales — inventory only changes when you finalize',
    render(el) {
      const st = svc.activeStockTake();
      const hist = S.filter('stock_takes', (x) => x.status !== 'draft').sort((a, b) => (b.finalized_at || b.updated_at).localeCompare(a.finalized_at || a.updated_at));
      const histHtml = `<section class="card"><div class="card-head"><div><h3>Stock take history</h3></div></div>${UI.table(['No.', 'Scope', 'Date', 'Counted', 'Adjusted', '>Value variance', 'Status', ''], hist.map((h) => `<tr class="clickable" data-h="${h.id}"><td><strong>${esc(h.no)}</strong></td><td>${esc(h.category || 'All')}</td><td>${U.fmtDateTime(h.finalized_at || h.updated_at)}</td><td>${h.lines.filter((l) => l.counted != null).length}/${h.lines.length}</td><td>${h.adjusted ?? '—'}</td><td class="num ${h.value_variance < 0 ? 'danger' : ''}">${h.value_variance != null ? U.money(h.value_variance, { sign: true }) : '—'}</td><td>${UI.statusBadge(h.status)}</td><td>${I('printer')}</td></tr>`), UI.empty('No stock takes yet', '', 'clipboard'))}</section>`;
      if (!st) {
        el.innerHTML = `<section class="card narrow"><div class="card-head"><div><h3>Start a stock take</h3><p>Takes a snapshot of system stock. Your count is saved as you go — you can close the browser and continue later.</p></div></div>
          <div class="form-grid"><label class="field"><span>Scope</span><select id="stCat">${UI.options(S.settings().categories, '', 'All categories')}</select></label><label class="field"><span>Note</span><input id="stNote" placeholder="e.g. Month-end count, console wall"></label></div>
          <button class="btn primary lg" id="stStart">${I('clipboard')} Start counting</button></section>${histHtml}`;
        el.querySelector('#stStart').onclick = async () => { try { await svc.startStockTake({ category: el.querySelector('#stCat').value, note: el.querySelector('#stNote').value }); App.rerender(); } catch (e) { U.toast(e.message, 'danger'); } };
        bindHist(el);
        return;
      }
      const lines = st.lines;
      const save = U.debounce(() => svc.saveStockTakeLines(st.id, lines), 400);
      const variance = (l) => (l.counted == null ? null : U.int(l.counted) - U.int(l.system_qty));
      const draw = () => {
        const counted = lines.filter((l) => l.counted != null);
        const vlines = counted.filter((l) => variance(l) !== 0);
        const moved = (l) => (S.get('products', l.product_id)?.stock ?? l.system_qty) !== l.system_qty;
        const rows = lines.filter((l) => (show === 'all' || (show === 'todo' ? l.counted == null : show === 'var' ? l.counted != null && variance(l) !== 0 : false)) && U.match(q, l.name, l.sku, l.serial, l.barcode));
        el.querySelector('#stSum').innerHTML = `${UI.stat('Progress', `${counted.length}/${lines.length}`, { hint: `${lines.length ? Math.round((counted.length / lines.length) * 100) : 0}% counted` })}${UI.stat('System units', lines.reduce((a, l) => a + l.system_qty, 0))}${UI.stat('Counted units', counted.reduce((a, l) => a + U.int(l.counted), 0))}${UI.stat('Lines with variance', vlines.length, { tone: vlines.length ? 'warning' : 'success' })}`;
        el.querySelector('#stRows').innerHTML = UI.table(['Product', 'Category', '>System', '>Counted', '>Variance', 'Reason'], rows.map((l) => { const i = lines.indexOf(l); const v = variance(l); return `<tr class="${v ? 'row-warn' : ''}">
          <td><strong>${esc(l.name)}</strong><div class="muted small">${esc(l.sku)}${l.serial ? ' · SN ' + esc(l.serial) : ''}${moved(l) ? ' · ' + UI.badge('sold/moved during count', 'info') : ''}</div></td><td>${esc(l.category)}</td><td class="num">${l.system_qty}</td>
          <td class="num"><div class="stepper sm"><button data-m="${i}">${I('minus')}</button><input type="number" min="0" class="qty-input" data-c="${i}" value="${l.counted ?? ''}" placeholder="—"><button data-p="${i}">${I('plus')}</button></div></td>
          <td class="num ${v > 0 ? 'success' : v < 0 ? 'danger' : ''}"><strong>${v == null ? '—' : v > 0 ? '+' + v : v}</strong></td>
          <td>${v ? `<input class="reason-input" data-r="${i}" value="${esc(l.reason)}" placeholder="Reason">` : ''}</td></tr>`; }), UI.empty('Nothing in this view', '', 'clipboard'));
      };
      el.innerHTML = `
        <div class="banner info">${I('info')}<div><strong>${esc(st.no)} in progress · ${esc(st.category || 'All categories')}</strong><span>Started ${U.fmtDateTime(st.started_at)} by ${esc(st.started_by)}. Sales can continue — variance is measured against the snapshot, so sales during the count are preserved.</span></div></div>
        <div class="stats small" id="stSum"></div>
        <section class="card">
          <div class="toolbar wrap">
            <div class="input-icon grow">${I('scan')}<input id="stScan" placeholder="Scan barcode / SKU / serial to count +1 (Enter)" autocomplete="off"></div>
            <div class="input-icon">${I('search')}<input id="stQ" type="search" placeholder="Filter list" value="${esc(q)}"></div>
            <div class="seg">${[['all', 'All'], ['todo', 'Not counted'], ['var', 'Variances']].map(([k, l]) => `<button data-show="${k}" class="${show === k ? 'active' : ''}">${l}</button>`).join('')}</div>
          </div>
          <div id="stRows"></div>
        </section>
        <section class="card"><div class="toolbar wrap">
          <label class="chip-check"><input type="checkbox" id="stZero"><span>Treat uncounted items as 0</span></label>
          <input id="stFinalNote" class="grow" placeholder="Final note (optional)">
          <button class="btn ghost danger-text" id="stDiscard">Discard</button>
          <button class="btn ghost" id="stPrint">${I('printer')} Variance sheet</button>
          <button class="btn primary" id="stFinal">${I('check')} Finalize & adjust stock</button>
        </div></section>
        ${histHtml}`;
      draw();
      const scan = el.querySelector('#stScan');
      scan.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const v = scan.value.trim(); if (!v) return;
        const l = lines.find((x) => x.sku.toLowerCase() === v.toLowerCase() || (x.barcode && x.barcode === v) || (x.serial && U.normSerial(x.serial) === U.normSerial(v)));
        if (!l) { U.toast(`“${v}” is not in this count scope`, 'danger'); scan.select(); return; }
        l.counted = U.int(l.counted) + 1; save(); draw(); scan.value = ''; U.toast(`${l.name}: ${l.counted}`, 'success');
      };
      el.querySelector('#stQ').oninput = U.debounce((e) => { q = e.target.value; draw(); }, 120);
      el.querySelectorAll('[data-show]').forEach((b) => (b.onclick = () => { show = b.dataset.show; el.querySelectorAll('[data-show]').forEach((x) => x.classList.toggle('active', x === b)); draw(); }));
      el.querySelector('#stRows').addEventListener('click', (e) => {
        const p = e.target.closest('[data-p]'), m = e.target.closest('[data-m]');
        if (p) { const l = lines[+p.dataset.p]; l.counted = U.int(l.counted) + 1; }
        else if (m) { const l = lines[+m.dataset.m]; l.counted = Math.max(0, U.int(l.counted) - 1); }
        else return;
        save(); draw();
      });
      el.querySelector('#stRows').addEventListener('change', (e) => {
        if (e.target.dataset.c != null) { const l = lines[+e.target.dataset.c]; l.counted = e.target.value === '' ? null : Math.max(0, U.int(e.target.value)); save(); draw(); }
        if (e.target.dataset.r != null) { lines[+e.target.dataset.r].reason = e.target.value; save(); }
      });
      el.querySelector('#stPrint').onclick = () => App.docs.show('stock_take', { ...st, lines });
      el.querySelector('#stDiscard').onclick = async () => { if (await UI.confirm({ title: 'Discard this stock take?', message: 'Counts are thrown away. Inventory is not changed.', confirmText: 'Discard', danger: true })) { await svc.discardStockTake(st.id); App.rerender(); } };
      el.querySelector('#stFinal').onclick = async () => {
        await svc.saveStockTakeLines(st.id, lines);
        const zero = el.querySelector('#stZero').checked;
        const n = lines.filter((l) => (l.counted ?? (zero ? 0 : null)) !== null && U.int(l.counted ?? 0) !== l.system_qty).length;
        if (!(await UI.confirm({ title: 'Finalize stock take?', message: `${n} SKU(s) will be adjusted. Each change is written to the stock ledger with reference ${esc(st.no)}.`, confirmText: 'Finalize', danger: n > 0 }))) return;
        try { const done = await svc.finalizeStockTake(st.id, { zeroUncounted: zero, note: el.querySelector('#stFinalNote').value }); U.toast(`${done.no} finalized · ${done.adjusted} adjusted`, 'success'); App.rerender(); App.docs.show('stock_take', done); } catch (e) { U.toast(e.message, 'danger'); }
      };
      bindHist(el);
    },
  });
  const bindHist = (el) => el.querySelectorAll('[data-h]').forEach((r) => (r.onclick = () => App.docs.show('stock_take', S.get('stock_takes', r.dataset.h))));
})();
