'use strict';
/**
 * Migration 001 - Foundation.
 * Settings, roles, users, audit & error logs, document numbering,
 * chart of accounts and the immutable double-entry journal.
 *
 * RULE: once released, a migration file is never edited. Changes go in a new file.
 */
module.exports = {
  version: 1,
  name: 'foundation',
  sql: `
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE roles (
  name        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  permissions TEXT NOT NULL,              -- JSON array of permission keys, or ["*"]
  is_system   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name         TEXT NOT NULL,
  role                 TEXT NOT NULL REFERENCES roles(name),
  password_hash        TEXT NOT NULL,
  is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1)),
  last_login_at        TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_id   INTEGER,
  username  TEXT,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  details   TEXT
);
CREATE INDEX idx_audit_ts ON audit_log(ts);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TABLE error_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  source  TEXT NOT NULL,
  message TEXT NOT NULL,
  stack   TEXT,
  context TEXT
);

-- Gap-free document numbering (invoices, vouchers, journal entries ...). Always allocated inside the
-- same transaction as the document it numbers, so a rolled-back document never burns a number.
CREATE TABLE doc_sequences (
  name    TEXT PRIMARY KEY,
  prefix  TEXT NOT NULL,
  next_no INTEGER NOT NULL CHECK (next_no >= 1),
  pad     INTEGER NOT NULL DEFAULT 4
);

CREATE TABLE accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  is_system  INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE journal_entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_no        TEXT NOT NULL UNIQUE,
  entry_date      TEXT NOT NULL CHECK (entry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  description     TEXT NOT NULL,
  source_type     TEXT,
  source_id       TEXT,
  reverses_id     INTEGER UNIQUE REFERENCES journal_entries(id),   -- an entry can be reversed once
  idempotency_key TEXT UNIQUE,                                      -- duplicate-submission guard
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_je_date ON journal_entries(entry_date);
CREATE INDEX idx_je_source ON journal_entries(source_type, source_id);

CREATE TABLE journal_lines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id   INTEGER NOT NULL REFERENCES journal_entries(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  party_type TEXT CHECK (party_type IN ('customer','supplier')),
  party_id   INTEGER,
  debit      INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),         -- paise
  credit     INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),        -- paise
  memo       TEXT,
  CHECK ((debit = 0) <> (credit = 0))                               -- exactly one side per line
);
CREATE INDEX idx_jl_entry ON journal_lines(entry_id);
CREATE INDEX idx_jl_account ON journal_lines(account_id);
CREATE INDEX idx_jl_party ON journal_lines(party_type, party_id);

-- Posted accounting records are immutable. Corrections are made by reversing entries.
CREATE TRIGGER je_no_update BEFORE UPDATE ON journal_entries
BEGIN SELECT RAISE(ABORT, 'posted journal entries are immutable; post a reversal'); END;
CREATE TRIGGER je_no_delete BEFORE DELETE ON journal_entries
BEGIN SELECT RAISE(ABORT, 'posted journal entries are immutable; post a reversal'); END;
CREATE TRIGGER jl_no_update BEFORE UPDATE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'posted journal lines are immutable; post a reversal'); END;
CREATE TRIGGER jl_no_delete BEFORE DELETE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'posted journal lines are immutable; post a reversal'); END;

-- ---- System reference data (structure, not business records) ----
INSERT INTO roles(name,label,permissions,is_system) VALUES
 ('admin','Administrator','["*"]',1),
 ('cashier','Cashier','["dashboard.view","billing.create","billing.reprint","products.view","customers.view","customers.create","customers.payments","daily_sheet.view"]',1);

INSERT INTO doc_sequences(name,prefix,next_no,pad) VALUES
 ('invoice','B-',1,4), ('purchase','P-',1,4), ('receipt_voucher','RV-',1,4),
 ('payment_voucher','PV-',1,4), ('journal_voucher','JV-',1,4), ('expense_voucher','EV-',1,4),
 ('adjustment_voucher','AV-',1,4), ('journal','JE-',1,6);

INSERT INTO accounts(code,name,type,is_system) VALUES
 ('1000','Cash in Hand','asset',1),
 ('1010','Bank Accounts','asset',1),
 ('1100','Customer Receivables','asset',1),
 ('1200','Inventory','asset',1),
 ('2000','Supplier Payables','liability',1),
 ('3000','Owner Capital / Opening Balances','equity',1),
 ('4000','Sales - Retail','income',1),
 ('4010','Sales - Wholesale','income',1),
 ('4100','Sales Returns','income',1),
 ('4200','Discounts Allowed','income',1),
 ('5000','Cost of Goods Sold','expense',1),
 ('5200','Stock Loss and Damage','expense',1);
`,
};
