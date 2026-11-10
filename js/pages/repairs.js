/* Repairs — kanban board, tickets, parts usage, collection */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  let view = 'board', q = '', showClosed = false;
  const ACC = ['Power cable', 'Controller', 'HDMI cable', 'Case / pouch', 'Box', 'Memory card', 'Dock', 'Charger'];
  const openStatuses = () => App.REPAIR_STATUSES.filter((s) => !['collected', 'cancelled'].includes(s.id));

  App.page('repairs', {
    title: 'Repairs', sub: 'Intake, track and hand back repair jobs',
    render(el) {
      const all = S.filter('repairs', (r) => U.match(q, r.no, r.customer_name, r.customer_phone, r.device, r.serial, r.issue)).sort((a, b) => b.at.localeCompare(a.at));
      const open = all.filter((r) => !['collected', 'cancelled'].includes(r.status));
      const closed = all.filter((r) => ['collected', 'cancelled'].includes(r.status));
      const card = (r) => {
        const late = r.due_at && new Date(r.due_at) < new Date() && r.status !== 'ready';
        const tech = r.technician_id ? S.get('staff', r.technician_id) : null;
        return `<button class="r-card ${late ? 'late' : ''}" data-rid="${r.id}">
          <div class="r-top"><strong>${esc(r.no)}</strong>${r.is_warranty_claim ? UI.badge('Warranty', 'violet') : ''}${late ? UI.badge('Overdue', 'danger') : ''}</div>
          <div class="r-dev">${esc(r.device)}</div>
          <div class="r-issue">${esc(r.issue)}</div>
          <div class="r-foot"><span>${I('user')}${esc(r.customer_name)}</span>${tech ? `<span class="avatar xs" style="background:${esc(tech.color)}" title="${esc(tech.name)}">${esc(U.initials(tech.name))}</span>` : ''}</div>
          <div class="r-foot muted"><span>${I('clock')}${r.due_at ? 'Due ' + new Date(r.due_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' }) : U.relTime(r.at)}</span><span>${r.estimate ? U.money(r.estimate) : 'Quote TBC'}</span></div>
        </button>`;
      };
      el.innerHTML = `
        <div class="toolbar">
          <div class="input-icon grow">${I('search')}<input id="rpQ" type="search" placeholder="Search ticket, customer, device, serial…" value="${esc(q)}"></div>
          <div class="seg"><button data-view="board" class="${view === 'board' ? 'active' : ''}">${I('grid')} Board</button><button data-view="list" class="${view === 'list' ? 'active' : ''}">${I('list')} List</button></div>
          <button class="btn primary" id="rpNew">${I('plus')} New ticket</button>
        </div>
        ${view === 'board' ? `<div class="kanban">${openStatuses().map((s) => { const rows = open.filter((r) => r.status === s.id); return `<div class="k-col" data-col="${s.id}"><div class="k-head"><span class="k-dot b-${s.tone}"></span>${esc(s.label)}<em>${rows.length}</em></div><div class="k-body">${rows.map(card).join('') || '<div class="k-empty">—</div>'}</div></div>`; }).join('')}</div>`
          : UI.table(['Ticket', 'Customer', 'Device', 'Status', 'Due', '>Estimate'], open.map((r) => `<tr class="clickable" data-rid="${r.id}"><td><strong>${esc(r.no)}</strong></td><td>${esc(r.customer_name)}<div class="muted small">${esc(r.customer_phone)}</div></td><td>${esc(r.device)}<div class="muted small">${esc(r.issue)}</div></td><td>${UI.statusBadge(r.status)}</td><td>${r.due_at ? U.fmtDate(r.due_at) : '—'}</td><td class="num">${r.estimate ? U.money(r.estimate) : '—'}</td></tr>`), UI.empty('No open repairs', '', 'wrench'))}
        <div class="section-head"><button class="btn ghost sm" id="rpClosed">${I(showClosed ? 'chevronDown' : 'chevronRight')} Closed tickets (${closed.length})</button></div>
        ${showClosed ? UI.table(['Ticket', 'Customer', 'Device', 'Status', 'Closed', '>Final price', svc.can('dashboard.finance') ? '>Profit' : ''], closed.slice(0, 100).map((r) => `<tr class="clickable" data-rid="${r.id}"><td><strong>${esc(r.no)}</strong></td><td>${esc(r.customer_name)}</td><td>${esc(r.device)}</td><td>${UI.statusBadge(r.status)}</td><td>${U.fmtDate(r.collected_at || r.updated_at)}</td><td class="num">${r.status === 'collected' ? U.money(r.final_price) : '—'}</td><td class="num">${svc.can('dashboard.finance') && r.status === 'collected' ? U.money(r.profit) : ''}</td></tr>`)) : ''}`;
      const qi = el.querySelector('#rpQ');
      qi.oninput = U.debounce(() => { q = qi.value; App.rerender(); setTimeout(() => { const n = document.querySelector('#rpQ'); n.focus(); n.setSelectionRange(q.length, q.length); }); }, 200);
      el.onclick = (e) => {
        const v = e.target.closest('[data-view]'); if (v) { view = v.dataset.view; App.rerender(); return; }
        if (e.target.closest('#rpNew')) return newTicket();
        if (e.target.closest('#rpClosed')) { showClosed = !showClosed; App.rerender(); return; }
        const r = e.target.closest('[data-rid]'); if (r) openTicket(r.dataset.rid);
      };
    },
  });

  function newTicket(prefill = {}) {
    let customer_id = prefill.customer_id || null;
    const techs = S.filter('staff', (s) => s.active !== false && ['technician', 'owner', 'manager'].includes(s.role));
    const m = UI.modal({
      title: 'New repair ticket', size: 'lg',
      body: `<div class="form-grid">
        <div class="span-2" id="rtCust">${UI.customerChip(customer_id, { required: true })}</div>
        <label class="field"><span>Device / model *</span><input id="rtDevice" placeholder="e.g. PS5 Slim Disc, DualSense Edge"></label>
        <label class="field"><span>Serial no.</span><input id="rtSerial"></label>
        <label class="field span-2"><span>Reported issue *</span><textarea id="rtIssue" rows="2" placeholder="What's wrong, when did it start, any drops/liquid?"></textarea></label>
        <div class="field span-2"><span>Accessories received</span><div class="chips" id="rtAcc">${ACC.map((a) => `<label class="chip-check"><input type="checkbox" value="${esc(a)}"><span>${esc(a)}</span></label>`).join('')}</div></div>
        <label class="field span-2"><span>Physical condition on arrival</span><input id="rtCond" placeholder="Scratches, missing screws, warranty seal broken…"></label>
        <label class="field"><span>Estimate (${esc(S.settings().currency)})</span><input id="rtEst" type="number" min="0" step=".01" placeholder="Leave blank if quote pending"></label>
        <label class="field"><span>Promised ready date</span><input id="rtDue" type="date" value="${U.dateKey(U.addDays(new Date(), 3))}"></label>
        <label class="field"><span>Deposit received</span><input id="rtDep" type="number" min="0" step=".01" value="0"></label>
        <label class="field"><span>Deposit method</span><select id="rtDepM">${UI.payOptions('cash')}</select></label>
        <label class="field span-2"><span>Assign technician</span><select id="rtTech">${UI.options(techs.map((t) => [t.id, t.name]), techs.find((t) => t.role === 'technician')?.id, 'Unassigned')}</select></label>
      </div>`,
      footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="rtSave">${I('check')} Create ticket</button>`,
    });
    m.el.querySelector('#rtCust').onclick = async () => { const id = await UI.pickCustomer({ allowWalkIn: false }); if (id) { customer_id = id; m.el.querySelector('#rtCust').innerHTML = UI.customerChip(id, { required: true }); } };
    m.el.querySelector('#rtSave').onclick = async () => {
      const v = (id) => m.el.querySelector(id).value;
      try {
        const r = await svc.createRepair({
          customer_id, device: v('#rtDevice'), serial: v('#rtSerial'), issue: v('#rtIssue'), condition_notes: v('#rtCond'),
          accessories: [...m.el.querySelectorAll('#rtAcc input:checked')].map((x) => x.value),
          estimate: v('#rtEst'), due_at: v('#rtDue') ? new Date(v('#rtDue') + 'T18:00').toISOString() : null,
          deposit: v('#rtDep'), deposit_method: v('#rtDepM'), technician_id: v('#rtTech') || null,
        });
        m.close(); App.rerender();
        U.toast(`${r.no} created`, 'success');
        App.docs.show('repair_intake', r);
      } catch (e) { U.toast(e.message, 'danger'); }
    };
  }
  App.newRepairTicket = newTicket;

  function openTicket(id) {
    const r = S.get('repairs', id);
    const closed = ['collected', 'cancelled'].includes(r.status);
    const cost = svc.repairCost(r);
    const fin = svc.can('dashboard.finance');
    const tech = r.technician_id ? S.get('staff', r.technician_id) : null;
    const stIdx = openStatuses().findIndex((s) => s.id === r.status);
    const m = UI.modal({
      title: `${r.no} · ${r.device}`, sub: `${esc(r.customer_name)} ${r.customer_phone ? '· ' + esc(r.customer_phone) : ''}`, size: 'lg',
      body: `
        ${!closed ? `<div class="stepper-line">${openStatuses().map((s, i) => `<button class="sl-step ${i < stIdx ? 'done' : i === stIdx ? 'current' : ''}" data-status="${s.id}"><i>${i < stIdx ? I('check') : i + 1}</i><span>${esc(s.label)}</span></button>`).join('')}</div>` : `<div class="banner ${r.status === 'collected' ? 'success' : 'muted'}">${I(r.status === 'collected' ? 'check' : 'ban')}<div><strong>${r.status === 'collected' ? 'Collected ' + U.fmtDateTime(r.collected_at) : 'Cancelled'}</strong><span>${r.status === 'collected' ? `Paid ${U.money(r.final_price)}${r.warranty_until ? ' · warranty until ' + U.fmtDate(r.warranty_until) : ''}` : esc(r.cancel_reason || '')}</span></div></div>`}
        <div class="grid-2">
          <div class="kv">
            <div><span>Issue</span><strong>${esc(r.issue)}</strong></div>
            <div><span>Serial</span><strong>${esc(r.serial || '—')}</strong></div>
            <div><span>Accessories</span><strong>${esc((r.accessories || []).join(', ') || 'None')}</strong></div>
            <div><span>Condition</span><strong>${esc(r.condition_notes || '—')}</strong></div>
            <div><span>Technician</span><strong>${esc(tech?.name || 'Unassigned')}</strong></div>
            <div><span>Estimate</span><strong>${r.estimate ? U.money(r.estimate) : 'TBC'}</strong></div>
            <div><span>Deposit</span><strong>${r.deposit ? `${U.money(r.deposit)} · ${App.paymentLabel(r.deposit_method)}` : '—'}</strong></div>
            <div><span>Due</span><strong>${r.due_at ? U.fmtDate(r.due_at) : '—'}</strong></div>
          </div>
          <div>
            <h4 class="mini-title">Parts used ${fin ? `<span class="muted">· cost ${U.money(cost.parts)}</span>` : ''}</h4>
            <div class="list compact">${r.parts.map((p, i) => `<div class="list-row"><div><strong>${esc(p.name)}</strong><span class="muted small">${esc(p.sku)} × ${p.qty}${fin ? ' · ' + U.money(p.unit_cost * p.qty) : ''}</span></div>${!closed ? `<button class="btn ghost sm" data-ret="${i}">Return</button>` : ''}</div>`).join('') || '<p class="muted small">No parts used yet.</p>'}</div>
            ${!closed ? '<div id="rpPart" class="mt-s"></div>' : ''}
            <h4 class="mini-title mt">Timeline</h4>
            <ol class="timeline">${[...r.timeline].reverse().map((t) => `<li><i class="b-${App.REPAIR_STATUSES.find((s) => s.id === t.status)?.tone || 'muted'}"></i><div><strong>${esc(App.REPAIR_STATUSES.find((s) => s.id === t.status)?.label || t.status)}</strong>${t.note ? `<em>${esc(t.note)}</em>` : ''}<span>${U.fmtDateTime(t.at)} · ${esc(t.by)}</span></div></li>`).join('')}</ol>
            ${!closed ? `<div class="input-group mt-s"><input id="rpNote" placeholder="Add a note (diagnosis, customer call…)"><button class="btn ghost" id="rpNoteBtn">Add</button></div>` : ''}
          </div>
        </div>`,
      footer: `<button class="btn ghost" id="rpPrint">${I('printer')} ${r.status === 'collected' ? 'Receipt' : 'Intake ticket'}</button>
        ${r.customer_phone ? `<button class="btn ghost" id="rpWa">${I('message')} WhatsApp</button>` : ''}
        ${!closed ? `<button class="btn ghost danger-text" id="rpCancel">Cancel job</button><button class="btn primary" id="rpDone">${I('check')} Complete & collect</button>` : ''}`,
    });
    const reopen = () => { m.close(); App.rerender(); setTimeout(() => openTicket(id), 200); };
    m.el.querySelectorAll('[data-status]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.status === r.status) return;
      try { await svc.setRepairStatus(id, b.dataset.status, ''); reopen(); if (b.dataset.status === 'ready' && r.customer_phone && (await UI.confirm({ title: 'Notify customer?', message: 'Send a WhatsApp message that the device is ready for pickup?', confirmText: 'Open WhatsApp' }))) notify(r); } catch (e) { U.toast(e.message, 'danger'); }
    }));
    if (!closed) {
      UI.productPicker(m.el.querySelector('#rpPart'), {
        placeholder: 'Use part from inventory…', filter: (p) => p.stock > 0 && p.ownership !== 'consignment', showCost: true,
        onPick: async (p) => { try { await svc.useRepairPart(id, p.id, 1); U.toast(`${p.name} deducted from stock`, 'success'); reopen(); } catch (e) { U.toast(e.message, 'danger'); } },
      });
      m.el.querySelectorAll('[data-ret]').forEach((b) => (b.onclick = async () => { await svc.returnRepairPart(id, +b.dataset.ret); reopen(); }));
      m.el.querySelector('#rpNoteBtn').onclick = async () => { await svc.addRepairNote(id, m.el.querySelector('#rpNote').value); reopen(); };
      m.el.querySelector('#rpDone').onclick = () => { m.close(); completeModal(id); };
      m.el.querySelector('#rpCancel').onclick = async () => {
        const reason = await UI.confirm({ title: 'Cancel repair job', message: r.deposit ? `The deposit of ${U.money(r.deposit)} will be refunded and any parts returned to stock.` : 'Parts used will be returned to stock.', confirmText: 'Cancel job', danger: true, input: { label: 'Reason', required: true } });
        if (!reason) return;
        try { await svc.cancelRepair(id, { reason, refund_method: r.deposit_method || 'cash' }); m.close(); App.rerender(); U.toast('Job cancelled'); } catch (e) { U.toast(e.message, 'danger'); }
      };
    }
    m.el.querySelector('#rpPrint').onclick = () => App.docs.show(r.status === 'collected' ? 'repair' : 'repair_intake', S.get('repairs', id));
    m.el.querySelector('#rpWa')?.addEventListener('click', () => notify(r));
  }
  function notify(r) {
    const s = S.settings();
    const msg = r.status === 'ready' || S.get('repairs', r.id).status === 'ready'
      ? `Hi ${r.customer_name}, your ${r.device} (ticket ${r.no}) is ready for pickup at ${s.store_name}. ${r.estimate ? `Amount: ${U.money(r.estimate)}${r.deposit ? ` (deposit ${U.money(r.deposit)} paid)` : ''}.` : ''} Thank you!`
      : `Hi ${r.customer_name}, update on your ${r.device} (ticket ${r.no}) at ${s.store_name}: status is now "${App.REPAIR_STATUSES.find((x) => x.id === S.get('repairs', r.id).status)?.label}".`;
    window.open(`https://wa.me/${U.cleanPhone(r.customer_phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  }

  function completeModal(id) {
    const r = S.get('repairs', id);
    const fin = svc.can('dashboard.finance');
    const m = UI.modal({
      title: `Complete & collect · ${r.no}`, sub: 'Confirm the final price, collect the balance and record internal costs.', size: 'md',
      body: `<div class="form-grid">
        <label class="field"><span>Final price *</span><input id="cpPrice" type="number" min="0" step=".01" value="${r.estimate || ''}"></label>
        <label class="field"><span>Deposit already paid</span><input readonly value="${U.money(r.deposit)}"></label>
        <label class="field"><span>Balance method</span><select id="cpMethod">${UI.payOptions('cash')}</select></label>
        <label class="field"><span>Warranty (days)</span><input id="cpWar" type="number" min="0" step="1" value="${r.is_warranty_claim ? 0 : S.settings().warranty_repair_days}"></label>
        ${fin ? `<label class="field"><span>Outsource / technician cost</span><input id="cpOut" type="number" min="0" step=".01" value="0"></label>
        <label class="field"><span>Other internal cost</span><input id="cpOther" type="number" min="0" step=".01" value="0"></label>` : ''}
      </div>
      <div class="kv boxed" id="cpSum"></div>
      ${fin ? '<p class="muted small">Costs and profit are internal and never printed on the customer receipt.</p>' : ''}`,
      footer: `<button class="btn ghost" data-close>Back</button><button class="btn primary" id="cpGo">${I('check')} Collect & print receipt</button>`,
    });
    const val = (s) => U.num(m.el.querySelector(s)?.value);
    const calc = () => {
      const price = val('#cpPrice');
      const c = svc.repairCost(r, { outsource_cost: val('#cpOut'), other_cost: val('#cpOther') });
      const bal = U.r2(price - r.deposit);
      m.el.querySelector('#cpSum').innerHTML = `<div><span>Balance to collect</span><strong class="${bal < 0 ? 'danger' : ''}">${U.money(bal)}</strong></div>${fin ? `<div><span>Parts cost</span><strong>${U.money(c.parts)}</strong></div><div><span>Total internal cost</span><strong>${U.money(c.total)}</strong></div><div><span>Repair profit</span><strong class="${price - c.total < 0 ? 'danger' : 'success'}">${U.money(price - c.total)} (${price ? U.pct(((price - c.total) / price) * 100) : '0%'})</strong></div>` : ''}`;
    };
    m.el.addEventListener('input', calc); calc();
    m.el.querySelector('#cpGo').onclick = async () => {
      const price = val('#cpPrice');
      const bal = U.r2(price - r.deposit);
      try {
        const done = await svc.completeRepair(id, { final_price: price, payments: bal > 0 ? [{ method: m.el.querySelector('#cpMethod').value, amount: bal }] : [], outsource_cost: val('#cpOut'), other_cost: val('#cpOther'), warranty_days: m.el.querySelector('#cpWar').value });
        m.close(); App.rerender(); U.toast(`${r.no} collected`, 'success'); App.docs.show('repair', done);
      } catch (e) { U.toast(e.message, 'danger'); }
    };
  }
})();
