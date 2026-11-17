# Changelog

## 0.2.1 - Product form and clock
Changed: product form now asks in plain order: how many packs, how many bottles in one pack, price of ONE bottle; carton/crate moved into an optional section; live summary cards (total bottles, price per pack, stock worth) update as you type.
Added: live clock (12-hour with seconds) and date in the top bar; follows the date format chosen in Settings; all times shown in the PC's local (Pakistan) time; timestamp conversion tested across midnight and new year.

## 0.2.0 - Stage 2: Products and inventory
Added: products with pack/carton/crate conversions; per-bottle pricing with live pack/carton/crate prices; append-only stock movements; stock adjustments (add, remove, damage, count); price history; low-stock alerts; live dashboard low-stock and stock value; cashier cost-price protection; stock-vs-movements integrity check. Database upgrade 002 (a safety backup is taken automatically before it runs).
Fixed: chip labels wrapping.

## 0.1.0 - Stage 1: Foundation
Added: project skeleton; SQLite schema + safe migrations (safety backup, rollback, downgrade protection); sign-in, roles, users, activity log; double-entry journal core; settings; manual backup and integrity check; premium UI shell and dashboard layout; logo assets and Windows icon; Electron main/preload (sandboxed, single-instance); installer configuration.

## Planned
- Stage 2: products, pack/carton/crate conversions, stock movements
- Stage 3: customers, suppliers, ledgers
- Stage 4: billing and printing (58 mm, 80 mm, A4)
- Stage 5: purchases, returns, empty bottles and crates
- Stage 6: expenses, bank and cash, vouchers, daily sheet, monthly closing
- Stage 7: live dashboard figures, reports, PDF and Excel export
- Stage 8: restore, JSON export/import, scheduled backups, Google Drive sync, migration of the Phase 3.1 data
- Stage 9: user manual, final test report
