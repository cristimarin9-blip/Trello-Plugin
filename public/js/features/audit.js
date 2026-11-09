// Feature: activity audit (board visits, who viewed what, scheduled-action log).
export function boardButtons(icon) {
  return [{
    icon,
    text: 'Activity audit',
    condition: 'always',
    callback: (t) => t.modal({ title: 'Activity audit', url: './views/audit.html', height: 600 })
  }];
}
