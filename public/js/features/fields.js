// Feature: custom fields — card-front badges and the "Fields" board button.
// Editing happens in the card-back "Fields" tab (js/tabs/fields.js) and the board
// modal (js/views/fields-board.js).
import { boardIcon } from '../lib/icons.js';
import { viewUrl } from '../lib/util.js';
import { badgesFor, cachedBoard, isComputed, boardChecklists, emptyContext } from '../lib/fields.js';

// Members, cards and checklist counts for badges, shared by every card for a minute.
let ctxCache = null; // { boardId, at, promise }
function boardContext(t, boardId, fields) {
  if (ctxCache && ctxCache.boardId === boardId && Date.now() - ctxCache.at < 60000) return ctxCache.promise;
  const promise = (async () => {
    const needCards = fields.some((f) => f.badge && f.type === 'cardref');
    const needLists = fields.some((f) => f.badge && f.type === 'checklist' && (f.checklist || '').trim());
    const [board, cards, checklists] = await Promise.all([
      t.board('members').catch(() => ({ members: [] })),
      needCards ? t.cards('id', 'name').catch(() => []) : [],
      needLists ? boardChecklists(t, boardId) : null
    ]);
    return { members: board.members || [], cards: new Map(cards.map((c) => [c.id, c])), checklists };
  })();
  ctxCache = { boardId, at: Date.now(), promise };
  return promise;
}

export async function cardBadges(t, enabled) {
  if (enabled && !enabled.fields) return [];
  const [{ id: boardId }, { id: cardId }] = await Promise.all([t.board('id'), t.card('id')]);
  const data = await cachedBoard(t, boardId);
  if (!data || !data.fields || !data.fields.length) return [];
  const badged = data.fields.filter((f) => f.badge);
  if (!badged.length) return badgesFor(data.fields, data.cards && data.cards[cardId]);
  let ctx = emptyContext();
  if (badged.some((f) => isComputed(f) || f.type === 'member' || f.type === 'cardref')) {
    const [card, shared] = await Promise.all([t.card('id', 'name', 'idShort', 'dateLastActivity', 'due', 'badges'), boardContext(t, boardId, data.fields)]);
    ctx = { ...shared, cards: new Map([...shared.cards, [card.id, card]]) };
  }
  return badgesFor(data.fields, data.cards && data.cards[cardId], { ctx, cardId });
}

export function openBoard(t, tab = 'table') {
  return t.modal({ title: 'Fields', url: viewUrl('fields-board.html'), args: { tab }, fullscreen: true });
}

export function boardButtons(icon) {
  return [{ icon: boardIcon('fields'), text: 'Fields', condition: 'always', callback: (t) => openBoard(t) }];
}
