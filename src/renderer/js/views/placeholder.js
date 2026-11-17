import { h, icon } from '../ui.js';

export function renderPlaceholder(item) {
  return h('div', { class: 'card card-pad', style: 'max-width:720px' },
    h('div', { class: 'empty', style: 'justify-items:start;text-align:left;padding:8px 4px' },
      h('div', { class: 'ic-big' }, icon(item.icon, 24)),
      h('h2', { style: 'font-size:22px;color:var(--ink)' }, `${item.label} is not built yet`),
      h('p', { style: 'margin:0;max-width:56ch' }, item.about),
      h('p', { style: 'margin:6px 0 0' }, h('span', { class: 'chip gold' }, `Planned for Stage ${item.stage}`),
        ' It will use the same database as everything built so far, so nothing needs to be re-entered.')));
}
