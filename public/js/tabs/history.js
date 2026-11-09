// Card-back tab: card history (Trello actions via REST) plus Power-Up events.
import { cards as cardsApi, isAuthorized } from '../lib/trello-api.js';
import { el, formatDateTime, truncate } from '../lib/util.js';

export function describeAction(a, listName = () => '') {
  const d = a.data || {};
  const who = (a.memberCreator && a.memberCreator.fullName) || 'Someone';
  switch (a.type) {
    case 'createCard': return `${who} created the card in ${d.list ? d.list.name : 'a list'}`;
    case 'copyCard': return `${who} copied the card`;
    case 'commentCard': return `${who} commented: “${truncate(d.text, 80)}”`;
    case 'updateCard': {
      const old = d.old || {};
      if ('idList' in old) return `${who} moved it from ${d.listBefore ? d.listBefore.name : listName(old.idList)} to ${d.listAfter ? d.listAfter.name : ''}`;
      if ('closed' in old) return `${who} ${d.card && d.card.closed ? 'archived' : 'restored'} the card`;
      if ('due' in old) return `${who} ${d.card && d.card.due ? `set the due date to ${formatDateTime(d.card.due)}` : 'removed the due date'}`;
      if ('dueComplete' in old) return `${who} marked it ${d.card && d.card.dueComplete ? 'complete' : 'incomplete'}`;
      if ('name' in old) return `${who} renamed it from “${truncate(old.name, 40)}”`;
      if ('desc' in old) return `${who} edited the description`;
      if ('pos' in old) return `${who} reordered it`;
      return `${who} updated the card`;
    }
    case 'addMemberToCard': return `${who} added ${d.member ? d.member.name : 'a member'}`;
    case 'removeMemberFromCard': return `${who} removed ${d.member ? d.member.name : 'a member'}`;
    case 'addLabelToCard': return `${who} added label ${d.label ? (d.label.name || d.label.color) : ''}`;
    case 'removeLabelFromCard': return `${who} removed label ${d.label ? (d.label.name || d.label.color) : ''}`;
    case 'addChecklistToCard': return `${who} added checklist “${d.checklist ? d.checklist.name : ''}”`;
    case 'removeChecklistFromCard': return `${who} removed checklist “${d.checklist ? d.checklist.name : ''}”`;
    case 'updateCheckItemStateOnCard': return `${who} ${d.checkItem && d.checkItem.state === 'complete' ? 'completed' : 'unticked'} “${truncate(d.checkItem ? d.checkItem.name : '', 50)}”`;
    case 'addAttachmentToCard': return `${who} attached ${d.attachment ? d.attachment.name : 'a file'}`;
    case 'deleteAttachmentFromCard': return `${who} removed an attachment`;
    case 'updateCustomFieldItem': return `${who} updated custom field ${d.customField ? d.customField.name : ''}`;
    default: return `${who}: ${a.type}`;
  }
}

export default {
  id: 'history',
  label: 'History',
  async render(t, root) {
    if (!(await isAuthorized(t))) {
      root.append(el('p', { class: 'notice' }, 'Authorise the Power-Up (Power-Up menu → settings → Authorise) to load the card history.'));
      return;
    }
    const [card, lists] = await Promise.all([t.card('id'), t.lists('id', 'name')]);
    const listName = (id) => (lists.find((l) => l.id === id) || {}).name || 'another list';
    const actions = await cardsApi.actions(t, card.id, 60);
    if (!actions.length) return root.append(el('p', { class: 'muted' }, 'No history yet.'));
    const ul = el('ul', { class: 'log' });
    for (const a of actions) {
      ul.append(el('li', {}, el('small', { class: 'muted' }, formatDateTime(a.date)), ' — ', describeAction(a, listName)));
    }
    root.append(ul, el('p', { class: 'muted' }, el('small', {}, `Showing the last ${actions.length} actions from Trello.`)));
  }
};
