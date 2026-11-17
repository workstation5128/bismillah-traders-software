# Bismillah Traders POS - Stage 1 (Foundation)

Offline Windows desktop POS and accounting for Bismillah Traders (Cold Drinks & Juices).
**Version 0.1.0 - Stage 1 of 9.** This stage is the secure foundation; billing, products and the other business modules arrive in the next stages and are shown in the sidebar with their stage number.

## Run it on your Windows 10 PC

1. Install **Node.js 22 LTS** from https://nodejs.org (accept the defaults). Restart the PC if asked.
2. Unzip this folder, e.g. to `C:\BismillahPOS`.
3. Open that folder, click the address bar, type `cmd`, press Enter.
4. Run (internet needed this one time only):
   ```
   npm install
   npm start
   ```
5. First launch shows **Create the owner account**. Choose your own username and password - there is no default login.

If `npm install` fails while building `better-sqlite3`, install "Visual Studio Build Tools" (workload: *Desktop development with C++*) and run `npm install` again.

### Build the installer (.exe)
```
npm run dist
```
Creates `dist\Bismillah Traders POS Setup 0.1.0.exe` (installer) and `dist\BismillahTradersPOS-Portable-0.1.0.exe`. Uninstalling never deletes your data.

### Run the checks
```
npm test            # 33 back-end tests (needs Node 22.5 or newer)
node tools/ui-check.js   # browser-driven UI check (needs: npm i -D playwright, then npx playwright install chromium)
```

## Where your data is
`%AppData%\Bismillah Traders POS\`
- `data\bt-pos.db` - the database (all records)
- `backups\` - manual, automatic and safety backups
- `logs\` - error logs

Updating or reinstalling the program never touches this folder. Before any database upgrade the program first saves a full **safety copy** in `backups\safety\`. If the data was made by a newer program version, an older one refuses to open it rather than risk damage.

## What works in Stage 1
- Sign-in with lockout after 5 wrong passwords (5 minutes), auto sign-out when idle, no default passwords
- Admin and Cashier roles; admin can add users, change roles, disable users, reset passwords (forced change at next sign-in); the last administrator can't be removed
- Business profile, receipt size, date format, auto sign-out settings
- Append-only activity log (sign-ins, changes, backups)
- Manual full backup, database integrity check, backup status in the top bar
- Dashboard layout with day/month selector (figures stay empty until their modules exist)
- Double-entry accounting core (immutable journal, reversals, duplicate protection) - used by later stages
- Keyboard: F1 to F5 shortcuts, Ctrl+K screen search
- Logo assets: emblem (cut-out PNGs), BT monogram SVG/PNG, Windows icon, 1-bit receipt logos for 58 mm and 80 mm

## Not built yet (clearly marked in the app)
Products, billing, customers, suppliers, purchases, empties, expenses, bank, vouchers, daily sheet, monthly closing, reports, restore, JSON export/import, automatic and Google Drive backup, logo upload, printing. See `CHANGELOG.md` for the schedule.

## Verification status
See `docs/TEST-REPORT.md`. Short version: back-end logic and the UI were tested here; **the Electron shell, the Windows installer, `better-sqlite3` on Windows and printing have NOT been tested** because they need a Windows PC.
