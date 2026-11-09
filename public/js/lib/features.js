// Feature switches.
//
// Three layers decide whether a feature is active on a card:
//   1. built-in default      (FEATURES[].default)
//   2. board defaults        (board/shared settings.defaults) — "on by default for cards"
//   3. per-card override     (card/shared features) — set from the card's Features tab or Bulk actions
// A card without its own override follows the board defaults, so changing the
// defaults later also changes every card that was never customised.
import { KEYS } from '../config.js';
import { get, set, remove, getSettings } from './storage.js';

export const FEATURES = [
  { id: 'priority', label: 'Priority', desc: 'Priority badge and picker', default: true },
  { id: 'company', label: 'Companies House', desc: 'Company lookup and filing-deadline badges', default: true },
  { id: 'crm', label: 'Client stages (CRM)', desc: 'Bookkeeping / accounts / VAT / PAYE tracker and badges', default: true },
  { id: 'subtasks', label: 'Subtasks & parent', desc: 'Task ↔ subtask links and progress badge', default: true },
  { id: 'checklist', label: 'Checklist sub-points', desc: 'Numbered sub-points and reordering tab', default: true },
  { id: 'history', label: 'Card history', desc: 'History tab (Trello actions)', default: true },
  { id: 'viewers', label: 'Who viewed', desc: 'Record and show who opened the card', default: true },
  { id: 'schedule', label: 'Scheduled actions & temporary cards', desc: 'Schedule / Temporary card buttons and badge', default: true },
  { id: 'routines', label: 'Apply routines', desc: '"Apply routine" card button', default: true }
];

export const FEATURE_IDS = FEATURES.map((f) => f.id);

export function builtInDefaults() {
  return Object.fromEntries(FEATURES.map((f) => [f.id, f.default]));
}

/** Board defaults: built-in defaults overlaid with settings.defaults. */
export async function boardDefaults(t) {
  const settings = await getSettings(t);
  const defaults = { ...builtInDefaults(), ...(settings.defaults || {}) };
  // Backwards compatibility with the older "record views" switch.
  if (settings.recordViews === false && !(settings.defaults && 'viewers' in settings.defaults)) defaults.viewers = false;
  return defaults;
}

/** Merge a card's override (if any) over the board defaults. */
export function resolve(defaults, override) {
  const effective = { ...defaults };
  if (override && typeof override === 'object') {
    for (const id of FEATURE_IDS) if (typeof override[id] === 'boolean') effective[id] = override[id];
  }
  return effective;
}

/**
 * Effective feature map for a card. `scope` is 'card' (current card) or a card id.
 * Pass `defaults` when calling for many cards to avoid re-reading the board settings.
 */
export async function cardFeatures(t, scope = 'card', defaults = null) {
  const [d, override] = await Promise.all([defaults || boardDefaults(t), get(t, scope, KEYS.features)]);
  return { enabled: resolve(d, override), custom: !!override, defaults: d };
}

export async function isEnabled(t, id, scope = 'card') {
  const { enabled } = await cardFeatures(t, scope);
  return !!enabled[id];
}

/** Store a complete override map on a card (or clear it with null to follow board defaults). */
export function setCardFeatures(t, scope, map) {
  if (!map) return remove(t, scope, KEYS.features);
  const clean = Object.fromEntries(FEATURE_IDS.map((id) => [id, !!map[id]]));
  return set(t, scope, KEYS.features, clean);
}

/** Flip one feature on a card, pinning the rest at their current effective values. */
export async function setCardFeature(t, scope, id, value, defaults = null) {
  const { enabled } = await cardFeatures(t, scope, defaults);
  return setCardFeatures(t, scope, { ...enabled, [id]: value });
}
