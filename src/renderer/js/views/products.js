import { h, icon, openModal, field, formError, showFieldErrors, toast, fmtRs, fmtDateTime } from '../ui.js';
import { api, session } from '../api.js';
import { can } from '../nav.js';
import { state } from '../shell.js';
import { breakdown, unitPrices, previewPaise, packagingUnits, unitLabel, sizeOf } from '../units.js';

const STATUS = { ok: ['In stock', 'ok'], low: ['Low stock', 'gold'], out: ['Out of stock', 'bad'] };

export async function render() {
  const user = session.user;
  const canManage = can(user, 'products.manage'), canAdjust = can(user, 'inventory.adjust');
  const wrap = h('div');
  const q = { search: '', category: '', lowOnly: false, includeInactive: false };
  const search = h('input', { class: 'input grow', placeholder: 'Search by name, brand, size or category', 'aria-label': 'Search products' });
  const cat = h('select', { class: 'select', 'aria-label': 'Category' });
  const low = h('input', { type: 'checkbox' }); const inactive = h('input', { type: 'checkbox' });
  const body = h('div', { class: 'card table-wrap' });
  let data = { products: [], canSeeCost: false, lookups: { categories: [], brands: [], sizes: [] } };

  async function load() {
    data = await api('products.list', q);
    const cur = cat.value;
    cat.replaceChildren(h('option', { value: '' }, 'All categories'), data.lookups.categories.map((c) => h('option', { value: c, selected: c === (q.category || cur) }, c)));
    draw();
  }
  function draw() {
    const cost = data.canSeeCost;
    if (!data.products.length) {
      body.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'ic-big' }, icon('box', 24)),
        h('strong', null, q.search || q.category || q.lowOnly ? 'No products match' : 'No products yet'),
        h('span', null, q.search || q.category || q.lowOnly ? 'Try a different search or filter.' : 'Add your first product to start tracking stock and prices.'),
        canManage && !(q.search || q.category || q.lowOnly) ? h('button', { class: 'btn btn-primary', onClick: () => productForm(null) }, icon('plus', 18), 'Add product') : null));
      return;
    }
    body.replaceChildren(h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Product'), h('th', null, 'Stock'), h('th', { class: 'r' }, 'Retailer / bottle'), h('th', { class: 'r' }, 'Wholesaler / bottle'),
        cost ? h('th', { class: 'r' }, 'Cost / bottle') : null, h('th', null, 'Status'), h('th', { class: 'r' }, ''))),
      h('tbody', null, data.products.map((p) => {
        const [label, cls] = STATUS[p.status];
        return h('tr', { class: p.isActive ? '' : 'row-off' },
          h('td', null, h('strong', null, p.name), h('div', { class: 'muted', style: 'font-size:12.5px' }, [p.brand, p.size, p.category].filter(Boolean).join(' \u00b7 '))),
          h('td', null, h('div', { class: 'stock-main num' }, p.stockText), h('div', { class: 'stock-sub num' }, `${p.stockQty.toLocaleString('en-US')} bottles`)),
          h('td', { class: 'r num' }, fmtRs(p.retailPrice)), h('td', { class: 'r num' }, fmtRs(p.wholesalePrice)),
          cost ? h('td', { class: 'r num' }, fmtRs(p.costPrice)) : null,
          h('td', null, p.isActive ? h('span', { class: `chip ${cls}` }, label) : h('span', { class: 'chip off' }, 'Inactive')),
          h('td', { class: 'r', style: 'white-space:nowrap' },
            h('button', { class: 'btn btn-ghost btn-sm', onClick: () => historyModal(p.id) }, 'History'), ' ',
            canAdjust && p.isActive ? h('button', { class: 'btn btn-ghost btn-sm', onClick: () => adjustModal(p) }, 'Adjust stock') : null, ' ',
            canManage ? h('button', { class: 'btn btn-ghost btn-sm', onClick: () => productForm(p) }, 'Edit') : null));
      }))));
  }

  let t; search.oninput = () => { clearTimeout(t); t = setTimeout(() => { q.search = search.value.trim(); load(); }, 200); };
  cat.onchange = () => { q.category = cat.value; load(); };
  low.onchange = () => { q.lowOnly = low.checked; load(); }; inactive.onchange = () => { q.includeInactive = inactive.checked; load(); };

  // ---------------- add / edit ----------------
  function productForm(p) {
    const isNew = !p; const slot = h('div');
    const val = (k, d = '') => (p && p[k] != null ? String(p[k]) : d);
    const paise = (k) => (p && p[k] != null ? (p[k] / 100).toString() : '');
    const i = (name, v, extra = {}) => h('input', { class: 'input', name, value: v, autocomplete: 'off', ...extra });
    const dl = (id, list) => h('datalist', { id }, list.map((x) => h('option', { value: x })));
    const f = {
      name: i('name', val('name')), brand: i('brand', val('brand'), { list: 'dl-brand' }), category: i('category', val('category'), { list: 'dl-cat' }), size: i('size', val('size'), { placeholder: 'e.g. 500ml, 1.5L' }),
      openingPacks: i('openingPacks', '', { inputmode: 'numeric', placeholder: 'e.g. 50' }),
      perPack: i('bottlesPerPack', val('bottlesPerPack', '12'), { inputmode: 'numeric', placeholder: 'e.g. 12' }),
      perCarton: i('bottlesPerCarton', val('bottlesPerCarton'), { inputmode: 'numeric', placeholder: 'leave empty if not used' }),
      perCrate: i('bottlesPerCrate', val('bottlesPerCrate'), { inputmode: 'numeric', placeholder: 'leave empty if not used' }),
      cost: i('costPrice', paise('costPrice'), { inputmode: 'decimal', placeholder: 'what you pay' }),
      retail: i('retailPrice', paise('retailPrice'), { inputmode: 'decimal', placeholder: 'e.g. 45' }), wholesale: i('wholesalePrice', paise('wholesalePrice'), { inputmode: 'decimal', placeholder: 'e.g. 43' }),
      alert: i('lowStockAlert', val('lowStockAlert', state.settings.low_stock_default || '0'), { inputmode: 'numeric' }),
    };
    const canCost = data.canSeeCost;
    const live = h('div', { class: 'live-summary', 'aria-live': 'polite' }); const preview = h('div', { class: 'preview' }); const warn = h('div');
    const num = (el) => { const s = el.value.trim(); return /^\d+$/.test(s) ? Number(s) : null; };
    const item = (k, v, dim) => h('div', { class: 'ls-item' }, h('div', { class: 'k' }, k), h('div', { class: `v ${dim ? 'dim' : ''}` }, v));
    const n0 = (n) => n.toLocaleString('en-US');

    function refresh() {
      const perPack = num(f.perPack);
      const pk = { bottlesPerPack: perPack || 1, bottlesPerCarton: num(f.perCarton), bottlesPerCrate: num(f.perCrate) };
      const packs = num(f.openingPacks), retail = previewPaise(f.retail.value), wholesale = previewPaise(f.wholesale.value), cost = canCost ? previewPaise(f.cost.value) : null;
      // ---- live summary: the three things that matter ----
      const items = [];
      if (isNew) {
        const total = packs != null && perPack ? packs * perPack : null;
        items.push(total != null ? item('Stock you are adding', `${n0(packs)} packs \u00d7 ${n0(perPack)} bottles = ${n0(total)} bottles`) : item('Stock you are adding', 'Enter packs and bottles per pack', true));
      } else items.push(item('Stock right now', `${n0(p.stockQty)} bottles (${p.stockText})`));
      items.push(retail != null && perPack ? item('Retailer price', `${fmtRs(retail)} per bottle \u2192 ${fmtRs(retail * perPack)} per pack`) : item('Retailer price', 'Enter the price of one bottle', true));
      items.push(wholesale != null && perPack ? item('Wholesaler price', `${fmtRs(wholesale)} per bottle \u2192 ${fmtRs(wholesale * perPack)} per pack`) : item('Wholesaler price', 'Enter the price of one bottle', true));
      const bottles = isNew ? (packs != null && perPack ? packs * perPack : null) : p.stockQty;
      if (bottles != null && (cost != null || retail != null)) {
        items.push(canCost && cost != null ? item('Stock is worth (at cost)', fmtRs(bottles * cost)) : item('Stock is worth (at retail price)', retail != null ? fmtRs(bottles * retail) : '\u2014', retail == null));
      }
      live.replaceChildren(...items);
      // ---- full unit table ----
      const prices = { Cost: canCost ? cost : null, Retailer: retail, Wholesaler: wholesale };
      const rows = [['Bottle', 'piece', 1], ['Pack', 'pack', pk.bottlesPerPack], ['Carton', 'carton', pk.bottlesPerCarton], ['Crate', 'crate', pk.bottlesPerCrate]];
      preview.replaceChildren(h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Unit'), h('th', null, 'Bottles'), canCost ? h('th', null, 'Cost') : null, h('th', null, 'Retailer'), h('th', null, 'Wholesaler'))),
        h('tbody', null, rows.map(([label, unit, size]) => h('tr', null, h('td', null, label), h('td', size ? {} : { class: 'na' }, size ? String(size) : 'not set'),
          ...['Cost', 'Retailer', 'Wholesaler'].filter((k) => canCost || k !== 'Cost').map((k) => {
            const v = prices[k]; return size && v != null ? h('td', null, fmtRs(unitPrices(pk, v)[unit])) : h('td', { class: 'na' }, '\u2014'); }))))));
      const msgs = [];
      if (canCost && cost != null && retail != null && retail < cost) msgs.push('Retailer price is below cost price: you will lose money on every retail bottle.');
      if (canCost && cost != null && wholesale != null && wholesale < cost) msgs.push('Wholesaler price is below cost price.');
      if (retail != null && wholesale != null && wholesale > retail) msgs.push('Wholesaler price is higher than the retailer price. Check this is intended.');
      warn.replaceChildren(...msgs.map((m) => h('div', { class: 'note' }, m)));
    }
    Object.values(f).forEach((el) => el.addEventListener('input', refresh));

    const more = h('details', { class: 'more', open: !!(p && (p.bottlesPerCarton || p.bottlesPerCrate)) }, h('summary', null, 'Also sell by carton or crate? (optional)'),
      h('div', { class: 'grid-2' }, field('Bottles in one carton', f.perCarton), field('Bottles in one crate', f.perCrate)));

    const body = h('div', null, slot, dl('dl-brand', data.lookups.brands), dl('dl-cat', data.lookups.categories),
      h('div', { class: 'section-title' }, 'Product'),
      h('div', { class: 'grid-4' }, field('Product name', f.name), field('Brand', f.brand), field('Category', f.category), field('Size', f.size)),
      h('div', { class: 'section-title' }, '1. Packs and bottles'),
      h('div', { class: 'grid-3' },
        isNew ? field('How many packs do you have?', f.openingPacks, { hint: 'Your opening stock.' }) : field('Current stock', h('input', { class: 'input', value: `${p.stockQty} bottles`, disabled: true }), { hint: 'Change it with "Adjust stock".' }),
        field('How many bottles in one pack?', f.perPack), field('Low-stock alert (bottles)', f.alert, { hint: '0 turns the alert off.' })),
      more,
      h('div', { class: 'section-title' }, '2. Price of ONE bottle (Rs.)'),
      h('div', { class: 'grid-3' }, field('Retailer price', f.retail), field('Wholesaler price', f.wholesale), canCost ? field('Cost price (what you pay)', f.cost) : null),
      live, warn, preview);
    refresh();

    openModal({ title: isNew ? 'Add product' : `Edit ${p.name}`, className: 'wide', body, actions: [{ label: 'Cancel', value: false },
      { label: isNew ? 'Save product' : 'Save changes', kind: 'primary', closes: false, onClick: async (m) => {
        slot.replaceChildren(); showFieldErrors(body, null);
        const payload = { name: f.name.value, brand: f.brand.value, category: f.category.value, size: f.size.value, bottlesPerPack: f.perPack.value, bottlesPerCarton: f.perCarton.value,
          bottlesPerCrate: f.perCrate.value, retailPrice: f.retail.value, wholesalePrice: f.wholesale.value, lowStockAlert: f.alert.value,
          costPrice: canCost ? f.cost.value : (p ? String(p.costPrice / 100) : '0') };
        if (isNew) payload.openingPacks = f.openingPacks.value || '0'; else payload.id = p.id;
        try {
          const r = await api(isNew ? 'products.create' : 'products.update', payload);
          toast(isNew ? `Product saved${r.openingBottles ? ` with ${r.openingBottles.toLocaleString('en-US')} bottles in stock` : ''}.` : 'Product updated.', 'ok');
          m.close(true); await load();
        } catch (err) { showFieldErrors(body, err); slot.append(formError(err.message)); body.closest('.modal').scrollTop = 0; }
        return false;
      } }] });
  }

  // ---------------- adjust stock ----------------
  function adjustModal(p) {
    const slot = h('div');
    const mode = h('select', { class: 'select', name: 'mode' },
      h('option', { value: 'add' }, 'Add stock (found / received without a purchase)'), h('option', { value: 'remove' }, 'Remove stock'),
      h('option', { value: 'damage' }, 'Damaged or lost'), h('option', { value: 'count' }, 'Stock count (set to what is physically on the shelf)'));
    const unitsAvail = ['piece', ...packagingUnits(p).map((u) => u.unit).reverse()].filter((u, i, a) => a.indexOf(u) === i);
    const unit = h('select', { class: 'select', name: 'unit' }, unitsAvail.map((u) => h('option', { value: u }, u === 'piece' ? 'Bottles' : `${unitLabel(u, 2)[0].toUpperCase()}${unitLabel(u, 2).slice(1)} (${sizeOf(p, u)} bottles)`)));
    const qty = h('input', { class: 'input', name: 'qty', inputmode: 'numeric', autocomplete: 'off' });
    const note = h('input', { class: 'input', name: 'note', placeholder: 'Why? e.g. broken while unloading', autocomplete: 'off' });
    const result = h('div', { class: 'hint', style: 'margin:-6px 0 12px;font-weight:600' });
    const refresh = () => {
      const n = /^\d+$/.test(qty.value.trim()) ? Number(qty.value.trim()) : null; if (n == null) { result.textContent = ''; return; }
      const base = n * sizeOf(p, unit.value); const next = mode.value === 'add' ? p.stockQty + base : mode.value === 'count' ? base : p.stockQty - base;
      result.textContent = next < 0 ? `Not possible: only ${p.stockQty} bottles in stock.` : `Stock will become ${next.toLocaleString('en-US')} bottles (${breakdown(p, next).text}).`;
    };
    [mode, unit, qty].forEach((e) => e.addEventListener('input', refresh));
    const body = h('div', null, slot,
      h('div', { class: 'note', style: 'background:var(--navy-50);color:var(--ink-2)' }, `Now in stock: ${p.stockText} (${p.stockQty.toLocaleString('en-US')} bottles)`),
      field('What happened?', mode), h('div', { class: 'grid-2' }, field('Quantity', qty), field('Unit', unit)), result, field('Reason', note));
    openModal({ title: `Adjust stock: ${p.name} ${p.size}`.trim(), body, actions: [{ label: 'Cancel', value: false },
      { label: 'Save adjustment', kind: 'primary', closes: false, onClick: async (m) => {
        slot.replaceChildren(); showFieldErrors(body, null);
        try { const r = await api('products.adjust', { productId: p.id, mode: mode.value, qty: qty.value, unit: unit.value, note: note.value });
          toast(`Stock is now ${r.stockText}.`, 'ok'); m.close(true); await load(); }
        catch (err) { showFieldErrors(body, err); slot.append(formError(err.message)); }
        return false;
      } }] });
  }

  // ---------------- history ----------------
  async function historyModal(id) {
    const d = await api('products.get', { id }); const p = d.product;
    const eq = (u) => { const s = sizeOf(p, u); return s ? `${(p.stockQty / s).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unitLabel(u, 2)}` : null; };
    const equiv = ['pack', 'carton', 'crate'].map(eq).filter(Boolean).join(' \u00b7 ');
    const body = h('div', null,
      h('div', { class: 'note', style: 'background:var(--navy-50);color:var(--ink-2)' }, h('strong', null, `${p.stockQty.toLocaleString('en-US')} bottles`), ` = ${p.stockText}`, equiv ? h('div', { class: 'muted' }, `That is ${equiv}`) : null),
      h('div', { class: 'section-title' }, 'Stock movements'),
      h('div', { class: 'card table-wrap', style: 'max-height:340px' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['When', 'What', 'Change', 'Balance', 'Note', 'By'].map((x, i) => h('th', { class: i === 2 || i === 3 ? 'r' : '' }, x)))),
        h('tbody', null, d.movements.map((m) => h('tr', null, h('td', { class: 'muted', style: 'white-space:nowrap' }, fmtDateTime(m.ts, state.settings.date_format)), h('td', null, m.label),
          h('td', { class: `r num delta ${m.change > 0 ? 'pos' : 'neg'}` }, `${m.change > 0 ? '+' : ''}${m.change.toLocaleString('en-US')}`), h('td', { class: 'r num' }, m.balance.toLocaleString('en-US')),
          h('td', { class: 'muted' }, m.note || ''), h('td', { class: 'muted' }, m.user || '')))))),
      d.priceHistory.length ? [h('div', { class: 'section-title', style: 'margin-top:16px' }, 'Price history (per bottle)'),
        h('div', { class: 'card table-wrap', style: 'max-height:200px' }, h('table', { class: 'tbl' },
          h('thead', null, h('tr', null, ['Changed', 'Cost', 'Retailer', 'Wholesaler'].map((x, i) => h('th', { class: i ? 'r' : '' }, x)))),
          h('tbody', null, d.priceHistory.map((x) => h('tr', null, h('td', { class: 'muted' }, fmtDateTime(x.ts, state.settings.date_format)), h('td', { class: 'r num' }, fmtRs(x.costPrice)), h('td', { class: 'r num' }, fmtRs(x.retailPrice)), h('td', { class: 'r num' }, fmtRs(x.wholesalePrice)))))))] : null);
    openModal({ title: `${p.name} ${p.size}`.trim(), className: 'wide', body, actions: [
      ...(can(user, 'products.manage') ? [{ label: p.isActive ? 'Make inactive' : 'Make active again', kind: 'ghost', closes: false, onClick: async (m) => { await api('products.setActive', { id, active: !p.isActive }); toast(p.isActive ? 'Product hidden from lists and billing.' : 'Product is active again.', 'ok'); m.close(true); await load(); return false; } }] : []),
      { label: 'Close', kind: 'primary', value: true }] });
  }

  const head = h('div', { class: 'page-head' }, h('div', null, h('h2', { style: 'font-size:22px' }, 'Products and stock'),
    h('p', null, 'Stock is counted in single bottles. Prices are per bottle; pack, carton and crate prices are worked out for you.')),
    canManage ? h('button', { class: 'btn btn-gold', onClick: () => productForm(null) }, icon('plus', 18), 'Add product') : null);
  wrap.append(head, h('div', { class: 'toolbar' }, search, cat, h('label', { class: 'check' }, low, 'Low or out of stock only'), h('label', { class: 'check' }, inactive, 'Show inactive')), body);
  await load();
  return wrap;
}
