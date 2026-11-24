// The Keel section on the card back. Trello gives each Power-Up one section per card,
// so instead of several Keel sections this one can show several tabs at once:
// "Several tabs" turns the tab bar into toggles and shows each chosen tab as a panel,
// one under another. Ctrl/Cmd/Shift-click a tab does the same in one step.
import { initIframe, fit } from '../lib/iframe.js';
import { cardFeatures } from '../lib/features.js';
import { el, clear, byId } from '../lib/util.js';
import company from '../tabs/company.js';
import fields from '../tabs/fields.js';
import crm from '../tabs/crm.js';
import subtasks from '../tabs/subtasks.js';
import checklist from '../tabs/checklist.js';
import history from '../tabs/history.js';
import viewers from '../tabs/viewers.js';
import features from '../tabs/features.js';

// Tab ids match feature ids in lib/features.js; `always` tabs ignore the switches.
const TABS = [company, fields, crm, subtasks, checklist, history, viewers, features];
const t = initIframe();
const app = byId('app');
const STATE_KEY = 'keel:card-panels';
const OLD_TAB_KEY = 'practice-powerup:last-tab';

// Per person (this browser), the same on every card: { several, open: [tabId], order: [tabId] }.
// `order` is the tab order chosen with the panels' ↑ ↓ buttons; it also orders the tab bar.
const state = (() => {
  const fallback = { several: false, open: [], order: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (saved && Array.isArray(saved.open)) return { ...fallback, ...saved };
    const old = localStorage.getItem(OLD_TAB_KEY);
    return old ? { ...fallback, open: [old] } : fallback;
  } catch { return fallback; }
})();
const persist = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* private mode */ } };

let visible = TABS;

const nav = el('div', { class: 'tabs card-tabs', role: 'tablist' });
const body = el('div', { id: 'tab-body' });
app.append(nav, body);

const isOpen = (id) => state.open.includes(id);
const openTabs = () => visible.filter((tab) => isOpen(tab.id));

/** Tabs in the person's chosen order; tabs not placed yet keep their usual position at the end. */
function sortTabs(list) {
  const rank = (id) => { const i = (state.order || []).indexOf(id); return i === -1 ? 1000 + TABS.findIndex((x) => x.id === id) : i; };
  return [...list].sort((a, b) => rank(a.id) - rank(b.id));
}

/** Move an open panel above (-1) or below (+1) the next open panel. */
function move(id, d) {
  const open = openTabs().map((tab) => tab.id);
  const i = open.indexOf(id);
  const neighbour = open[i + d];
  if (i === -1 || !neighbour) return;
  const order = sortTabs(TABS).map((tab) => tab.id).filter((x) => x !== id);
  const at = order.indexOf(neighbour);
  order.splice(d < 0 ? at : at + 1, 0, id);
  state.order = order;
  visible = sortTabs(visible);
  persist();
  renderNav();
  renderBody();
}

function toggle(id) {
  if (isOpen(id)) {
    if (state.open.length > 1) state.open = state.open.filter((x) => x !== id);
  } else {
    state.open = [...state.open, id];
  }
}

function choose(id, event) {
  const add = event && (event.ctrlKey || event.metaKey || event.shiftKey);
  if (add && !state.several) state.several = true;
  if (state.several) toggle(id);
  else state.open = [id];
  persist();
  renderNav();
  renderBody();
}

function setSeveral(on) {
  state.several = on;
  // Back to one tab: keep the first open one (in tab order).
  if (!on) state.open = [(openTabs()[0] || visible[0]).id];
  persist();
  renderNav();
  renderBody();
}

function renderNav() {
  clear(nav);
  for (const tab of visible) {
    const on = isOpen(tab.id);
    nav.append(el('button', {
      class: `tab${on ? ' active' : ''}${state.several ? ' multi' : ''}`,
      role: state.several ? 'switch' : 'tab',
      'aria-selected': state.several ? null : String(on),
      'aria-checked': state.several ? String(on) : null,
      title: state.several ? (on ? 'Click to hide this panel' : 'Click to show this panel too') : 'Ctrl/Cmd-click to show several tabs at once',
      onclick: (e) => choose(tab.id, e)
    }, state.several ? el('span', { class: 'tab-check', 'aria-hidden': 'true' }, on ? '☑' : '☐') : null, tab.label));
  }
  nav.append(el('span', { class: 'grow' }));
  nav.append(el('button', { class: `tab-tool${state.several ? ' on' : ''}`, 'aria-pressed': String(state.several), title: 'Show several Keel tabs at the same time',
    onclick: () => setSeveral(!state.several) }, state.several ? '✕ One tab' : '⊞ Several tabs'));
}

async function renderTab(tab, root) {
  try {
    await tab.render(t, root, { refresh: load, fit: () => fit(t, 120) });
  } catch (err) {
    root.append(el('p', { class: 'status error' }, err.message || String(err)));
  }
}

async function renderBody() {
  clear(body);
  const tabs = openTabs();
  if (!state.several || tabs.length < 2) {
    body.className = '';
    const root = el('div');
    body.append(root);
    await renderTab(tabs[0] || visible[0], root);
  } else {
    body.className = 'panels stack';
    await Promise.all(tabs.map((tab, i) => {
      const root = el('div', { class: 'panel-body' });
      body.append(el('section', { class: 'panel', 'aria-label': tab.label },
        el('header', {}, el('span', {}, tab.label),
          el('span', { class: 'panel-tools' },
            el('button', { class: 'icon', title: `Move ${tab.label} up`, 'aria-label': `Move ${tab.label} up`, disabled: i === 0, onclick: () => move(tab.id, -1) }, '↑'),
            el('button', { class: 'icon', title: `Move ${tab.label} down`, 'aria-label': `Move ${tab.label} down`, disabled: i === tabs.length - 1, onclick: () => move(tab.id, 1) }, '↓'),
            el('button', { class: 'icon', title: `Hide ${tab.label}`, 'aria-label': `Hide ${tab.label}`, onclick: () => choose(tab.id) }, '×'))),
        root));
      return renderTab(tab, root);
    }));
  }
  fit(t, 120);
}

async function load() {
  const { enabled } = await cardFeatures(t);
  visible = sortTabs(TABS.filter((tab) => tab.always || enabled[tab.id]));
  state.open = state.open.filter((id) => visible.some((tab) => tab.id === id));
  if (!state.open.length) state.open = [visible[0].id];
  if (!state.several) state.open = state.open.slice(0, 1);
  renderNav();
  await renderBody();
}

// t.render re-runs when pluginData on the card/board changes (e.g. another member edits it).
t.render(load);
