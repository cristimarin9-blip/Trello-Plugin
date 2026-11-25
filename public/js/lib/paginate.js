// Lays printed content out on A4 sheets, the same on screen and on paper.
// Each block (title, then one block per section) is measured at A4 width. A section that
// does not fit in the space left on the current sheet moves to a new sheet, so sections
// are never cut off. Only a section taller than a whole sheet is split, between its rows,
// list items, pairs or paragraphs, with its heading repeated as "(continued)".
import { el } from './util.js';

export const A4 = { width: 210, height: 297, margin: 14, footer: 9 }; // millimetres

const outer = (node) => {
  const cs = getComputedStyle(node);
  return node.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
};

/**
 * Smallest pieces a too-tall section can be split at: list items, definition pairs,
 * table rows, or whole paragraphs. Each leaf remembers the wrappers it sits in (lists,
 * tables, boxes) so a part of the section can rebuild them around its leaves.
 */
function leaves(node, chain = []) {
  const tag = node.tagName;
  if (tag === 'DL') {
    const kids = [...node.children];
    const out = [];
    for (let i = 0; i < kids.length; i += 2) out.push({ nodes: kids.slice(i, i + 2), chain: [...chain, node] });
    return out;
  }
  if (tag === 'TABLE' && node.tBodies.length) {
    const body = node.tBodies[0];
    return [...body.rows].map((tr) => ({ nodes: [tr], chain: [...chain, node, body] }));
  }
  if ((tag === 'UL' || tag === 'OL') && node.children.length) return [...node.children].map((li) => ({ nodes: [li], chain: [...chain, node] }));
  const onlyElements = [...node.childNodes].every((n) => n.nodeType === 1 || !String(n.textContent).trim());
  if ((tag === 'DIV' || tag === 'SECTION') && node.children.length && onlyElements && !node.classList.contains('p-comment')) {
    return [...node.children].flatMap((child) => leaves(child, [...chain, node]));
  }
  return [{ nodes: [node], chain }];
}

/** A part of a section: its heading, then the leaves inside freshly cloned wrappers. */
function buildPart(section, heading, list, continued) {
  const root = section.cloneNode(false);
  if (heading) {
    const h = heading.cloneNode(true);
    if (continued) h.textContent = `${heading.textContent} (continued)`;
    root.append(h);
  }
  let open = []; // [{ orig, clone }] wrappers currently open, outermost first
  for (const leaf of list) {
    let k = 0;
    while (k < open.length && k < leaf.chain.length && open[k].orig === leaf.chain[k]) k += 1;
    open = open.slice(0, k);
    let parent = k ? open[k - 1].clone : root;
    for (let j = k; j < leaf.chain.length; j += 1) {
      const orig = leaf.chain[j];
      const clone = orig.cloneNode(false);
      if (orig.tagName === 'TABLE' && orig.tHead) clone.append(orig.tHead.cloneNode(true));
      parent.append(clone);
      open.push({ orig, clone });
      parent = clone;
    }
    for (const n of leaf.nodes) parent.append(n.cloneNode(true));
  }
  return root;
}

/**
 * blocks: [{ node, heading? }] where `heading` is the section heading element (for
 * "(continued)"). Returns an array of sheets, each an array of nodes, measured inside
 * `host` with the sheet classes `sheetClass`.
 */
export function paginate(blocks, { host, sheetClass, footer }) {
  const probe = el('div', { style: 'position:absolute;visibility:hidden;height:100mm;width:1px' });
  host.append(probe);
  const pxPerMm = probe.getBoundingClientRect().height / 100;
  probe.remove();
  const available = (A4.height - 2 * A4.margin - (footer ? A4.footer : 0)) * pxPerMm - 2; // 2px safety

  const sheet = el('div', { class: `${sheetClass} p-measure`, 'aria-hidden': 'true' });
  const content = el('div', { class: 'p-sheet-content' });
  // A trailing marker, so the block being measured is never the sheet's last child (the
  // last child loses its bottom margin, which would make every block measure short).
  const end = el('div', { style: 'height:0' });
  content.append(end);
  sheet.append(content);
  host.append(sheet);
  const measure = (node) => { content.insertBefore(node, end); const h = outer(node); node.remove(); return h; };

  const sheets = [[]];
  let used = 0;
  const newSheet = () => { sheets.push([]); used = 0; };
  const put = (node, h) => { sheets[sheets.length - 1].push(node); used += h; };

  for (const block of blocks) {
    const h = measure(block.node);
    if (h <= available - used) { put(block.node, h); continue; }
    if (h <= available) { newSheet(); put(block.node, h); continue; } // move the whole section to a new sheet
    // Taller than a sheet, so it has to be split anyway: start it on this sheet if at
    // least a quarter of the sheet is free (else on a fresh one) and continue on the
    // next sheets, splitting only between list items, rows, pairs or paragraphs.
    if (sheets[sheets.length - 1].length && available - used < available / 4) newSheet();
    const heading = block.heading || null;
    const all = [...block.node.children].filter((c) => c !== heading).flatMap((c) => leaves(c, []));
    let part = [];
    let continued = false;
    for (const leaf of all) {
      const trial = buildPart(block.node, heading, [...part, leaf], continued);
      if (measure(trial) > available - used && part.length) {
        const done = buildPart(block.node, heading, part, continued);
        put(done, measure(done));
        newSheet();
        part = [leaf];
        continued = true;
      } else {
        part.push(leaf);
      }
    }
    if (part.length) { const done = buildPart(block.node, heading, part, continued); put(done, measure(done)); }
  }
  sheet.remove();
  return sheets.filter((s) => s.length);
}
