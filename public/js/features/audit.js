// Feature: activity audit (board visits, who viewed what, scheduled-action log).
import { boardIcon } from '../lib/icons.js';
import { viewUrl } from '../lib/util.js';
export function boardButtons(icon) {
  return [{
    icon: boardIcon('audit'),
    text: 'Activity audit',
    condition: 'always',
    callback: (t) => t.modal({ title: 'Activity audit', url: viewUrl('audit.html'), height: 600 })
  }];
}
