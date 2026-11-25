// "Import": scan other Power-Ups' data on this board (e.g. Amazing Fields) through the
// Trello API, read-only, and keep a copy in Keel's database to set up an import from.
import { api } from '../lib/fields.js';
import { api as trello } from '../lib/trello-api.js';
import { clear, el, setStatus } from '../lib/util.js';

// Keel's own pluginData keys, used to tell Keel's data apart from other Power-Ups'.
const KEEL_KEYS = ['priority', 'company', 'views', 'parent', 'children', 'crm', 'schedule', 'features', 'routines', 'audit', 'settings', 'scheduleLog', 'fieldsRev', 'handover', 'printLayout'];

function parse(value) {
  try { return JSON.parse(value); } catch { return value; }
}

export function isKeel(entry) {
  const v = parse(entry.value);
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => KEEL_KEYS.includes(k));
}

export function drawImport(root, ctx) {
  const { t, boardId } = ctx;
  const out = el('div');
  const scanBtn = el('button', { class: 'primary', onclick: scan }, 'Scan this board');
  root.append(el('div', { class: 'import-box' },
    el('h3', {}, 'Bring fields over from another Power-Up'),
    el('p', {}, 'Look for data that other Power-Ups (such as Amazing Fields) keep on this board and its cards, so it can be copied into Keel\'s fields.'),
    el('p', { class: 'muted' }, el('small', {}, 'Scanning only reads. Nothing is changed in Trello or in the other Power-Up.')),
    scanBtn, out));

  async function scan() {
    scanBtn.disabled = true;
    clear(out);
    setStatus('Scanning…');
    try {
      const [boardData, cards] = await Promise.all([
        trello(t, 'GET', `/boards/${boardId}/pluginData`),
        trello(t, 'GET', `/boards/${boardId}/cards`, { fields: 'name', pluginData: 'true', filter: 'open' })
      ]);
      const plugins = new Map();
      const note = (entry, where) => {
        if (isKeel(entry)) return;
        const p = plugins.get(entry.idPlugin) || { id: entry.idPlugin, board: 0, cards: 0, chars: 0, keys: new Set() };
        p[where] += 1;
        p.chars += String(entry.value || '').length;
        const v = parse(entry.value);
        if (v && typeof v === 'object') Object.keys(v).slice(0, 8).forEach((k) => p.keys.add(k));
        plugins.set(entry.idPlugin, p);
      };
      (boardData || []).forEach((e) => note(e, 'board'));
      for (const c of cards || []) (c.pluginData || []).forEach((e) => note(e, 'cards'));
      setStatus('');
      if (!plugins.size) {
        out.append(el('p', { class: 'notice' }, 'No data from other Power-Ups was found. Trello may not share Amazing Fields\' data with other Power-Ups; the next option is Trello\'s board export (board menu → Print, export and share → Export as JSON).'));
        return;
      }
      out.append(el('h3', { style: 'margin-top:10px' }, 'Found'), el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Power-Up id'), el('th', {}, 'Board data'), el('th', {}, 'Cards with data'), el('th', {}, 'Size'), el('th', {}, 'Keys'))),
        el('tbody', {}, [...plugins.values()].map((p) => el('tr', {}, el('td', {}, el('code', {}, p.id)), el('td', {}, p.board ? 'yes' : '—'), el('td', {}, String(p.cards)),
          el('td', {}, `${Math.round(p.chars / 100) / 10} KB`), el('td', {}, el('small', {}, [...p.keys].slice(0, 8).join(', '))))))));
      const saveBtn = el('button', { class: 'primary', onclick: async () => {
        saveBtn.disabled = true;
        try {
          const keep = (list) => (list || []).filter((e) => !isKeel(e)).map((e) => ({ idPlugin: e.idPlugin, scope: e.scope, access: e.access, value: e.value }));
          const sample = { scannedAt: new Date().toISOString(), board: keep(boardData), cards: [] };
          let size = JSON.stringify(sample).length;
          for (const c of cards || []) {
            const entry = { id: c.id, name: c.name, pluginData: keep(c.pluginData) };
            if (!entry.pluginData.length) continue;
            const s = JSON.stringify(entry).length;
            if (size + s > 800000) break;
            sample.cards.push(entry);
            size += s;
          }
          await api.sample(t, boardId, sample);
          setStatus(`Saved a copy of ${sample.cards.length} cards' data for setting up the import`, 'success');
        } catch (err) {
          setStatus(err.message, 'error');
          saveBtn.disabled = false;
        }
      } }, 'Save a copy for import setup');
      out.append(el('p', {}, 'The import can be set up from a copy of this data. The copy is stored in Keel\'s own database (your Cloudflare account) and is only used for that.'), saveBtn);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      scanBtn.disabled = false;
    }
  }
}
