# Architecture (Stage 1)

```
electron/main.js      window, app:// protocol, single instance, IPC bridge (one channel)
electron/preload.js   sandboxed bridge: window.bt.invoke(channel, payload, token)
src/ipc/registry.js   ALL back-end endpoints; enforces sign-in, permissions, error handling
src/core/*            business logic with no UI dependency (tested without Electron)
  db.js               adapter: better-sqlite3 (app) or node:sqlite (tests); WAL, FK on, synchronous=FULL
  migrate.js          versioned migrations, safety backup, rollback, newer-data refusal
  journal.js          double-entry journal; DB triggers make posted entries immutable
  auth.js             scrypt passwords, lockout, sessions, user management
src/renderer/*        plain HTML/CSS/ES modules, no bundler; talks only through api.js
tools/dev-server.js   same renderer + same registry over HTTP, for testing in a browser
```
Rules: money = integer paise; stock = integer single bottles; every business action = one SQL transaction;
posted accounting records are never edited (reverse them); document numbers are allocated inside the same transaction as the document.
