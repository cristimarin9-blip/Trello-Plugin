// Writes public/img/icons/<name>-dark.svg and <name>-light.svg from the shapes below.
// Trello shows the dark version on light board headers and the light one on dark headers.
// Run: node scripts/make-icons.mjs   (the SVG files are committed)
import { mkdirSync, writeFileSync } from 'node:fs';

const ICONS = {
  // Board buttons
  crm: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.2c2.8.3 5 2.6 5 5.8"/>',
  fields: '<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><path d="M7 8.5h4M7 12h10M7 15.5h7"/><path d="M14.5 8.5H17"/>',
  bulk: '<rect x="7" y="7" width="13" height="13" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/><path d="M10.5 13.5l2 2 4-4.5"/>',
  routines: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>',
  audit: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  // Card buttons
  subtasks: '<path d="M6 3v13a2 2 0 0 0 2 2h4"/><path d="M6 8h6"/><rect x="13" y="5.5" width="8" height="5" rx="1.5"/><rect x="13" y="15.5" width="8" height="5" rx="1.5"/>',
  routine: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  schedule: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/><path d="M17.5 12h.01"/>',
  temporary: '<path d="M6 3h12M6 21h12"/><path d="M7 3c0 4 3 5.5 5 9-2 3.5-5 5-5 9M17 3c0 4-3 5.5-5 9 2 3.5 5 5 5 9"/>'
};
const COLORS = { dark: '#172b4d', light: '#ffffff', gray: '#44546f' };

mkdirSync(new URL('../public/img/icons/', import.meta.url), { recursive: true });
for (const [name, shapes] of Object.entries(ICONS)) {
  for (const [variant, color] of Object.entries(COLORS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>\n`;
    writeFileSync(new URL(`../public/img/icons/${name}-${variant}.svg`, import.meta.url), svg);
  }
}
console.log(`wrote ${Object.keys(ICONS).length * 3} icons`);
