// Card-back tab: Companies House lookup (by number, or search by name) and deadlines.
import { KEYS, CH_PROXY_URL } from '../config.js';
import { get, set, remove, getSettings } from '../lib/storage.js';
import { el, clear, formatDate, daysUntil, deadlineColor, monthsFromEnd, relativeTime, setStatus } from '../lib/util.js';

const STALE_MS = 24 * 60 * 60 * 1000;

export function normaliseNumber(input) {
  const raw = String(input || '').toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  return /^\d+$/.test(raw) ? raw.padStart(8, '0') : raw;
}

/** True for inputs shaped like a company number: 1-8 digits, or e.g. SC123456 / R0123456. */
export function looksLikeCompanyNumber(input) {
  const raw = String(input || '').toUpperCase().replace(/\s+/g, '');
  return /^\d{1,8}$/.test(raw) || /^(?=.{8}$)[A-Z]{1,2}\d{6,7}$/.test(raw);
}

async function errorText(res) {
  try { const body = await res.json(); return body && body.error ? body.error : ''; } catch { return ''; }
}

export async function searchCompanies(proxyUrl, query) {
  const base = proxyUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/search?q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
  // Workers deployed before name search existed answer 404 for /search.
  if (res.status === 404) throw new Error('Name search needs the updated proxy worker: paste the latest worker/src/index.js into your Cloudflare worker and deploy it (README step 6). Lookup by company number still works.');
  if (!res.ok) throw new Error((await errorText(res)) || `Search failed (${res.status}). Check the proxy URL and API key.`);
  const body = await res.json();
  return Array.isArray(body.items) ? body.items : [];
}

export async function fetchCompany(proxyUrl, number) {
  const base = proxyUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/company/${encodeURIComponent(number)}`, { headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new Error(`Company ${number} not found at Companies House.`);
  if (!res.ok) throw new Error(`Lookup failed (${res.status}). Check the proxy URL and API key.`);
  return res.json();
}

/** Shape the proxy response into the compact snapshot stored on the card. */
export function toSnapshot(data) {
  const accounts = data.accounts || {};
  const cs = data.confirmation || {};
  return {
    number: data.number,
    name: data.name,
    status: data.status,
    type: data.type,
    incorporated: data.incorporated,
    address: data.address,
    sic: (data.sic || []).slice(0, 4),
    accountsDue: accounts.nextDue || null,
    accountsOverdue: !!accounts.overdue,
    accountsMadeUpTo: accounts.nextMadeUpTo || null,
    lastAccountsMadeUpTo: accounts.lastMadeUpTo || null,
    ard: accounts.ard || null,
    csDue: cs.nextDue || null,
    csOverdue: !!cs.overdue,
    csMadeUpTo: cs.nextMadeUpTo || null,
    // Corporation tax: payment 9 months + 1 day after the period end; CT600 return 12 months after.
    ctPaymentDue: accounts.nextMadeUpTo ? monthsFromEnd(accounts.nextMadeUpTo, 9, 1) : null,
    ctReturnDue: accounts.nextMadeUpTo ? monthsFromEnd(accounts.nextMadeUpTo, 12) : null,
    officers: (data.officers || []).slice(0, 8).map((o) => ({ n: o.name, r: o.role, a: o.appointed })),
    fetchedAt: Date.now()
  };
}

async function proxyUrl(t) {
  const settings = await getSettings(t);
  const url = settings.chProxyUrl || CH_PROXY_URL;
  if (!url) throw new Error('Set the Companies House proxy URL in the Power-Up settings first (README step 6).');
  return url;
}

async function lookup(t, number, root, ctx) {
  const proxy = await proxyUrl(t);
  setStatus('Looking up…');
  const data = await fetchCompany(proxy, number);
  await set(t, 'card', KEYS.company, toSnapshot(data));
  setStatus('Updated from Companies House', 'success');
  await ctx.refresh();
}

async function search(t, query, results, ctx) {
  const proxy = await proxyUrl(t);
  setStatus('Searching Companies House…');
  const items = await searchCompanies(proxy, query);
  clear(results);
  if (!items.length) {
    results.append(el('p', { class: 'muted' }, `No companies found for "${query}". Try fewer words or the company number.`));
    setStatus('');
    return ctx.fit();
  }
  results.append(el('h3', {}, 'Pick the company'));
  const list = el('ul', { class: 'card-list' });
  for (const item of items) {
    const pick = async () => {
      try { await lookup(t, item.number, results, ctx); } catch (err) { setStatus(err.message, 'error'); }
    };
    const detail = [item.number, item.incorporated ? `inc. ${formatDate(item.incorporated)}` : '', item.address].filter(Boolean).join(' · ');
    list.append(el('li', { role: 'button', tabindex: '0', title: `Use ${item.name}`, onclick: pick, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } } },
      el('span', { class: 'grow' }, el('strong', {}, item.name), el('br'), el('small', { class: 'muted' }, detail)),
      el('span', { class: `pill ${item.status === 'active' ? 'green' : 'red'}` }, item.status || 'unknown')));
  }
  results.append(list);
  setStatus(`${items.length} match${items.length === 1 ? '' : 'es'}: click one to add it to this card`);
  ctx.fit();
}

function deadlineRow(label, date, overdue) {
  if (!date) return null;
  const days = daysUntil(date);
  const text = overdue || days < 0 ? `overdue by ${Math.abs(days)}d` : days === 0 ? 'today' : `in ${days}d`;
  return [el('dt', {}, label), el('dd', {}, `${formatDate(date)} `, el('span', { class: `pill ${deadlineColor(date, overdue)}` }, text))];
}

export default {
  id: 'company',
  label: 'Company',
  async render(t, root, ctx) {
    const company = await get(t, 'card', KEYS.company);
    const form = el('div', { class: 'row' });
    const results = el('div');
    const input = el('input', { type: 'text', placeholder: 'Company name or number, e.g. 01234567', 'aria-label': 'Company name or number', value: company ? company.number : '' });
    const button = el('button', { class: 'primary' });
    const sync = () => {
      const value = input.value.trim();
      button.textContent = !value || looksLikeCompanyNumber(value)
        ? (company && normaliseNumber(value) === company.number ? 'Refresh' : 'Look up')
        : 'Search';
    };
    sync();
    input.oninput = sync;
    button.onclick = async () => {
      const value = input.value.trim().replace(/\s+/g, ' ');
      if (!value) return setStatus('Enter a company name or number', 'error');
      if (!looksLikeCompanyNumber(value) && value.length < 2) return setStatus('Type at least 2 characters of the company name', 'error');
      button.disabled = true;
      try {
        if (looksLikeCompanyNumber(value)) await lookup(t, normaliseNumber(value), root, ctx);
        else await search(t, value, results, ctx);
      } catch (err) { setStatus(err.message, 'error'); } finally { button.disabled = false; }
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') button.click(); };
    form.append(el('div', { class: 'grow' }, input), button);
    if (company) {
      form.append(el('button', { onclick: async () => { await remove(t, 'card', KEYS.company); setStatus('Removed'); ctx.refresh(); } }, 'Remove'));
    }
    root.append(form, results);

    if (!company) {
      root.append(el('p', { class: 'muted' }, 'Enter the company number, or search by name and pick the company, to pull the registered name, status, officers and filing deadlines. Deadlines appear as badges on the card front.'));
      return;
    }

    const dl = el('dl', { class: 'kv' });
    dl.append(el('dt', {}, 'Name'), el('dd', {}, el('a', { href: `https://find-and-update.company-information.service.gov.uk/company/${company.number}`, target: '_blank', rel: 'noopener' }, company.name || company.number)));
    dl.append(el('dt', {}, 'Status'), el('dd', {}, el('span', { class: `pill ${company.status === 'active' ? 'green' : 'red'}` }, company.status || 'unknown'), ` ${company.type || ''}`));
    if (company.incorporated) dl.append(el('dt', {}, 'Incorporated'), el('dd', {}, formatDate(company.incorporated)));
    if (company.ard) dl.append(el('dt', {}, 'Year end'), el('dd', {}, company.ard));
    if (company.address) dl.append(el('dt', {}, 'Registered office'), el('dd', {}, company.address));
    root.append(el('h3', {}, 'Deadlines'));
    const deadlines = el('dl', { class: 'kv' });
    for (const row of [
      deadlineRow(`Accounts to ${formatDate(company.accountsMadeUpTo)}`, company.accountsDue, company.accountsOverdue),
      deadlineRow('Confirmation statement', company.csDue, company.csOverdue),
      deadlineRow('Corporation tax payment*', company.ctPaymentDue),
      deadlineRow('CT600 return*', company.ctReturnDue)
    ]) if (row) deadlines.append(...row);
    root.append(dl, deadlines, el('p', { class: 'muted' }, el('small', {}, '*Estimated from the accounting period: payment 9 months + 1 day, return 12 months after the period end. Confirm against HMRC.')));

    if (company.officers && company.officers.length) {
      root.append(el('h3', {}, 'Officers'));
      root.append(el('ul', { class: 'card-list' }, company.officers.map((o) => el('li', {}, el('span', { class: 'grow' }, o.n), el('small', {}, `${o.r}${o.a ? ` · since ${formatDate(o.a)}` : ''}`)))));
    }
    root.append(el('p', { class: 'muted' }, el('small', {}, `Last checked ${relativeTime(company.fetchedAt)}`)));

    if (Date.now() - (company.fetchedAt || 0) > STALE_MS) {
      // Silent refresh when the snapshot is older than a day.
      lookup(t, company.number, root, ctx).catch((err) => setStatus(`Auto-refresh skipped: ${err.message}`, 'info'));
    }
  }
};
