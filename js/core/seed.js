/* Arcadia POS — demo data generator (fictional brand "Pixel Harbor Games").
 * Runs through the real services so every number on screen is internally consistent. */
(function () {
  const App = (window.App = window.App || {});
  const U = App.utils;
  const S = App.store;
  const svc = App.svc;

  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const STAFF = [
    { name: 'Aina Rahman', role: 'owner', pin: '1234', color: '#7c5cff' },
    { name: 'Jason Lim', role: 'manager', pin: '2222', color: '#22c55e' },
    { name: 'Farah Idris', role: 'cashier', pin: '0000', color: '#f59e0b' },
    { name: 'Kumar Selvam', role: 'technician', pin: '1111', color: '#06b6d4' },
  ];
  const CUSTOMERS = [
    ['Amirul Hakim', '0123456781', 'registered'], ['Siti Nurhaliza Zain', '0198765432', 'registered'], ['Daniel Tan', '0172233445', 'registered'],
    ['Priya Ramesh', '0163344556', 'online', 'WhatsApp'], ['Haziq Firdaus', '0134455667', 'registered'], ['Melissa Wong', '0115566778', 'online', 'Instagram'],
    ['Faiz Iskandar', '0196677889', 'registered'], ['Nurul Ain', '0147788990', 'online', 'TikTok'], ['Kevin Raj', '0128899001', 'registered'], ['Zara Sofea', '0189900112', 'registered'],
  ];
  const SUPPLIERS = [
    { name: 'Nexus Distribution Sdn Bhd', contact: 'Mr. Wong', phone: '0378881234', email: 'orders@nexusdist.example' },
    { name: 'GameOn Wholesale', contact: 'Ms. Lee', phone: '0356662211', email: 'sales@gameon.example' },
    { name: "Collector's Corner (Consignor)", contact: 'Hafiz', phone: '0129998877', notes: 'Retro consignment · 80/20 split' },
  ];
  // name, category, platform, condition, price, cost, stock, serial, low
  const PRODUCTS = [
    ['PlayStation 5 Slim Disc 1TB', 'Console', 'PS5', 'New', 2199, 1890, 5, '', 2],
    ['PlayStation 5 Pro 2TB', 'Console', 'PS5', 'New', 3299, 2950, 2, '', 1],
    ['PlayStation 5 Slim Digital', 'Console', 'PS5', 'Used', 1599, 1250, 1, 'S01-F57A8812345', 0],
    ['Nintendo Switch OLED White', 'Console', 'Nintendo Switch', 'New', 1399, 1180, 6, '', 2],
    ['Nintendo Switch 2 + Mario Kart World Bundle', 'Console', 'Switch 2', 'New', 2299, 2010, 4, '', 2],
    ['Nintendo Switch Lite Turquoise', 'Console', 'Nintendo Switch', 'Used', 699, 480, 1, 'XKW10012345678', 0],
    ['Xbox Series X 1TB', 'Console', 'Xbox Series', 'New', 2399, 2050, 2, '', 1],
    ['PlayStation 4 Slim 500GB', 'Console', 'PS4', 'Used', 799, 520, 1, 'MB123456789', 0],
    ['Steam Deck OLED 512GB', 'Console', 'PC', 'New', 2599, 2280, 2, '', 1],
    ['EA Sports FC 26', 'Games', 'PS5', 'New', 259, 190, 14, '', 4],
    ['Mario Kart World', 'Games', 'Switch 2', 'New', 289, 225, 9, '', 3],
    ['Zelda: Tears of the Kingdom', 'Games', 'Nintendo Switch', 'New', 249, 185, 6, '', 2],
    ['Pokémon Legends: Z-A', 'Games', 'Nintendo Switch', 'New', 249, 190, 10, '', 3],
    ['Ghost of Yōtei', 'Games', 'PS5', 'New', 299, 235, 7, '', 2],
    ['Grand Theft Auto V', 'Games', 'PS5', 'New', 129, 85, 5, '', 2],
    ["Marvel's Spider-Man 2", 'Games', 'PS5', 'Used', 149, 90, 3, '', 1],
    ['Elden Ring', 'Games', 'PS5', 'Used', 119, 70, 2, '', 1],
    ['Animal Crossing: New Horizons', 'Games', 'Nintendo Switch', 'Used', 159, 110, 3, '', 1],
    ['DualSense Wireless Controller White', 'Controller', 'PS5', 'New', 339, 270, 10, '', 3],
    ['DualSense Edge Pro Controller', 'Controller', 'PS5', 'New', 899, 760, 2, '', 1],
    ['Joy-Con Pair Neon Red/Blue', 'Controller', 'Nintendo Switch', 'New', 329, 260, 4, '', 2],
    ['Switch Pro Controller', 'Controller', 'Nintendo Switch', 'New', 299, 230, 3, '', 1],
    ['Xbox Wireless Controller Carbon Black', 'Controller', 'Xbox Series', 'New', 259, 200, 4, '', 2],
    ['DualShock 4 Controller', 'Controller', 'PS4', 'Used', 129, 70, 3, '', 1],
    ['DualSense Charging Station', 'Accessories', 'PS5', 'New', 129, 85, 6, '', 2],
    ['SanDisk 256GB microSD for Switch', 'Accessories', 'Nintendo Switch', 'New', 159, 110, 8, '', 3],
    ['HORI Split Pad Pro', 'Accessories', 'Nintendo Switch', 'New', 249, 190, 1, '', 2],
    ['PULSE Elite Wireless Headset', 'Accessories', 'PS5', 'New', 549, 450, 2, '', 1],
    ['Switch Carrying Case', 'Accessories', 'Nintendo Switch', 'New', 69, 35, 15, '', 5],
    ['HDMI 2.1 Ultra High Speed Cable 2m', 'Accessories', 'Multi', 'New', 39, 12, 20, '', 5],
    ['PSN Gift Card RM100', 'Gift Cards', 'PS5', 'New', 100, 95, 30, '', 10],
    ['Steam Wallet RM100', 'Gift Cards', 'PC', 'New', 100, 96, 25, '', 10],
    ['amiibo Link (Tears of the Kingdom)', 'Collectibles', 'Nintendo Switch', 'New', 99, 70, 4, '', 1],
    ['Funko Pop! Kratos', 'Collectibles', 'Multi', 'New', 89, 55, 3, '', 1],
    ['PS5 HDMI Port Replacement', 'Repair Parts', 'PS5', 'New', 45, 18, 8, '', 3],
    ['DualSense Analog Stick Module', 'Repair Parts', 'PS5', 'New', 25, 6, 20, '', 5],
    ['Joy-Con Analog Stick Module', 'Repair Parts', 'Nintendo Switch', 'New', 30, 8, 15, '', 5],
    ['Thermal Paste Kit', 'Repair Parts', 'Multi', 'New', 20, 8, 10, '', 3],
  ];
  const METHODS = ['cash', 'cash', 'cash', 'qr', 'qr', 'card', 'bank', 'ewallet'];

  App.seedDemo = async () => {
    const r = rng(20261110);
    const pick = (a) => a[Math.floor(r() * a.length)];
    await S.tx(async () => {
      await S.upsert('settings', { ...App.DEFAULT_SETTINGS });
      for (const st of STAFF) await S.insert('staff', { ...st, active: true });
    });
    const owner = S.find('staff', (s) => s.role === 'owner');
    const prevSession = { ...App.session };
    App.session.staff = owner;
    svc._seeding = true;
    const at = (daysAgo, hour = 11, min = 0) => { const d = U.addDays(new Date(), -daysAgo); d.setHours(hour, min, 0, 0); return new Date(Math.min(d.getTime(), Date.now() - 60000 * (5 + daysAgo))).toISOString(); };
    const asOf = (iso) => (App.session.backdate = { at: iso, reason: 'seed', silent: true });

    try {
      asOf(at(40, 10));
      for (const [name, phone, type, channel] of CUSTOMERS) await svc.saveCustomer({ name, phone, type, channel: channel || '' });
      for (const s of SUPPLIERS) await svc.saveSupplier(s);
      for (const [name, category, platform, condition, price, cost, stock, serial, low] of PRODUCTS) {
        await svc.saveProduct({ name, category, platform, condition, price, cost, stock: serial ? stock : stock * 3, serial, low_stock: low });
      }
      const cons = S.find('suppliers', (s) => s.name.startsWith('Collector'));
      await svc.receiveConsignment({ supplier_id: cons.id, reference: 'CC-AGR-0012', terms: 'Monthly settlement', items: [
        { name: 'PlayStation 1 Console Boxed (SCPH-1002)', category: 'Console', platform: 'Retro', condition: 'Used', qty: 1, consignment_cost: 700, price: 899 },
        { name: 'Game Boy Advance SP AGS-101', category: 'Console', platform: 'Retro', condition: 'Used', qty: 2, consignment_cost: 380, price: 499 },
        { name: 'Pokémon Emerald (Cart Only)', category: 'Games', platform: 'Retro', condition: 'Used', qty: 3, consignment_cost: 180, price: 239 },
      ] });

      const customers = S.all('customers');
      const sellable = () => S.filter('products', (p) => p.stock > U.int(p.low_stock) + 1 && p.category !== 'Repair Parts');
      for (let d = 29; d >= 0; d--) {
        const n = d === 0 ? 4 : 2 + Math.floor(r() * 5) + (new Date(at(d)).getDay() % 6 === 0 ? 3 : 0);
        for (let k = 0; k < n; k++) {
          asOf(at(d, d === 0 ? 1 + k * 2 : 11 + Math.floor(r() * 10), Math.floor(r() * 60)));
          const pool = sellable();
          const lines = [];
          const count = r() < 0.7 ? 1 : 2;
          for (let j = 0; j < count; j++) {
            const p = pick(pool.filter((x) => (x.category !== 'Console' || r() < 0.35) && !lines.some((l) => l.product_id === x.id)));
            if (p) lines.push({ product_id: p.id, qty: p.serial ? 1 : 1 + (r() < 0.15 ? 1 : 0), unit_price: p.price });
          }
          lines.forEach((l) => { const p = S.get('products', l.product_id); if (l.qty > p.stock) l.qty = p.stock; });
          if (!lines.length || lines.some((l) => l.qty < 1)) continue;
          const sub = lines.reduce((a, l) => a + l.unit_price * l.qty, 0);
          const discount = r() < 0.2 ? Math.min(50, Math.round(sub * 0.05)) : 0;
          const method = pick(METHODS);
          const cust = r() < 0.55 ? pick(customers).id : null;
          try { await svc.completeSale({ items: lines, customer_id: cust, discount, payments: [{ method, amount: U.r2(sub - discount) }] }); } catch (e) { /* skip */ }
        }
        if (d % 4 === 0) {
          asOf(at(d, 15));
          await svc.completeBuy({ customer_id: pick(customers).id, seller_id_no: '9' + Math.floor(r() * 1e10), method: pick(['cash', 'bank']), items: [
            pick([
              { name: 'DualShock 4 Controller', category: 'Controller', platform: 'PS4', condition: 'Used', qty: 1, unit_price: 60, sell_price: 129, qc: { 'All buttons': 'pass', 'No stick drift': 'pass' } },
              { name: 'Animal Crossing: New Horizons', category: 'Games', platform: 'Nintendo Switch', condition: 'Used', qty: 1, unit_price: 95, sell_price: 159, qc: { 'Disc surface': 'na', 'Boots & plays': 'pass' } },
              { name: 'Elden Ring', category: 'Games', platform: 'PS5', condition: 'Used', qty: 1, unit_price: 60, sell_price: 119, qc: { 'Disc surface': 'pass', 'Boots & plays': 'pass' } },
            ]),
          ] }).catch(() => {});
        }
        if (d % 6 === 3) {
          asOf(at(d, 16));
          const out = pick(S.filter('products', (p) => p.stock > 0 && p.category === 'Games' && p.condition === 'New'));
          await svc.completeTrade({ customer_id: pick(customers).id, method: pick(['cash', 'qr']),
            inItems: [{ name: pick(["Marvel's Spider-Man 2", 'Hogwarts Legacy', 'Gran Turismo 7']), category: 'Games', platform: 'PS5', condition: 'Used', qty: 1, unit_price: 70 + Math.floor(r() * 4) * 10, sell_price: 139 }],
            outItems: out ? [{ product_id: out.id, qty: 1, unit_price: out.price }] : [] }).catch(() => {});
        }
      }

      // Repairs in various stages
      const tech = S.find('staff', (s) => s.role === 'technician');
      const jobs = [
        [12, 'PS5 Disc Edition', 'No HDMI signal after drop', 180, 50, 'collected'],
        [9, 'DualSense Controller', 'Left stick drift', 60, 0, 'collected'],
        [6, 'Nintendo Switch V2', 'Overheating, fan loud', 120, 30, 'ready'],
        [4, 'PS4 Pro', 'Blue light of death', 250, 50, 'waiting_parts'],
        [2, 'Joy-Con (L)', 'Stick drift', 50, 0, 'in_progress'],
        [1, 'Xbox Series S', 'Not powering on', 0, 0, 'diagnosing'],
        [0, 'Steam Deck LCD', 'Screen replacement quote', 0, 0, 'received'],
      ];
      for (const [d, device, issue, est, dep, status] of jobs) {
        asOf(at(d, 12));
        const rep = await svc.createRepair({ customer_id: pick(customers).id, device, issue, estimate: est, deposit: dep, deposit_method: dep ? 'qr' : '', technician_id: tech.id, accessories: ['Power cable'], due_at: U.addDays(at(d), 4).toISOString() });
        if (status === 'received') continue;
        await svc.setRepairStatus(rep.id, 'diagnosing', 'Initial inspection done');
        if (status === 'diagnosing') continue;
        if (device.includes('PS5')) await svc.useRepairPart(rep.id, S.find('products', (p) => p.name.startsWith('PS5 HDMI')).id, 1);
        if (device.includes('DualSense')) await svc.useRepairPart(rep.id, S.find('products', (p) => p.name.startsWith('DualSense Analog')).id, 1);
        if (device.includes('Joy-Con')) await svc.useRepairPart(rep.id, S.find('products', (p) => p.name.startsWith('Joy-Con Analog')).id, 1);
        if (device.includes('Switch')) await svc.useRepairPart(rep.id, S.find('products', (p) => p.name.startsWith('Thermal')).id, 1);
        await svc.setRepairStatus(rep.id, status === 'collected' ? 'ready' : status, '');
        if (status === 'collected') {
          asOf(at(d - 2, 17));
          await svc.completeRepair(rep.id, { final_price: est, payments: est - dep ? [{ method: 'cash', amount: est - dep }] : [], warranty_days: 30 });
        }
      }

      // Purchase orders
      const nexus = S.find('suppliers', (s) => s.name.startsWith('Nexus'));
      const gameon = S.find('suppliers', (s) => s.name.startsWith('GameOn'));
      const byName = (n) => S.find('products', (p) => p.name === n);
      asOf(at(14, 10));
      const po1 = await svc.createPO({ supplier_id: nexus.id, invoice_no: 'NX-88213', lines: [
        { product_id: byName('DualSense Wireless Controller White').id, name: 'DualSense Wireless Controller White', category: 'Controller', qty: 10, unit_cost: 265, sell_price: 339 },
        { product_id: byName('EA Sports FC 26').id, name: 'EA Sports FC 26', category: 'Games', qty: 10, unit_cost: 188, sell_price: 259 },
      ], shipping: 40, discount: 0, paid: 0, pay_method: 'bank' });
      asOf(at(12, 14));
      await svc.receivePO(po1.id, [{ idx: 0, qty: 10 }, { idx: 1, qty: 10 }], 'All good');
      await svc.payPO(po1.id, po1.total, 'bank');
      asOf(at(3, 11));
      const po2 = await svc.createPO({ supplier_id: gameon.id, invoice_no: 'GO-5512', expected_at: U.dateKey(U.addDays(new Date(), 4)), lines: [
        { product_id: byName('HORI Split Pad Pro').id, name: 'HORI Split Pad Pro', category: 'Accessories', platform: 'Nintendo Switch', qty: 6, unit_cost: 185, sell_price: 249 },
        { name: 'Metroid Prime 4: Beyond', category: 'Games', platform: 'Switch 2', condition: 'New', qty: 8, unit_cost: 215, sell_price: 279 },
      ], shipping: 25, paid: 500, pay_method: 'bank' });
      asOf(at(1, 15));
      await svc.receivePO(po2.id, [{ idx: 1, qty: 4 }], 'Partial — rest next week');

      // One refund, one settlement
      const lastSale = S.filter('sales', (s) => s.lines.some((l) => l.category === 'Accessories'))[0];
      if (lastSale) {
        asOf(U.addDays(lastSale.at, 1).toISOString());
        const idx = lastSale.lines.findIndex((l) => l.category === 'Accessories');
        await svc.refund({ sale_id: lastSale.id, returns: [{ line_idx: idx, qty: 1, restock: true }], method: lastSale.payments[0].method, reason: 'Customer changed mind (unopened)' }).catch(() => {});
      }
      const due = svc.consignmentLedger().find((x) => x.supplier_id === cons.id);
      if (due && due.outstanding > 0) { asOf(at(2, 18)); await svc.settleConsignment({ supplier_id: cons.id, amount: due.outstanding, method: 'bank', note: 'Monthly settlement' }); }

      // A closed shift yesterday so today's opening shows cash continuity
      const y = at(1, 10);
      await S.insert('shifts', { no: 'SHF-DEMO-001', status: 'closed', opened_at: y, opened_by: owner.id, opened_by_name: owner.name, opening: 500, closed_at: at(1, 22), closed_by: owner.id, closed_by_name: owner.name, expected: 1240, counted: 1240, variance: 0, summary: { sale: 740 } });
    } finally {
      svc._seeding = false;
      App.session.backdate = null;
      App.session.staff = prevSession.staff;
    }
  };

  App.ensureFirstRun = async () => {
    if (!S.all('staff').length) {
      await App.seedDemo();
      return true;
    }
    return false;
  };
})();
