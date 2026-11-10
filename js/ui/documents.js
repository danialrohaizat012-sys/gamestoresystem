/* Arcadia POS — receipts, vouchers, tickets & reports (print / PDF / WhatsApp) */
(function () {
  const App = (window.App = window.App || {});
  const U = App.utils;
  const S = App.store;
  const { esc } = U;
  const D = (App.docs = {});
  const m = (n) => U.money(n);

  const warrantyText = (l) => (l.warranty_days ? `${l.warranty_days >= 365 && l.warranty_days % 365 === 0 ? l.warranty_days / 365 + ' yr' : l.warranty_days + ' days'} warranty · until ${U.fmtDate(l.warranty_until)}` : '');

  /* Normalised document model */
  D.build = (kind, x) => {
    const base = { kind, number: x.no, date: x.at, customer: x.customer_name, phone: x.customer_phone, staff: x.staff_name, status: x.status, backdated: x.backdated, notes: x.note || '' };
    switch (kind) {
      case 'sale': return { ...base, title: 'Tax Invoice / Receipt', lines: x.lines.map((l) => ({ name: l.name, meta: [l.sku, l.serial && 'SN ' + l.serial, l.condition, warrantyText(l), l.returned_qty ? `${l.returned_qty} returned` : ''].filter(Boolean).join(' · '), qty: l.qty, price: l.unit_price, total: l.total })),
        totals: [['Subtotal', m(x.subtotal)], x.discount ? ['Discount', '-' + m(x.discount)] : null, x.tax ? [x.tax_label, m(x.tax)] : null, ['Total', m(x.total), true]].filter(Boolean),
        payments: [...x.payments.map((p) => [App.paymentLabel(p.method), m(p.amount)]), x.tendered ? ['Cash tendered', m(x.tendered)] : null, x.change ? ['Change', m(x.change)] : null].filter(Boolean),
        extra: x.points_earned ? `You earned ${x.points_earned} loyalty points.` : '' };
      case 'buy': return { ...base, title: 'Purchase Voucher (Buy from Customer)', idNo: x.seller_id_no, lines: x.lines.map((l) => ({ name: l.name, meta: [l.sku, l.serial && 'SN ' + l.serial, l.condition, l.qc_fails?.length ? 'QC fail: ' + l.qc_fails.join(', ') : 'QC passed'].filter(Boolean).join(' · '), qty: l.qty, price: l.unit_price, total: l.total })),
        totals: [['Total paid to seller', m(x.total), true]], payments: [[App.paymentLabel(x.method), m(x.total)]],
        signature: ['Seller signature', 'Received by'], extra: 'The seller declares that the items above are their lawful property, free of any lien, and agrees to transfer ownership to the store.' };
      case 'trade': return { ...base, title: 'Trade-In Receipt', idNo: x.seller_id_no,
        sections: [
          { title: 'Traded in by customer', lines: x.in_lines.map((l) => ({ name: l.name, meta: [l.sku, l.serial && 'SN ' + l.serial, l.condition].filter(Boolean).join(' · '), qty: l.qty, price: l.unit_price, total: l.total })) },
          { title: 'Taken by customer', lines: x.out_lines.map((l) => ({ name: l.name, meta: [l.sku, l.serial && 'SN ' + l.serial, l.condition, warrantyText(l)].filter(Boolean).join(' · '), qty: l.qty, price: l.unit_price, total: l.total })) },
        ],
        totals: [['Items taken', m(x.total_out)], ['Trade-in value', '-' + m(x.total_in)], [x.direction === 'customer_pays' ? 'Customer pays' : x.direction === 'store_pays' ? 'Store pays customer' : 'Even trade', m(Math.abs(x.balance)), true]],
        payments: x.method !== 'none' ? [[App.paymentLabel(x.method), m(Math.abs(x.balance))]] : [], signature: ['Customer signature', 'Staff'] };
      case 'repair_intake': return { ...base, number: x.no, title: 'Repair Intake Ticket', lines: [],
        info: [['Device', x.device], ['Serial', x.serial || '—'], ['Issue', x.issue], ['Accessories', (x.accessories || []).join(', ') || 'None'], ['Condition notes', x.condition_notes || '—'], ['Estimate', x.estimate ? m(x.estimate) : 'To be quoted'], ['Deposit', x.deposit ? `${m(x.deposit)} (${App.paymentLabel(x.deposit_method)})` : '—'], ['Est. ready', x.due_at ? U.fmtDate(x.due_at) : '—']],
        signature: ['Customer signature', 'Received by'], extra: 'Devices not collected within 60 days of the ready notice may be disposed of to cover costs. Data loss during repair is not the store’s responsibility.' };
      case 'repair': return { ...base, date: x.collected_at || x.at, title: x.is_warranty_claim ? 'Warranty Repair Receipt' : 'Repair Invoice',
        info: [['Device', x.device], ['Serial', x.serial || '—'], ['Issue', x.issue], ['Warranty', x.warranty_days ? `${x.warranty_days} days · until ${U.fmtDate(x.warranty_until)}` : 'No warranty']],
        lines: [{ name: 'Repair service', meta: x.device, qty: 1, price: x.final_price, total: x.final_price }],
        totals: [['Repair total', m(x.final_price)], x.deposit ? ['Deposit paid', '-' + m(x.deposit)] : null, ['Balance paid', m(x.balance_paid ?? x.final_price), true]].filter(Boolean),
        payments: (x.payments || []).map((p) => [App.paymentLabel(p.method), m(p.amount)]) };
      case 'refund': case 'exchange': case 'warranty': {
        const t = { refund: 'Refund Note', exchange: 'Exchange Note', warranty: 'Warranty Claim' }[kind];
        const d = { ...base, title: t, ref: x.sale_no, lines: (x.return_lines || []).map((l) => ({ name: l.name, meta: `Returned${l.restock ? ' · restocked' : ' · written off'}`, qty: l.qty, price: U.r2(l.amount / l.qty), total: l.amount })) };
        if (kind === 'refund') { d.totals = [['Refunded', m(x.refund_amount), true]]; d.payments = [[App.paymentLabel(x.method), m(x.refund_amount)]]; d.notes = x.reason; }
        if (kind === 'exchange') {
          d.sections = [{ title: 'Returned', lines: d.lines }, { title: 'Replacement', lines: x.new_lines.map((l) => ({ name: l.name, meta: [l.sku, l.serial && 'SN ' + l.serial, warrantyText(l)].filter(Boolean).join(' · '), qty: l.qty, price: l.unit_price, total: l.total })) }];
          d.lines = null;
          d.totals = [['Credit', '-' + m(x.credit)], ['Replacement', m(x.new_total)], [x.difference >= 0 ? 'Customer pays' : 'Refunded to customer', m(Math.abs(x.difference)), true]];
          d.payments = x.difference ? [[App.paymentLabel(x.method), m(Math.abs(x.difference))]] : [];
        }
        if (kind === 'warranty') {
          d.lines = [];
          d.info = [['Product', x.product_name], ['Serial', x.serial || '—'], ['Warranty until', U.fmtDate(x.warranty_until)], ['Fault', x.issue], ['Resolution', x.resolution === 'repair' ? `Sent for repair (${x.repair_no || ''})` : `Replaced with ${x.replacement?.name} (${x.replacement?.sku})`]];
        }
        return d;
      }
      case 'po': return { ...base, customer: x.supplier_name, title: 'Purchase Order', ref: x.invoice_no,
        lines: x.lines.map((l) => ({ name: l.name, meta: `${l.received_qty}/${l.qty} received`, qty: l.qty, price: l.unit_cost, total: U.r2(l.unit_cost * l.qty) })),
        totals: [['Subtotal', m(x.subtotal)], x.shipping ? ['Shipping', m(x.shipping)] : null, x.discount ? ['Discount', '-' + m(x.discount)] : null, ['Total', m(x.total), true], ['Paid', m(x.paid)], ['Balance', m(x.total - x.paid)]].filter(Boolean) };
      case 'shift': {
        const sum = App.svc.shiftSummary(x);
        const label = { sale: 'Cash sales', buy: 'Buy from customer', trade: 'Trade-in balance', repair: 'Repair payments', repair_deposit: 'Repair deposits', repair_refund: 'Deposit refunds', refund: 'Refunds', exchange: 'Exchanges', purchase: 'Supplier payments', consignment: 'Consignor payouts', cash_in: 'Cash in', cash_out: 'Cash out', void: 'Voids' };
        return { kind, number: x.no, date: x.closed_at || x.opened_at, staff: x.closed_by_name || x.opened_by_name, customer: '', title: 'Shift Report (Z-Report)', lines: [],
          info: [['Opened', `${U.fmtDateTime(x.opened_at)} · ${x.opened_by_name}`], ['Closed', x.closed_at ? `${U.fmtDateTime(x.closed_at)} · ${x.closed_by_name}` : 'Still open']],
          totals: [['Opening cash', m(x.opening)], ...Object.entries(x.status === 'closed' && x.summary ? x.summary : sum.by).map(([k, v]) => [label[k] || k, m(v)]), ['Expected cash', m(x.status === 'closed' ? x.expected : sum.expected), true], x.counted != null ? ['Counted cash', m(x.counted)] : null, x.counted != null ? ['Variance', U.money(x.variance, { sign: true }), true] : null].filter(Boolean),
          notes: x.close_note || '' };
      }
      case 'stock_take': {
        const counted = x.lines.filter((l) => l.counted != null);
        const vars = counted.filter((l) => (l.variance ?? U.int(l.counted) - U.int(l.system_qty)) !== 0);
        return { kind, number: x.no, date: x.finalized_at || x.started_at, staff: x.finalized_by || x.started_by, customer: '', title: 'Stock Take Report', status: x.status, plain: true,
          info: [['Scope', x.category || 'All categories'], ['Started', `${U.fmtDateTime(x.started_at)} · ${x.started_by}`], ['Finalized', x.finalized_at ? `${U.fmtDateTime(x.finalized_at)} · ${x.finalized_by}` : 'Not yet'], ['SKUs counted', `${counted.length} / ${x.lines.length}`], ['Adjustment ref', x.adj_no || '—']],
          lines: vars.map((l) => { const v = l.variance ?? U.int(l.counted) - U.int(l.system_qty); return { name: l.name, meta: `${l.sku} · system ${l.system_qty} → counted ${l.counted}${l.reason ? ' · ' + l.reason : ''}`, qty: (v > 0 ? '+' : '') + v, price: 0, total: 0 }; }),
          totals: x.value_variance != null ? [['Value variance (at cost)', U.money(x.value_variance, { sign: true }), true]] : null, notes: x.final_note || x.note || '' };
      }
      default: return base;
    }
  };

  const store = () => S.settings();
  const linesTable = (lines, plain = false) => `<table class="doc-lines"><thead><tr><th>Item</th><th class="num">Qty</th>${plain ? '' : '<th class="num">Price</th><th class="num">Total</th>'}</tr></thead><tbody>
    ${lines.map((l) => `<tr><td><strong>${esc(l.name)}</strong>${l.meta ? `<small>${esc(l.meta)}</small>` : ''}</td><td class="num">${l.qty}</td>${plain ? '' : `<td class="num">${m(l.price)}</td><td class="num">${m(l.total)}</td>`}</tr>`).join('') || `<tr><td colspan="${plain ? 2 : 4}" class="muted">—</td></tr>`}</tbody></table>`;

  D.html = (d) => {
    const s = store();
    return `<article class="doc paper-${s.receipt_paper}">
      <header class="doc-head">
        <div class="doc-logo" style="background:${esc(s.accent)}">${esc(s.logo_text || U.initials(s.store_name))}</div>
        <div><h2>${esc(s.store_name)}</h2><p>${esc(s.legal_name)}${s.registration_no ? ` · ${esc(s.registration_no)}` : ''}</p><p>${esc(s.address).replace(/\n/g, '<br>')}</p><p>${esc(s.phone)}${s.email ? ' · ' + esc(s.email) : ''}</p></div>
      </header>
      <div class="doc-title"><h3>${esc(d.title)}</h3>${d.status === 'void' ? '<span class="doc-void">VOID</span>' : ''}${d.backdated ? '<span class="doc-void soft">BACKDATED</span>' : ''}</div>
      <dl class="doc-meta">
        <div><dt>No.</dt><dd>${esc(d.number)}</dd></div><div><dt>Date</dt><dd>${U.fmtDateTime(d.date)}</dd></div>
        ${d.customer ? `<div><dt>${d.kind === 'po' ? 'Supplier' : 'Customer'}</dt><dd>${esc(d.customer)}${d.phone ? ' · ' + esc(d.phone) : ''}</dd></div>` : ''}
        ${d.idNo ? `<div><dt>IC / ID</dt><dd>${esc(d.idNo)}</dd></div>` : ''}
        ${d.ref ? `<div><dt>Reference</dt><dd>${esc(d.ref)}</dd></div>` : ''}
        ${d.staff ? `<div><dt>Served by</dt><dd>${esc(d.staff)}</dd></div>` : ''}
      </dl>
      ${d.info ? `<dl class="doc-info">${d.info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${d.sections ? d.sections.map((sec) => `<h4 class="doc-sec">${esc(sec.title)}</h4>${linesTable(sec.lines)}`).join('') : d.lines && d.lines.length ? linesTable(d.lines, d.plain) : ''}
      ${d.totals ? `<div class="doc-totals">${d.totals.map(([k, v, strong]) => `<div class="${strong ? 'strong' : ''}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>` : ''}
      ${d.payments?.length ? `<div class="doc-pay"><h4>Payment</h4>${d.payments.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>` : ''}
      ${d.notes ? `<p class="doc-note"><b>Note:</b> ${esc(d.notes)}</p>` : ''}
      ${d.extra ? `<p class="doc-note">${esc(d.extra)}</p>` : ''}
      ${d.signature ? `<div class="doc-sign">${d.signature.map((t) => `<div><span></span>${esc(t)}</div>`).join('')}</div>` : ''}
      <footer class="doc-foot">${esc(s.receipt_footer)}<br><span>${esc(s.website || '')}</span></footer>
    </article>`;
  };

  D.text = (d) => {
    const s = store();
    const L = [`*${s.store_name}*`, d.title, `No: ${d.number}`, `Date: ${U.fmtDateTime(d.date)}`, ''];
    const addLines = (lines) => lines.forEach((l) => L.push(`• ${l.name} x${l.qty} — ${m(l.total)}`));
    if (d.sections) d.sections.forEach((sec) => { L.push(`_${sec.title}_`); addLines(sec.lines); });
    else if (d.lines) addLines(d.lines);
    if (d.info) d.info.forEach(([k, v]) => L.push(`${k}: ${v}`));
    if (d.totals) { L.push(''); d.totals.forEach(([k, v, st]) => L.push(st ? `*${k}: ${v}*` : `${k}: ${v}`)); }
    L.push('', s.receipt_footer);
    return L.join('\n');
  };

  D.print = (d) => {
    let root = document.getElementById('printRoot');
    if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.appendChild(root); }
    root.innerHTML = D.html(d);
    document.body.dataset.paper = store().receipt_paper;
    setTimeout(() => window.print(), 50);
  };
  D.whatsapp = (d) => {
    const phone = U.cleanPhone(d.phone);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(D.text(d))}`;
    window.open(url, '_blank', 'noopener');
  };

  /* Preview modal with actions */
  D.show = (kind, x, { after } = {}) => {
    const d = D.build(kind, x);
    const modal = App.ui.modal({
      title: d.title, sub: esc(d.number), size: 'doc',
      body: `<div class="doc-preview">${D.html(d)}</div>`,
      footer: `<button class="btn ghost" id="docWa" ${d.phone ? '' : 'disabled title="No phone number"'}>${App.icon('message')} WhatsApp</button>
        <button class="btn ghost" id="docCopy">${App.icon('receipt')} Copy text</button>
        <button class="btn primary" id="docPrint">${App.icon('printer')} Print / PDF</button>
        ${after ? `<button class="btn accent" id="docAfter">${esc(after.label)}</button>` : ''}`,
    });
    modal.el.querySelector('#docPrint').onclick = () => D.print(d);
    modal.el.querySelector('#docWa').onclick = () => D.whatsapp(d);
    modal.el.querySelector('#docCopy').onclick = async () => { try { await navigator.clipboard.writeText(D.text(d)); U.toast('Copied', 'success'); } catch { U.toast('Clipboard blocked', 'danger'); } };
    if (after) modal.el.querySelector('#docAfter').onclick = () => { modal.close(); after.run(); };
    return modal;
  };
})();
