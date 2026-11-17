// UI copy of src/core/units.js (kept identical by tests/products.test.js). No DOM access here.
const NAMES = { crate: ['crate', 'crates'], carton: ['carton', 'cartons'], pack: ['pack', 'packs'], piece: ['bottle', 'bottles'] };
export const unitLabel = (unit, n) => NAMES[unit][n === 1 ? 0 : 1];

export function sizeOf(p, unit) {
  const s = unit === 'piece' ? 1 : unit === 'pack' ? p.bottlesPerPack : unit === 'carton' ? p.bottlesPerCarton : unit === 'crate' ? p.bottlesPerCrate : undefined;
  if (s === undefined) throw new Error('Unknown unit: ' + unit);
  return s == null ? null : s;
}
export function packagingUnits(p) {
  const seen = new Set(); const out = [];
  for (const unit of ['crate', 'carton', 'pack']) {
    const size = sizeOf(p, unit);
    if (size && size > 1 && !seen.has(size)) { seen.add(size); out.push({ unit, size }); }
  }
  return out.sort((a, b) => b.size - a.size);
}
export function toBase(p, unit, qty) {
  const size = sizeOf(p, unit);
  if (size == null) throw new Error(`This product has no ${unit} size set.`);
  if (!Number.isInteger(qty)) throw new Error('Quantity must be a whole number.');
  return qty * size;
}
export function breakdown(p, totalBottles) {
  let left = totalBottles; const parts = [];
  for (const { unit, size } of packagingUnits(p)) {
    const q = Math.floor(left / size);
    if (q > 0) { parts.push({ unit, qty: q, size }); left -= q * size; }
  }
  const bits = parts.map((x) => `${x.qty} ${unitLabel(x.unit, x.qty)}`);
  if (left > 0 || bits.length === 0) bits.push(`${left} ${unitLabel('piece', left)}`);
  return { parts, pieces: left, text: bits.join(', ') };
}
export function unitPrices(p, perBottle) {
  const f = (unit) => { const s = sizeOf(p, unit); return s == null ? null : s * perBottle; };
  return { piece: perBottle, pack: f('pack'), carton: f('carton'), crate: f('crate') };
}
/** Lenient parse for LIVE PREVIEW only ("45", "45.5", "1,250.50" -> paise, or null). The server does the real parsing. */
export function previewPaise(text) {
  const s = String(text ?? '').replace(/[,\s]/g, '').replace(/^rs\.?/i, '');
  return /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(parseFloat(s) * 100) : null;
}
