/* Arcadia POS — business logic.
 * Every operation that touches more than one record runs inside store.tx() so it is
 * all-or-nothing. Every stock change goes through moveStock() (full stock ledger) and
 * every cash movement goes through postCash() (shift cash ledger).
 */
(function () {
  const App = (window.App = window.App || {});
  const U = App.utils;
  const S = App.store;
  const svc = (App.svc = {});

  /* ================= Session & permissions ================= */
  App.session = { staff: null, backdate: null };

  svc.can = (perm) => {
    const st = App.session.staff;
    if (!st) return false;
    const role = App.ROLES[st.role];
    if (!role) return false;
    return role.perms.includes('*') || role.perms.includes(perm);
  };
  svc.require = (perm, what = 'This action') => {
    if (!svc.can(perm)) throw new Error(`${what} requires ${perm.includes('.') ? 'manager' : 'additional'} permission.`);
  };
  svc.isOwner = () => App.session.staff?.role === 'owner';

  /* Context for each transaction: who, when, backdated? */
  svc.ctx = () => {
    const st = App.session.staff;
    if (!st) throw new Error('Please sign in.');
    const b = App.session.backdate;
    if (b) {
      if (!svc.isOwner()) throw new Error('Only the owner can record backdated transactions.');
      const at = new Date(b.at);
      if (Number.isNaN(at.getTime())) throw new Error('Invalid backdate.');
      if (at.getTime() > Date.now() + 60000) throw new Error('Backdated time cannot be in the future.');
      if (!b.reason) throw new Error('A reason is required for backdated entries.');
      if (b.silent) return { at: at.toISOString(), backdated: false, backdate_reason: '', staff_id: st.id, staff_name: st.name };
      return { at: at.toISOString(), backdated: true, backdate_reason: b.reason, staff_id: st.id, staff_name: st.name };
    }
    return { at: U.nowISO(), backdated: false, backdate_reason: '', staff_id: st.id, staff_name: st.name };
  };

  svc.audit = async (action, detail = '', ref = {}) => {
    const st = App.session.staff;
    await S.insert('audit_log', { at: U.nowISO(), action, detail, staff_id: st?.id || null, staff_name: st?.name || 'system', ...ref });
  };

  /* ================= Numbering ================= */
  const yymmdd = (iso) => { const d = new Date(iso); return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  svc.nextNo = async (prefix, at = U.nowISO()) => {
    const key = `${prefix}-${yymmdd(at)}`;
    const c = S.get('counters', key);
    const seq = (c?.value || 0) + 1;
    await S.upsert('counters', { id: key, value: seq });
    return `${key}-${String(seq).padStart(3, '0')}`;
  };
  svc.nextSku = async (category) => {
    const prefix = App.CATEGORY_PREFIX[category] || String(category || 'GEN').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'GEN';
    const key = `SKU-${prefix}`;
    let seq = (S.get('counters', key)?.value || 0) + 1;
    let sku = `${prefix}-${String(seq).padStart(5, '0')}`;
    while (S.find('products', (p) => p.sku === sku)) { seq++; sku = `${prefix}-${String(seq).padStart(5, '0')}`; }
    await S.upsert('counters', { id: key, value: seq });
    return sku;
  };

  /* ================= Customers ================= */
  svc.customerSnap = (id) => {
    const c = id ? S.get('customers', id) : null;
    return { customer_id: c?.id || null, customer_name: c?.name || 'Walk-in Customer', customer_phone: c?.phone || '' };
  };
  svc.saveCustomer = async (c) => {
    const name = String(c.name || '').trim();
    if (!name) throw new Error('Customer name is required.');
    const phone = U.cleanPhone(c.phone);
    if (phone) {
      const dup = S.find('customers', (x) => x.phone === phone && x.id !== c.id);
      if (dup) throw new Error(`Phone already belongs to ${dup.name}.`);
    }
    const row = { type: 'registered', channel: '', email: '', address: '', notes: '', ic_no: '', points: 0, ...c, name, phone };
    return c.id ? S.update('customers', c.id, row) : S.insert('customers', row);
  };
  svc.customerStats = (id) => {
    const sales = S.filter('sales', (s) => s.customer_id === id && s.status === 'completed');
    const buys = S.filter('buys', (s) => s.customer_id === id && s.status === 'completed');
    const trades = S.filter('trades', (s) => s.customer_id === id && s.status === 'completed');
    const repairs = S.filter('repairs', (s) => s.customer_id === id);
    const all = [...sales, ...buys, ...trades, ...repairs].map((x) => x.at).sort();
    return {
      spent: U.sum(sales, (s) => s.total) + U.sum(trades.filter((t) => t.balance > 0), (t) => t.balance) + U.sum(repairs.filter((r) => r.status === 'collected'), (r) => r.final_price),
      sold_to_us: U.sum(buys, (b) => b.total),
      visits: sales.length + buys.length + trades.length + repairs.length,
      last: all[all.length - 1] || null,
    };
  };

  /* ================= Products & stock ledger ================= */
  svc.warrantyDaysFor = (p) => {
    const s = S.settings();
    if (p.warranty_days != null && p.warranty_days !== '') return U.int(p.warranty_days);
    if (p.category === 'Gift Cards' || p.category === 'Repair Parts') return 0;
    return p.condition === 'New' ? U.int(s.warranty_new_days) : U.int(s.warranty_used_days);
  };
  svc.isLow = (p) => p.active !== false && p.stock <= U.int(p.low_stock ?? 1);

  svc.moveStock = async (product, delta, ref, c) => {
    const p = S.get('products', product.id || product);
    if (!p) throw new Error('Product not found.');
    delta = U.int(delta);
    if (!delta) return p;
    const before = U.int(p.stock);
    const after = before + delta;
    if (after < 0) throw new Error(`Not enough stock for "${p.name}" (available ${before}, needed ${-delta}).`);
    await S.update('products', p.id, { stock: after, active: true });
    await S.insert('stock_moves', {
      at: c?.at || U.nowISO(), product_id: p.id, sku: p.sku, product_name: p.name,
      delta, before, after, ref_type: ref.type, ref_id: ref.id || null, ref_no: ref.no || '', reason: ref.reason || '',
      staff_id: c?.staff_id || null, staff_name: c?.staff_name || '',
    });
    return p;
  };
  /* Stock in with weighted-average cost (owned stock only). */
  svc.receiveStock = async (product, qty, unitCost, ref, c) => {
    const p = S.get('products', product.id || product);
    qty = U.int(qty);
    if (qty <= 0) throw new Error('Quantity must be at least 1.');
    if (p.ownership !== 'consignment') {
      const oldQ = Math.max(0, U.int(p.stock));
      const cost = oldQ + qty > 0 ? U.r2((oldQ * U.num(p.cost) + qty * U.num(unitCost)) / (oldQ + qty)) : U.num(unitCost);
      await S.update('products', p.id, { cost });
    }
    return svc.moveStock(p, qty, ref, c);
  };

  svc.saveProduct = async (data) => {
    svc.require('inventory.edit', 'Editing products');
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Product name is required.');
    const serial = String(data.serial || '').trim();
    if (serial) {
      const dup = S.find('products', (p) => p.id !== data.id && U.normSerial(p.serial) === U.normSerial(serial));
      if (dup) throw new Error(`Serial already registered to ${dup.name} (${dup.sku}).`);
      if (U.int(data.stock) > 1) throw new Error('A serialised item can only have stock 0 or 1.');
    }
    if (data.barcode) {
      const dup = S.find('products', (p) => p.id !== data.id && p.barcode && p.barcode === data.barcode);
      if (dup) throw new Error(`Barcode already used by ${dup.name}.`);
    }
    return S.tx(async () => {
      const c = svc.ctx();
      if (data.id) {
        const cur = S.get('products', data.id);
        const patch = { ...data, name, serial };
        delete patch.stock; // stock never edited directly — use adjustment (ledger)
        delete patch.adjust_reason;
        if (data.sku && data.sku !== cur.sku) {
          if (!svc.isOwner()) throw new Error('Only the owner can change a SKU.');
          if (S.find('products', (p) => p.sku === data.sku && p.id !== cur.id)) throw new Error('SKU already exists.');
        }
        const p = await S.update('products', data.id, patch);
        const newStock = U.int(data.stock);
        if (data.stock != null && newStock !== U.int(cur.stock)) {
          svc.require('inventory.adjust', 'Changing stock');
          await svc.moveStock(p, newStock - U.int(cur.stock), { type: 'adjustment', no: await svc.nextNo('ADJ', c.at), reason: data.adjust_reason || 'Manual edit' }, c);
        }
        return p;
      }
      const sku = data.sku && svc.isOwner() ? data.sku : await svc.nextSku(data.category);
      if (S.find('products', (p) => p.sku === sku)) throw new Error('SKU already exists.');
      const p = await S.insert('products', {
        sku, barcode: data.barcode || '', name, category: data.category, platform: data.platform || '', condition: data.condition || 'New',
        serial, stock: 0, cost: U.num(data.cost), price: U.num(data.price), low_stock: U.int(data.low_stock ?? 1),
        warranty_days: data.warranty_days === '' || data.warranty_days == null ? null : U.int(data.warranty_days),
        ownership: 'owned', supplier_id: null, consignment_cost: 0, active: true, notes: data.notes || '',
      });
      if (U.int(data.stock) > 0) await svc.moveStock(p, U.int(data.stock), { type: 'opening', reason: 'Opening stock' }, c);
      return p;
    });
  };

  svc.adjustStock = async (productId, delta, reason) => {
    svc.require('inventory.adjust', 'Stock adjustment');
    if (!String(reason || '').trim()) throw new Error('A reason is required for stock adjustments.');
    return S.tx(async () => {
      const c = svc.ctx();
      const no = await svc.nextNo('ADJ', c.at);
      await svc.moveStock({ id: productId }, delta, { type: 'adjustment', no, reason }, c);
      await svc.audit('stock.adjust', `${no}: ${delta > 0 ? '+' : ''}${delta} · ${reason}`, { ref_id: productId });
    });
  };

  /* Audit fix #7: products with history are archived, never hard-deleted. */
  svc.deleteProduct = async (id) => {
    svc.require('inventory.edit', 'Deleting products');
    const p = S.get('products', id);
    const used = S.all('stock_moves').some((m) => m.product_id === id && m.ref_type !== 'opening');
    if (used || p.stock > 0) {
      await S.update('products', id, { active: false });
      return 'archived';
    }
    await S.tx(async () => {
      S.filter('stock_moves', (m) => m.product_id === id).forEach((m) => S.remove('stock_moves', m.id));
      await S.remove('products', id);
    });
    return 'deleted';
  };

  /* Find an existing product to merge into, or create a new one (stock 0).
     Serialised items never merge; a serial that comes back (we sold it, now buying back) re-uses its SKU. */
  svc.resolveProduct = async (item, { ownership = 'owned', supplier_id = null } = {}) => {
    if (item.product_id) {
      const p = S.get('products', item.product_id);
      if (!p) throw new Error('Selected product no longer exists.');
      if (item.serial && U.normSerial(p.serial) !== U.normSerial(item.serial)) {
        // same model but this unit has its own serial → separate SKU
        return svc.resolveProduct({ ...item, product_id: null, name: p.name, category: p.category, platform: p.platform, price: item.price || p.price }, { ownership, supplier_id });
      }
      return p;
    }
    const name = String(item.name || '').trim();
    if (!name) throw new Error('Item name is required.');
    const serial = String(item.serial || '').trim();
    if (serial) {
      const ex = S.find('products', (p) => U.normSerial(p.serial) === U.normSerial(serial));
      if (ex) {
        if (ex.stock > 0) throw new Error(`Serial ${serial} is already in stock as ${ex.name} (${ex.sku}).`);
        await S.update('products', ex.id, { condition: item.condition || ex.condition, price: U.num(item.price) || ex.price, ownership, supplier_id });
        return ex;
      }
    } else {
      const ex = S.find('products', (p) => !p.serial && U.normalize(p.name) === U.normalize(name) && p.category === item.category
        && (p.platform || '') === (item.platform || '') && p.condition === (item.condition || 'Used')
        && (p.ownership || 'owned') === ownership && (ownership !== 'consignment' || p.supplier_id === supplier_id));
      if (ex) { if (U.num(item.price)) await S.update('products', ex.id, { price: U.num(item.price) }); return ex; }
    }
    return S.insert('products', {
      sku: await svc.nextSku(item.category), barcode: '', name, category: item.category || 'Accessories', platform: item.platform || '',
      condition: item.condition || 'Used', serial, stock: 0, cost: 0, price: U.num(item.price), low_stock: serial ? 0 : 1,
      warranty_days: null, ownership, supplier_id, consignment_cost: ownership === 'consignment' ? U.num(item.consignment_cost) : 0, active: true, notes: '',
    });
  };

  /* ================= Cash ledger & shifts ================= */
  svc.currentShift = () => S.find('shifts', (s) => s.status === 'open');
  svc.lastClosedShift = () => S.filter('shifts', (s) => s.status === 'closed').sort((a, b) => (b.closed_at || '').localeCompare(a.closed_at || ''))[0] || null;

  /* Validate BEFORE writing anything: cash in a payment list needs an open shift. */
  svc.assertCashAllowed = (payments, c) => {
    const hasCash = payments.some((p) => p.method === 'cash' && U.num(p.amount) !== 0);
    if (hasCash && !c.backdated && !svc._seeding && !svc.currentShift() && S.settings().require_shift_for_cash) {
      throw new Error('Open a shift before accepting or paying out cash.');
    }
  };
  /* signed amount: + money into drawer, - money out of drawer */
  svc.postCash = async (amount, type, ref, c, note = '') => {
    amount = U.r2(amount);
    if (!amount || c.backdated) return null;
    const sh = svc.currentShift();
    if (!sh) return null;
    return S.insert('cash_ledger', { at: c.at, shift_id: sh.id, amount, type, ref_type: ref.type, ref_id: ref.id, ref_no: ref.no, note, staff_id: c.staff_id, staff_name: c.staff_name });
  };
  svc.postPayments = async (payments, sign, type, ref, c) => {
    for (const p of payments) if (p.method === 'cash') await svc.postCash(sign * U.num(p.amount), type, ref, c);
  };
  svc.shiftSummary = (shift) => {
    if (!shift) return null;
    const rows = S.filter('cash_ledger', (r) => r.shift_id === shift.id);
    const by = {};
    rows.forEach((r) => (by[r.type] = U.r2((by[r.type] || 0) + r.amount)));
    const movement = U.sum(rows, (r) => r.amount);
    return { rows, by, movement, expected: U.r2(U.num(shift.opening) + movement) };
  };
  svc.openShift = async ({ opening, note = '', reason = '' }) => {
    svc.require('shift', 'Opening a shift');
    if (svc.currentShift()) throw new Error('A shift is already open.');
    opening = U.r2(opening);
    if (opening < 0) throw new Error('Opening cash cannot be negative.');
    const prev = svc.lastClosedShift();
    const diff = prev ? U.r2(opening - U.num(prev.counted)) : 0;
    if (diff !== 0) {
      svc.require('shift.override', 'Opening with a cash difference');
      if (!reason.trim()) throw new Error(`Opening cash differs from last closing (${U.money(prev.counted)}). A reason is required.`);
    }
    return S.tx(async () => {
      const st = App.session.staff;
      const at = U.nowISO();
      const sh = await S.insert('shifts', {
        no: await svc.nextNo('SHF', at), status: 'open', opened_at: at, opened_by: st.id, opened_by_name: st.name,
        opening, prev_shift_id: prev?.id || null, prev_closing: prev ? prev.counted : null, opening_diff: diff, opening_reason: reason, note,
      });
      if (diff !== 0) await svc.audit('shift.opening_diff', `${sh.no}: ${U.money(diff, { sign: true })} · ${reason}`, { ref_id: sh.id });
      return sh;
    });
  };
  svc.cashMove = async ({ direction, amount, note }) => {
    svc.require('shift', 'Cash in/out');
    const sh = svc.currentShift();
    if (!sh) throw new Error('Open a shift first.');
    amount = U.r2(amount);
    if (amount <= 0) throw new Error('Enter an amount.');
    if (!String(note || '').trim()) throw new Error('A note is required for cash in/out.');
    if (direction === 'out' && amount > svc.shiftSummary(sh).expected) throw new Error('Cash out exceeds the cash expected in the drawer.');
    return S.tx(async () => {
      const c = { ...svc.ctx(), at: U.nowISO(), backdated: false };
      const no = await svc.nextNo('CSH', c.at);
      await svc.postCash(direction === 'in' ? amount : -amount, direction === 'in' ? 'cash_in' : 'cash_out', { type: 'cash', no }, c, note);
    });
  };
  svc.closeShift = async ({ counted, note = '', denominations = null }) => {
    const sh = svc.currentShift();
    if (!sh) throw new Error('No open shift.');
    if (counted === '' || counted == null) throw new Error('Count the drawer and enter the closing cash.');
    counted = U.r2(counted);
    const sum = svc.shiftSummary(sh);
    const variance = U.r2(counted - sum.expected);
    if (variance !== 0 && !String(note).trim()) throw new Error('Explain the variance before closing.');
    const st = App.session.staff;
    return S.update('shifts', sh.id, {
      status: 'closed', closed_at: U.nowISO(), closed_by: st.id, closed_by_name: st.name,
      expected: sum.expected, counted, variance, close_note: note, denominations, summary: sum.by,
    });
  };

  /* ================= Pricing ================= */
  /* lines: [{ product_id, qty, unit_price, line_discount }]; discount: absolute amount on subtotal */
  svc.priceLines = (lines, discount = 0) => {
    const s = S.settings();
    const subtotal = U.sum(lines, (l) => U.num(l.unit_price) * U.int(l.qty) - U.num(l.line_discount));
    discount = U.clamp(U.r2(discount), 0, subtotal);
    let remaining = discount;
    const priced = lines.map((l, i) => {
      const gross = U.r2(U.num(l.unit_price) * U.int(l.qty) - U.num(l.line_discount));
      const share = i === lines.length - 1 ? remaining : U.r2(subtotal ? (gross / subtotal) * discount : 0);
      remaining = U.r2(remaining - share);
      return { ...l, total: gross, net: U.r2(gross - share) };
    });
    const net = U.r2(subtotal - discount);
    let tax = 0, total = net;
    if (s.tax_enabled) {
      const rate = U.num(s.tax_rate) / 100;
      if (s.tax_inclusive) tax = U.r2(net - net / (1 + rate));
      else { tax = U.r2(net * rate); total = U.r2(net + tax); }
    }
    // amount the customer paid for each line (incl. tax) → used for exact refunds
    const factor = net ? total / net : 1;
    let left = total;
    priced.forEach((l, i) => { l.paid = i === priced.length - 1 ? U.r2(left) : U.r2(l.net * factor); left = U.r2(left - l.paid); });
    return { lines: priced, subtotal, discount, tax, total, revenue: U.r2(total - tax) };
  };

  const validatePayments = (payments, due) => {
    payments = (payments || []).filter((p) => U.num(p.amount) > 0).map((p) => ({ method: p.method, amount: U.r2(p.amount) }));
    if (due > 0 && !payments.length) throw new Error('Add a payment.');
    const paid = U.sum(payments, (p) => p.amount);
    if (Math.abs(paid - due) > 0.004) throw new Error(`Payments (${U.money(paid)}) must equal the amount due (${U.money(due)}).`);
    return payments;
  };

  /* Build sale-type lines from products (stock checked inside moveStock) */
  const buildOutLines = (items, c) => items.map((it) => {
    const p = S.get('products', it.product_id);
    if (!p) throw new Error('A product in the cart no longer exists.');
    if (p.active === false) throw new Error(`${p.name} is archived.`);
    const qty = U.int(it.qty);
    if (qty <= 0) throw new Error('Quantity must be at least 1.');
    if (p.serial && qty > 1) throw new Error(`${p.name} is serialised — quantity must be 1.`);
    const wd = svc.warrantyDaysFor(p);
    return {
      product_id: p.id, sku: p.sku, name: p.name, serial: p.serial || '', condition: p.condition, platform: p.platform, category: p.category,
      qty, unit_price: U.r2(it.unit_price ?? p.price), line_discount: U.r2(it.line_discount || 0),
      unit_cost: p.ownership === 'consignment' ? U.num(p.consignment_cost || p.cost) : U.num(p.cost),
      ownership: p.ownership || 'owned', supplier_id: p.supplier_id || null,
      warranty_days: wd, warranty_until: wd ? U.addDays(c.at, wd).toISOString() : null, returned_qty: 0,
    };
  });

  /* ================= Sale ================= */
  svc.completeSale = async ({ items, customer_id = null, discount = 0, payments, tendered = 0, note = '' }) => {
    svc.require('pos', 'Selling');
    if (!items?.length) throw new Error('The cart is empty.');
    return S.tx(async () => {
      const c = svc.ctx();
      if (items.some((i) => { const p = S.get('products', i.product_id); return p && i.unit_price != null && U.r2(i.unit_price) !== U.r2(p.price); })) svc.require('pos.price', 'Changing prices');
      const base = buildOutLines(items, c);
      const pr = svc.priceLines(base, discount);
      if (pr.discount > pr.subtotal * 0.3) svc.require('pos.price', 'Discounts above 30%');
      const pays = validatePayments(payments, pr.total);
      svc.assertCashAllowed(pays, c);
      const cashPaid = U.sum(pays.filter((p) => p.method === 'cash'), (p) => p.amount);
      if (tendered && tendered < cashPaid) throw new Error('Cash tendered is less than the cash portion.');
      const cogs = U.sum(pr.lines, (l) => l.unit_cost * l.qty);
      const s = S.settings();
      const points = s.loyalty_enabled && customer_id ? Math.floor(pr.revenue * U.num(s.loyalty_rate)) : 0;
      const no = await svc.nextNo('INV', c.at);
      const sale = await S.insert('sales', {
        no, ...c, shift_id: c.backdated ? null : svc.currentShift()?.id || null, ...svc.customerSnap(customer_id),
        lines: pr.lines, subtotal: pr.subtotal, discount: pr.discount, tax: pr.tax, tax_label: s.tax_enabled ? `${s.tax_label} ${s.tax_rate}%${s.tax_inclusive ? ' (incl.)' : ''}` : '',
        total: pr.total, revenue: pr.revenue, payments: pays, tendered: U.r2(tendered), change: tendered ? U.r2(tendered - cashPaid) : 0,
        cogs, profit: U.r2(pr.revenue - cogs), points_earned: points, note, status: 'completed',
      });
      for (const l of pr.lines) await svc.moveStock({ id: l.product_id }, -l.qty, { type: 'sale', id: sale.id, no }, c);
      await svc.postPayments(pays, +1, 'sale', { type: 'sale', id: sale.id, no }, c);
      if (points) { const cu = S.get('customers', customer_id); await S.update('customers', cu.id, { points: U.int(cu.points) + points }); }
      return sale;
    });
  };

  /* ================= Buy from customer ================= */
  svc.completeBuy = async ({ customer_id, seller_id_no = '', items, method, note = '' }) => {
    svc.require('buy', 'Buying from customers');
    if (!customer_id) throw new Error('Select or create the seller — second-hand purchases must be traceable.');
    if (!items?.length) throw new Error('Add at least one item.');
    return S.tx(async () => {
      const c = svc.ctx();
      const lines = [];
      for (const it of items) {
        const qty = U.int(it.qty || 1);
        if (qty <= 0) throw new Error('Quantity must be at least 1.');
        if (it.serial && qty > 1) throw new Error(`${it.name}: serialised items must be quantity 1.`);
        const unit = U.r2(it.unit_price);
        if (unit < 0) throw new Error('Offer price cannot be negative.');
        const fails = Object.entries(it.qc || {}).filter(([, v]) => v === 'fail').map(([k]) => k);
        const p = await svc.resolveProduct({ ...it, price: it.sell_price });
        lines.push({
          product_id: p.id, sku: p.sku, name: p.name, category: p.category, platform: p.platform, condition: it.condition || p.condition,
          serial: it.serial || p.serial || '', qty, unit_price: unit, total: U.r2(unit * qty), sell_price: U.r2(it.sell_price || p.price), qc: it.qc || {}, qc_fails: fails, qc_notes: it.qc_notes || '',
        });
      }
      const total = U.sum(lines, (l) => l.total);
      const pays = [{ method, amount: total }];
      svc.assertCashAllowed(pays, c);
      const no = await svc.nextNo('BUY', c.at);
      const buy = await S.insert('buys', { no, ...c, shift_id: c.backdated ? null : svc.currentShift()?.id || null, ...svc.customerSnap(customer_id), seller_id_no, lines, total, method, note, status: 'completed' });
      for (const l of lines) {
        await svc.receiveStock({ id: l.product_id }, l.qty, l.unit_price, { type: 'buy', id: buy.id, no }, c);
        if (l.sell_price) await S.update('products', l.product_id, { price: l.sell_price, condition: l.condition });
      }
      await svc.postPayments(pays, -1, 'buy', { type: 'buy', id: buy.id, no }, c);
      return buy;
    });
  };

  /* ================= Trade-in ================= */
  svc.tradeTotals = (inItems, outItems) => {
    const totalIn = U.sum(inItems, (i) => U.num(i.unit_price) * U.int(i.qty || 1));
    const totalOut = U.sum(outItems, (i) => U.num(i.unit_price) * U.int(i.qty || 1));
    const balance = U.r2(totalOut - totalIn);
    return { totalIn, totalOut, balance, direction: balance > 0 ? 'customer_pays' : balance < 0 ? 'store_pays' : 'even' };
  };
  svc.completeTrade = async ({ customer_id, seller_id_no = '', inItems, outItems, method, note = '' }) => {
    svc.require('trade', 'Trade-in');
    if (!customer_id) throw new Error('Select or create the customer for this trade-in.');
    if (!inItems?.length) throw new Error('Add at least one item the customer is trading in.');
    return S.tx(async () => {
      const c = svc.ctx();
      if (outItems.some((i) => { const p = S.get('products', i.product_id); return p && i.unit_price != null && U.r2(i.unit_price) !== U.r2(p.price); })) svc.require('pos.price', 'Changing prices');
      const t = svc.tradeTotals(inItems, outItems);
      const inLines = [];
      for (const it of inItems) {
        const qty = U.int(it.qty || 1);
        if (it.serial && qty > 1) throw new Error(`${it.name}: serialised items must be quantity 1.`);
        const p = await svc.resolveProduct({ ...it, price: it.sell_price });
        inLines.push({ product_id: p.id, sku: p.sku, name: p.name, category: p.category, platform: p.platform, condition: it.condition || p.condition, serial: it.serial || p.serial || '', qty, unit_price: U.r2(it.unit_price), total: U.r2(it.unit_price * qty), sell_price: U.r2(it.sell_price || p.price), qc: it.qc || {} });
      }
      const outLines = buildOutLines(outItems, c).map((l) => ({ ...l, total: U.r2(l.unit_price * l.qty), net: U.r2(l.unit_price * l.qty), paid: U.r2(l.unit_price * l.qty) }));
      // the same serial can't go in and out in the same trade
      inLines.forEach((i) => { if (outLines.some((o) => o.product_id === i.product_id)) throw new Error(`${i.name} is both traded in and out.`); });
      const amount = Math.abs(t.balance);
      const pays = amount ? [{ method, amount }] : [];
      if (amount && !method) throw new Error('Choose a payment method for the balance.');
      svc.assertCashAllowed(pays, c);
      const cogs = U.sum(outLines, (l) => l.unit_cost * l.qty);
      const no = await svc.nextNo('TRD', c.at);
      const trade = await S.insert('trades', {
        no, ...c, shift_id: c.backdated ? null : svc.currentShift()?.id || null, ...svc.customerSnap(customer_id), seller_id_no,
        in_lines: inLines, out_lines: outLines, total_in: t.totalIn, total_out: t.totalOut, balance: t.balance, direction: t.direction,
        method: amount ? method : 'none', cogs, profit: U.r2(t.totalOut - cogs), note, status: 'completed',
      });
      for (const l of inLines) {
        await svc.receiveStock({ id: l.product_id }, l.qty, l.unit_price, { type: 'trade_in', id: trade.id, no }, c);
        if (l.sell_price) await S.update('products', l.product_id, { price: l.sell_price, condition: l.condition });
      }
      for (const l of outLines) await svc.moveStock({ id: l.product_id }, -l.qty, { type: 'trade_out', id: trade.id, no }, c);
      if (amount) await svc.postPayments(pays, t.direction === 'customer_pays' ? 1 : -1, 'trade', { type: 'trade', id: trade.id, no }, c);
      return trade;
    });
  };

  /* ================= Repairs ================= */
  svc.createRepair = async (d) => {
    svc.require('repairs', 'Repairs');
    if (!d.customer_id && !d._skipCustomerCheck) throw new Error('Select the customer.');
    if (!String(d.device || '').trim()) throw new Error('Device is required.');
    if (!String(d.issue || '').trim()) throw new Error('Describe the issue.');
    return S.tx(async () => {
      const c = svc.ctx();
      const deposit = U.r2(d.deposit || 0);
      const pays = deposit ? [{ method: d.deposit_method, amount: deposit }] : [];
      svc.assertCashAllowed(pays, c);
      const no = await svc.nextNo('RPR', c.at);
      const r = await S.insert('repairs', {
        no, ...c, ...svc.customerSnap(d.customer_id), device: d.device.trim(), serial: d.serial || '', issue: d.issue.trim(),
        accessories: d.accessories || [], condition_notes: d.condition_notes || '', estimate: U.r2(d.estimate || 0),
        deposit, deposit_method: deposit ? d.deposit_method : '', technician_id: d.technician_id || null, due_at: d.due_at || null,
        status: 'received', timeline: [{ at: c.at, status: 'received', note: 'Device received', by: c.staff_name }],
        parts: [], final_price: 0, outsource_cost: 0, other_cost: 0, is_warranty_claim: !!d.is_warranty_claim, source_ref: d.source_ref || null,
      });
      if (deposit) await svc.postPayments(pays, +1, 'repair_deposit', { type: 'repair', id: r.id, no }, c);
      return r;
    });
  };
  svc.setRepairStatus = async (id, status, note = '') => {
    svc.require('repairs', 'Repairs');
    const r = S.get('repairs', id);
    if (['collected', 'cancelled'].includes(r.status)) throw new Error('This ticket is closed.');
    if (['collected', 'cancelled'].includes(status)) throw new Error('Use Complete & Collect or Cancel.');
    return S.update('repairs', id, { status, timeline: [...r.timeline, { at: U.nowISO(), status, note, by: App.session.staff.name }] });
  };
  svc.addRepairNote = async (id, note) => {
    const r = S.get('repairs', id);
    if (!note.trim()) return;
    return S.update('repairs', id, { timeline: [...r.timeline, { at: U.nowISO(), status: r.status, note, by: App.session.staff.name }] });
  };
  svc.useRepairPart = async (id, productId, qty = 1) => {
    svc.require('repairs', 'Repairs');
    return S.tx(async () => {
      const c = svc.ctx();
      const r = S.get('repairs', id);
      if (['collected', 'cancelled'].includes(r.status)) throw new Error('This ticket is closed.');
      const p = S.get('products', productId);
      await svc.moveStock(p, -U.int(qty), { type: 'repair_part', id: r.id, no: r.no }, c);
      await S.update('repairs', id, { parts: [...r.parts, { product_id: p.id, sku: p.sku, name: p.name, qty: U.int(qty), unit_cost: U.num(p.cost) }] });
    });
  };
  svc.returnRepairPart = async (id, idx) => {
    return S.tx(async () => {
      const c = svc.ctx();
      const r = S.get('repairs', id);
      const part = r.parts[idx];
      await svc.moveStock({ id: part.product_id }, part.qty, { type: 'repair_part_return', id: r.id, no: r.no }, c);
      await S.update('repairs', id, { parts: r.parts.filter((_, i) => i !== idx) });
    });
  };
  svc.repairCost = (r, extra = {}) => {
    const parts = U.sum(r.parts || [], (p) => p.unit_cost * p.qty);
    const outsource = U.num(extra.outsource_cost ?? r.outsource_cost);
    const other = U.num(extra.other_cost ?? r.other_cost);
    return { parts, outsource, other, total: U.r2(parts + outsource + other) };
  };
  svc.completeRepair = async (id, { final_price, payments, outsource_cost = 0, other_cost = 0, warranty_days = null, note = '' }) => {
    svc.require('repairs', 'Repairs');
    return S.tx(async () => {
      const c = svc.ctx();
      const r = S.get('repairs', id);
      if (['collected', 'cancelled'].includes(r.status)) throw new Error('This ticket is already closed.');
      final_price = U.r2(final_price);
      if (final_price < r.deposit) throw new Error(`Final price can't be below the deposit (${U.money(r.deposit)}). Refund the difference via Cancel instead.`);
      const balance = U.r2(final_price - r.deposit);
      const pays = validatePayments(payments, balance);
      svc.assertCashAllowed(pays, c);
      const cost = svc.repairCost(r, { outsource_cost, other_cost });
      const wd = warranty_days == null || warranty_days === '' ? U.int(S.settings().warranty_repair_days) : U.int(warranty_days);
      await svc.postPayments(pays, +1, 'repair', { type: 'repair', id: r.id, no: r.no }, c);
      return S.update('repairs', id, {
        status: 'collected', final_price, balance_paid: balance, payments: pays, outsource_cost: U.r2(outsource_cost), other_cost: U.r2(other_cost),
        parts_cost: cost.parts, total_cost: cost.total, profit: U.r2(final_price - cost.total), warranty_days: wd,
        warranty_until: wd ? U.addDays(c.at, wd).toISOString() : null, collected_at: c.at, collected_by: c.staff_name,
        shift_id: c.backdated ? null : svc.currentShift()?.id || null,
        timeline: [...r.timeline, { at: c.at, status: 'collected', note: note || `Collected · ${U.money(final_price)}`, by: c.staff_name }],
      });
    });
  };
  svc.cancelRepair = async (id, { reason, refund_method = 'cash' }) => {
    if (!String(reason || '').trim()) throw new Error('A reason is required.');
    return S.tx(async () => {
      const c = svc.ctx();
      const r = S.get('repairs', id);
      if (['collected', 'cancelled'].includes(r.status)) throw new Error('This ticket is already closed.');
      for (const part of r.parts) await svc.moveStock({ id: part.product_id }, part.qty, { type: 'repair_part_return', id: r.id, no: r.no }, c);
      if (r.deposit) {
        const pays = [{ method: refund_method, amount: r.deposit }];
        svc.assertCashAllowed(pays, c);
        await svc.postPayments(pays, -1, 'repair_refund', { type: 'repair', id: r.id, no: r.no }, c);
      }
      return S.update('repairs', id, { status: 'cancelled', parts: [], cancel_reason: reason, deposit_refund_method: r.deposit ? refund_method : '', timeline: [...r.timeline, { at: c.at, status: 'cancelled', note: reason, by: c.staff_name }] });
    });
  };

  /* ================= After-sales ================= */
  svc.returnable = (sale, idx) => U.int(sale.lines[idx].qty) - U.int(sale.lines[idx].returned_qty);
  svc.lineUnitPaid = (line) => U.r2(U.num(line.paid ?? line.net ?? line.total) / U.int(line.qty));
  const markReturned = async (sale, returns) => {
    const lines = sale.lines.map((l, i) => {
      const r = returns.find((x) => x.line_idx === i);
      return r ? { ...l, returned_qty: U.int(l.returned_qty) + r.qty } : l;
    });
    await S.update('sales', sale.id, { lines });
  };
  const checkReturns = (sale, returns) => {
    if (!returns.length) throw new Error('Select at least one item.');
    returns.forEach((r) => {
      if (r.qty <= 0) throw new Error('Return quantity must be at least 1.');
      if (r.qty > svc.returnable(sale, r.line_idx)) throw new Error(`Only ${svc.returnable(sale, r.line_idx)} × ${sale.lines[r.line_idx].name} can still be returned.`);
    });
  };
  const outsideWindow = (sale) => (Date.now() - new Date(sale.at).getTime()) / 86400000 > U.int(S.settings().refund_window_days);

  svc.refund = async ({ sale_id, returns, method, reason }) => {
    svc.require('after_sales', 'Refunds');
    if (!String(reason || '').trim()) throw new Error('A reason is required.');
    return S.tx(async () => {
      const c = svc.ctx();
      const sale = S.get('sales', sale_id);
      if (sale.status !== 'completed') throw new Error('This sale was voided.');
      if (outsideWindow(sale)) svc.require('transactions.void', 'Refunds outside the refund window');
      checkReturns(sale, returns);
      const lines = returns.map((r) => {
        const l = sale.lines[r.line_idx];
        return { line_idx: r.line_idx, product_id: l.product_id, name: l.name, sku: l.sku, qty: r.qty, amount: U.r2(svc.lineUnitPaid(l) * r.qty), unit_cost: l.unit_cost, restock: !!r.restock };
      });
      const amount = U.sum(lines, (l) => l.amount);
      const pays = [{ method, amount }];
      svc.assertCashAllowed(pays, c);
      const taxShare = sale.total ? U.r2((amount / sale.total) * U.num(sale.tax)) : 0;
      const cogsBack = U.sum(lines.filter((l) => l.restock), (l) => l.unit_cost * l.qty);
      const no = await svc.nextNo('RFD', c.at);
      const doc = await S.insert('after_sales', {
        no, kind: 'refund', ...c, shift_id: c.backdated ? null : svc.currentShift()?.id || null, sale_id, sale_no: sale.no, ...svc.customerSnap(sale.customer_id),
        return_lines: lines, refund_amount: amount, method, reason,
        revenue_effect: -U.r2(amount - taxShare), cogs_effect: -cogsBack, profit_effect: -U.r2(amount - taxShare - cogsBack), status: 'completed',
      });
      await markReturned(sale, returns);
      for (const l of lines) if (l.restock) await svc.receiveStock({ id: l.product_id }, l.qty, l.unit_cost, { type: 'refund', id: doc.id, no }, c);
      await svc.postPayments(pays, -1, 'refund', { type: 'after_sales', id: doc.id, no }, c);
      if (sale.points_earned && sale.customer_id) {
        const cu = S.get('customers', sale.customer_id);
        const back = Math.round(sale.points_earned * (amount / sale.total));
        if (cu) await S.update('customers', cu.id, { points: Math.max(0, U.int(cu.points) - back) });
      }
      return doc;
    });
  };

  svc.exchange = async ({ sale_id, returns, newItems, method, reason }) => {
    svc.require('after_sales', 'Exchanges');
    if (!newItems?.length) throw new Error('Pick the replacement item(s).');
    return S.tx(async () => {
      const c = svc.ctx();
      const sale = S.get('sales', sale_id);
      if (sale.status !== 'completed') throw new Error('This sale was voided.');
      if (outsideWindow(sale)) svc.require('transactions.void', 'Exchanges outside the refund window');
      checkReturns(sale, returns);
      const back = returns.map((r) => {
        const l = sale.lines[r.line_idx];
        return { line_idx: r.line_idx, product_id: l.product_id, name: l.name, sku: l.sku, qty: r.qty, amount: U.r2(svc.lineUnitPaid(l) * r.qty), unit_cost: l.unit_cost, restock: !!r.restock };
      });
      const credit = U.sum(back, (l) => l.amount);
      const out = buildOutLines(newItems, c).map((l) => ({ ...l, total: U.r2(l.unit_price * l.qty), net: U.r2(l.unit_price * l.qty), paid: U.r2(l.unit_price * l.qty) }));
      const newTotal = U.sum(out, (l) => l.total);
      const diff = U.r2(newTotal - credit);
      const pays = diff ? [{ method, amount: Math.abs(diff) }] : [];
      if (diff && !method) throw new Error('Choose a payment method for the difference.');
      svc.assertCashAllowed(pays, c);
      const cogsOut = U.sum(out, (l) => l.unit_cost * l.qty);
      const cogsBack = U.sum(back.filter((l) => l.restock), (l) => l.unit_cost * l.qty);
      const no = await svc.nextNo('EXC', c.at);
      const doc = await S.insert('after_sales', {
        no, kind: 'exchange', ...c, shift_id: c.backdated ? null : svc.currentShift()?.id || null, sale_id, sale_no: sale.no, ...svc.customerSnap(sale.customer_id),
        return_lines: back, new_lines: out, credit, new_total: newTotal, difference: diff, method: diff ? method : 'none', reason: reason || 'Exchange',
        revenue_effect: diff, cogs_effect: U.r2(cogsOut - cogsBack), profit_effect: U.r2(diff - (cogsOut - cogsBack)), status: 'completed',
      });
      await markReturned(sale, returns);
      for (const l of back) if (l.restock) await svc.receiveStock({ id: l.product_id }, l.qty, l.unit_cost, { type: 'exchange_in', id: doc.id, no }, c);
      for (const l of out) await svc.moveStock({ id: l.product_id }, -l.qty, { type: 'exchange_out', id: doc.id, no }, c);
      if (diff) await svc.postPayments(pays, diff > 0 ? 1 : -1, 'exchange', { type: 'after_sales', id: doc.id, no }, c);
      return doc;
    });
  };

  svc.warrantyClaim = async ({ sale_id, line_idx, issue, resolution, replacement_id = null }) => {
    svc.require('after_sales', 'Warranty claims');
    if (!String(issue || '').trim()) throw new Error('Describe the fault.');
    return S.tx(async () => {
      const c = svc.ctx();
      const sale = S.get('sales', sale_id);
      const l = sale.lines[line_idx];
      if (!l.warranty_until || new Date(l.warranty_until) < new Date()) svc.require('transactions.void', 'Claims on expired warranty');
      if (svc.returnable(sale, line_idx) <= 0) throw new Error('This item was already returned.');
      const no = await svc.nextNo('WAR', c.at);
      const base = { no, kind: 'warranty', ...c, sale_id, sale_no: sale.no, ...svc.customerSnap(sale.customer_id), line_idx, product_name: l.name, serial: l.serial, issue, resolution, warranty_until: l.warranty_until, status: 'completed', revenue_effect: 0 };
      if (resolution === 'repair') {
        const doc = await S.insert('after_sales', { ...base, cogs_effect: 0, profit_effect: 0 });
        const rep = await svc.createRepair({ customer_id: sale.customer_id || null, device: `${l.name}${l.platform ? ' · ' + l.platform : ''}`, serial: l.serial, issue: `[WARRANTY ${sale.no}] ${issue}`, estimate: 0, is_warranty_claim: true, source_ref: no, _skipCustomerCheck: true });
        await S.update('after_sales', doc.id, { repair_id: rep.id, repair_no: rep.no });
        return { ...doc, repair_no: rep.no };
      }
      // replace with another unit (default same SKU) at zero charge
      const rp = S.get('products', replacement_id || l.product_id);
      if (!rp) throw new Error('Choose a replacement product.');
      const doc = await S.insert('after_sales', { ...base, replacement: { product_id: rp.id, name: rp.name, sku: rp.sku, unit_cost: rp.cost }, cogs_effect: U.num(rp.cost), profit_effect: -U.num(rp.cost) });
      await svc.moveStock(rp, -1, { type: 'warranty_replace', id: doc.id, no, reason: `Warranty replacement for ${sale.no}` }, c);
      await markReturned(sale, [{ line_idx, qty: 1 }]);
      return doc;
    });
  };

  /* ================= Voids (audit fixes #1–#3) ================= */
  svc.voidTransaction = async (kind, id, reason) => {
    svc.require('transactions.void', 'Voiding');
    if (!String(reason || '').trim()) throw new Error('A void reason is required.');
    return S.tx(async () => {
      const c = { ...svc.ctx(), at: U.nowISO(), backdated: false }; // reversal posts NOW, into the current shift
      const table = { sale: 'sales', buy: 'buys', trade: 'trades' }[kind];
      const x = S.get(table, id);
      if (!x || x.status !== 'completed') throw new Error('Transaction already voided.');
      const ref = { type: `${kind}_void`, id, no: x.no, reason };
      if (kind === 'sale') {
        if (S.all('after_sales').some((a) => a.sale_id === id)) throw new Error('This sale has refunds/exchanges/claims. Reverse it through After-Sales instead of voiding.');
        svc.assertCashAllowed(x.payments, c);
        for (const l of x.lines) await svc.receiveStock({ id: l.product_id }, l.qty, l.unit_cost, ref, c);
        await svc.postPayments(x.payments, -1, 'void', ref, c);
        if (x.points_earned && x.customer_id) { const cu = S.get('customers', x.customer_id); if (cu) await S.update('customers', cu.id, { points: Math.max(0, U.int(cu.points) - x.points_earned) }); }
      } else if (kind === 'buy') {
        svc.assertCashAllowed([{ method: x.method, amount: x.total }], c);
        for (const l of x.lines) await reverseStockIn(l, ref, c);
        await svc.postPayments([{ method: x.method, amount: x.total }], +1, 'void', ref, c);
      } else if (kind === 'trade') {
        const amt = Math.abs(x.balance);
        if (amt) svc.assertCashAllowed([{ method: x.method, amount: amt }], c);
        for (const l of x.in_lines) await reverseStockIn(l, ref, c);
        for (const l of x.out_lines) await svc.receiveStock({ id: l.product_id }, l.qty, l.unit_cost, ref, c);
        if (amt) await svc.postPayments([{ method: x.method, amount: amt }], x.direction === 'customer_pays' ? -1 : 1, 'void', ref, c);
      }
      await S.update(table, id, { status: 'void', void_reason: reason, voided_at: c.at, voided_by: c.staff_name });
      await svc.audit(`${kind}.void`, `${x.no}: ${reason}`, { ref_id: id });
    });
  };
  /* Removing stock that came in: fails loudly if it was already sold (no silent clamp to 0). */
  async function reverseStockIn(line, ref, c) {
    const p = S.get('products', line.product_id);
    if (!p || p.stock < line.qty) throw new Error(`${line.name} has already been sold or moved (stock ${p?.stock ?? 0}). Void the later sale first or use a stock adjustment.`);
    const remaining = p.stock - line.qty;
    const cost = remaining > 0 ? Math.max(0, U.r2((p.stock * p.cost - line.qty * line.unit_price) / remaining)) : p.cost;
    await S.update('products', p.id, { cost });
    await svc.moveStock(p, -line.qty, ref, c);
  }

  /* ================= Suppliers & purchase orders ================= */
  svc.saveSupplier = async (d) => {
    if (!String(d.name || '').trim()) throw new Error('Supplier name is required.');
    const row = { phone: '', email: '', contact: '', address: '', notes: '', ...d, name: d.name.trim() };
    return d.id ? S.update('suppliers', d.id, row) : S.insert('suppliers', row);
  };
  svc.poTotals = (lines, shipping = 0, discount = 0) => {
    const subtotal = U.sum(lines, (l) => U.num(l.unit_cost) * U.int(l.qty));
    const total = U.r2(Math.max(0, subtotal + U.num(shipping) - U.num(discount)));
    return { subtotal, total, landedFactor: subtotal ? total / subtotal : 1 };
  };
  svc.createPO = async (d) => {
    svc.require('purchases', 'Purchasing');
    const sup = S.get('suppliers', d.supplier_id);
    if (!sup) throw new Error('Choose a supplier.');
    const lines = (d.lines || []).filter((l) => l.product_id || String(l.name || '').trim());
    if (!lines.length) throw new Error('Add at least one product.');
    lines.forEach((l) => { if (U.int(l.qty) <= 0) throw new Error('Quantities must be at least 1.'); });
    return S.tx(async () => {
      const c = svc.ctx();
      const t = svc.poTotals(lines, d.shipping, d.discount);
      const paid = U.r2(d.paid || 0);
      if (paid > t.total) throw new Error('Amount paid exceeds the PO total.');
      const pays = paid ? [{ method: d.pay_method, amount: paid }] : [];
      svc.assertCashAllowed(pays, c);
      const no = await svc.nextNo('PO', c.at);
      const po = await S.insert('purchase_orders', {
        no, ...c, supplier_id: sup.id, supplier_name: sup.name, invoice_no: d.invoice_no || '', expected_at: d.expected_at || null, notes: d.notes || '',
        lines: lines.map((l) => ({ product_id: l.product_id || null, name: l.name, category: l.category, platform: l.platform || '', condition: l.condition || 'New', qty: U.int(l.qty), received_qty: 0, unit_cost: U.r2(l.unit_cost), sell_price: U.r2(l.sell_price) })),
        shipping: U.r2(d.shipping), discount: U.r2(d.discount), subtotal: t.subtotal, total: t.total,
        payments: pays.map((p) => ({ ...p, at: c.at })), paid, status: 'ordered', receipts: [],
      });
      await svc.postPayments(pays, -1, 'purchase', { type: 'po', id: po.id, no }, c);
      return po;
    });
  };
  svc.receivePO = async (id, receive, note = '') => {
    svc.require('purchases', 'Receiving stock');
    return S.tx(async () => {
      const c = svc.ctx();
      const po = S.get('purchase_orders', id);
      if (['received', 'cancelled'].includes(po.status)) throw new Error('This PO is closed.');
      const rows = receive.filter((r) => U.int(r.qty) > 0);
      if (!rows.length) throw new Error('Enter quantities received.');
      const factor = svc.poTotals(po.lines, po.shipping, po.discount).landedFactor;
      const grn = await svc.nextNo('GRN', c.at);
      const lines = U.clone(po.lines);
      for (const r of rows) {
        const l = lines[r.idx];
        const qty = U.int(r.qty);
        if (qty > l.qty - l.received_qty) throw new Error(`${l.name}: receiving more than ordered.`);
        const p = await svc.resolveProduct({ product_id: l.product_id, name: l.name, category: l.category, platform: l.platform, condition: l.condition, price: l.sell_price });
        l.product_id = p.id;
        l.received_qty += qty;
        await svc.receiveStock(p, qty, U.r2(l.unit_cost * factor), { type: 'purchase', id: po.id, no: grn }, c);
        if (l.sell_price) await S.update('products', p.id, { price: l.sell_price });
      }
      const done = lines.every((l) => l.received_qty >= l.qty);
      return S.update('purchase_orders', id, { lines, status: done ? 'received' : 'partial', receipts: [...po.receipts, { no: grn, at: c.at, by: c.staff_name, note, lines: rows.map((r) => ({ idx: r.idx, qty: U.int(r.qty) })) }] });
    });
  };
  svc.payPO = async (id, amount, method) => {
    svc.require('purchases', 'Supplier payments');
    return S.tx(async () => {
      const c = svc.ctx();
      const po = S.get('purchase_orders', id);
      amount = U.r2(amount);
      if (amount <= 0) throw new Error('Enter an amount.');
      if (amount > U.r2(po.total - po.paid)) throw new Error('Payment exceeds the balance due.');
      svc.assertCashAllowed([{ method, amount }], c);
      await svc.postPayments([{ method, amount }], -1, 'purchase', { type: 'po', id, no: po.no }, c);
      return S.update('purchase_orders', id, { paid: U.r2(po.paid + amount), payments: [...po.payments, { at: c.at, method, amount }] });
    });
  };
  svc.cancelPO = async (id, reason) => {
    const po = S.get('purchase_orders', id);
    if (po.receipts.length) throw new Error('Stock has already been received on this PO.');
    if (po.paid > 0) throw new Error('This PO has payments. Record a supplier refund first.');
    return S.update('purchase_orders', id, { status: 'cancelled', cancel_reason: reason });
  };

  /* ================= Consignment ================= */
  svc.receiveConsignment = async ({ supplier_id, reference = '', terms = '', expiry = null, items, note = '' }) => {
    svc.require('consignment', 'Consignment');
    const sup = S.get('suppliers', supplier_id);
    if (!sup) throw new Error('Choose the consignor / supplier.');
    if (!items?.length) throw new Error('Add at least one item.');
    return S.tx(async () => {
      const c = svc.ctx();
      const no = await svc.nextNo('CSG', c.at);
      const lines = [];
      for (const it of items) {
        if (it.serial && U.int(it.qty) > 1) throw new Error(`${it.name}: serialised items must be quantity 1.`);
        if (U.num(it.consignment_cost) <= 0) throw new Error(`${it.name}: enter the amount owed to the consignor per unit.`);
        if (U.num(it.price) < U.num(it.consignment_cost)) throw new Error(`${it.name}: selling price is below the consignor price.`);
        const p = await svc.resolveProduct({ ...it, product_id: null }, { ownership: 'consignment', supplier_id });
        await S.update('products', p.id, { consignment_cost: U.r2(it.consignment_cost), cost: U.r2(it.consignment_cost), price: U.r2(it.price) });
        await svc.moveStock(p, U.int(it.qty), { type: 'consignment_in', no }, c);
        lines.push({ product_id: p.id, sku: p.sku, name: p.name, qty: U.int(it.qty), consignment_cost: U.r2(it.consignment_cost), price: U.r2(it.price) });
      }
      return S.insert('consignments', { no, ...c, supplier_id, supplier_name: sup.name, reference, terms, expiry, note, lines, total_value: U.sum(lines, (l) => l.consignment_cost * l.qty) });
    });
  };
  svc.returnConsignment = async (productId, qty, note = '') => {
    svc.require('consignment', 'Consignment');
    return S.tx(async () => {
      const c = svc.ctx();
      const no = await svc.nextNo('CSR', c.at);
      await svc.moveStock({ id: productId }, -U.int(qty), { type: 'consignment_return', no, reason: note || 'Returned to consignor' }, c);
    });
  };
  /* Payable is derived from actual sales (minus returns) — never stored, so it can't drift. */
  svc.consignmentLedger = () => {
    const sups = {};
    const add = (sid) => (sups[sid] = sups[sid] || { supplier_id: sid, sold_units: 0, due: 0, paid: 0, sales: 0 });
    const lineHit = (l, qty) => { if (l.ownership !== 'consignment' || !l.supplier_id || qty <= 0) return; const r = add(l.supplier_id); r.sold_units += qty; r.due = U.r2(r.due + l.unit_cost * qty); r.sales = U.r2(r.sales + U.num(l.unit_price) * qty); };
    S.filter('sales', (s) => s.status === 'completed').forEach((s) => s.lines.forEach((l) => lineHit(l, l.qty - U.int(l.returned_qty))));
    S.filter('trades', (s) => s.status === 'completed').forEach((t) => t.out_lines.forEach((l) => lineHit(l, l.qty)));
    S.all('after_sales').forEach((a) => (a.new_lines || []).forEach((l) => lineHit(l, l.qty)));
    S.all('consignment_settlements').forEach((x) => { const r = add(x.supplier_id); r.paid = U.r2(r.paid + x.amount); });
    Object.values(sups).forEach((r) => { r.outstanding = U.r2(r.due - r.paid); r.name = S.get('suppliers', r.supplier_id)?.name || 'Unknown'; });
    return Object.values(sups);
  };
  svc.settleConsignment = async ({ supplier_id, amount, method, note = '' }) => {
    svc.require('consignment', 'Consignment settlements');
    const row = svc.consignmentLedger().find((r) => r.supplier_id === supplier_id);
    amount = U.r2(amount);
    if (amount <= 0) throw new Error('Enter an amount.');
    if (!row || amount > row.outstanding) throw new Error(`Amount exceeds the outstanding payable (${U.money(row?.outstanding || 0)}).`);
    return S.tx(async () => {
      const c = svc.ctx();
      svc.assertCashAllowed([{ method, amount }], c);
      const no = await svc.nextNo('CST', c.at);
      const x = await S.insert('consignment_settlements', { no, ...c, supplier_id, supplier_name: row.name, amount, method, note });
      await svc.postPayments([{ method, amount }], -1, 'consignment', { type: 'consignment', id: x.id, no }, c);
      return x;
    });
  };

  /* ================= Stock take ================= */
  svc.activeStockTake = () => S.find('stock_takes', (s) => s.status === 'draft');
  svc.startStockTake = async ({ category = '', note = '' }) => {
    svc.require('stock_take', 'Stock take');
    if (svc.activeStockTake()) throw new Error('A stock take is already in progress.');
    const products = S.filter('products', (p) => p.active !== false && (!category || p.category === category));
    if (!products.length) throw new Error('No products in this scope.');
    return S.tx(async () => {
      const at = U.nowISO();
      return S.insert('stock_takes', {
        no: await svc.nextNo('STK', at), status: 'draft', started_at: at, started_by: App.session.staff.name, category, note,
        lines: products.map((p) => ({ product_id: p.id, sku: p.sku, barcode: p.barcode || '', serial: p.serial || '', name: p.name, category: p.category, system_qty: p.stock, counted: null, reason: '' })),
      });
    });
  };
  svc.saveStockTakeLines = (id, lines) => S.update('stock_takes', id, { lines });
  svc.finalizeStockTake = async (id, { zeroUncounted = false, note = '' } = {}) => {
    svc.require('stock_take', 'Stock take');
    return S.tx(async () => {
      const c = { ...svc.ctx(), at: U.nowISO(), backdated: false };
      const st = S.get('stock_takes', id);
      const lines = st.lines.map((l) => ({ ...l, counted: l.counted == null && zeroUncounted ? 0 : l.counted }));
      const counted = lines.filter((l) => l.counted != null);
      if (!counted.length) throw new Error('Nothing counted yet.');
      const adjNo = await svc.nextNo('ADJ', c.at);
      let adjusted = 0;
      for (const l of counted) {
        // variance vs. the snapshot; sales made during the count are preserved
        const delta = U.int(l.counted) - U.int(l.system_qty);
        l.variance = delta;
        if (!delta) continue;
        const p = S.get('products', l.product_id);
        if (!p) continue;
        const applied = Math.max(delta, -p.stock);
        await svc.moveStock(p, applied, { type: 'stock_take', id: st.id, no: adjNo, reason: l.reason || `Stock take ${st.no}` }, c);
        adjusted++;
      }
      const valueVar = U.sum(counted, (l) => (l.variance || 0) * U.num(S.get('products', l.product_id)?.cost));
      await svc.audit('stock_take.finalize', `${st.no}: ${adjusted} SKU adjusted · value ${U.money(valueVar, { sign: true })}`, { ref_id: id });
      return S.update('stock_takes', id, { status: 'finalized', lines, finalized_at: c.at, finalized_by: c.staff_name, adj_no: adjNo, adjusted, value_variance: valueVar, final_note: note });
    });
  };
  svc.discardStockTake = (id) => S.update('stock_takes', id, { status: 'discarded' });

  /* ================= Reporting helpers ================= */
  svc.inRange = (iso, from, to) => { const t = new Date(iso).getTime(); return t >= from.getTime() && t <= to.getTime(); };
  svc.periodRange = (key, custom = {}) => {
    const now = new Date();
    const d0 = U.startOfDay(now);
    switch (key) {
      case 'today': return [d0, U.endOfDay(now)];
      case 'yesterday': { const y = U.addDays(d0, -1); return [y, U.endOfDay(y)]; }
      case '7d': return [U.addDays(d0, -6), U.endOfDay(now)];
      case '30d': return [U.addDays(d0, -29), U.endOfDay(now)];
      case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1), U.endOfDay(now)];
      case 'last_month': return [new Date(now.getFullYear(), now.getMonth() - 1, 1), U.endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))];
      case 'year': return [new Date(now.getFullYear(), 0, 1), U.endOfDay(now)];
      case 'custom': return [U.startOfDay(custom.from || now), U.endOfDay(custom.to || now)];
      default: return [new Date(0), U.endOfDay(now)];
    }
  };
  /* One consistent P&L definition used by Dashboard and Reports. */
  svc.metrics = (from, to) => {
    const inR = (x) => svc.inRange(x.at, from, to);
    const sales = S.filter('sales', (s) => s.status === 'completed' && inR(s));
    const trades = S.filter('trades', (s) => s.status === 'completed' && inR(s));
    const buys = S.filter('buys', (s) => s.status === 'completed' && inR(s));
    const repairs = S.filter('repairs', (r) => r.status === 'collected' && svc.inRange(r.collected_at, from, to));
    const after = S.filter('after_sales', inR);
    const salesRev = U.sum(sales, (s) => s.revenue);
    const salesProfit = U.sum(sales, (s) => s.profit);
    const tradeRev = U.sum(trades, (t) => t.total_out);
    const tradeProfit = U.sum(trades, (t) => t.profit);
    const repairRev = U.sum(repairs, (r) => r.final_price);
    const repairProfit = U.sum(repairs, (r) => r.profit);
    const afterRev = U.sum(after, (a) => a.revenue_effect);
    const afterProfit = U.sum(after, (a) => a.profit_effect);
    const revenue = U.r2(salesRev + tradeRev + repairRev + afterRev);
    const profit = U.r2(salesProfit + tradeProfit + repairProfit + afterProfit);
    return {
      sales, trades, buys, repairs, after,
      salesRev, salesProfit, tradeRev, tradeProfit, repairRev, repairProfit, afterRev, afterProfit, revenue, profit,
      margin: revenue ? (profit / revenue) * 100 : 0,
      buyIn: U.sum(buys, (b) => b.total) + U.sum(trades, (t) => t.total_in),
      txCount: sales.length + trades.length + repairs.length,
      avgBasket: sales.length ? salesRev / sales.length : 0,
      refunds: U.sum(after.filter((a) => a.kind === 'refund'), (a) => a.refund_amount),
    };
  };
  svc.inventoryValue = () => {
    const ps = S.filter('products', (p) => p.active !== false && p.stock > 0);
    const owned = ps.filter((p) => p.ownership !== 'consignment');
    const cons = ps.filter((p) => p.ownership === 'consignment');
    return {
      ownedCost: U.sum(owned, (p) => p.stock * p.cost), ownedRetail: U.sum(owned, (p) => p.stock * p.price),
      consCost: U.sum(cons, (p) => p.stock * p.cost), consRetail: U.sum(cons, (p) => p.stock * p.price),
      units: ps.reduce((a, p) => a + p.stock, 0), skus: ps.length, consUnits: cons.reduce((a, p) => a + p.stock, 0),
    };
  };
})();
