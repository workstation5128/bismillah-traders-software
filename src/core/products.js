'use strict';
/**
 * Products and inventory.
 *  - Stock is single bottles. Every change goes through applyStock(), which writes an append-only movement
 *    and refuses to go below zero.
 *  - Prices are paise per single bottle; pack/carton/crate prices are derived (units.unitPrices).
 */
const { bad, notFound } = require('./errors');
const { toPaise } = require('./money');
const { audit } = require('./audit');
const units = require('./units');

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
const MOVEMENT_LABEL = {
  opening: 'Opening stock', purchase: 'Purchase', sale: 'Sale', sale_return: 'Sales return',
  purchase_return: 'Purchase return', adjustment: 'Adjustment', damage: 'Damaged / lost', audit: 'Stock count',
};

// ---------- validation helpers ----------
function text(v, label, max, { required = false, field } = {}) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (required && !s) throw bad(`${label} is required.`, field && { [field]: true });
  if (s.length > max) throw bad(`${label} is too long (max ${max} characters).`, field && { [field]: true });
  return s;
}
function whole(v, label, { min = 0, max = 1000000, field, optional = false } = {}) {
  if (optional && (v === '' || v == null)) return null;
  const s = typeof v === 'string' ? v.trim() : v;
  const n = typeof s === 'string' && /^\d+$/.test(s) ? Number(s) : s;
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} must be a whole number from ${min} to ${max.toLocaleString('en-US')}.`, field && { [field]: true });
  return n;
}
function money(v, label, field, { required = true } = {}) {
  if ((v === '' || v == null) && !required) return 0;
  let p;
  try { p = toPaise(v); } catch { throw bad(`${label} is not a valid amount.`, { [field]: true }); }
  if (p < 0) throw bad(`${label} cannot be negative.`, { [field]: true });
  if (p > 100000000) throw bad(`${label} is unrealistically large. Prices are per single bottle.`, { [field]: true });
  return p;
}

function parseProduct(i) {
  const f = {
    name: text(i.name, 'Product name', 80, { required: true, field: 'name' }),
    brand: text(i.brand, 'Brand', 60), category: text(i.category, 'Category', 60), size: text(i.size, 'Size', 30),
    bottlesPerPack: whole(i.bottlesPerPack ?? 1, 'Bottles per pack', { min: 1, max: 1000, field: 'bottlesPerPack' }),
    bottlesPerCarton: whole(i.bottlesPerCarton, 'Bottles per carton', { min: 1, max: 5000, field: 'bottlesPerCarton', optional: true }),
    bottlesPerCrate: whole(i.bottlesPerCrate, 'Bottles per crate', { min: 1, max: 5000, field: 'bottlesPerCrate', optional: true }),
    costPrice: money(i.costPrice, 'Cost price', 'costPrice', { required: false }),
    retailPrice: money(i.retailPrice, 'Retailer price', 'retailPrice'),
    wholesalePrice: money(i.wholesalePrice, 'Wholesaler price', 'wholesalePrice'),
    lowStockAlert: whole(i.lowStockAlert ?? 0, 'Low-stock alert', { min: 0, max: 1000000, field: 'lowStockAlert' }),
  };
  return f;
}

// ---------- shaping ----------
function toApi(r, canCost) {
  const p = {
    id: r.id, name: r.name, brand: r.brand, category: r.category, size: r.size,
    bottlesPerPack: r.bottles_per_pack, bottlesPerCarton: r.bottles_per_carton, bottlesPerCrate: r.bottles_per_crate,
    costPrice: canCost ? r.cost_price : null, retailPrice: r.retail_price, wholesalePrice: r.wholesale_price,
    lowStockAlert: r.low_stock_alert, stockQty: r.stock_qty, isActive: !!r.is_active, createdAt: r.created_at, updatedAt: r.updated_at,
  };
  p.stockText = units.breakdown(p, p.stockQty).text;
  p.status = p.stockQty === 0 ? 'out' : (p.lowStockAlert > 0 && p.stockQty <= p.lowStockAlert ? 'low' : 'ok');
  return p;
}
const displayName = (p) => [p.name, p.brand && `(${p.brand})`, p.size].filter(Boolean).join(' ');

// ---------- the ONE place stock changes ----------
/** Used by adjustments now and by billing / purchases / returns in later stages. Call inside or outside db.tx. */
function applyStock(db, { productId, change, type, refType, refId, note, userId, unitCost }) {
  if (!Number.isInteger(change) || change === 0) throw bad('Quantity must be a whole number, not zero.');
  return db.tx(() => {
    const p = db.get('SELECT id, name, brand, size, stock_qty FROM products WHERE id = ?', productId);
    if (!p) throw notFound('Product not found.');
    const next = p.stock_qty + change;
    if (next < 0) {
      throw bad(`Not enough stock for ${displayName(p)}: ${p.stock_qty} in stock, ${-change} needed.`, { qty: true });
    }
    db.run(`UPDATE products SET stock_qty = ?, updated_at = ${NOW} WHERE id = ?`, next, productId);
    const movementId = db.run(
      `INSERT INTO stock_movements(product_id,movement_type,qty_change,balance_after,unit_cost,ref_type,ref_id,note,user_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      productId, type, change, next, unitCost ?? null, refType || null, refId == null ? null : String(refId), note || null, userId || null).lastInsertRowid;
    return { movementId, balance: next };
  });
}

function recordPrices(db, id, f, userId) {
  db.run('INSERT INTO product_price_history(product_id,cost_price,retail_price,wholesale_price,user_id) VALUES (?,?,?,?,?)',
    id, f.costPrice, f.retailPrice, f.wholesalePrice, userId || null);
}

function dupCheck(db, f, exceptId) {
  const d = db.get(`SELECT id FROM products WHERE name = ? COLLATE NOCASE AND brand = ? COLLATE NOCASE AND size = ? COLLATE NOCASE AND id <> ?`,
    f.name, f.brand, f.size, exceptId || 0);
  if (d) throw bad('A product with this name, brand and size already exists.', { name: true });
}

function createProduct(db, user, input) {
  const f = parseProduct(input);
  const openingPacks = whole(input.openingPacks ?? 0, 'Opening stock (packs)', { min: 0, max: 1000000, field: 'openingPacks' });
  dupCheck(db, f);
  return db.tx(() => {
    const id = db.run(
      `INSERT INTO products(name,brand,category,size,bottles_per_pack,bottles_per_carton,bottles_per_crate,cost_price,retail_price,wholesale_price,low_stock_alert)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      f.name, f.brand, f.category, f.size, f.bottlesPerPack, f.bottlesPerCarton, f.bottlesPerCrate, f.costPrice, f.retailPrice, f.wholesalePrice, f.lowStockAlert).lastInsertRowid;
    recordPrices(db, id, f, user.id);
    const openingBottles = openingPacks * f.bottlesPerPack;
    if (openingBottles > 0) {
      applyStock(db, { productId: id, change: openingBottles, type: 'opening', note: `Opening stock: ${openingPacks} packs x ${f.bottlesPerPack}`, userId: user.id, unitCost: f.costPrice });
    }
    audit(db, user, 'product.created', 'product', id, { name: f.name, openingBottles });
    return { id, openingBottles };
  });
}

function updateProduct(db, user, id, input) {
  const cur = db.get('SELECT * FROM products WHERE id = ?', id);
  if (!cur) throw notFound('Product not found.');
  const f = parseProduct(input);
  dupCheck(db, f, id);
  db.tx(() => {
    db.run(`UPDATE products SET name=?,brand=?,category=?,size=?,bottles_per_pack=?,bottles_per_carton=?,bottles_per_crate=?,
            cost_price=?,retail_price=?,wholesale_price=?,low_stock_alert=?,updated_at=${NOW} WHERE id=?`,
      f.name, f.brand, f.category, f.size, f.bottlesPerPack, f.bottlesPerCarton, f.bottlesPerCrate, f.costPrice, f.retailPrice, f.wholesalePrice, f.lowStockAlert, id);
    if (cur.cost_price !== f.costPrice || cur.retail_price !== f.retailPrice || cur.wholesale_price !== f.wholesalePrice) recordPrices(db, id, f, user.id);
    const changed = {};
    for (const [k, a, b] of [['name', cur.name, f.name], ['cost', cur.cost_price, f.costPrice], ['retail', cur.retail_price, f.retailPrice], ['wholesale', cur.wholesale_price, f.wholesalePrice],
      ['perPack', cur.bottles_per_pack, f.bottlesPerPack], ['perCarton', cur.bottles_per_carton, f.bottlesPerCarton], ['perCrate', cur.bottles_per_crate, f.bottlesPerCrate], ['alert', cur.low_stock_alert, f.lowStockAlert]]) {
      if (a !== b) changed[k] = [a, b];
    }
    audit(db, user, 'product.updated', 'product', id, changed);
  });
}

function setActive(db, user, id, active) {
  const cur = db.get('SELECT id, is_active FROM products WHERE id = ?', id);
  if (!cur) throw notFound('Product not found.');
  db.tx(() => {
    db.run(`UPDATE products SET is_active = ?, updated_at = ${NOW} WHERE id = ?`, active ? 1 : 0, id);
    audit(db, user, active ? 'product.activated' : 'product.deactivated', 'product', id);
  });
}

/**
 * Manual stock changes.
 *  mode: 'add' | 'remove' | 'damage' | 'count'   (count = physical stock count; sets stock to the counted quantity)
 */
function adjustStock(db, user, { productId, mode, qty, unit = 'piece', note }) {
  const p0 = db.get('SELECT * FROM products WHERE id = ?', productId);
  if (!p0) throw notFound('Product not found.');
  const p = toApi(p0, true);
  if (!['add', 'remove', 'damage', 'count'].includes(mode)) throw bad('Choose what you want to do.');
  const reason = text(note, 'Reason', 200, { required: true, field: 'note' });
  if (reason.length < 3) throw bad('Please write a short reason.', { note: true });
  const n = whole(qty, 'Quantity', { min: mode === 'count' ? 0 : 1, max: 10000000, field: 'qty' });
  if (!['piece', 'pack', 'carton', 'crate'].includes(unit)) throw bad('Choose a unit.', { unit: true });
  if (units.sizeOf(p, unit) == null) throw bad(`This product has no ${unit} size set.`, { unit: true });
  const base = units.toBase(p, unit, n);
  let change, type;
  if (mode === 'add') { change = base; type = 'adjustment'; }
  else if (mode === 'remove') { change = -base; type = 'adjustment'; }
  else if (mode === 'damage') { change = -base; type = 'damage'; }
  else { change = base - p.stockQty; type = 'audit'; if (change === 0) throw bad('The counted quantity matches the current stock. Nothing to change.', { qty: true }); }
  return db.tx(() => {
    const r = applyStock(db, { productId, change, type, note: reason, userId: user.id, unitCost: p0.cost_price });
    audit(db, user, 'stock.' + type, 'product', productId, { change, balance: r.balance, reason });
    return { change, balance: r.balance, stockText: units.breakdown(p, r.balance).text };
  });
}

// ---------- queries ----------
function listProducts(db, { search, category, lowOnly, includeInactive } = {}, canCost = false) {
  const where = []; const params = [];
  if (!includeInactive) where.push('is_active = 1');
  if (search) { const s = `%${String(search).trim()}%`; where.push('(name LIKE ? OR brand LIKE ? OR category LIKE ? OR size LIKE ?)'); params.push(s, s, s, s); }
  if (category) { where.push('category = ? COLLATE NOCASE'); params.push(category); }
  const rows = db.all(`SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name COLLATE NOCASE, brand COLLATE NOCASE, size`, ...params);
  let out = rows.map((r) => toApi(r, canCost));
  if (lowOnly) out = out.filter((p) => p.status !== 'ok');
  return out;
}

function getProduct(db, id, canCost, { movementLimit = 200 } = {}) {
  const r = db.get('SELECT * FROM products WHERE id = ?', id);
  if (!r) throw notFound('Product not found.');
  const movements = db.all(
    `SELECT m.id, m.ts, m.movement_type AS type, m.qty_change AS change, m.balance_after AS balance, m.note, m.ref_type AS refType, m.ref_id AS refId, u.username AS user
       FROM stock_movements m LEFT JOIN users u ON u.id = m.user_id WHERE m.product_id = ? ORDER BY m.id DESC LIMIT ?`, id, movementLimit)
    .map((m) => ({ ...m, label: MOVEMENT_LABEL[m.type] }));
  const prices = canCost ? db.all('SELECT ts, cost_price AS costPrice, retail_price AS retailPrice, wholesale_price AS wholesalePrice FROM product_price_history WHERE product_id = ? ORDER BY id DESC LIMIT 50', id) : [];
  return { product: toApi(r, canCost), movements, priceHistory: prices };
}

function lowStock(db, limit = 8) {
  return db.all(`SELECT * FROM products WHERE is_active = 1 AND low_stock_alert > 0 AND stock_qty <= low_stock_alert ORDER BY (stock_qty * 1.0 / low_stock_alert), name LIMIT ?`, limit)
    .map((r) => { const p = toApi(r, false); return { id: p.id, name: displayName(p), stockText: p.stockText, stockQty: p.stockQty, alert: p.lowStockAlert, status: p.status }; });
}
const stockValue = (db) => db.get('SELECT COALESCE(SUM(stock_qty * cost_price),0) v FROM products WHERE is_active = 1').v;

function lookups(db) {
  const col = (c) => db.all(`SELECT DISTINCT ${c} v FROM products WHERE ${c} <> '' ORDER BY ${c} COLLATE NOCASE`).map((r) => r.v);
  return { categories: col('category'), brands: col('brand'), sizes: col('size') };
}

/** Invariant check used by the integrity scan: cached stock must equal the sum of its movements. */
function stockMismatches(db) {
  return db.all(`SELECT p.id, p.name, p.stock_qty AS cached, COALESCE(SUM(m.qty_change),0) AS ledger
                   FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id GROUP BY p.id HAVING cached <> ledger`);
}

module.exports = { createProduct, updateProduct, setActive, adjustStock, applyStock, listProducts, getProduct, lowStock, stockValue, lookups, stockMismatches, displayName, MOVEMENT_LABEL };
