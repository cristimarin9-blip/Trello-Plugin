import { initIframe, fit } from '../lib/iframe.js';
import { cardFeatures } from '../lib/features.js';
import { el, clear, byId } from '../lib/util.js';
import company from '../tabs/company.js';
import crm from '../tabs/crm.js';
import subtasks from '../tabs/subtasks.js';
import checklist from '../tabs/checklist.js';
import history from '../tabs/history.js';
import viewers from '../tabs/viewers.js';
import features from '../tabs/features.js';

// Tab ids match feature ids in lib/features.js; `always` tabs ignore the switches.
const TABS = [company, crm, subtasks, checklist, history, viewers, features];
const t = initIframe();
const app = byId('app');
const LAST_TAB_KEY = 'practice-powerup:last-tab';

let activeId = (() => { try { return localStorage.getItem(LAST_TAB_KEY); } catch { return null; } })();
let visible = TABS;

const nav = el('div', { class: 'tabs' });
const body = el('div', { id: 'tab-body' });
app.append(nav, body);

function renderNav() {
  clear(nav);
  for (const tab of visible) {
    nav.append(el('button', { class: tab.id === activeId ? 'active' : '', onclick: () => select(tab.id) }, tab.label));
  }
}

async function renderBody() {
  const tab = visible.find((x) => x.id === activeId) || visible[0];
  clear(body);
  const root = el('div');
  body.append(root);
  try {
    await tab.render(t, root, { refresh: load, fit: () => fit(t, 120) });
  } catch (err) {
    root.append(el('p', { class: 'status error' }, err.message || String(err)));
  }
  fit(t, 120);
}

function select(id) {
  activeId = id;
  try { localStorage.setItem(LAST_TAB_KEY, id); } catch { /* ignore */ }
  renderNav();
  renderBody();
}

async function load() {
  const { enabled } = await cardFeatures(t);
  visible = TABS.filter((tab) => tab.always || enabled[tab.id]);
  if (!visible.some((tab) => tab.id === activeId)) activeId = visible[0].id;
  renderNav();
  await renderBody();
}

// t.render re-runs when pluginData on the card/board changes (e.g. another member edits it).
t.render(load);
