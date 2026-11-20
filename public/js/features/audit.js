// Feature: activity audit (board visits, who viewed what, scheduled-action log).
import { viewUrl } from '../lib/util.js';
export function boardButtons(icon) {
  return [{
    icon,
    text: 'Activity audit',
    condition: 'always',
    callback: (t) => t.modal({ title: 'Activity audit', url: viewUrl('audit.html'), height: 600 })
  }];
}
