/* Shift & cash drawer */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  const LABEL = { sale: 'Cash sales', buy: 'Paid to sellers', trade: 'Trade-in balance', repair: 'Repair payments', repair_deposit: 'Repair deposits', repair_refund: 'Deposit refunds', refund: 'Refunds', exchange: 'Exchanges', purchase: 'Supplier payments', consignment: 'Consignor payouts', cash_in: 'Cash in', cash_out: 'Cash out', void: 'Voids' };

  App.page('shift', {
    title: 'Shift & Cash', sub: 'Every ringgit in and out of the drawer, with continuity between shifts',
    render(el) {
      const sh = svc.currentShift();
      const prev = svc.lastClosedShift();
      const history = S.filter('shifts', (s) => s.status === 'closed').sort((a, b) => (b.closed_at || '').localeCompare(a.closed_at || '')).slice(0, 30);
      if (!sh) {
        el.innerHTML = `<div class="grid-2">
          <section class="card"><div class="card-head"><div><h3>Open a new shift</h3><p>Count the drawer before you start selling.</p></div></div>
            <div class="kv boxed"><div><span>Previous shift</span><strong>${prev ? `${esc(prev.no)} · ${esc(prev.closed_by_name)}` : 'None'}</strong></div><div><span>Previous closing cash</span><strong>${prev ? U.money(prev.counted) : '—'}</strong></div></div>
            <label class="field"><span>Opening cash</span><div class="input-group"><input id="opAmt" type="number" min="0" step=".01" inputmode="decimal" value="${prev ? Number(prev.counted).toFixed(2) : ''}"><button class="btn ghost" id="opCount">${I('cash')} Count</button></div></label>
            <div id="opDiff"></div>
            <label class="field hidden" id="opReasonWrap"><span>Reason for difference * <small class="muted">(manager)</small></span><textarea id="opReason" rows="2" placeholder="e.g. Owner took RM200 for bank-in after closing"></textarea></label>
            <button class="btn primary block lg" id="opGo">${I('check')} Open shift</button>
          </section>
          <section class="card"><div class="card-head"><div><h3>How cash continuity works</h3></div></div>
            <ol class="howto"><li>Opening cash should equal the previous shift's counted closing cash.</li><li>Every cash sale, buy-in, trade balance, repair payment, refund and payout is posted to this shift's ledger automatically.</li><li>Voids made later are posted as reversals in the shift where they happen — closed shifts are never rewritten.</li><li>At closing, count the drawer; any variance must be explained.</li></ol>
          </section></div>
          ${histTable(history)}`;
        const amt = el.querySelector('#opAmt');
        const upd = () => {
          const d = prev ? U.r2(U.num(amt.value) - U.num(prev.counted)) : 0;
          el.querySelector('#opDiff').innerHTML = prev && amt.value !== '' && d !== 0 ? `<div class="banner warning">${I('alert')}<div><strong>Difference ${U.money(d, { sign: true })}</strong><span>Opening doesn't match last closing. ${svc.can('shift.override') ? 'Give a reason to continue.' : 'Ask a manager to open the shift.'}</span></div></div>` : '';
          el.querySelector('#opReasonWrap').classList.toggle('hidden', !(prev && d !== 0));
        };
        amt.oninput = upd; upd();
        el.querySelector('#opCount').onclick = async () => { await UI.cashCounter(amt); upd(); };
        el.querySelector('#opGo').onclick = async () => {
          if (amt.value === '') return U.toast('Enter the opening cash', 'danger');
          try { await svc.openShift({ opening: amt.value, reason: el.querySelector('#opReason').value }); U.toast('Shift opened', 'success'); App.rerender(); } catch (e) { U.toast(e.message, 'danger'); }
        };
        bindHist(el);
        return;
      }
      const sum = svc.shiftSummary(sh);
      el.innerHTML = `
        <div class="stats">
          ${UI.stat('Opening cash', U.money(sh.opening), { hint: `Opened ${U.fmtTime(sh.opened_at)} by ${esc(sh.opened_by_name)}` })}
          ${UI.stat('Cash in', U.money(U.sum(sum.rows.filter((r) => r.amount > 0), (r) => r.amount)), { tone: 'success' })}
          ${UI.stat('Cash out', U.money(-U.sum(sum.rows.filter((r) => r.amount < 0), (r) => r.amount)), { tone: 'danger' })}
          ${UI.stat('Expected in drawer', U.money(sum.expected), { tone: 'accent', hint: esc(sh.no) })}
        </div>
        <div class="grid-2-1">
          <section class="card"><div class="card-head"><div><h3>Drawer ledger</h3><p>${sum.rows.length} movements this shift</p></div><button class="btn ghost sm" id="shReport">${I('printer')} X-report</button></div>
            <div class="chips mb">${Object.entries(sum.by).map(([k, v]) => `<span class="pill">${esc(LABEL[k] || k)} <b class="${v < 0 ? 'danger' : 'success'}">${U.money(v, { sign: true })}</b></span>`).join('') || '<span class="muted small">No cash movements yet.</span>'}</div>
            ${UI.table(['Time', 'Type', 'Reference', 'By', '>Amount'], [...sum.rows].reverse().map((r) => `<tr><td>${U.fmtTime(r.at)}</td><td>${esc(LABEL[r.type] || r.type)}${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</td><td>${esc(r.ref_no || '—')}</td><td class="muted">${esc(r.staff_name)}</td><td class="num ${r.amount < 0 ? 'danger' : 'success'}"><strong>${U.money(r.amount, { sign: true })}</strong></td></tr>`), UI.empty('No cash movements yet', '', 'wallet'))}
          </section>
          <div class="stack">
            <section class="card"><div class="card-head"><div><h3>Cash in / out</h3><p>Petty cash, bank-in, float top-up</p></div></div>
              <div class="seg block" id="mvDir"><button class="active" data-d="out">Cash out</button><button data-d="in">Cash in</button></div>
              <label class="field"><span>Amount</span><input id="mvAmt" type="number" min="0" step=".01"></label>
              <label class="field"><span>Note *</span><input id="mvNote" placeholder="e.g. Bank-in, bought packing tape"></label>
              <button class="btn ghost block" id="mvGo">Record movement</button>
            </section>
            <section class="card"><div class="card-head"><div><h3>Close shift</h3><p>Count the drawer and close</p></div></div>
              <label class="field"><span>Counted cash</span><div class="input-group"><input id="clAmt" type="number" min="0" step=".01" inputmode="decimal"><button class="btn ghost" id="clCount">${I('cash')} Count</button></div></label>
              <div id="clVar" class="change-box"><span>Variance</span><strong>—</strong></div>
              <label class="field"><span>Closing note <small class="muted">(required if variance)</small></span><textarea id="clNote" rows="2"></textarea></label>
              <button class="btn primary block lg" id="clGo">${I('lock')} Close shift</button>
            </section>
          </div>
        </div>
        ${histTable(history)}`;
      let dir = 'out', denoms = null;
      el.querySelector('#mvDir').onclick = (e) => { const b = e.target.closest('[data-d]'); if (!b) return; dir = b.dataset.d; el.querySelectorAll('#mvDir [data-d]').forEach((x) => x.classList.toggle('active', x === b)); };
      el.querySelector('#mvGo').onclick = async () => { try { await svc.cashMove({ direction: dir, amount: el.querySelector('#mvAmt').value, note: el.querySelector('#mvNote').value }); U.toast('Recorded', 'success'); App.rerender(); } catch (e) { U.toast(e.message, 'danger'); } };
      const cl = el.querySelector('#clAmt');
      const upd = () => { const box = el.querySelector('#clVar'); if (cl.value === '') { box.className = 'change-box'; box.querySelector('strong').textContent = '—'; return; } const v = U.r2(U.num(cl.value) - sum.expected); box.className = `change-box ${v === 0 ? 'ok' : 'neg'}`; box.querySelector('strong').textContent = v === 0 ? 'Balanced' : `${U.money(v, { sign: true })} ${v > 0 ? 'over' : 'short'}`; };
      cl.oninput = upd;
      el.querySelector('#clCount').onclick = async () => { const r = await UI.cashCounter(cl); if (r) denoms = r.counts; upd(); };
      el.querySelector('#shReport').onclick = () => App.docs.show('shift', sh);
      el.querySelector('#clGo').onclick = async () => {
        if (!(await UI.confirm({ title: 'Close this shift?', message: `Expected ${U.money(sum.expected)}, counted ${cl.value === '' ? '—' : U.money(cl.value)}.`, confirmText: 'Close shift' }))) return;
        try { const done = await svc.closeShift({ counted: cl.value, note: el.querySelector('#clNote').value, denominations: denoms }); U.toast('Shift closed', 'success'); App.rerender(); App.docs.show('shift', done); } catch (e) { U.toast(e.message, 'danger'); }
      };
      bindHist(el);
    },
  });
  const histTable = (rows) => `<section class="card"><div class="card-head"><div><h3>Shift history</h3></div></div>${UI.table(['Shift', 'Opened', 'Closed', '>Opening', '>Expected', '>Counted', '>Variance', ''], rows.map((s) => `<tr class="clickable" data-sh="${s.id}"><td><strong>${esc(s.no)}</strong>${s.opening_diff ? `<div class="small warning-text">Opening diff ${U.money(s.opening_diff, { sign: true })}</div>` : ''}</td><td>${U.fmtDateTime(s.opened_at)}<div class="muted small">${esc(s.opened_by_name)}</div></td><td>${U.fmtDateTime(s.closed_at)}<div class="muted small">${esc(s.closed_by_name)}</div></td><td class="num">${U.money(s.opening)}</td><td class="num">${U.money(s.expected)}</td><td class="num">${U.money(s.counted)}</td><td class="num ${s.variance ? 'danger' : 'success'}"><strong>${s.variance ? U.money(s.variance, { sign: true }) : 'OK'}</strong></td><td>${I('printer')}</td></tr>`), UI.empty('No closed shifts yet', '', 'wallet'))}</section>`;
  const bindHist = (el) => el.querySelectorAll('[data-sh]').forEach((r) => (r.onclick = () => App.docs.show('shift', S.get('shifts', r.dataset.sh))));
})();
