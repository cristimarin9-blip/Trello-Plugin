// Feature: scheduled card actions and temporary cards.
//
// A schedule is stored on the card: [{ id, at (ms), type, listId, listName, temp }].
// Types: 'archive' | 'move' | 'complete' | 'priority'.
//
// Power-Ups have no server, so due actions run from the browser of whoever has
// the board open with this Power-Up (throttled to once a minute per tab), using
// that member's authorised REST token. See docs/FEATURES.md for the trade-offs
// and the Butler / worker-cron alternatives.
import { KEYS } from '../config.js';
import { get, set } from '../lib/storage.js';
import { isAuthorized, cards as cardsApi } from '../lib/trello-api.js';
import { boardDefaults, cardFeatures } from '../lib/features.js';
import { daysUntil, formatDateTime, truncate } from '../lib/util.js';

const RUN_GAP_MS = 60 * 1000;
let lastRun = 0;
let running = false;

export function describe(item) {
  switch (item.type) {
    case 'archive': return item.temp ? 'Expire (archive)' : 'Archive';
    case 'move': return `Move to ${truncate(item.listName || 'list', 18)}`;
    case 'complete': return 'Mark due complete';
    case 'priority': return `Priority → ${item.value}`;
    default: return item.type;
  }
}

export async function cardBadges(t, enabled) {
  if (enabled && !enabled.schedule) return [];
  const schedule = (await get(t, 'card', KEYS.schedule)) || [];
  if (!schedule.length) return [];
  const next = [...schedule].sort((a, b) => a.at - b.at)[0];
  const days = daysUntil(new Date(next.at));
  const color = days <= 0 ? 'red' : days <= 2 ? 'orange' : next.temp ? 'pink' : 'light-gray';
  const when = Date.now() > next.at ? 'now' : formatDateTime(new Date(next.at));
  const label = next.temp ? `⌛ Temp · expires ${when}` : `⏰ ${describe(next)} · ${when}`;
  return [{ text: label + (schedule.length > 1 ? ` (+${schedule.length - 1})` : ''), color }];
}

export function cardButtons(iconUrl, enabled) {
  if (enabled && !enabled.schedule) return [];
  return [
    {
      icon: iconUrl,
      text: 'Schedule action',
      callback: (t) => t.popup({ title: 'Scheduled actions', url: './views/schedule.html', height: 320 })
    },
    {
      icon: iconUrl,
      text: 'Temporary card',
      callback: (t) => t.popup({ title: 'Temporary card', url: './views/schedule.html', args: { mode: 'temp' }, height: 260 })
    }
  ];
}

/** Execute a single schedule item. Returns true on success. */
export async function execute(t, cardId, item) {
  switch (item.type) {
    case 'archive': await cardsApi.update(t, cardId, { closed: true }); return true;
    case 'move': await cardsApi.update(t, cardId, { idList: item.listId, pos: 'top' }); return true;
    case 'complete': await cardsApi.update(t, cardId, { dueComplete: true }); return true;
    case 'priority': await set(t, cardId, KEYS.priority, item.value); return true;
    default: return false;
  }
}

/** Called on board load. Runs due actions for every card on the board. */
export async function runDueActions(t) {
  const now = Date.now();
  if (running || now - lastRun < RUN_GAP_MS) return;
  lastRun = now;
  running = true;
  try {
    if (!(await isAuthorized(t))) return;
    const boardCards = await t.cards('id', 'name');
    const schedules = await Promise.all(boardCards.map((c) => get(t, c.id, KEYS.schedule)));
    const log = (await get(t, 'board', KEYS.scheduleLog)) || [];
    const defaults = await boardDefaults(t);
    let changed = false;
    for (let i = 0; i < boardCards.length; i += 1) {
      const schedule = schedules[i];
      if (!schedule || !schedule.length) continue;
      // Cards with the feature switched off keep their schedule but nothing runs.
      const { enabled } = await cardFeatures(t, boardCards[i].id, defaults);
      if (!enabled.schedule) continue;
      const due = schedule.filter((s) => s.at <= now);
      if (!due.length) continue;
      const remaining = schedule.filter((s) => s.at > now);
      // Write the remaining schedule first so a second browser does not run the same action.
      await set(t, boardCards[i].id, KEYS.schedule, remaining);
      for (const item of due) {
        try {
          await execute(t, boardCards[i].id, item);
          log.unshift({ at: now, card: truncate(boardCards[i].name, 40), what: describe(item), ok: true });
        } catch (err) {
          log.unshift({ at: now, card: truncate(boardCards[i].name, 40), what: describe(item), ok: false, err: String(err.message || err).slice(0, 80) });
        }
        changed = true;
      }
    }
    if (changed) await set(t, 'board', KEYS.scheduleLog, log.slice(0, 15));
  } catch (err) {
    console.warn('runDueActions failed', err);
  } finally {
    running = false;
  }
}
