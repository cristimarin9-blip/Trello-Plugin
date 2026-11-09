// Feature: card priority (badge on the card front, detail badge, popup picker, list sorter).
import { KEYS } from '../config.js';
import { get, set, remove } from '../lib/storage.js';
import { boardDefaults, cardFeatures } from '../lib/features.js';

export const PRIORITIES = {
  urgent: { label: 'Urgent', color: 'red' },
  high: { label: 'High', color: 'orange' },
  medium: { label: 'Medium', color: 'yellow' },
  low: { label: 'Low', color: 'green' }
};
export const ORDER = ['urgent', 'high', 'medium', 'low'];

export function rank(priority) {
  const i = ORDER.indexOf(priority);
  return i === -1 ? ORDER.length : i;
}

export async function cardBadges(t, enabled) {
  if (enabled && !enabled.priority) return [];
  const p = await get(t, 'card', KEYS.priority);
  if (!p || !PRIORITIES[p]) return [];
  return [{ text: `⬆ ${PRIORITIES[p].label}`, color: PRIORITIES[p].color }];
}

export async function cardDetailBadges(t, enabled) {
  if (enabled && !enabled.priority) return [];
  const p = await get(t, 'card', KEYS.priority);
  return [{
    title: 'Priority',
    text: p && PRIORITIES[p] ? PRIORITIES[p].label : 'Set…',
    color: p && PRIORITIES[p] ? PRIORITIES[p].color : null,
    callback: pickPriority
  }];
}

export function pickPriority(t) {
  return t.popup({
    title: 'Set priority',
    items: [
      ...ORDER.map((key) => ({
        text: PRIORITIES[key].label,
        callback: async (tt) => {
          await set(tt, 'card', KEYS.priority, key);
          return tt.closePopup();
        }
      })),
      {
        text: 'Clear priority',
        callback: async (tt) => {
          await remove(tt, 'card', KEYS.priority);
          return tt.closePopup();
        }
      }
    ]
  });
}

export function listSorters() {
  return [{
    text: 'Priority (urgent first)',
    callback: async (t, opts) => {
      const defaults = await boardDefaults(t);
      const priorities = await Promise.all(opts.cards.map(async (c) => {
        const { enabled } = await cardFeatures(t, c.id, defaults);
        return enabled.priority ? get(t, c.id, KEYS.priority) : null;
      }));
      const sortedIds = opts.cards
        .map((c, i) => ({ id: c.id, r: rank(priorities[i]), pos: i }))
        .sort((a, b) => a.r - b.r || a.pos - b.pos)
        .map((c) => c.id);
      return { sortedIds };
    }
  }];
}
