// Feature: filter the cards of one list.
// Power-Ups cannot inject a search box into the list header itself; the nearest
// Trello allows is a list menu action that opens a popup search over that list.
export function listActions() {
  return [{
    text: 'Filter cards in this list…',
    callback: async (t) => {
      const list = await t.list('id', 'name');
      return t.popup({ title: `Filter: ${list.name}`, url: './views/list-filter.html', args: { listId: list.id, listName: list.name }, height: 360 });
    }
  }];
}
