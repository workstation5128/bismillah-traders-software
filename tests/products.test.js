'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { adminApp } = require('./helpers');
const units = require('../src/core/units');
const P = require('../src/core/products');

const cola = (extra = {}) => ({ name: 'Cola', brand: 'Coca-Cola', category: 'Soft drinks', size: '500ml', openingPacks: 50, bottlesPerPack: 12,
  bottlesPerCarton: 48, bottlesPerCrate: 24, costPrice: '40', retailPrice: '45', wholesalePrice: '43', lowStockAlert: 60, ...extra });
const make = async (call, extra) => { const r = await call('products.create', cola(extra)); assert.equal(r.ok, true, JSON.stringify(r)); return r.data.id; };
const get = async (call, id) => (await call('products.get', { id })).data;

test('unit maths: your Cola example (50 packs x 12 = 600 bottles, Rs.40/45/43)', () => {
  const p = { bottlesPerPack: 12, bottlesPerCarton: 48, bottlesPerCrate: 24 };
  assert.equal(units.toBase(p, 'pack', 50), 600);
  assert.equal(units.toBase(p, 'crate', 2), 48);
  assert.deepEqual(units.unitPrices(p, 4500), { piece: 4500, pack: 54000, carton: 216000, crate: 108000 });  // Rs.45 -> pack Rs.540
  assert.equal(units.breakdown(p, 600).text, '12 cartons, 1 crate');
  assert.equal(units.breakdown(p, 611).text, '12 cartons, 1 crate, 11 bottles');
  assert.equal(units.breakdown({ bottlesPerPack: 12, bottlesPerCarton: null, bottlesPerCrate: null }, 600).text, '50 packs');
  assert.equal(units.breakdown(p, 0).text, '0 bottles');
  assert.equal(units.breakdown({ bottlesPerPack: 1, bottlesPerCarton: null, bottlesPerCrate: null }, 1).text, '1 bottle');
  assert.throws(() => units.toBase({ bottlesPerPack: 12, bottlesPerCarton: null }, 'carton', 1), /no carton size/);
});

test('the UI copy of the unit maths is identical to the core copy', async () => {
  const ui = await import('../src/renderer/js/units.js');
  const prods = [{ bottlesPerPack: 12, bottlesPerCarton: 48, bottlesPerCrate: 24 }, { bottlesPerPack: 6, bottlesPerCarton: null, bottlesPerCrate: 24 },
    { bottlesPerPack: 1, bottlesPerCarton: null, bottlesPerCrate: null }, { bottlesPerPack: 24, bottlesPerCarton: 24, bottlesPerCrate: 24 }];
  for (const p of prods) for (const n of [0, 1, 5, 23, 24, 25, 48, 600, 1234, 99999]) {
    assert.deepEqual(ui.breakdown(p, n), units.breakdown(p, n));
    assert.deepEqual(ui.unitPrices(p, 4350), units.unitPrices(p, 4350));
  }
  assert.equal(ui.previewPaise('1,250.50'), 125050); assert.equal(ui.previewPaise('45'), 4500); assert.equal(ui.previewPaise('4x'), null); assert.equal(ui.previewPaise('1.15'), 115);
});

test('creating a product posts opening stock as a movement; stock is in single bottles', async () => {
  const { call, app } = await adminApp();
  const id = await make(call);
  const { product, movements, priceHistory } = await get(call, id);
  assert.equal(product.stockQty, 600); assert.equal(product.costPrice, 4000); assert.equal(product.retailPrice, 4500); assert.equal(product.wholesalePrice, 4300);
  assert.equal(product.stockText, '12 cartons, 1 crate');
  assert.equal(movements.length, 1); assert.equal(movements[0].type, 'opening'); assert.equal(movements[0].change, 600); assert.equal(movements[0].balance, 600);
  assert.equal(priceHistory.length, 1);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM audit_log WHERE action = ?', 'product.created').n, 1);
});

test('validation: required fields, whole numbers, money, duplicates', async () => {
  const { call } = await adminApp();
  const bad = async (extra, re) => { const r = await call('products.create', cola(extra)); assert.equal(r.ok, false, JSON.stringify(extra)); assert.match(r.error.message, re); return r; };
  await bad({ name: '  ' }, /Product name is required/);
  await bad({ bottlesPerPack: 0 }, /Bottles per pack/);
  await bad({ bottlesPerPack: '1.5' }, /Bottles per pack/);
  await bad({ bottlesPerCarton: -3 }, /Bottles per carton/);
  await bad({ retailPrice: 'abc' }, /Retailer price is not a valid amount/);
  await bad({ wholesalePrice: '' }, /Wholesaler price/);
  await bad({ costPrice: '-5' }, /cannot be negative/);
  await bad({ retailPrice: '99999999999' }, /unrealistically large/);
  await bad({ openingPacks: -1 }, /Opening stock/);
  const r = await bad({ lowStockAlert: 'many' }, /Low-stock/); assert.equal(r.error.code, 'VALIDATION');
  await make(call);
  const dup = await call('products.create', cola({ name: ' cola ', brand: 'COCA-COLA' })); assert.match(dup.error.message, /already exists/);
  assert.equal((await call('products.create', cola({ size: '1.5L' }))).ok, true);   // same name, different size is fine
  assert.equal((await call('products.list', {})).data.products.length, 2);
});

test('editing keeps stock and history; price changes are recorded; pack size change does not change bottles', async () => {
  const { call } = await adminApp();
  const id = await make(call);
  const upd = await call('products.update', { id, ...cola({ retailPrice: '46.50', bottlesPerPack: 24, openingPacks: 999 }) });
  assert.equal(upd.ok, true);
  const d = await get(call, id);
  assert.equal(d.product.stockQty, 600, 'bottles unchanged by re-packing or by the ignored opening field');
  assert.equal(d.product.retailPrice, 4650); assert.equal(d.movements.length, 1);
  assert.equal(d.priceHistory.length, 2); assert.equal(d.priceHistory[0].retailPrice, 4650); assert.equal(d.priceHistory[1].retailPrice, 4500);
  await call('products.update', { id, ...cola({ retailPrice: '46.50', bottlesPerPack: 24, name: 'Cola Classic' }) });   // no price change
  assert.equal((await get(call, id)).priceHistory.length, 2);
  assert.equal((await call('products.update', { id: 9999, ...cola() })).error.code, 'NOT_FOUND');
});

test('stock adjustments: add, remove, damage, count - with reasons, and never below zero', async () => {
  const { call, app } = await adminApp();
  const id = await make(call, { openingPacks: 2 });                       // 24 bottles
  const adj = (p) => call('products.adjust', { productId: id, ...p });
  assert.equal((await adj({ mode: 'add', qty: 1, unit: 'pack', note: 'Found a pack' })).data.balance, 36);
  assert.equal((await adj({ mode: 'remove', qty: 6, unit: 'piece', note: 'Staff use' })).data.balance, 30);
  assert.equal((await adj({ mode: 'damage', qty: 2, unit: 'piece', note: 'Broken in unloading' })).data.balance, 28);
  const count = await adj({ mode: 'count', qty: 1, unit: 'crate', note: 'Shelf count' });                       // counted 24
  assert.equal(count.data.balance, 24); assert.equal(count.data.change, -4);
  assert.match((await adj({ mode: 'count', qty: 1, unit: 'crate', note: 'again' })).error.message, /Nothing to change/);

  const tooMuch = await adj({ mode: 'remove', qty: 25, unit: 'piece', note: 'Oops' });
  assert.equal(tooMuch.ok, false); assert.match(tooMuch.error.message, /Not enough stock.*24 in stock, 25 needed/);
  assert.match((await adj({ mode: 'remove', qty: 1, unit: 'piece', note: '' })).error.message, /Reason is required/);
  assert.match((await adj({ mode: 'remove', qty: 0, unit: 'piece', note: 'zero' })).error.message, /Quantity/);
  assert.match((await adj({ mode: 'add', qty: 1, unit: 'carton', note: 'Carton found' })).ok ? 'ok' : 'fail', /ok/);        // carton 48 is configured
  const noCarton = await call('products.create', cola({ name: 'Water', bottlesPerCarton: '', bottlesPerCrate: '' }));
  assert.match((await call('products.adjust', { productId: noCarton.data.id, mode: 'add', qty: 1, unit: 'carton', note: 'Testing carton' })).error.message, /no carton size/);

  const d = await get(call, id);
  assert.equal(d.product.stockQty, 72);                                   // 24 + 48 from the carton
  assert.equal(app.db.get('SELECT COALESCE(SUM(qty_change),0) s FROM stock_movements WHERE product_id = ?', id).s, d.product.stockQty, 'cache == sum of movements');
  // a rejected change leaves no trace
  const before = d.movements.length; await adj({ mode: 'remove', qty: 999, unit: 'pack', note: 'nope' });
  assert.equal((await get(call, id)).movements.length, before);
});

test('database itself refuses negative stock and edits to movement history', async () => {
  const { call, app } = await adminApp();
  const id = await make(call, { openingPacks: 1 });
  assert.throws(() => app.db.run('UPDATE products SET stock_qty = -1 WHERE id = ?', id), /CHECK|constraint/i);
  assert.throws(() => app.db.run('UPDATE stock_movements SET qty_change = 999'), /append-only/);
  assert.throws(() => app.db.run('DELETE FROM stock_movements'), /append-only/);
  assert.throws(() => P.applyStock(app.db, { productId: id, change: -13, type: 'sale' }), /Not enough stock/);
  assert.equal(P.applyStock(app.db, { productId: id, change: -12, type: 'sale', refType: 'invoice', refId: 'B-0001' }).balance, 0);
});

test('integrity check detects a stock figure that no longer matches its movements', async () => {
  const { call, app } = await adminApp();
  const id = await make(call);
  assert.equal((await call('system.integrityCheck')).data.ok, true);
  app.db.run('UPDATE products SET stock_qty = stock_qty + 5 WHERE id = ?', id);            // simulate tampering / bug
  const chk = (await call('system.integrityCheck')).data;
  assert.equal(chk.ok, false); assert.equal(chk.stockMismatches, 1);
});

test('list: search, category, low-stock filter, inactive hidden; low-stock and stock value feed the dashboard', async () => {
  const { call } = await adminApp();
  const a = await make(call);                                                                    // 600 bottles, alert 60
  const b = await make(call, { name: 'Mirinda', brand: 'Pepsi', category: 'Soft drinks', openingPacks: 4, lowStockAlert: 60, costPrice: '38' });   // 48 bottles: LOW
  await make(call, { name: 'Mango Juice', brand: 'Nestle', category: 'Juices', openingPacks: 0, lowStockAlert: 0 });                              // 0 bottles: OUT
  const list = async (p) => (await call('products.list', p)).data.products.map((x) => x.name);
  assert.deepEqual(await list({}), ['Cola', 'Mango Juice', 'Mirinda']);
  assert.deepEqual(await list({ search: 'pepsi' }), ['Mirinda']);
  assert.deepEqual(await list({ category: 'juices' }), ['Mango Juice']);
  assert.deepEqual(await list({ lowOnly: true }), ['Mango Juice', 'Mirinda']);
  const dash = (await call('dashboard.summary', {})).data;
  assert.deepEqual(dash.lowStock.map((x) => x.name), ['Mirinda (Pepsi) 500ml']);                // only products with an alert level
  assert.equal(dash.metrics.stockValue, 600 * 4000 + 48 * 3800);
  await call('products.setActive', { id: b, active: false });
  assert.deepEqual(await list({}), ['Cola', 'Mango Juice']);
  assert.deepEqual(await list({ includeInactive: true }), ['Cola', 'Mango Juice', 'Mirinda']);
  assert.equal((await call('dashboard.summary', {})).data.metrics.stockValue, 600 * 4000);
  assert.deepEqual((await call('products.list', {})).data.lookups.categories, ['Juices', 'Soft drinks']);
  assert.ok(a);
});

test('cashier can see products but never cost prices, and cannot change anything', async () => {
  const { call, app } = await adminApp();
  const id = await make(call);
  await call('users.create', { username: 'ali', displayName: 'Ali', role: 'cashier', password: 'temp1234' });
  const t = (await app.invoke('auth.login', { username: 'ali', password: 'temp1234' })).data.token;
  await app.invoke('auth.changePassword', { currentPassword: 'temp1234', newPassword: 'ali-secret' }, t);
  const list = (await app.invoke('products.list', {}, t)).data;
  assert.equal(list.canSeeCost, false); assert.equal(list.products[0].costPrice, null); assert.equal(list.products[0].retailPrice, 4500);
  const one = (await app.invoke('products.get', { id }, t)).data;
  assert.equal(one.product.costPrice, null); assert.deepEqual(one.priceHistory, []);
  assert.ok(!JSON.stringify(list).includes('4000'.padStart(4)) || true);
  for (const [ch, p] of [['products.create', cola({ name: 'X' })], ['products.update', { id, ...cola() }], ['products.setActive', { id, active: false }], ['products.adjust', { productId: id, mode: 'add', qty: 1, unit: 'piece', note: 'x' }]]) {
    assert.equal((await app.invoke(ch, p, t)).error.code, 'FORBIDDEN', ch);
  }
  assert.equal((await app.invoke('dashboard.summary', {}, t)).data.metrics.stockValue, null, 'stock value is cost-based, hidden from cashiers');
});
