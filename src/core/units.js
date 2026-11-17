'use strict';
/**
 * Unit conversions. Stock is stored in single bottles; this converts to/from packs, cartons and crates.
 * `p` is an API-shaped product: { bottlesPerPack, bottlesPerCarton|null, bottlesPerCrate|null }.
 * (A copy for the UI lives in src/renderer/js/units.js; tests keep the two identical.)
 */
const NAMES = { crate: ['crate', 'crates'], carton: ['carton', 'cartons'], pack: ['pack', 'packs'], piece: ['bottle', 'bottles'] };
const unitLabel = (unit, n) => NAMES[unit][n === 1 ? 0 : 1];

function sizeOf(p, unit) {
  const s = unit === 'piece' ? 1 : unit === 'pack' ? p.bottlesPerPack : unit === 'carton' ? p.bottlesPerCarton : unit === 'crate' ? p.bottlesPerCrate : undefined;
  if (s === undefined) throw new Error('Unknown unit: ' + unit);
  return s == null ? null : s;
}
/** Configured packaging units bigger than one bottle, largest first. */
function packagingUnits(p) {
  const seen = new Set(); const out = [];
  for (const unit of ['crate', 'carton', 'pack']) {
    const size = sizeOf(p, unit);
    if (size && size > 1 && !seen.has(size)) { seen.add(size); out.push({ unit, size }); }
  }
  return out.sort((a, b) => b.size - a.size);
}
function toBase(p, unit, qty) {
  const size = sizeOf(p, unit);
  if (size == null) throw new Error(`This product has no ${unit} size set.`);
  if (!Number.isInteger(qty)) throw new Error('Quantity must be a whole number.');
  return qty * size;
}
/** 600 bottles of a 12-pack => { parts:[{unit:'pack',qty:50,size:12}], pieces:0, text:'50 packs' } */
function breakdown(p, totalBottles) {
  let left = totalBottles; const parts = [];
  for (const { unit, size } of packagingUnits(p)) {
    const q = Math.floor(left / size);
    if (q > 0) { parts.push({ unit, qty: q, size }); left -= q * size; }
  }
  const bits = parts.map((x) => `${x.qty} ${unitLabel(x.unit, x.qty)}`);
  if (left > 0 || bits.length === 0) bits.push(`${left} ${unitLabel('piece', left)}`);
  return { parts, pieces: left, text: bits.join(', ') };
}
/** Price of each unit from a per-bottle price (paise). null where the unit isn't configured. */
function unitPrices(p, perBottle) {
  const f = (unit) => { const s = sizeOf(p, unit); return s == null ? null : s * perBottle; };
  return { piece: perBottle, pack: f('pack'), carton: f('carton'), crate: f('crate') };
}
module.exports = { sizeOf, packagingUnits, toBase, breakdown, unitPrices, unitLabel };
