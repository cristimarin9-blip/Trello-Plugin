// Print / handover layout: which sections of a card are printed, in what order, with
// which options, and how the page looks. A board can save a default layout.

export const SECTIONS = {
  handover: { label: 'Handover note', hint: 'Your note for the person taking over; printed in a highlighted box' },
  summary: { label: 'Card summary', hint: 'Board, list, due date, members, labels, priority', opts: { link: { label: 'Card link', default: true } } },
  description: { label: 'Description', hint: 'The card description' },
  fields: { label: 'Fields', hint: 'Keel field values, grouped by section tab', opts: { show: { label: 'Which fields', default: 'filled', choices: { filled: 'Only fields with a value', visible: 'Fields shown on the card', all: 'All fields' } } } },
  crm: { label: 'Client stages', hint: 'Tracks with stage, since when, deadline and note', opts: { notes: { label: 'Notes', default: true } } },
  company: { label: 'Companies House', hint: 'Company details and filing deadlines', opts: { officers: { label: 'Officers', default: true } } },
  checklists: { label: 'Checklists', hint: 'Every checklist with ticked and open items', opts: { hideDone: { label: 'Only open items', default: false } } },
  subtasks: { label: 'Subtasks & parent', hint: 'Linked task cards and whether they are done' },
  comments: { label: 'Latest comments', hint: 'Most recent comments first', opts: { count: { label: 'How many', default: 5, choices: { 3: '3', 5: '5', 10: '10', 25: '25' } } } },
  attachments: { label: 'Attachments', hint: 'File and link names' }
};
export const SECTION_ORDER = Object.keys(SECTIONS);

export const PAGE = {
  size: { label: 'Paper', default: 'A4', choices: { A4: 'A4', Letter: 'US Letter' } },
  font: { label: 'Text size', default: 'normal', choices: { small: 'Small', normal: 'Normal', large: 'Large' } },
  skipEmpty: { label: 'Leave out empty sections', default: true },
  footer: { label: 'Footer with who printed it and when', default: true }
};

export const HANDOVER_MAX = 1000;

function optDefaults(id) {
  return Object.fromEntries(Object.entries(SECTIONS[id].opts || {}).map(([k, o]) => [k, o.default]));
}

export function defaultLayout() {
  return {
    sections: SECTION_ORDER.map((id) => ({ id, on: id !== 'attachments', opts: optDefaults(id) })),
    page: Object.fromEntries(Object.entries(PAGE).map(([k, p]) => [k, p.default]))
  };
}

function cleanOpt(def, value) {
  if (def.choices) return Object.keys(def.choices).map(String).includes(String(value)) ? (typeof def.default === 'number' ? Number(value) : value) : def.default;
  return typeof value === typeof def.default ? value : def.default;
}

/** Normalise a saved layout: unknown sections dropped, new sections added at the end. */
export function sanitizeLayout(input) {
  const base = defaultLayout();
  if (!input || typeof input !== 'object') return base;
  const seen = new Set();
  const sections = [];
  for (const s of Array.isArray(input.sections) ? input.sections : []) {
    if (!s || !SECTIONS[s.id] || seen.has(s.id)) continue;
    seen.add(s.id);
    const defs = SECTIONS[s.id].opts || {};
    sections.push({ id: s.id, on: s.on !== false, opts: Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, cleanOpt(d, s.opts ? s.opts[k] : undefined)])) });
  }
  for (const s of base.sections) if (!seen.has(s.id)) sections.push(s);
  const page = Object.fromEntries(Object.entries(PAGE).map(([k, d]) => [k, cleanOpt(d, input.page ? input.page[k] : undefined)]));
  return { sections, page };
}

/** Compact form for the board's 4 KB storage: options equal to the default are left out. */
export function compactLayout(layout) {
  const l = sanitizeLayout(layout);
  return {
    sections: l.sections.map((s) => {
      const opts = Object.fromEntries(Object.entries(s.opts).filter(([k, v]) => v !== SECTIONS[s.id].opts[k].default));
      return { id: s.id, ...(s.on ? {} : { on: false }), ...(Object.keys(opts).length ? { opts } : {}) };
    }),
    page: Object.fromEntries(Object.entries(l.page).filter(([k, v]) => v !== PAGE[k].default))
  };
}
