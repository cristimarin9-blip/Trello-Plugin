// Feature: "Print / handover" card button: choose what of the card is printed and how,
// for the person who continues the work (js/views/print.js).
import { cardIcon } from '../lib/icons.js';
import { viewUrl } from '../lib/util.js';

export function cardButtons() {
  return [{
    icon: cardIcon('print'),
    text: 'Print / handover',
    callback: (t) => t.modal({ title: 'Print / handover', url: viewUrl('print.html'), fullscreen: true })
  }];
}
