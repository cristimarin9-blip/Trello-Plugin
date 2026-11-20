// Feature: custom fields — card-front badges and the "Fields" board button.
// Editing happens in the card-back "Fields" tab (js/tabs/fields.js) and the board
// modal (js/views/fields-board.js).
import { viewUrl } from '../lib/util.js';
import { badgesFor, cachedBoard } from '../lib/fields.js';

export async function cardBadges(t, enabled) {
  if (enabled && !enabled.fields) return [];
  const [{ id: boardId }, { id: cardId }] = await Promise.all([t.board('id'), t.card('id')]);
  const data = await cachedBoard(t, boardId);
  if (!data || !data.fields || !data.fields.length) return [];
  return badgesFor(data.fields, data.cards && data.cards[cardId]);
}

export function openBoard(t, tab = 'table') {
  return t.modal({ title: 'Fields', url: viewUrl('fields-board.html'), args: { tab }, fullscreen: false, height: 640 });
}

export function boardButtons(icon) {
  return [{ icon, text: 'Fields', condition: 'always', callback: (t) => openBoard(t) }];
}
