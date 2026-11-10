/* Reports — P&L by stream, category, payment, staff, inventory */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui, C = App.charts;
  const { esc } = U;
  const I = (n) => App.icon(n);
  const f = { period: 'month', from: U.dateKey(U.addDays(new Date(), -30)), to: U.dateKey() };

  App.page('reports', {
    title: 'Reports', sub: 'One consistent profit definition across every screen',
    render(el) {
      const [from, to] = svc.periodRange(f.period, { from: f.from, to: f.to });
      const mt = svc.metrics(from, to);
      const inv = svc.inventoryValue();
      const days = Math.max(1, Math.round((to - from) / 86400000));
      const buckets = days > 62 ? 'month' : 'day';
      const keyOf = (iso) => buckets === 'month' ? U.dateKey(iso).slice(0, 7) : U.dateKey(iso);
      const labels = [];
      for (let d = new Date(from); d <= to; d = buckets === 'month' ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : U.addDays(d, 1)) labels.push(keyOf(d));
      const byKey = (arr, dateFn, valFn) => labels.map((k) => U.sum(arr.filter((x) => keyOf(dateFn(x)) === k), valFn));
      const series = [
        { name: 'Sales', values: byKey(mt.sales, (x) => x.at, (x) => x.revenue) },
        { name: 'Trade-in', values: byKey(mt.trades, (x) => x.at, (x) => x.total_out) },
        { name: 'Repairs', values: byKey(mt.repairs, (x) => x.collected_at, (x) => x.final_price) },
      ];
      // category profit (sales lines net of discount, minus returns)
      const cat = {};
      mt.sales.forEach((s) => s.lines.forEach((l) => { const k = l.category || 'Other'; cat[k] = cat[k] || { rev: 0, profit: 0, qty: 0 }; const f2 = s.tax && s.total ? s.revenue / s.total : 1; const rev = l.paid * f2; cat[k].rev += rev; cat[k].profit += rev - l.unit_cost * l.qty; cat[k].qty += l.qty; }));
      mt.trades.forEach((t) => t.out_lines.forEach((l) => { const k = l.category || 'Other'; cat[k] = cat[k] || { rev: 0, profit: 0, qty: 0 }; cat[k].rev += l.total; cat[k].profit += l.total - l.unit_cost * l.qty; cat[k].qty += l.qty; }));
      const cats = Object.entries(cat).map(([k, v]) => ({ label: k, value: U.r2(v.profit), rev: v.rev, qty: v.qty })).sort((a, b) => b.value - a.value);
      // payments
      const pay = {};
      mt.sales.forEach((s) => s.payments.forEach((p) => (pay[p.method] = (pay[p.method] || 0) + p.amount)));
      mt.repairs.forEach((r) => (r.payments || []).forEach((p) => (pay[p.method] = (pay[p.method] || 0) + p.amount)));
      mt.trades.filter((t) => t.direction === 'customer_pays').forEach((t) => (pay[t.method] = (pay[t.method] || 0) + t.balance));
      // staff
      const staff = {};
      [...mt.sales.map((s) => [s.staff_name, s.revenue]), ...mt.trades.map((t) => [t.staff_name, t.total_out]), ...mt.repairs.map((r) => [r.collected_by || r.staff_name, r.final_price])].forEach(([n, v]) => { staff[n] = staff[n] || { value: 0, count: 0 }; staff[n].value += v; staff[n].count++; });
      // products
      const prod = {};
      mt.sales.forEach((s) => s.lines.forEach((l) => { prod[l.product_id] = prod[l.product_id] || { label: l.name, value: 0, qty: 0 }; prod[l.product_id].value += l.net; prod[l.product_id].qty += l.qty; }));
      const invCat = {};
      S.filter('products', (p) => p.active !== false && p.stock > 0 && p.ownership !== 'consignment').forEach((p) => (invCat[p.category] = (invCat[p.category] || 0) + p.stock * p.cost));
      const dead = S.filter('products', (p) => p.active !== false && p.stock > 0 && p.ownership !== 'consignment').map((p) => ({ p, last: S.filter('stock_moves', (m) => m.product_id === p.id && m.delta < 0).map((m) => m.at).sort().pop() || p.created_at })).filter((x) => Date.now() - new Date(x.last) > 45 * 86400000).sort((a, b) => b.p.stock * b.p.cost - a.p.stock * a.p.cost).slice(0, 8);

      el.innerHTML = `
        <div class="toolbar">
          <div class="seg">${[['today', 'Today'], ['7d', '7d'], ['month', 'This month'], ['last_month', 'Last month'], ['year', 'This year'], ['custom', 'Custom']].map(([k, l]) => `<button data-p="${k}" class="${f.period === k ? 'active' : ''}">${l}</button>`).join('')}</div>
          ${f.period === 'custom' ? `<input type="date" id="rpFrom" value="${f.from}"><span class="muted">→</span><input type="date" id="rpTo" value="${f.to}">` : ''}
          <span class="grow"></span><span class="muted small">${U.fmtDate(from)} – ${U.fmtDate(to)}</span>
          <button class="btn ghost" id="rpCsv">${I('download')} Export P&L</button>
        </div>
        <div class="stats">
          ${UI.stat('Net revenue', U.money(mt.revenue), { tone: 'accent', hint: 'After refunds & exchanges, excl. tax' })}
          ${UI.stat('Gross profit', U.money(mt.profit), { tone: 'success', hint: `${U.pct(mt.margin)} margin` })}
          ${UI.stat('Transactions', mt.txCount, { hint: `Avg sale ${U.money(mt.avgBasket)}` })}
          ${UI.stat('Refunds', U.money(mt.refunds), { tone: mt.refunds ? 'danger' : '', hint: `${mt.after.filter((a) => a.kind === 'refund').length} refunds` })}
        </div>
        <section class="card"><div class="card-head"><div><h3>Revenue over time</h3><p>Per ${buckets}</p></div></div>${C.bars(labels.map((k) => buckets === 'month' ? k : k.slice(8)), series)}</section>
        <div class="grid-2-1">
          <section class="card"><div class="card-head"><div><h3>Profit & loss by stream</h3></div></div>
            ${UI.table(['Stream', '>Revenue', '>Gross profit', '>Margin'], [
              ['Product sales', mt.salesRev, mt.salesProfit], ['Trade-in sales', mt.tradeRev, mt.tradeProfit], ['Repairs', mt.repairRev, mt.repairProfit], ['Refunds / exchanges', mt.afterRev, mt.afterProfit],
            ].map(([l, r, p]) => `<tr><td>${l}</td><td class="num">${U.money(r)}</td><td class="num ${p < 0 ? 'danger' : ''}">${U.money(p)}</td><td class="num">${r ? U.pct((p / r) * 100) : '—'}</td></tr>`).concat([`<tr class="total-row"><td><strong>Total</strong></td><td class="num"><strong>${U.money(mt.revenue)}</strong></td><td class="num"><strong>${U.money(mt.profit)}</strong></td><td class="num"><strong>${U.pct(mt.margin)}</strong></td></tr>`]))}
            <p class="muted small">Stock bought in this period (buy-ins + trade-in value): <b>${U.money(mt.buyIn)}</b> — this is inventory investment, not an expense, until it sells.</p>
          </section>
          <section class="card"><div class="card-head"><div><h3>Gross profit by category</h3></div></div>${C.donut(cats.filter((c) => c.value > 0), { center: U.money(U.sum(cats, (c) => c.value)).replace(/\.\d+$/, ''), sub: 'profit' })}</section>
        </div>
        <div class="grid-3">
          <section class="card"><div class="card-head"><div><h3>Payment methods</h3><p>Money received</p></div></div>${C.hbars(Object.entries(pay).map(([k, v]) => ({ label: App.paymentLabel(k), value: U.r2(v) })).sort((a, b) => b.value - a.value))}</section>
          <section class="card"><div class="card-head"><div><h3>Staff performance</h3><p>Revenue handled</p></div></div>${C.hbars(Object.entries(staff).map(([k, v]) => ({ label: k, value: U.r2(v.value), sub: `${v.count} txn` })).sort((a, b) => b.value - a.value))}</section>
          <section class="card"><div class="card-head"><div><h3>Best sellers</h3><p>By revenue</p></div></div>${C.hbars(Object.values(prod).sort((a, b) => b.value - a.value).slice(0, 6).map((x) => ({ ...x, value: U.r2(x.value), sub: `${x.qty} sold` })))}</section>
        </div>
        <div class="grid-2">
          <section class="card"><div class="card-head"><div><h3>Inventory value by category</h3><p>Owned stock at cost · ${U.money(inv.ownedCost)}</p></div></div>${C.hbars(Object.entries(invCat).map(([k, v]) => ({ label: k, value: U.r2(v) })).sort((a, b) => b.value - a.value))}</section>
          <section class="card"><div class="card-head"><div><h3>Slow movers</h3><p>No sale in 45+ days — consider a promo</p></div></div>
            ${UI.table(['Product', '>Stock', '>Tied-up cost', 'Last moved'], dead.map((d) => `<tr><td><strong>${esc(d.p.name)}</strong><div class="muted small">${esc(d.p.sku)}</div></td><td class="num">${d.p.stock}</td><td class="num">${U.money(d.p.stock * d.p.cost)}</td><td>${U.relTime(d.last)}</td></tr>`), UI.empty('No slow movers', 'Everything is selling', 'check'))}</section>
        </div>`;
      el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { f.period = b.dataset.p; App.rerender(); }));
      el.querySelector('#rpFrom')?.addEventListener('change', (e) => { f.from = e.target.value; App.rerender(); });
      el.querySelector('#rpTo')?.addEventListener('change', (e) => { f.to = e.target.value; App.rerender(); });
      el.querySelector('#rpCsv').onclick = () => U.download(`pnl-${U.dateKey(from)}-${U.dateKey(to)}.csv`, U.toCSV([
        { stream: 'Product sales', revenue: mt.salesRev, gross_profit: mt.salesProfit }, { stream: 'Trade-in sales', revenue: mt.tradeRev, gross_profit: mt.tradeProfit },
        { stream: 'Repairs', revenue: mt.repairRev, gross_profit: mt.repairProfit }, { stream: 'Refunds/exchanges', revenue: mt.afterRev, gross_profit: mt.afterProfit },
        { stream: 'TOTAL', revenue: mt.revenue, gross_profit: mt.profit },
        ...cats.map((c) => ({ stream: `Category: ${c.label}`, revenue: U.r2(c.rev), gross_profit: c.value })),
      ]), 'text/csv');
    },
  });
})();
