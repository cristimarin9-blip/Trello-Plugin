// Feature: processes & routines — named step lists applied to a card as a checklist.
import { KEYS } from '../config.js';
import { get } from '../lib/storage.js';
import { checklists as checklistsApi } from '../lib/trello-api.js';

export function boardButtons(icon) {
  return [{
    icon,
    text: 'Routines',
    condition: 'always',
    callback: (t) => t.modal({ title: 'Processes & routines', url: './views/routines.html', height: 560 })
  }];
}

export function cardButtons(iconUrl) {
  return [{
    icon: iconUrl,
    text: 'Apply routine',
    callback: async (t) => {
      const routines = (await get(t, 'board', KEYS.routines)) || [];
      if (!routines.length) {
        return t.popup({
          title: 'Apply routine',
          items: [{ text: 'No routines yet — create one from the "Routines" board button.', callback: (tt) => tt.closePopup() }]
        });
      }
      return t.popup({
        title: 'Apply routine',
        items: routines.map((r) => ({
          text: `${r.name} (${r.steps.length} steps)`,
          callback: async (tt) => {
            try {
              await applyRoutine(tt, r);
              tt.alert({ message: `Added checklist "${r.name}"`, duration: 4, display: 'success' });
            } catch (err) {
              tt.alert({ message: err.message, duration: 8, display: 'error' });
            }
            return tt.closePopup();
          }
        }))
      });
    }
  }];
}

export async function applyRoutine(t, routine) {
  const card = await t.card('id');
  const checklist = await checklistsApi.create(t, card.id, routine.name);
  for (const step of routine.steps) {
    // eslint-disable-next-line no-await-in-loop
    await checklistsApi.addItem(t, checklist.id, step);
  }
  return checklist;
}
