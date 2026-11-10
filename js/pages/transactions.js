/* Transactions & receipts — unified journal */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  const f = { q: '', type: '', status: '', period: '30d', staff: '' };
  const TYPES = { sale: ['Sale', 'success'], buy: ['Buy-in', 'warning'], trade: ['Trade-in', 'violet'], repair: ['Repair', 'info'], refund: ['Refund', 'danger'], exchange: ['Exchange', 'violet'], warranty: ['Warranty', 'info'] };

  App.journal = () => [
    ...S.all('sales').map((x) => ({ kind: 'sale', x, at: x.at, amount: x.total, pay: x.payments.map((p) => App.paymentLabel(p.method)).join(' + ') })),
    ...S.all('buys').map((x) => ({ kind: 'buy', x, at: x.at, amount: -x.total, pay: App.paymentLabel(x.method) })),
    ...S.all('trades').map((x) => ({ kind: 'trade', x, at: x.at, amount: x.balance, pay: x.method === 'none' ? 'Even' : App.paymentLabel(x.method) })),
    ...S.filter('repairs', (r) => r.status === 'collected').map((x) => ({ kind: 'repair', x, at: x.collected_at, amount: x.final_price, pay: (x.payments || []).map((p) => App.paymentLabel(p.method)).join(' + ') || 'Deposit' })),
    ...S.all('after_sales').map((x) => ({ kind: x.kind, x, at: x.at, amount: x.kind === 'refund' ? -x.refund_amount : x.kind === 'exchange' ? x.difference : 0, pay: x.method && x.method !== 'none' ? App.paymentLabel(x.method) : '—' })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  App.page('transactions', {
    title: 'Transactions', sub: 'Every receipt in one place — reprint, share, void',
    render(el) {
      el.innerHTML = `<section class="card">
        <div class="toolbar wrap">
          <div class="input-icon grow">${I('search')}<input id="txQ" type="search" placeholder="Receipt no., customer, item, serial…" value="${esc(f.q)}"></div>
          <select data-f="type">${UI.options(Object.entries(TYPES).map(([k, [l]]) => [k, l]), f.type, 'All types')}</select>
          <select data-f="status">${UI.options([['completed', 'Completed'], ['void', 'Void']], f.status, 'Any status')}</select>
          <select data-f="period">${UI.options([['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['last_month', 'Last month'], ['all', 'All time']], f.period)}</select>
          <select data-f="staff">${UI.options(S.all('staff').map((s) => [s.id, s.name]), f.staff, 'All staff')}</select>
          <button class="btn ghost" id="txCsv">${I('download')} CSV</button>
        </div>
        <div id="txSum" class="sum-strip"></div>
        <div id="txTable"></div></section>`;
      const rows = () => {
        const [from, to] = svc.periodRange(f.period);
        return App.journal().filter((r) => (!f.type || r.kind === f.type) && (!f.status || r.x.status === f.status) && (!f.staff || r.x.staff_id === f.staff) && svc.inRange(r.at, from, to)
          && U.match(f.q, r.x.no, r.x.customer_name, r.x.customer_phone, ...(r.x.lines || r.x.out_lines || r.x.return_lines || []).map((l) => `${l.name} ${l.serial || ''}`), r.x.device || ''));
      };
      const draw = () => {
        const list = rows();
        const act = list.filter((r) => r.x.status !== 'void');
        el.querySelector('#txSum').innerHTML = `<span>${list.length} records</span><span>Money in <b class="success">${U.money(U.sum(act.filter((r) => r.amount > 0), (r) => r.amount))}</b></span><span>Money out <b class="danger">${U.money(-U.sum(act.filter((r) => r.amount < 0), (r) => r.amount))}</b></span>`;
        el.querySelector('#txTable').innerHTML = UI.table(['No.', 'Date', 'Type', 'Customer', 'Payment', '>Amount', 'Status', ''], list.slice(0, 300).map((r, i) => `<tr class="${r.x.status === 'void' ? 'voided' : ''}">
          <td><strong>${esc(r.x.no)}</strong>${r.x.backdated ? ' ' + UI.badge('Backdated', 'warning') : ''}</td><td>${U.fmtDateTime(r.at)}<div class="muted small">${esc(r.x.staff_name || '')}</div></td>
          <td>${UI.badge(...TYPES[r.kind])}</td><td>${esc(r.x.customer_name)}</td><td class="muted">${esc(r.pay)}</td><td class="num"><strong>${U.money(r.amount, { sign: true })}</strong></td>
          <td>${UI.statusBadge(r.x.status || 'completed')}${r.x.void_reason ? `<div class="muted small">${esc(r.x.void_reason)}</div>` : ''}</td>
          <td class="actions"><button class="icon-btn" data-view="${i}" title="View receipt">${I('eye')}</button>
            ${r.kind === 'sale' && r.x.status === 'completed' && svc.can('after_sales') ? `<button class="icon-btn" data-after="${r.x.id}" title="Refund / exchange">${I('undo')}</button>` : ''}
            ${['sale', 'buy', 'trade'].includes(r.kind) && r.x.status === 'completed' && svc.can('transactions.void') ? `<button class="icon-btn danger-text" data-void="${i}" title="Void">${I('ban')}</button>` : ''}</td></tr>`), UI.empty('No transactions match', '', 'receipt'));
        el.querySelector('#txTable').onclick = async (e) => {
          const v = e.target.closest('[data-view]'), vd = e.target.closest('[data-void]'), af = e.target.closest('[data-after]');
          if (v) { const r = list[+v.dataset.view]; App.docs.show(r.kind, r.x); }
          if (af) App.afterSalesOpen(af.dataset.after);
          if (vd) {
            const r = list[+vd.dataset.void];
            const reason = await UI.confirm({ title: `Void ${r.x.no}?`, message: 'Stock is reversed and any cash is reversed in the <b>current</b> shift (closed shifts are never rewritten). This cannot be undone.', confirmText: 'Void transaction', danger: true, input: { label: 'Reason', required: true } });
            if (!reason) return;
            try { await svc.voidTransaction(r.kind, r.x.id, reason); U.toast(`${r.x.no} voided`, 'success'); draw(); } catch (er) { U.toast(er.message, 'danger'); }
          }
        };
      };
      draw();
      el.querySelector('#txQ').oninput = U.debounce((e) => { f.q = e.target.value; draw(); }, 150);
      el.querySelectorAll('[data-f]').forEach((x) => (x.onchange = () => { f[x.dataset.f] = x.value; draw(); }));
      el.querySelector('#txCsv').onclick = () => U.download(`transactions-${U.dateKey()}.csv`, U.toCSV(rows().map((r) => ({ no: r.x.no, date: r.at, type: r.kind, customer: r.x.customer_name, phone: r.x.customer_phone, staff: r.x.staff_name, payment: r.pay, amount: r.amount, status: r.x.status, backdated: !!r.x.backdated }))), 'text/csv');
    },
  });
})();
