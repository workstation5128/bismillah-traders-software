import { h, icon, toast, fmtBytes, fmtDateTime, formError } from '../ui.js';
import { api } from '../api.js';
import { state, refreshHealth } from '../shell.js';

const KIND = { manual: 'Manual', auto: 'Automatic', safety: 'Safety copy' };

export async function render() {
  const wrap = h('div', { style: 'max-width:960px' });
  async function draw(checkResult) {
    const { backups, backupDir } = await api('backup.list');
    const backBtn = h('button', { class: 'btn btn-gold btn-lg', onClick: async (e) => {
      e.currentTarget.disabled = true;
      try { const b = await api('backup.create'); toast(`Backup saved (${fmtBytes(b.size)}).`, 'ok'); await refreshHealth(); await draw(); }
      catch (err) { toast(err.message, 'bad'); e.currentTarget.disabled = false; }
    } }, icon('db'), 'Back up now');
    const chkBtn = h('button', { class: 'btn btn-ghost', onClick: async (e) => {
      e.currentTarget.disabled = true;
      try { await draw(await api('system.integrityCheck')); } catch (err) { toast(err.message, 'bad'); e.currentTarget.disabled = false; }
    } }, icon('shield'), 'Check database integrity');
    const result = checkResult && h('div', { class: 'card card-pad', style: 'margin-top:16px' },
      h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, h('span', { class: `chip ${checkResult.ok ? 'ok' : 'bad'}` }, checkResult.ok ? 'All checks passed' : 'Problems found'),
        h('span', { class: 'muted' }, `Storage ${checkResult.sqliteOk ? 'OK' : 'damaged'} \u00b7 ${checkResult.foreignKeyViolations} broken links \u00b7 accounts ${checkResult.journalBalanced ? 'balance' : 'DO NOT balance'}`)));
    wrap.replaceChildren(
      h('div', { class: 'card card-pad', style: 'display:flex;gap:20px;align-items:center;justify-content:space-between;flex-wrap:wrap' },
        h('div', null, h('h2', { style: 'font-size:22px' }, 'Keep a copy of your data'),
          h('p', { class: 'muted', style: 'margin:6px 0 0;max-width:58ch' }, 'A backup is a complete copy of your records. Copy backup files to a USB drive now and then; a copy on another device protects you if this computer fails.')),
        h('div', { style: 'display:flex;gap:10px' }, chkBtn, backBtn)),
      result,
      h('div', { class: 'card', style: 'margin-top:16px' }, h('div', { class: 'card-head' }, h('h3', null, 'Saved backups'), h('span', { class: 'muted', style: 'font-size:12.5px;word-break:break-all' }, backupDir)),
        backups.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Type', 'File', 'Size', 'Created'].map((t) => h('th', null, t)))),
          h('tbody', null, backups.map((b) => h('tr', null, h('td', null, h('span', { class: `chip ${b.kind === 'safety' ? 'gold' : ''}` }, KIND[b.kind])), h('td', { style: 'font-size:12.5px;word-break:break-all' }, b.name), h('td', null, fmtBytes(b.size)), h('td', { class: 'muted' }, fmtDateTime(b.modified, state.settings.date_format)))))))
          : h('div', { class: 'empty' }, h('div', { class: 'ic-big' }, icon('db', 24)), h('strong', null, 'No backups yet'), h('span', null, 'Press \u201cBack up now\u201d to make your first one.'))),
      h('p', { class: 'muted', style: 'margin-top:14px' }, 'Coming in Stage 8: restore from a backup, JSON export and import, scheduled automatic backups and Google Drive sync. A safety copy is always taken before any upgrade.'));
  }
  await draw(); return wrap;
}
