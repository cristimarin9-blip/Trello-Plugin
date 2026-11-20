// Feature: bulk card actions (board button -> modal).
import { viewUrl } from '../lib/util.js';
export function boardButtons(icon) {
  return [{
    icon,
    text: 'Bulk actions',
    condition: 'always',
    callback: (t) => t.modal({ title: 'Bulk card actions', url: viewUrl('bulk.html'), height: 640 })
  }];
}
