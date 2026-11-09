import { initIframe, fit } from '../lib/iframe.js';
import { byId, clear, el } from '../lib/util.js';
import subtasks from '../tabs/subtasks.js';

const t = initIframe();
const app = byId('app');

async function render() {
  clear(app);
  const root = el('div');
  app.append(root);
  try { await subtasks.render(t, root, { refresh: render, fit: () => fit(t) }); } catch (err) { root.append(el('p', { class: 'status error' }, err.message)); }
  fit(t, 120);
}
t.render(render);
