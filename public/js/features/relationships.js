// Feature: parent task card <-> subtask cards.
import { KEYS } from '../config.js';
import { get } from '../lib/storage.js';
import { truncate } from '../lib/util.js';

export async function cardBadges(t, enabled) {
  if (enabled && !enabled.subtasks) return [];
  const [parent, children] = await Promise.all([get(t, 'card', KEYS.parent), get(t, 'card', KEYS.children)]);
  const badges = [];
  if (parent && parent.id) badges.push({ text: `↑ ${truncate(parent.name, 22)}`, color: 'purple' });
  if (children && children.length) {
    const cards = await t.cards('id', 'dueComplete', 'closed');
    const byId = new Map(cards.map((c) => [c.id, c]));
    const live = children.filter((id) => byId.has(id));
    const done = live.filter((id) => byId.get(id).dueComplete).length;
    badges.push({ text: `☑ ${done}/${live.length} subtasks`, color: live.length && done === live.length ? 'green' : 'sky' });
  }
  return badges;
}

export async function cardDetailBadges(t, enabled) {
  if (enabled && !enabled.subtasks) return [];
  const parent = await get(t, 'card', KEYS.parent);
  if (!parent || !parent.id) return [];
  return [{
    title: 'Subtask of',
    text: truncate(parent.name, 30),
    color: 'purple',
    callback: (tt) => tt.showCard(parent.id)
  }];
}

export function cardButtons(iconUrl, enabled) {
  if (enabled && !enabled.subtasks) return [];
  return [{
    icon: iconUrl,
    text: 'Subtasks',
    callback: (t) => t.popup({ title: 'Subtasks & parent', url: './views/relationships.html', height: 260 })
  }];
}
