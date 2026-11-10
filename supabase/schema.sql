-- =====================================================================
-- Arcadia POS — Supabase / Postgres schema
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- Design: every table stores the full app record in `doc jsonb` (so the
-- database never drifts out of sync with the app), and a trigger copies the
-- hot fields into typed, indexed columns for fast SQL reporting.
-- =====================================================================

create or replace function public.arcadia_sync_cols() returns trigger
language plpgsql as $$
begin
  new.at          := coalesce(nullif(new.doc->>'at','')::timestamptz, nullif(new.doc->>'created_at','')::timestamptz, now());
  new.no          := new.doc->>'no';
  new.status      := new.doc->>'status';
  new.customer_id := new.doc->>'customer_id';
  new.product_id  := new.doc->>'product_id';
  new.shift_id    := new.doc->>'shift_id';
  new.updated_at  := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'settings','staff','customers','suppliers','products','sales','buys','trades','repairs',
    'after_sales','purchase_orders','consignments','consignment_settlements','shifts','cash_ledger',
    'stock_moves','stock_takes','counters','audit_log','held_carts'
  ] loop
    execute format('create table if not exists public.%I (
      id text primary key,
      doc jsonb not null,
      at timestamptz,
      no text,
      status text,
      customer_id text,
      product_id text,
      shift_id text,
      updated_at timestamptz default now()
    )', t);
    execute format('create index if not exists %I on public.%I (at desc)', t || '_at_idx', t);
    execute format('create index if not exists %I on public.%I (no)', t || '_no_idx', t);
    execute format('create index if not exists %I on public.%I (customer_id)', t || '_cust_idx', t);
    execute format('create index if not exists %I on public.%I (product_id)', t || '_prod_idx', t);
    execute format('drop trigger if exists %I on public.%I', t || '_sync', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.arcadia_sync_cols()', t || '_sync', t);

    -- Row Level Security: only signed-in store accounts can read/write.
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_auth_all', t);
  end loop;
end $$;

-- Ledgers are append-only: nobody may edit or delete history.
drop policy if exists stock_moves_auth_all on public.stock_moves;
create policy stock_moves_insert on public.stock_moves for insert to authenticated with check (true);
create policy stock_moves_select on public.stock_moves for select to authenticated using (true);
drop policy if exists cash_ledger_auth_all on public.cash_ledger;
create policy cash_ledger_insert on public.cash_ledger for insert to authenticated with check (true);
create policy cash_ledger_select on public.cash_ledger for select to authenticated using (true);
drop policy if exists audit_log_auth_all on public.audit_log;
create policy audit_log_insert on public.audit_log for insert to authenticated with check (true);
create policy audit_log_select on public.audit_log for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- RPC roadmap (multi-counter safety)
-- In local mode numbering is per-browser. With several devices, document
-- numbers must come from the database so two counters never issue the same
-- invoice number. Call: select public.next_counter('INV-261110');
-- ---------------------------------------------------------------------
create or replace function public.next_counter(p_key text) returns integer
language plpgsql security definer as $$
declare v integer;
begin
  insert into public.counters (id, doc) values (p_key, jsonb_build_object('id', p_key, 'value', 1))
  on conflict (id) do update
    set doc = jsonb_set(public.counters.doc, '{value}', to_jsonb(coalesce((public.counters.doc->>'value')::int, 0) + 1))
  returning (doc->>'value')::int into v;
  return v;
end $$;
grant execute on function public.next_counter(text) to authenticated;

-- Handy reporting view: daily revenue by stream
create or replace view public.v_daily_revenue as
select date_trunc('day', at) as day, 'sale' as stream, sum((doc->>'revenue')::numeric) as revenue, sum((doc->>'profit')::numeric) as profit
  from public.sales where status = 'completed' group by 1
union all
select date_trunc('day', at), 'trade', sum((doc->>'total_out')::numeric), sum((doc->>'profit')::numeric)
  from public.trades where status = 'completed' group by 1
union all
select date_trunc('day', (doc->>'collected_at')::timestamptz), 'repair', sum((doc->>'final_price')::numeric), sum((doc->>'profit')::numeric)
  from public.repairs where status = 'collected' group by 1;
