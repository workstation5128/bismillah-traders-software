'use strict';
const crypto = require('crypto');
const { bad } = require('./errors');

const DEFAULTS = {
  business_name: 'Bismillah Traders',
  business_tagline: 'Cold Drinks & Juices',
  business_address: 'Amian Abad Road, Mundakey Goraya, Near Gourmet Bakers',
  business_phone: '03421224370',
  currency_symbol: 'Rs.',
  date_format: 'DD/MM/YYYY',
  receipt_width: '80',        // '58' | '80' | 'A4'
  session_idle_minutes: '60',
  low_stock_default: '24',
};

/** Keys a user may change through the UI, with validators. */
const EDITABLE = {
  business_name: (v) => nonEmpty(v, 'Business name', 80),
  business_tagline: (v) => nonEmpty(v, 'Tagline', 80),
  business_address: (v) => nonEmpty(v, 'Address', 200),
  business_phone: (v) => nonEmpty(v, 'Phone', 40),
  date_format: (v) => oneOf(v, ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], 'Date format'),
  receipt_width: (v) => oneOf(v, ['58', '80', 'A4'], 'Receipt width'),
  session_idle_minutes: (v) => range(v, 5, 1440, 'Auto sign-out'),
  low_stock_default: (v) => range(v, 0, 100000, 'Default low-stock alert'),
};

function nonEmpty(v, label, max) {
  const s = String(v ?? '').trim();
  if (!s) throw bad(`${label} cannot be empty.`);
  if (s.length > max) throw bad(`${label} is too long (max ${max} characters).`);
  return s;
}
function oneOf(v, list, label) { if (!list.includes(String(v))) throw bad(`${label} is not valid.`); return String(v); }
function range(v, lo, hi, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`${label} must be a whole number from ${lo} to ${hi}.`);
  return String(n);
}

function seedSettings(db) {
  db.tx(() => {
    for (const [k, v] of Object.entries(DEFAULTS)) {
      db.run('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)', k, v);
    }
    // Stable identity of this database; later used to make cloud sync conflict-safe.
    db.run('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)', 'database_id', crypto.randomUUID());
  });
}

function getAll(db) {
  const out = {};
  for (const r of db.all('SELECT key, value FROM settings')) out[r.key] = r.value;
  return out;
}
const get = (db, key, fallback) => db.get('SELECT value FROM settings WHERE key = ?', key)?.value ?? fallback;

function update(db, changes) {
  const clean = {};
  for (const [k, v] of Object.entries(changes || {})) {
    if (!EDITABLE[k]) throw bad(`Setting "${k}" cannot be changed.`);
    clean[k] = EDITABLE[k](v);
  }
  db.tx(() => {
    for (const [k, v] of Object.entries(clean)) {
      db.run(`INSERT INTO settings(key,value,updated_at) VALUES (?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`, k, v);
    }
  });
  return clean;
}

module.exports = { DEFAULTS, EDITABLE, seedSettings, getAll, get, update };
