// Feature: who viewed a card, and board visits (activity audit).
// Trello has no "viewed" or "logged in" events. We record the nearest thing:
// when a member who has this Power-Up enabled opens a card (card-back-section
// renders) or loads the board (board-buttons renders). Writes are throttled so
// re-renders do not spam pluginData.
import { KEYS } from '../config.js';
import { get, set } from '../lib/storage.js';
import { isEnabled } from '../lib/features.js';

const CARD_VIEW_GAP_MS = 5 * 60 * 1000;   // one record per member per 5 minutes per card
const BOARD_VISIT_GAP_MS = 15 * 60 * 1000; // one record per member per 15 minutes
const MAX_VIEWERS = 25;
const MAX_LOG = 12;
const MAX_MEMBERS = 40;

const recent = new Map(); // in-memory throttle for this browser tab

function throttled(key, gap) {
  const now = Date.now();
  const last = recent.get(key) || 0;
  if (now - last < gap) return true;
  recent.set(key, now);
  return false;
}

export async function recordCardView(t, enabled) {
  try {
    const on = enabled ? enabled.viewers : await isEnabled(t, 'viewers');
    if (!on) return;
    const [member, card] = await Promise.all([t.member('id', 'fullName', 'username'), t.card('id')]);
    if (!member || !card || throttled(`card:${card.id}:${member.id}`, CARD_VIEW_GAP_MS)) return;
    const views = (await get(t, 'card', KEYS.views)) || { viewers: {}, total: 0 };
    const now = Date.now();
    const prev = views.viewers[member.id];
    if (prev && now - prev.at < CARD_VIEW_GAP_MS) return;
    views.viewers[member.id] = { n: member.fullName, u: member.username, at: now, c: (prev ? prev.c : 0) + 1 };
    views.total = (views.total || 0) + 1;
    // Keep only the most recent viewers so the card stays under Trello's 4 KB limit.
    const entries = Object.entries(views.viewers).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_VIEWERS);
    views.viewers = Object.fromEntries(entries);
    await set(t, 'card', KEYS.views, views);
  } catch (err) {
    console.warn('recordCardView failed', err);
  }
}

export async function recordBoardVisit(t) {
  try {
    const member = await t.member('id', 'fullName', 'username');
    if (!member || throttled(`board:${member.id}`, BOARD_VISIT_GAP_MS)) return;
    const audit = (await get(t, 'board', KEYS.audit)) || { members: {}, log: [] };
    const now = Date.now();
    const prev = audit.members[member.id];
    if (prev && now - prev.last < BOARD_VISIT_GAP_MS) return;
    audit.members[member.id] = { n: member.fullName, u: member.username, first: prev ? prev.first : now, last: now, v: (prev ? prev.v : 0) + 1 };
    audit.log = [{ m: member.id, at: now }, ...(audit.log || [])].slice(0, MAX_LOG);
    const entries = Object.entries(audit.members).sort((a, b) => b[1].last - a[1].last).slice(0, MAX_MEMBERS);
    audit.members = Object.fromEntries(entries);
    await set(t, 'board', KEYS.audit, audit);
  } catch (err) {
    console.warn('recordBoardVisit failed', err);
  }
}

export async function cardDetailBadges(t, enabled) {
  if (enabled && !enabled.viewers) return [];
  const views = await get(t, 'card', KEYS.views);
  if (!views || !views.total) return [];
  const viewers = Object.keys(views.viewers || {}).length;
  return [{ title: 'Views', text: `${views.total} (${viewers} ${viewers === 1 ? 'person' : 'people'})` }];
}
