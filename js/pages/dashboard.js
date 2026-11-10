/* Dashboard */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui, C = App.charts;
  const { esc } = U;
  const I = (n) => App.icon(n);
  let period = 'today';

  App.page('dashboard', {
    title: 'Dashboard',
    sub: () => `${new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
    render(el) {
      const fin = svc.can('dashboard.finance');
      const [from, to] = svc.periodRange(period);
      const mt = svc.metrics(from, to);
      const inv = svc.inventoryValue();
      const sh = svc.currentShift();
      const repairsOpen = S.filter('repairs', (r) => !['collected', 'cancelled'].includes(r.status));
      const ready = repairsOpen.filter((r) => r.status === 'ready');
      const overdue = repairsOpen.filter((r) => r.due_at && new Date(r.due_at) < new Date() && r.status !== 'ready');
      const low = S.filter('products', (p) => p.active !== false && p.ownership !== 'consignment' && svc.isLow(p)).sort((a, b) => a.stock - b.stock);
      const pendingPO = S.filter('purchase_orders', (p) => ['ordered', 'partial'].includes(p.status));
      const consDue = U.sum(svc.consignmentLedger(), (r) => Math.max(0, r.outstanding));

      // 14-day revenue chart
      const days = [...Array(14)].map((_, i) => U.addDays(U.startOfDay(new Date()), i - 13));
      const dayKey = (iso) => U.dateKey(iso);
      const series = [['Sales', (k) => U.sum(S.filter('sales', (s) => s.status === 'completed' && dayKey(s.at) === k), (s) => s.revenue)],
        ['Trade-in', (k) => U.sum(S.filter('trades', (s) => s.status === 'completed' && dayKey(s.at) === k), (s) => s.total_out)],
        ['Repairs', (k) => U.sum(S.filter('repairs', (r) => r.status === 'collected' && dayKey(r.collected_at) === k), (r) => r.final_price)]]
        .map(([name, f]) => ({ name, values: days.map((d) => f(U.dateKey(d))) }));

      const top = Object.values(mt.sales.flatMap((s) => s.lines).reduce((m, l) => { const k = l.product_id; m[k] = m[k] || { label: l.name, value: 0, qty: 0 }; m[k].value += l.net; m[k].qty += l.qty; return m; }, {})).sort((a, b) => b.value - a.value).slice(0, 5).map((x) => ({ ...x, sub: `${x.qty} sold` }));

      const recent = [
        ...S.all('sales').map((x) => ['sale', x, x.total, 'Sale']), ...S.all('buys').map((x) => ['buy', x, -x.total, 'Buy']),
        ...S.all('trades').map((x) => ['trade', x, x.balance, 'Trade-in']), ...S.filter('repairs', (r) => r.status === 'collected').map((x) => ['repair', x, x.final_price, 'Repair']),
      ].sort((a, b) => (b[1].collected_at || b[1].at).localeCompare(a[1].collected_at || a[1].at)).slice(0, 7);

      const hr = new Date().getHours();
      const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
      const [t0, t1] = svc.periodRange('today');
      const today = svc.metrics(t0, t1);
      const st = S.settings();
      el.innerHTML = `
        <section class="hero">
          <div class="hero-art" aria-hidden="true">${App.brand.pixelSvg(st.logo_icon || 'anchor', '#ffffff', '#ffffff', { tile: false })}</div>
          <div class="hero-copy">
            <span class="pixel-tag">${esc(st.store_name)}</span>
            <h2>${greet}, ${esc(App.session.staff.name.split(' ')[0])} <span class="wave">👋</span></h2>
            <p>${repairsOpen.length} repairs in progress · ${ready.length} ready for pickup · ${low.length} items low on stock</p>
          </div>
          <div class="hero-stats">
            ${fin ? `<div><span>Today's revenue</span><strong>${U.money(today.revenue)}</strong></div>` : ''}
            <div><span>Sales today</span><strong>${today.sales.length}</strong></div>
            ${sh && svc.can('shift') ? `<div><span>Cash in drawer</span><strong>${U.money(svc.shiftSummary(sh).expected)}</strong></div>` : ''}
          </div>
        </section>
        ${!sh && svc.can('shift') ? `<div class="banner warning">${I('wallet')}<div><strong>No shift is open</strong><span>Open the cash drawer before taking cash payments.</span></div><a class="btn sm primary" href="#/shift">Open shift</a></div>` : ''}
        <div class="quick-actions">
          ${[['pos', 'New sale', 'cart', 'F2'], ['trade', 'Trade-in', 'trade'], ['buy', 'Buy item', 'buy'], ['repairs', 'Repair ticket', 'wrench']].filter(([id]) => svc.can(id)).map(([id, l, ic, k]) => `<a class="qa" href="#/${id}"><span class="qa-ico">${I(ic)}</span><strong>${l}</strong>${k ? `<kbd>${k}</kbd>` : ''}</a>`).join('')}
        </div>
        ${fin ? `
        <div class="section-head"><h3>Performance</h3><div class="seg">${[['today', 'Today'], ['7d', '7 days'], ['month', 'This month'], ['30d', '30 days']].map(([k, l]) => `<button class="${k === period ? 'active' : ''}" data-period="${k}">${l}</button>`).join('')}</div></div>
        <div class="stats">
          ${UI.stat('Revenue', U.money(mt.revenue), { icon: 'chart', hint: `${mt.txCount} transactions`, tone: 'accent' })}
          ${UI.stat('Gross profit', U.money(mt.profit), { icon: 'zap', hint: `${U.pct(mt.margin)} margin`, tone: 'success' })}
          ${UI.stat('Avg. basket', U.money(mt.avgBasket), { icon: 'cart', hint: `${mt.sales.length} sales` })}
          ${UI.stat('Stock bought in', U.money(mt.buyIn), { icon: 'buy', hint: 'Buy-ins + trade-ins' })}
        </div>
        <div class="grid-2-1">
          <section class="card"><div class="card-head"><div><h3>Revenue · last 14 days</h3><p>Sales, trade-in and repairs by day</p></div></div>${C.bars(days.map((d) => d.getDate() + ''), series)}</section>
          <section class="card"><div class="card-head"><div><h3>Revenue mix</h3><p>${esc({ today: 'Today', '7d': 'Last 7 days', month: 'This month', '30d': 'Last 30 days' }[period])}</p></div></div>
            ${C.donut([{ label: 'Product sales', value: mt.salesRev }, { label: 'Trade-in sales', value: mt.tradeRev }, { label: 'Repairs', value: mt.repairRev }], { center: U.money(mt.revenue).replace(/\.\d+$/, ''), sub: 'revenue' })}
          </section>
        </div>` : ''}
        <div class="grid-3">
          <section class="card"><div class="card-head"><div><h3>Needs attention</h3><p>Things to action today</p></div></div>
            <div class="alert-list">
              ${ready.length ? `<a href="#/repairs" class="alert-row success">${I('wrench')}<span><strong>${ready.length} repair${ready.length > 1 ? 's' : ''} ready for pickup</strong><em>Notify customers via WhatsApp</em></span>${I('chevronRight')}</a>` : ''}
              ${overdue.length ? `<a href="#/repairs" class="alert-row danger">${I('clock')}<span><strong>${overdue.length} repair${overdue.length > 1 ? 's' : ''} past due date</strong><em>${overdue.map((r) => r.no).slice(0, 3).join(', ')}</em></span>${I('chevronRight')}</a>` : ''}
              ${low.length ? `<a href="#/inventory" class="alert-row warning">${I('box')}<span><strong>${low.length} product${low.length > 1 ? 's' : ''} low / out of stock</strong><em>${esc(low.slice(0, 2).map((p) => p.name).join(', '))}</em></span>${I('chevronRight')}</a>` : ''}
              ${pendingPO.length && svc.can('purchases') ? `<a href="#/purchases" class="alert-row info">${I('truck')}<span><strong>${pendingPO.length} purchase order${pendingPO.length > 1 ? 's' : ''} awaiting stock</strong><em>${esc(pendingPO.map((p) => p.supplier_name).slice(0, 2).join(', '))}</em></span>${I('chevronRight')}</a>` : ''}
              ${consDue > 0 && svc.can('consignment') ? `<a href="#/consignment" class="alert-row info">${I('layers')}<span><strong>${U.money(consDue)} owed to consignors</strong><em>Settle from Consignment</em></span>${I('chevronRight')}</a>` : ''}
              ${!ready.length && !overdue.length && !low.length ? UI.empty('All clear', 'Nothing urgent right now', 'check') : ''}
            </div>
          </section>
          <section class="card"><div class="card-head"><div><h3>Repair pipeline</h3><p>${repairsOpen.length} open tickets</p></div><a class="btn sm ghost" href="#/repairs">Open board</a></div>
            <div class="pipeline">${App.REPAIR_STATUSES.filter((s) => !['collected', 'cancelled'].includes(s.id)).map((s) => { const n = repairsOpen.filter((r) => r.status === s.id).length; return `<div class="pipe"><span class="pipe-n b-${s.tone}">${n}</span><span>${esc(s.label)}</span></div>`; }).join('')}</div>
          </section>
          <section class="card"><div class="card-head"><div><h3>${fin ? 'Top sellers' : 'Inventory'}</h3><p>${fin ? 'By revenue in period' : 'Current stock'}</p></div></div>
            ${fin ? C.hbars(top) : `<div class="kv"><div><span>SKUs in stock</span><strong>${inv.skus}</strong></div><div><span>Units</span><strong>${inv.units}</strong></div><div><span>Low stock</span><strong>${low.length}</strong></div></div>`}
          </section>
        </div>
        <section class="card"><div class="card-head"><div><h3>Recent activity</h3><p>Latest transactions</p></div>${svc.can('transactions') ? '<a class="btn sm ghost" href="#/transactions">View all</a>' : ''}</div>
          ${UI.table(['No.', 'Type', 'Customer', 'When', '>Amount', ''], recent.map(([k, x, amt, label]) => `<tr data-doc="${k}" data-id="${x.id}" class="clickable"><td><strong>${esc(x.no)}</strong></td><td>${UI.badge(label, k === 'sale' ? 'success' : k === 'buy' ? 'warning' : k === 'trade' ? 'violet' : 'info')}${x.status === 'void' ? ' ' + UI.badge('Void', 'danger') : ''}</td><td>${esc(x.customer_name)}</td><td class="muted">${U.relTime(x.collected_at || x.at)}</td><td class="num"><strong>${U.money(amt, { sign: true })}</strong></td><td>${I('chevronRight')}</td></tr>`))}
        </section>
        ${fin ? `<div class="stats small">
          ${UI.stat('Stock value (cost)', U.money(inv.ownedCost), { hint: `${inv.units - inv.consUnits} owned units` })}
          ${UI.stat('Stock value (retail)', U.money(inv.ownedRetail), { hint: `Potential margin ${U.money(inv.ownedRetail - inv.ownedCost)}` })}
          ${UI.stat('Consignment held', U.money(inv.consCost), { hint: `${inv.consUnits} units · not your asset` })}
          ${UI.stat('Refunds', U.money(mt.refunds), { hint: 'In selected period' })}
        </div>` : ''}`;

      el.onclick = (e) => {
        const p = e.target.closest('[data-period]');
        if (p) { period = p.dataset.period; App.rerender(); return; }
        const r = e.target.closest('[data-doc]');
        if (r) { const k = r.dataset.doc; const t = { sale: 'sales', buy: 'buys', trade: 'trades', repair: 'repairs' }[k]; App.docs.show(k, S.get(t, r.dataset.id)); }
      };
    },
  });
})();
