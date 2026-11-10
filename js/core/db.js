/* Arcadia POS — data layer
 *
 * The rest of the app only talks to App.store. The store keeps an in-memory cache of
 * every table and hands each committed change set to an adapter:
 *
 *   adapter.init()                     -> Promise
 *   adapter.loadAll(tables)            -> Promise<{ [table]: rows[] }>
 *   adapter.commit(changes, data)      -> Promise   changes = [{ table, op: 'upsert'|'delete', row }]
 *
 * LocalAdapter    : localStorage (default, works offline, zero setup)
 * SupabaseAdapter : Postgres via supabase-js — same table/column names as /supabase/schema.sql
 */
(function () {
  const App = (window.App = window.App || {});
  const U = App.utils;

  App.TABLES = [
    'settings', 'staff', 'customers', 'suppliers', 'products', 'sales', 'buys', 'trades', 'repairs',
    'after_sales', 'purchase_orders', 'consignments', 'consignment_settlements', 'shifts', 'cash_ledger',
    'stock_moves', 'stock_takes', 'counters', 'audit_log', 'held_carts',
  ];

  /* ---------------- Local adapter ---------------- */
  class LocalAdapter {
    constructor(prefix) { this.prefix = prefix; this.name = 'Local (this browser)'; }
    key(t) { return `${this.prefix}:${t}`; }
    async init() {}
    async loadAll(tables) {
      const out = {};
      for (const t of tables) {
        try { out[t] = JSON.parse(localStorage.getItem(this.key(t)) || '[]'); } catch { out[t] = []; }
      }
      return out;
    }
    async commit(changes, data) {
      const dirty = [...new Set(changes.map((c) => c.table))];
      try {
        dirty.forEach((t) => localStorage.setItem(this.key(t), JSON.stringify(data[t] || [])));
      } catch (e) {
        throw new Error('Browser storage is full. Export a backup and archive old data. (' + e.message + ')');
      }
    }
    async wipe(tables) { tables.forEach((t) => localStorage.removeItem(this.key(t))); }
  }

  /* ---------------- Supabase adapter (ready, not active) ----------------
   * Each table is { id text pk, doc jsonb, at timestamptz, ...indexed columns }.
   * The full record lives in `doc`, so the schema never drifts from the app;
   * a trigger copies hot fields (no, status, customer_id, at…) into indexed columns for SQL reporting.
   */
  class SupabaseAdapter {
    constructor({ url, anonKey }) { this.url = url; this.anonKey = anonKey; this.name = 'Supabase'; }
    async init() {
      if (!window.supabase) throw new Error('supabase-js not loaded. Uncomment the script tag in index.html.');
      if (!this.url || !this.anonKey) throw new Error('Supabase URL / anon key missing in js/core/config.js');
      this.client = window.supabase.createClient(this.url, this.anonKey, { auth: { persistSession: true } });
      // One Supabase Auth account per store (or per device). Staff then switch with their PIN inside the app.
      const { data } = await this.client.auth.getSession();
      if (!data.session) {
        const email = window.prompt('Store account email (Supabase Auth):');
        const password = email && window.prompt('Password:');
        if (!email || !password) throw new Error('Store sign-in required.');
        const { error } = await this.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    }
    async loadAll(tables) {
      const out = {};
      await Promise.all(tables.map(async (t) => {
        const rows = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await this.client.from(t).select('doc').range(from, from + 999);
          if (error) throw error;
          rows.push(...data.map((r) => r.doc));
          if (data.length < 1000) break;
        }
        out[t] = rows;
      }));
      return out;
    }
    async commit(changes) {
      /* Production note: move multi-record operations (sale, trade, refund…) into Postgres
         functions and call them with client.rpc() so they are atomic across devices.
         Document numbers should come from the next_counter() RPC — see supabase/schema.sql. */
      const byTable = {};
      for (const c of changes) {
        if (!c.row) continue;
        (byTable[c.table] = byTable[c.table] || { up: new Map(), del: new Set() });
        if (c.op === 'delete') { byTable[c.table].del.add(c.row.id); byTable[c.table].up.delete(c.row.id); }
        else byTable[c.table].up.set(c.row.id, { id: c.row.id, doc: c.row });
      }
      for (const [t, { up, del }] of Object.entries(byTable)) {
        if (up.size) { const { error } = await this.client.from(t).upsert([...up.values()]); if (error) throw error; }
        if (del.size) { const { error } = await this.client.from(t).delete().in('id', [...del]); if (error) throw error; }
      }
    }
    async wipe() { throw new Error('Wipe is disabled for Supabase. Use the SQL console.'); }
  }

  App.createAdapter = () => {
    const cfg = App.config;
    return cfg.backend === 'supabase' ? new SupabaseAdapter(cfg.supabase) : new LocalAdapter(cfg.storagePrefix);
  };

  /* ---------------- Store (cache + transactions) ---------------- */
  const listeners = new Set();
  let data = {};
  let pending = null; // array while inside tx()
  let adapter = null;

  const S = (App.store = {
    get adapter() { return adapter; },
    async init() {
      adapter = App.createAdapter();
      await adapter.init();
      data = await adapter.loadAll(App.TABLES);
      App.TABLES.forEach((t) => (data[t] = data[t] || []));
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(tables) { listeners.forEach((fn) => { try { fn(tables); } catch (e) { console.error(e); } }); },

    all(t) { return data[t] || []; },
    get(t, id) { return (data[t] || []).find((r) => r.id === id) || null; },
    find(t, fn) { return (data[t] || []).find(fn) || null; },
    filter(t, fn) { return (data[t] || []).filter(fn); },

    settings() {
      return { ...App.DEFAULT_SETTINGS, ...((data.settings || [])[0] || {}) };
    },

    /* Atomic unit of work: if fn throws, the in-memory cache is rolled back and nothing is persisted. */
    async tx(fn) {
      if (pending) return fn();
      const snapshot = U.clone(data);
      pending = [];
      try {
        const result = await fn();
        const changes = pending;
        pending = null;
        if (changes.length) {
          await adapter.commit(changes, data);
          S.emit([...new Set(changes.map((c) => c.table))]);
        }
        return result;
      } catch (e) {
        data = snapshot;
        pending = null;
        throw e;
      }
    },
    async insert(t, row) {
      return S.tx(async () => {
        const now = U.nowISO();
        const r = { id: row.id || U.uid(), created_at: now, updated_at: now, ...row };
        data[t].push(r);
        pending.push({ table: t, op: 'upsert', row: r });
        return r;
      });
    },
    async update(t, id, patch) {
      return S.tx(async () => {
        const r = S.get(t, id);
        if (!r) throw new Error(`${t} record not found`);
        Object.assign(r, patch, { updated_at: U.nowISO() });
        pending.push({ table: t, op: 'upsert', row: r });
        return r;
      });
    },
    async upsert(t, row) {
      return S.get(t, row.id) ? S.update(t, row.id, row) : S.insert(t, row);
    },
    async remove(t, id) {
      return S.tx(async () => {
        const i = data[t].findIndex((r) => r.id === id);
        if (i < 0) return;
        const [row] = data[t].splice(i, 1);
        pending.push({ table: t, op: 'delete', row });
      });
    },
    async replaceAll(newData) {
      // Used by "Restore backup" — local adapter only
      if (!(adapter instanceof LocalAdapter)) throw new Error('Restore is only available in local mode.');
      App.TABLES.forEach((t) => (data[t] = Array.isArray(newData[t]) ? newData[t] : []));
      await adapter.commit(App.TABLES.map((t) => ({ table: t, op: 'upsert', row: null })), data);
      S.emit(App.TABLES);
    },
    snapshot() { return U.clone(data); },
  });
})();
