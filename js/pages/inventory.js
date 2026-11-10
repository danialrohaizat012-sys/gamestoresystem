/* Inventory — products, stock ledger, adjustments */
(function () {
  const App = window.App, U = App.utils, S = App.store, svc = App.svc, UI = App.ui;
  const { esc } = U;
  const I = (n) => App.icon(n);
  const f = { q: '', cat: '', plat: '', cond: '', own: '', stock: '', sort: 'name', archived: false };

  App.page('inventory', {
    title: 'Inventory', sub: 'Every unit, every movement — fully traceable',
    render(el) {
      const s = S.settings();
      const cost = svc.can('inventory.cost');
      const edit = svc.can('inventory.edit');
      const inv = svc.inventoryValue();
      const lowCount = S.filter('products', (p) => p.active !== false && svc.isLow(p) && p.ownership !== 'consignment').length;
      el.innerHTML = `
        <div class="stats small">
          ${UI.stat('SKUs in stock', inv.skus, { hint: `${inv.units} units total` })}
          ${cost ? UI.stat('Owned stock at cost', U.money(inv.ownedCost), { hint: `Retail ${U.money(inv.ownedRetail)}` }) : ''}
          ${UI.stat('Low / out of stock', lowCount, { tone: lowCount ? 'warning' : '', hint: 'Below alert level' })}
          ${UI.stat('Consignment units', inv.consUnits, { hint: 'Owned by consignors' })}
        </div>
        <section class="card">
          <div class="toolbar wrap">
            <div class="input-icon grow">${I('search')}<input id="ivQ" type="search" placeholder="Search name, SKU, serial, barcode…" value="${esc(f.q)}"></div>
            <select data-f="cat">${UI.options(s.categories, f.cat, 'All categories')}</select>
            <select data-f="plat">${UI.options(s.platforms, f.plat, 'All platforms')}</select>
            <select data-f="cond">${UI.options(['New', 'Used', 'Refurbished'], f.cond, 'Any condition')}</select>
            <select data-f="stock">${UI.options([['in', 'In stock'], ['low', 'Low / out'], ['out', 'Out of stock']], f.stock, 'Any stock')}</select>
            <select data-f="own">${UI.options([['owned', 'Owned'], ['consignment', 'Consignment']], f.own, 'Any ownership')}</select>
            <select data-f="sort">${UI.options([['name', 'Sort: Name'], ['stock', 'Sort: Stock ↑'], ['recent', 'Sort: Recently added'], ...(cost ? [['value', 'Sort: Stock value ↓'], ['margin', 'Sort: Margin ↓']] : [])], f.sort)}</select>
            <label class="chip-check"><input type="checkbox" id="ivArch" ${f.archived ? 'checked' : ''}><span>Archived</span></label>
            <button class="btn ghost" id="ivExport">${I('download')} CSV</button>
            ${edit ? `<button class="btn primary" id="ivAdd">${I('plus')} Add product</button>` : ''}
          </div>
          <div id="ivTable"></div>
        </section>`;
      const drawTable = () => {
        let rows = S.filter('products', (p) => (f.archived ? p.active === false : p.active !== false)
          && (!f.cat || p.category === f.cat) && (!f.plat || p.platform === f.plat) && (!f.cond || p.condition === f.cond)
          && (!f.own || (p.ownership || 'owned') === f.own)
          && (!f.stock || (f.stock === 'in' ? p.stock > 0 : f.stock === 'out' ? p.stock <= 0 : svc.isLow(p)))
          && U.match(f.q, p.name, p.sku, p.serial, p.barcode, p.platform));
        const sorters = { name: (a, b) => a.name.localeCompare(b.name), stock: (a, b) => a.stock - b.stock, recent: (a, b) => b.created_at.localeCompare(a.created_at), value: (a, b) => b.stock * b.cost - a.stock * a.cost, margin: (a, b) => (b.price - b.cost) / (b.price || 1) - (a.price - a.cost) / (a.price || 1) };
        rows.sort(sorters[f.sort] || sorters.name);
        el.querySelector('#ivTable').innerHTML = UI.table(['Product', 'Platform', 'Condition', cost ? '>Cost' : '', '>Price', cost ? '>Margin' : '', '>Stock', ''],
          rows.slice(0, 300).map((p) => `<tr class="${App.inventoryFocus === p.id ? 'flash' : ''}" data-pid="${p.id}">
            <td><div class="prod-cell">${UI.productThumb(p)}<div><strong>${esc(p.name)}</strong><span class="muted small">${esc(p.sku)}${p.serial ? ' · SN ' + esc(p.serial) : ''}${p.barcode ? ' · ' + esc(p.barcode) : ''} · ${esc(p.category)}</span></div></div></td>
            <td>${esc(p.platform || '—')}</td>
            <td>${UI.conditionBadge(p.condition)}${p.ownership === 'consignment' ? ' ' + UI.badge('Consignment', 'info') : ''}</td>
            <td class="num">${cost ? U.money(p.cost) : ''}</td><td class="num"><strong>${U.money(p.price)}</strong></td>
            <td class="num">${cost ? `<span class="${p.price - p.cost < 0 ? 'danger' : ''}">${p.price ? U.pct(((p.price - p.cost) / p.price) * 100) : '—'}</span>` : ''}</td>
            <td class="num">${UI.stockBadge(p)}</td>
            <td class="actions"><button class="icon-btn" data-hist="${p.id}" title="Stock history">${I('history')}</button>${svc.can('inventory.adjust') ? `<button class="icon-btn" data-adj="${p.id}" title="Adjust stock">${I('package')}</button>` : ''}${edit ? `<button class="icon-btn" data-edit="${p.id}" title="Edit">${I('edit')}</button>` : ''}</td>
          </tr>`), UI.empty('No products match these filters', '', 'box'));
        if (App.inventoryFocus) { el.querySelector('.flash')?.scrollIntoView({ block: 'center' }); App.inventoryFocus = null; }
      };
      drawTable();
      el.querySelector('#ivQ').oninput = U.debounce((e) => { f.q = e.target.value; drawTable(); }, 120);
      el.querySelectorAll('[data-f]').forEach((x) => (x.onchange = () => { f[x.dataset.f] = x.value; drawTable(); }));
      el.querySelector('#ivArch').onchange = (e) => { f.archived = e.target.checked; drawTable(); };
      el.querySelector('#ivAdd')?.addEventListener('click', () => productForm());
      el.querySelector('#ivExport').onclick = () => U.download(`inventory-${U.dateKey()}.csv`, U.toCSV(S.filter('products', (p) => p.active !== false).map((p) => ({ sku: p.sku, barcode: p.barcode, name: p.name, category: p.category, platform: p.platform, condition: p.condition, serial: p.serial, ownership: p.ownership, stock: p.stock, ...(cost ? { cost: p.cost } : {}), price: p.price }))), 'text/csv');
      el.querySelector('#ivTable').onclick = (e) => {
        const h = e.target.closest('[data-hist]'), a = e.target.closest('[data-adj]'), ed = e.target.closest('[data-edit]');
        if (h) history(h.dataset.hist); else if (a) adjust(a.dataset.adj); else if (ed) productForm(S.get('products', ed.dataset.edit));
      };
    },
  });

  function productForm(p = null) {
    const s = S.settings();
    const owner = svc.isOwner();
    const m = UI.modal({
      title: p ? 'Edit product' : 'Add product', sub: p ? `${esc(p.sku)} · stock changes are logged to the stock ledger` : 'SKU is generated automatically from the category', size: 'lg',
      body: `<form id="pf" class="form-grid cols-3">
        <label class="field span-2"><span>Product name *</span><input name="name" required value="${esc(p?.name || '')}" placeholder="e.g. PlayStation 5 Slim Disc 1TB"></label>
        <label class="field"><span>SKU</span><input name="sku" value="${esc(p?.sku || '')}" ${owner ? '' : 'readonly'} placeholder="${p ? '' : 'Auto'}"></label>
        <label class="field"><span>Category</span><select name="category">${UI.options(s.categories, p?.category || s.categories[0])}</select></label>
        <label class="field"><span>Platform</span><select name="platform">${UI.options(s.platforms, p?.platform || '', '—')}</select></label>
        <label class="field"><span>Condition</span><select name="condition">${UI.options(['New', 'Used', 'Refurbished'], p?.condition || 'New')}</select></label>
        <label class="field"><span>Cost price</span><input name="cost" type="number" min="0" step=".01" value="${p?.cost ?? ''}" ${p && p.stock > 0 && !owner ? 'readonly' : ''}></label>
        <label class="field"><span>Selling price *</span><input name="price" type="number" min="0" step=".01" value="${p?.price ?? ''}" required></label>
        <label class="field"><span>${p ? 'Stock (change = adjustment)' : 'Opening stock'}</span><input name="stock" type="number" min="0" step="1" value="${p?.stock ?? 0}"></label>
        <label class="field"><span>Serial no.</span><input name="serial" value="${esc(p?.serial || '')}" placeholder="For unique units"></label>
        <label class="field"><span>Barcode / UPC</span><input name="barcode" value="${esc(p?.barcode || '')}"></label>
        <label class="field"><span>Low-stock alert at</span><input name="low_stock" type="number" min="0" step="1" value="${p?.low_stock ?? 1}"></label>
        <label class="field"><span>Warranty days <small class="muted">(blank = default)</small></span><input name="warranty_days" type="number" min="0" step="1" value="${p?.warranty_days ?? ''}" placeholder="${p?.condition === 'Used' ? s.warranty_used_days : s.warranty_new_days}"></label>
        <label class="field span-2"><span>Notes</span><input name="notes" value="${esc(p?.notes || '')}"></label>
        <label class="field span-3 hidden" id="pfReason"><span>Reason for stock change *</span><input name="adjust_reason" placeholder="e.g. Found extra unit in storeroom"></label>
      </form>
      <div class="kv boxed" id="pfMargin"></div>`,
      footer: `${p ? `<button class="btn ghost danger-text" id="pfDel">${p.active === false ? 'Restore' : 'Archive / delete'}</button>` : ''}<span class="grow"></span><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="pfSave">Save product</button>`,
    });
    const form = m.el.querySelector('#pf');
    const upd = () => {
      const d = Object.fromEntries(new FormData(form));
      const mg = U.num(d.price) - U.num(d.cost);
      m.el.querySelector('#pfMargin').innerHTML = `<div><span>Margin / unit</span><strong class="${mg < 0 ? 'danger' : 'success'}">${U.money(mg)} · ${U.num(d.price) ? U.pct((mg / U.num(d.price)) * 100) : '—'}</strong></div>`;
      if (p) m.el.querySelector('#pfReason').classList.toggle('hidden', U.int(d.stock) === U.int(p.stock));
      if (d.serial) form.stock.max = 1;
    };
    form.oninput = upd; upd();
    m.el.querySelector('#pfSave').onclick = async () => {
      const d = Object.fromEntries(new FormData(form));
      if (p && U.int(d.stock) !== U.int(p.stock) && !d.adjust_reason.trim()) return U.toast('Give a reason for the stock change', 'danger');
      try { await svc.saveProduct({ ...(p ? { id: p.id } : {}), ...d, sku: d.sku || (p ? p.sku : ''), cost: U.num(d.cost), price: U.num(d.price) }); m.close(); App.rerender(); U.toast('Product saved', 'success'); }
      catch (e) { U.toast(e.message, 'danger'); }
    };
    m.el.querySelector('#pfDel')?.addEventListener('click', async () => {
      if (p.active === false) { await S.update('products', p.id, { active: true }); m.close(); App.rerender(); return; }
      if (!(await UI.confirm({ title: 'Remove product?', message: 'Products with sales or stock history are archived (hidden, history kept). Unused products are deleted.', confirmText: 'Remove', danger: true }))) return;
      try { const r = await svc.deleteProduct(p.id); m.close(); App.rerender(); U.toast(r === 'archived' ? 'Archived — history preserved' : 'Deleted'); } catch (e) { U.toast(e.message, 'danger'); }
    });
  }
  App.productForm = productForm;

  async function adjust(id) {
    const p = S.get('products', id);
    const m = UI.modal({
      title: 'Adjust stock', sub: `${esc(p.name)} · currently ${p.stock}`, size: 'sm',
      body: `<div class="seg block" id="adDir"><button class="active" data-d="-1">Remove</button><button data-d="1">Add</button></div>
        <label class="field"><span>Quantity</span><input id="adQty" type="number" min="1" step="1" value="1"></label>
        <label class="field"><span>Reason *</span><select id="adWhy">${UI.options(['Damaged / defective', 'Lost / stolen', 'Found in storeroom', 'Internal use / demo unit', 'Data correction', 'Other'])}</select></label>
        <label class="field"><span>Details</span><input id="adNote" placeholder="Optional details"></label>`,
      footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="adGo">Apply adjustment</button>`,
    });
    let dir = -1;
    m.el.querySelector('#adDir').onclick = (e) => { const b = e.target.closest('[data-d]'); if (!b) return; dir = +b.dataset.d; m.el.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('active', x === b)); };
    m.el.querySelector('#adGo').onclick = async () => {
      const qty = U.int(m.el.querySelector('#adQty').value);
      const reason = [m.el.querySelector('#adWhy').value, m.el.querySelector('#adNote').value.trim()].filter(Boolean).join(' — ');
      try { await svc.adjustStock(id, dir * qty, reason); m.close(); App.rerender(); U.toast('Stock adjusted', 'success'); } catch (e) { U.toast(e.message, 'danger'); }
    };
  }

  function history(id) {
    const p = S.get('products', id);
    const rows = S.filter('stock_moves', (x) => x.product_id === id).sort((a, b) => b.at.localeCompare(a.at) || b.created_at.localeCompare(a.created_at));
    const label = { opening: 'Opening stock', sale: 'Sale', buy: 'Bought from customer', trade_in: 'Trade-in (in)', trade_out: 'Trade-in (out)', purchase: 'Supplier receipt', adjustment: 'Adjustment', stock_take: 'Stock take', refund: 'Refund restock', exchange_in: 'Exchange (in)', exchange_out: 'Exchange (out)', repair_part: 'Used in repair', repair_part_return: 'Repair part returned', warranty_replace: 'Warranty replacement', consignment_in: 'Consignment in', consignment_return: 'Returned to consignor', sale_void: 'Sale voided', buy_void: 'Buy voided', trade_void: 'Trade voided' };
    UI.modal({
      title: 'Stock ledger', sub: `${esc(p.name)} · ${esc(p.sku)} · now ${p.stock}`, size: 'lg',
      body: UI.table(['Date', 'Movement', 'Reference', '>Change', '>Balance', 'By'], rows.map((r) => `<tr><td>${U.fmtDateTime(r.at)}</td><td>${esc(label[r.ref_type] || r.ref_type)}${r.reason ? `<div class="muted small">${esc(r.reason)}</div>` : ''}</td><td>${esc(r.ref_no || '—')}</td><td class="num ${r.delta > 0 ? 'success' : 'danger'}"><strong>${r.delta > 0 ? '+' : ''}${r.delta}</strong></td><td class="num">${r.after}</td><td class="muted">${esc(r.staff_name)}</td></tr>`), UI.empty('No movements', '', 'history')),
    });
  }
})();
