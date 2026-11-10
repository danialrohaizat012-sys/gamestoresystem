# Audit of the reference POS & what changed

The reference (`pos.html`, ~4,200 lines, Firebase) was reviewed module by module. Below: problems found, why they matter, and how Arcadia POS handles it. Items marked ✅ are covered by automated end-to-end checks run against the new build.

## Logic / data-integrity issues

| # | Issue in the reference | Impact | Fix in Arcadia POS |
|---|---|---|---|
| 1 | **Cancelling a sale restocks the full quantity even if items were already refunded** through After-Sales (which also restocked). | Phantom stock, inventory overstated. | A sale with any refund/exchange/claim cannot be voided — it must be reversed via After-Sales. Refunds track `returned_qty` per line and can never exceed what's left. ✅ |
| 2 | **Cancelling a buy-in clamps stock at 0** (`Math.max(0, qty - remove)`) and removes one unit per line regardless of line quantity. | Item already resold → stock silently wrong, cost wrong. | Void fails loudly if the bought item was sold/moved; cost is un-averaged correctly; line quantities respected. ✅ |
| 3 | **Cancelling a transaction changes a closed shift's expected cash retroactively** (cancelled records are simply excluded from the total). | A shift that balanced yesterday suddenly shows a variance; today's drawer is off by the refund. | Voids post a reversal entry into the **current** shift. Closed shifts are never rewritten. ✅ |
| 4 | Shift cash attribution falls back to **timestamps** for records without a `shiftId`. | Transactions from one shift counted in another. | Every cash movement writes an explicit `cash_ledger` row bound to a shift. Expected cash = opening + ledger. ✅ |
| 5 | **Payment method names differ per module** ("QR / DuitNow" in sales, "QR" in repairs, "DuitNow" in buys). | Reports split one method into three; cash detection by string compare. | One canonical list of payment method IDs used everywhere. |
| 6 | **Stock-take draft lives only in memory** (`let stockTakeDraft=[]`). | Refresh / crash during a count loses all counting work. | Drafts are saved continuously; resume any time. |
| 7 | Stock take adjusts to the counted number regardless of sales made during the count. | Shop must stop selling during a count, or stock becomes wrong. | Variance is measured against the snapshot and applied as a delta, so sales during the count are preserved. ✅ |
| 8 | **Products can be deleted while referenced** by sales/stock history; no permission check on delete. | Broken receipts, lost history. | Products with history are archived, never deleted; editing requires permission. |
| 9 | Only stock-take changes leave an audit trail; sales, buys, trades, refunds, repairs parts change stock with no ledger. | "Where did this unit go?" can't be answered. | Full **stock ledger** — every movement has before/after/reference/staff. |
| 10 | Multi-document writes are not consistently atomic (several writes in sequence outside a transaction in places). | Half-saved transactions on network errors. | Every business operation runs in `store.tx()`: all-or-nothing, cache rolled back on error. ✅ |
| 11 | Duplicate serial numbers only checked against products list loosely; serial buy-back of a unit previously sold creates a new SKU. | Same physical console with two SKUs; stolen-goods traceability weaker. | Serial must be unique while in stock; buying back a previously-sold serial reuses its SKU and history. ✅ |
| 12 | Trade-in / buy-in do not require a customer identity. | No traceability for second-hand goods (police / stolen goods checks). | Seller must be a customer record; IC/passport recorded on buy-ins and printed on the voucher. |
| 13 | Discount is only a fixed RM amount with no limit; price overrides by anyone. | Margin leakage. | RM or %; >30% discount and price overrides need manager permission — enforced in the business layer, not only the UI. ✅ |
| 14 | Refunds have no window and no partial-quantity logic. | Inconsistent refund policy. | Configurable refund window (manager override outside it), partial quantities, refund amount = exactly what the customer paid for that line (discount & tax allocated). ✅ |
| 15 | PO receiving uses supplier unit price only; shipping/discount ignored in cost. | Margins overstated. | **Landed cost**: shipping & discount spread across received units. |
| 16 | Consignment payables stored as separate documents updated on each sale/cancel. | Can drift out of sync; complicated reversal rules. | Payable is **derived** from completed sales minus returns minus settlements — can't drift. |
| 17 | Repair deposit counted in shift only when method string equals "cash". Repair cancel doesn't refund deposit or return parts. | Cash mismatches, parts lost. | Deposits/refunds go through the cash ledger; cancelling a job refunds the deposit and returns parts to stock. |
| 18 | "Total Stock Buy" mixes buy-ins, trade-in values and paid consignment into one KPI next to revenue. | Owner reads inventory investment as an expense. | Reports separate P&L (revenue, gross profit by stream) from stock bought in (investment). One profit definition used everywhere. |
| 19 | Owner check, roles and "owner only" features were enforced mainly in the UI. | Any user with devtools can bypass. | Permissions checked inside services. **With Supabase, add server-side checks (RLS/RPC) — see below.** |

## UX issues

- Mixed Malay/English labels, Firebase-specific copy and Meney branding throughout → clean English UI, fully white-label.
- Customer selection via a long `<select>` → searchable customer picker with inline "new customer".
- Cart not usable on phones → mobile bottom-sheet cart, bottom navigation, PWA install.
- No keyboard flow → barcode Enter-to-add, `F2`/`F9`/`/`, `Ctrl+K` command palette.
- No hold/park sale, no change calculator, no denomination counter → added.
- Repairs as a flat table → Kanban board with status stepper, timeline, parts, WhatsApp notify.

## Remaining work (honest list)

1. **Multi-device Supabase**: local mode is single-device. Before running several counters concurrently, move document numbering to `next_counter()` and wrap sale/trade/refund into Postgres RPC functions so stock checks happen inside the database transaction.
2. **Staff PINs** are stored in plain text in local storage (acceptable for a single trusted device). With Supabase, store hashed PINs and enforce roles with RLS.
3. **localStorage ~5 MB limit**: roughly tens of thousands of transactions. Back up and move to Supabase before that.
4. Not yet built: e-invoice (LHDN MyInvois) submission, label/barcode printing, multi-branch stock transfer, customer-facing display.
