/* Customers — CRM, history, loyalty */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  let q = '', sort = 'recent';

  App.page('customers', {
    title: 'Customers', sub: 'Know your regulars — history, spend, loyalty points',
    render(el) {
      const rows = S.all('customers').map((c) => ({ c, s: svc.customerStats(c.id) }));
      const draw = () => {
        const list = rows.filter((r) => U.match(q, r.c.name, r.c.phone, r.c.email, r.c.ic_no)).sort((a, b) => sort === 'spent' ? b.s.spent - a.s.spent : sort === 'name' ? a.c.name.localeCompare(b.c.name) : (b.s.last || '').localeCompare(a.s.last || ''));
        el.querySelector('#cuTable').innerHTML = UI.table(['Customer', 'Type', 'Visits', 'Last visit', '>Spent', S.settings().loyalty_enabled ? '>Points' : '', ''], list.map((r) => `<tr class="clickable ${App.customerFocus === r.c.id ? 'flash' : ''}" data-cid="${r.c.id}">
          <td><div class="prod-cell"><span class="avatar">${esc(U.initials(r.c.name))}</span><div><strong>${esc(r.c.name)}</strong><span class="muted small">${esc(r.c.phone || 'No phone')}${r.c.email ? ' · ' + esc(r.c.email) : ''}</span></div></div></td>
          <td>${r.c.type === 'online' ? UI.badge(r.c.channel || 'Online', 'info') : UI.badge('In-store', 'muted')}</td><td>${r.s.visits}</td><td>${r.s.last ? U.relTime(r.s.last) : '—'}</td>
          <td class="num"><strong>${U.money(r.s.spent)}</strong></td><td class="num">${S.settings().loyalty_enabled ? U.int(r.c.points) : ''}</td><td>${I('chevronRight')}</td></tr>`), UI.empty('No customers', '', 'users'));
        if (App.customerFocus) { const id = App.customerFocus; App.customerFocus = null; profile(id); }
      };
      el.innerHTML = `<div class="stats small">
          ${UI.stat('Customers', rows.length)}
          ${UI.stat('Active (30 days)', rows.filter((r) => r.s.last && Date.now() - new Date(r.s.last) < 30 * 86400000).length)}
          ${UI.stat('Lifetime spend', U.money(U.sum(rows, (r) => r.s.spent)))}
          ${UI.stat('Bought from customers', U.money(U.sum(rows, (r) => r.s.sold_to_us)))}
        </div>
        <section class="card"><div class="toolbar">
          <div class="input-icon grow">${I('search')}<input id="cuQ" type="search" placeholder="Search name, phone, email, IC…" value="${esc(q)}"></div>
          <select id="cuSort">${UI.options([['recent', 'Recent visit'], ['spent', 'Top spenders'], ['name', 'Name']], sort)}</select>
          <button class="btn ghost" id="cuCsv">${I('download')} CSV</button>
          <button class="btn primary" id="cuNew">${I('plus')} New customer</button>
        </div><div id="cuTable"></div></section>`;
      draw();
      el.querySelector('#cuQ').oninput = U.debounce((e) => { q = e.target.value; draw(); }, 120);
      el.querySelector('#cuSort').onchange = (e) => { sort = e.target.value; draw(); };
      el.querySelector('#cuNew').onclick = async () => { if (await UI.customerForm()) App.rerender(); };
      el.querySelector('#cuCsv').onclick = () => U.download(`customers-${U.dateKey()}.csv`, U.toCSV(rows.map((r) => ({ name: r.c.name, phone: r.c.phone, email: r.c.email, type: r.c.type, channel: r.c.channel, points: r.c.points, visits: r.s.visits, spent: r.s.spent, last_visit: r.s.last }))), 'text/csv');
      el.querySelector('#cuTable').onclick = (e) => { const r = e.target.closest('[data-cid]'); if (r) profile(r.dataset.cid); };
    },
  });

  function profile(id) {
    const c = S.get('customers', id);
    const s = svc.customerStats(id);
    const hist = App.journal().filter((r) => r.x.customer_id === id).slice(0, 50);
    const repairs = S.filter('repairs', (r) => r.customer_id === id && !['collected', 'cancelled'].includes(r.status));
    const owned = S.filter('sales', (x) => x.customer_id === id && x.status === 'completed').flatMap((x) => x.lines.filter((l) => l.warranty_until && new Date(l.warranty_until) > new Date() && l.qty > U.int(l.returned_qty)).map((l) => ({ ...l, no: x.no })));
    const m = UI.modal({
      title: c.name, sub: `${esc(c.phone || 'No phone')}${c.email ? ' · ' + esc(c.email) : ''}${c.ic_no ? ' · IC ' + esc(c.ic_no) : ''}`, size: 'lg',
      body: `<div class="stats small">
          ${UI.stat('Total spent', U.money(s.spent))}${UI.stat('Visits', s.visits)}${UI.stat('Sold to us', U.money(s.sold_to_us))}${S.settings().loyalty_enabled ? UI.stat('Points', U.int(c.points)) : ''}
        </div>
        ${c.notes ? `<div class="banner muted">${I('info')}<div><span>${esc(c.notes)}</span></div></div>` : ''}
        ${repairs.length ? `<h4 class="mini-title">Open repairs</h4><div class="list">${repairs.map((r) => `<div class="list-row"><div><strong>${esc(r.no)} · ${esc(r.device)}</strong><span class="muted small">${esc(r.issue)}</span></div>${UI.statusBadge(r.status)}</div>`).join('')}</div>` : ''}
        ${owned.length ? `<h4 class="mini-title">Items under warranty</h4><div class="list">${owned.map((l) => `<div class="list-row"><div><strong>${esc(l.name)}</strong><span class="muted small">${esc(l.no)}${l.serial ? ' · SN ' + esc(l.serial) : ''}</span></div>${UI.badge('Until ' + U.fmtDate(l.warranty_until), 'success')}</div>`).join('')}</div>` : ''}
        <h4 class="mini-title">History</h4>
        ${UI.table(['No.', 'Date', 'Type', '>Amount'], hist.map((r, i) => `<tr class="clickable" data-h="${i}"><td><strong>${esc(r.x.no)}</strong></td><td>${U.fmtDate(r.at)}</td><td>${UI.badge(r.kind, 'muted')}${r.x.status === 'void' ? ' ' + UI.badge('Void', 'danger') : ''}</td><td class="num">${U.money(r.amount, { sign: true })}</td></tr>`), UI.empty('No history yet'))}`,
      footer: `${c.phone ? `<button class="btn ghost" id="cpWa">${I('message')} WhatsApp</button>` : ''}<button class="btn ghost" id="cpEdit">${I('edit')} Edit</button>${svc.can('pos') ? `<button class="btn primary" id="cpSell">${I('cart')} New sale</button>` : ''}`,
    });
    m.el.querySelectorAll('[data-h]').forEach((r) => (r.onclick = () => { const h = hist[+r.dataset.h]; App.docs.show(h.kind, h.x); }));
    m.el.querySelector('#cpWa')?.addEventListener('click', () => window.open(`https://wa.me/${U.cleanPhone(c.phone)}`, '_blank', 'noopener'));
    m.el.querySelector('#cpEdit').onclick = async () => { const r = await UI.customerForm(c); if (r) { m.close(); App.rerender(); } };
    m.el.querySelector('#cpSell')?.addEventListener('click', () => { m.close(); App.posSetCustomer(id); App.go('pos'); });
  }
})();
