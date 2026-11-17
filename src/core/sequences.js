'use strict';
/** Allocate the next document number. MUST be called inside the same db.tx() as the document. */
function nextNumber(db, name) {
  const s = db.get('SELECT prefix, next_no, pad FROM doc_sequences WHERE name = ?', name);
  if (!s) throw new Error('Unknown document sequence: ' + name);
  db.run('UPDATE doc_sequences SET next_no = next_no + 1 WHERE name = ?', name);
  return s.prefix + String(s.next_no).padStart(s.pad, '0');
}
module.exports = { nextNumber };
