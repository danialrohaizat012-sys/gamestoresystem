# Arcadia POS — all-in-one system for game stores

A white-label point of sale built for game shops: **sell, buy-back, trade-in, repair, consignment, purchasing, stock take, shifts and reports** in one fast web app. Ships with a fictional demo store, **Pixel Harbor Games**, so you can show it to any shop owner and then rebrand it for them in two minutes.

> Runs 100% in the browser today (localStorage, works offline as a PWA). The data layer is ready for **Supabase** — switching is a config change, not a rewrite.

## Quick start

```bash
python3 -m http.server 8080
```

Open http://localhost:8080. Demo PINs: **Owner 1234 · Manager 2222 · Cashier 0000 · Technician 1111**.
Any static host works (GitHub Pages, Netlify, Vercel, Cloudflare Pages). No build step.

## Modules

| Area | What it does |
|---|---|
| **Dashboard** | Revenue / profit / basket KPIs, 14-day chart, revenue mix, "needs attention" (ready repairs, overdue jobs, low stock, open POs, consignor payables) |
| **Point of Sale** | Tap or scan (barcode / SKU / serial), category & platform filters, hold & resume carts, % or RM discount, split payment, cash tendered + change, receipts to print / PDF / WhatsApp. `F2` open POS, `/` search, `F9` pay |
| **Trade-In** | Many items in, many items out, live balance (customer pays / store pays / even), QC per item |
| **Buy from Customer** | Seller IC required, QC checklist per category (console, controller, games…), expected margin, purchase voucher with signature lines |
| **Repairs** | Kanban board, intake ticket, deposit, technician, due date, parts pulled from inventory, timeline notes, WhatsApp "ready for pickup", complete & collect with internal cost / profit |
| **After-Sales** | Refund, exchange, warranty claim (send to repair or replace unit) — always linked to the original receipt, partial quantities, restock or write-off |
| **Inventory** | Platform / condition / ownership filters, margin, full **stock ledger** per product, adjustments with reasons, archive instead of delete, CSV export |
| **Purchasing** | Suppliers, purchase orders, partial receiving (GRN), **landed cost** (shipping & discount spread into unit cost), supplier payments |
| **Consignment** | Receive other people's items, sell normally, payable computed from real sales, settlements, return to consignor |
| **Stock Take** | Saved drafts, scan-to-count, sales continue during the count, variance report, adjustments posted to the ledger |
| **Transactions** | Unified journal, filters, reprint, void with reason (manager+) |
| **Customers** | Profiles, history, items under warranty, open repairs, loyalty points |
| **Reports** | P&L by stream, profit by category, payment methods, staff performance, best sellers, inventory value, slow movers, CSV export |
| **Shift & Cash** | Opening/closing continuity, denomination counter, cash in/out, full drawer ledger, X/Z reports |
| **Settings** | Store brand (name, logo letters, colour, address, receipt footer), tax (SST incl./excl.), warranty defaults, refund window, loyalty, categories & platforms, staff & PINs, backup/restore, go-live, Supabase, audit log |

Owner-only **backdated mode** lets you migrate old paper/Excel records; such entries are flagged on receipts and never touch today's cash drawer.

## Rebranding for a new store

Settings → **Store & brand**: name, legal name, SSM no., address, receipt footer, and the **Logo studio** — pick a pixel-art mark (anchor, gamepad, ghost, crown, rocket), use letters, or upload the store's own logo; choose two brand colours. The logo and colours flow into the sidebar, login screen, receipts and browser icon. Then Settings → **Data & backup → Go live** clears demo transactions and locks the reset.

## Architecture

```
index.html            app shell (no build step)
css/app.css           design system (dark + light themes, mobile-first)
js/core/config.js     roles & permissions, payment methods, defaults, backend switch
js/core/db.js         store (in-memory cache + atomic transactions) + Local / Supabase adapters
js/core/services.js   ALL business rules (stock ledger, cash ledger, sales, trades, refunds…)
js/core/seed.js       demo data, generated through the real services
js/ui/*               icons, modals, pickers, charts, receipts/documents
js/pages/*            one file per screen
supabase/schema.sql   tables, indexes, triggers, RLS, next_counter() RPC, reporting view
```

Every operation that touches several records runs in `store.tx()` — if anything fails, nothing is saved. Every stock change goes through `moveStock()` (ledger) and every cash movement through `postCash()` (shift ledger).

## Switching to Supabase

1. Create a project, run `supabase/schema.sql` in the SQL editor.
2. Create a store login in **Authentication → Users**.
3. In `js/core/config.js`: `backend: 'supabase'`, fill `supabase.url` and `supabase.anonKey`.
4. Uncomment the supabase-js `<script>` in `index.html`.
5. Migrate your local data with `supabase/import-backup.md`.

For several counters at once, move document numbering to the `next_counter()` RPC and wrap sale/trade/refund in Postgres functions (see notes in `db.js`) — see **AUDIT.md → Remaining work**.

See **[AUDIT.md](AUDIT.md)** for the review of the original system and what was fixed.
