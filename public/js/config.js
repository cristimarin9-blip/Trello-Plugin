// ---------------------------------------------------------------------------
// Power-Up configuration. Values come from the Trello admin portal
// (https://trello.com/power-ups/admin -> Keel -> Authorization -> OAuth 2.0).
// ---------------------------------------------------------------------------

// Shown in the card-back section title and the settings popup.
export const APP_NAME = 'Keel';

// OAuth 2.0 "Client ID" from the OAuth 2.0 tab (security type: Public).
// It is a public identifier, safe to commit. There is no secret for public clients.
export const OAUTH_CLIENT_ID = 'JpcsjyDUsQcVWemdSDgoJZAZqv9YQHK';

// Page Trello redirects to after the user clicks "Allow". It is served from this
// repo and must be listed, character for character, under "Callback URL(s)" in
// the OAuth 2.0 tab:  https://cristimarin9-blip.github.io/Trello-Plugin/views/oauth-callback.html
export const OAUTH_REDIRECT_URI = new URL('../views/oauth-callback.html', import.meta.url).href;

// Scopes requested at authorisation. read/write:board are always enabled for Power-Ups.
export const OAUTH_SCOPES = ['read:board:trello', 'write:board:trello'];

// Storage keys used in Trello pluginData. Keep these stable: renaming one orphans existing data.
export const KEYS = {
  priority: 'priority',      // card/shared  : 'urgent' | 'high' | 'medium' | 'low'
  company: 'company',        // card/shared  : Companies House snapshot
  views: 'views',            // card/shared  : who viewed this card and when
  parent: 'parent',          // card/shared  : { id, name } of parent card
  children: 'children',      // card/shared  : [cardId, ...]
  crm: 'crm',                // card/shared  : client stage tracker
  schedule: 'schedule',      // card/shared  : scheduled actions / temporary card expiry
  features: 'features',      // card/shared  : per-card feature overrides { featureId: bool }
  routines: 'routines',      // board/shared : [{ id, name, steps: [] }]
  audit: 'audit',            // board/shared : member activity on this board
  settings: 'settings',      // board/shared : { chProxyUrl, stageBadges, defaults: { featureId: bool } }
  scheduleLog: 'scheduleLog' // board/shared : last executed scheduled actions
};

// Trello limits each (scope, visibility) bucket to 4096 characters of JSON.
export const STORAGE_LIMIT = 4096;
