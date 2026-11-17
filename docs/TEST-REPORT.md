# Test report (Stage 1 + Stage 2)

Run on: Linux sandbox, Node 22, headless Chromium. Date: 17 Nov 2026.

## Actually run and passing
| Area | Result |
|---|---|
| Back-end automated tests (`npm test`) | 47 / 47 pass |
| Browser UI check (`tools/ui-check.js`, real renderer + real back-end) | 60 / 60 pass |

Covered: money maths (no float drift); schema creation; re-run is no-op; upgrade takes a safety backup and keeps data; failed migration rolls back fully; newer-data refusal; password hashing; first-run setup (once only, no default login); lockout and recovery; idle expiry; roles/permissions; forced password change; last-admin protection; session kill on disable; append-only activity log; journal balance/validation/idempotency/immutability triggers/reversal/trial balance; settings validation; persistence after close and reopen; backup is a complete openable copy; integrity check; error logging without leaking internals; unknown-channel rejection; UI flows (setup, sign-in, sign-out, dashboard period selector, shortcuts, palette, settings, users, backup, activity log, cashier restrictions); no console errors.

Stage 2 covered: unit maths incl. your Cola example (50 packs x 12 = 600 bottles, Rs.40/45/43); UI and core unit code kept identical; opening stock as a movement; validation; duplicates; edit keeps history; price history; add/remove/damage/count; no negative stock (app and database); append-only movements; stock-vs-movements integrity; filters; dashboard low stock and stock value; cashier cannot see cost or change stock; UI flows for add product, live preview, duplicate, low-stock flag, adjust, history, search, cashier view.

Not yet verified on Windows: the upgrade from schema 1 to 2 on a real installed copy (tested here on a throwaway database with a safety backup).

Date/time covered: 12-hour clock at midnight/noon/end of day; Settings date formats; UTC-to-Pakistan conversion across midnight and new year; "today" uses local time; live clock ticks in the UI and follows the Settings date format.

Known limit: the software uses the Windows date/time. If the PC clock or time zone is wrong, so is the software.

## Bugs found by testing and fixed during Stage 1
1. A channel named `constructor` resolved through the JavaScript prototype chain (now own-property lookup).
2. User menu rendered underneath page content (stacking order).
3. A user with a temporary password was bounced back to login (shell's read-only calls were blocked).
4. (Stage 2) Test-script slips only; no product bugs found.

## NOT tested (needs a Windows PC)
- Electron main process, `app://` protocol loading, preload bridge, window behaviour
- `better-sqlite3` installing and running on Windows 10 (tests used Node's built-in SQLite, same engine)
- `npm run dist` installer and portable build, installer icon, uninstall keeping data
- Fonts on Windows (Bahnschrift/Segoe UI are expected; screenshots here used a fallback font)
- Printing (not built yet), Google Drive (not built yet)
