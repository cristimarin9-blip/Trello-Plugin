// Feature: bulk card actions (board button -> modal).
import { boardIcon } from '../lib/icons.js';
import { viewUrl } from '../lib/util.js';
export function boardButtons(icon) {
  return [{
    icon: boardIcon('bulk'),
    text: 'Bulk actions',
    condition: 'always',
    callback: (t) => t.modal({ title: 'Bulk card actions', url: viewUrl('bulk.html'), height: 640 })
  }];
}
