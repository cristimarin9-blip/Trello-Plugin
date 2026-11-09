// Power-Up connector. Trello loads public/index.html in a hidden iframe and this
// file registers every capability. Each capability must ALSO be ticked in the
// Trello admin portal (README step 5) or Trello will not call it.
import { APP_KEY, APP_NAME } from './config.js';
import { cardFeatures } from './lib/features.js';
import * as priority from './features/priority.js';
import * as companiesHouse from './features/companies-house.js';
import * as views from './features/views.js';
import * as relationships from './features/relationships.js';
import * as crm from './features/crm.js';
import * as scheduler from './features/scheduler.js';
import * as routines from './features/routines.js';
import * as bulk from './features/bulk.js';
import * as audit from './features/audit.js';
import * as listFilter from './features/list-filter.js';
import * as settings from './features/settings.js';

const ICON = new URL('../img/icon.svg', import.meta.url).href;
const BOARD_ICON = {
  dark: new URL('../img/icon-dark.svg', import.meta.url).href,
  light: new URL('../img/icon-light.svg', import.meta.url).href
};

/** Resolve the card's feature switches once, then run every provider with them. */
async function collect(t, ...providers) {
  const { enabled } = await cardFeatures(t).catch(() => ({ enabled: {} }));
  const results = await Promise.all(providers.map((fn) => Promise.resolve().then(() => fn(t, enabled)).catch((err) => {
    console.warn('capability provider failed', err);
    return [];
  })));
  return results.flat();
}

window.TrelloPowerUp.initialize({
  'card-badges': (t) => collect(t, priority.cardBadges, companiesHouse.cardBadges, crm.cardBadges, relationships.cardBadges, scheduler.cardBadges),

  'card-detail-badges': (t) => collect(t, priority.cardDetailBadges, companiesHouse.cardDetailBadges, crm.cardDetailBadges, relationships.cardDetailBadges, views.cardDetailBadges),

  'card-buttons': async (t) => {
    const { enabled } = await cardFeatures(t).catch(() => ({ enabled: {} }));
    return [
      ...relationships.cardButtons(ICON, enabled),
      ...routines.cardButtons(ICON, enabled),
      ...scheduler.cardButtons(ICON, enabled)
    ];
  },

  'card-back-section': async (t) => {
    // Opening a card renders this section: the closest Trello gets to a "card viewed" event.
    const { enabled } = await cardFeatures(t).catch(() => ({ enabled: {} }));
    views.recordCardView(t, enabled);
    return {
      title: APP_NAME,
      icon: ICON,
      content: { type: 'iframe', url: t.signUrl('./views/card-back.html'), height: 220 }
    };
  },

  'board-buttons': (t) => {
    // Loading a board renders these buttons: record the visit and run any due scheduled actions.
    views.recordBoardVisit(t);
    scheduler.runDueActions(t);
    return [
      ...crm.boardButtons(BOARD_ICON),
      ...bulk.boardButtons(BOARD_ICON),
      ...routines.boardButtons(BOARD_ICON),
      ...audit.boardButtons(BOARD_ICON)
    ];
  },

  'list-actions': () => listFilter.listActions(),
  'list-sorters': () => priority.listSorters(),

  'show-settings': settings.showSettings,
  'authorization-status': settings.authorizationStatus,
  'show-authorization': settings.showAuthorization,
  'on-enable': settings.showSettings,
  'remove-data': settings.removeData
}, { appKey: APP_KEY, appName: APP_NAME });
