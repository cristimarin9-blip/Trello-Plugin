// ---------------------------------------------------------------------------
// Power-Up configuration. Edit these two values after you create the Power-Up
// in the Trello admin portal (see README.md, step 3).
// ---------------------------------------------------------------------------

// Your Trello API key from https://trello.com/power-ups/admin -> your Power-Up -> "API key".
// It is a public identifier (it is safe to commit), but the token the user grants is not.
export const APP_KEY = 'REPLACE_WITH_YOUR_TRELLO_API_KEY';

// Shown to users when they authorise the Power-Up to act on their behalf.
export const APP_NAME = 'Keel';

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
