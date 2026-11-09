// Feature: bulk card actions (board button -> modal).
export function boardButtons(icon) {
  return [{
    icon,
    text: 'Bulk actions',
    condition: 'always',
    callback: (t) => t.modal({ title: 'Bulk card actions', url: './views/bulk.html', height: 640 })
  }];
}
