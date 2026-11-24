# Feature notes and platform limits

Each requested feature, what was built, how it works, and where Trello's Power-Up platform constrains it.

Two platform facts shape most of the design:

* **Storage.** A Power-Up stores data in Trello "pluginData": at most **4096 characters of JSON per card** and **4096 per board** (shared visibility). Every feature below keeps its data compact and capped. Settings → shows current board usage.
* **No server, no events.** A Power-Up is client-side code that runs in the browser of a member who has it enabled. Trello gives it no "card viewed", "user logged in" or timer events, and does not let it change Trello's own interface (no injecting a search box into a list). Anything that needs Trello's data beyond the card/board in view uses the Trello REST API with the OAuth 2.0 token each member grants via **Authorise** (per workspace; access tokens refresh automatically, refresh tokens last 90 days).

---

## 1. Card priority
* **Built:** `urgent / high / medium / low` stored on the card. Badge on the front, clickable "Priority" badge on the back (popup picker), list sorter *Priority (urgent first)*, filter by priority in the list filter and bulk-set in Bulk actions.
* **Code:** `public/js/features/priority.js`.

## 2. Companies House and deadlines at a glance
* **Built:** card back → **Company** tab. Enter the company number, or search by name (up to 10 matches with number, status, incorporation date and address; click one to use it). The box decides by shape: 1–8 digits or a prefixed number such as `SC123456` is looked up directly, anything else is searched by name. The Power-Up calls the proxy worker, which calls Companies House and returns the profile, filing dates and active officers. A compact snapshot (≈1 KB) is stored on the card so that **card-front badges** can show: accounts due, confirmation statement due, estimated corporation-tax payment date, and a red badge if the company is not *active*. Badge colours: red ≤14 days or overdue, orange ≤30, yellow ≤60, green otherwise. Snapshots auto-refresh when a card is opened more than 24 h after the last check.
* **Computed dates:** CT payment = 9 months + 1 day after the period end; CT600 = 12 months; VAT and PAYE in the CRM. Month-end periods follow the statutory month-end rule (30 June → 31 March / 1 April). They are estimates — confirm against HMRC.
* **Why a proxy:** the Companies House API requires a secret key and does not allow browser (CORS) requests. The worker (`worker/src/index.js`) keeps the key secret, restricts calling origins, and caches each company and each name search for an hour (the API allows 600 requests per 5 minutes).
* **Code:** `public/js/tabs/company.js`, `public/js/features/companies-house.js`, `worker/`.

## 3. Card views & board visits, including who is on the board and when
* **Built:** opening a card records `{member, time, count}` on that card (**Who viewed** tab, "Views" detail badge). Loading the board records a board visit per member (**Activity audit** board button: every board member with first seen / last seen / visit count, recent visit log, recently viewed cards across the board).
* **Limits:** Trello does not expose real view events. A view is recorded only when the viewer has this Power-Up enabled and the card/board actually renders; it is throttled (5 min per card, 15 min per board, per member) to respect storage. Members who never enabled the Power-Up show as "never (with Power-Up)". Viewer lists are capped at 25 per card, 40 members per board.
* **Code:** `public/js/features/views.js`, `public/js/tabs/viewers.js`, `public/js/views/audit.js`.

## 4. Card history
* **Built:** **History** tab lists the last 60 Trello actions on the card (created, moved, renamed, due set, completed, comments, members, labels, checklists ticked, attachments…) in plain English with time and member. Requires Authorise.
* **Code:** `public/js/tabs/history.js`.

## 5. Card relationships (task card & subtask cards)
* **Built:** a card can have one parent and many subtasks. Link an existing card (search), create a new subtask card directly (REST), or set a parent. Front badges: `↑ Parent name` on the child, `☑ done/total subtasks` on the parent (green when all done). Clicking the "Subtask of" badge opens the parent. A subtask is "done" when its due date is marked complete.
* **Code:** `public/js/features/relationships.js`, `public/js/tabs/subtasks.js`.

## 6. Sub-points and order in checklists
* **Built:** **Checklist** tab shows every checklist with hierarchical numbering (1, 1.1, 1.2, 2…), indentation, move up/down, indent/outdent, add sub-point under an item, tick, delete, add item. Requires Authorise.
* **How:** Trello checklists are flat, so a sub-point is an item whose name starts with `↳ ` (one per level, max 3). The prefix is visible in Trello's own view, so the hierarchy still reads correctly there. Reordering uses Trello's `pos` values.
* **Code:** `public/js/tabs/checklist.js`.

## 7. Accountancy client CRM
* **Built:** **Client stages** tab with four tracks — Bookkeeping, Year-end accounts, VAT return, PAYE/payroll — each with on/off, stage dropdown, "Next stage" button, period-end date and a note. Deadlines are computed per track: VAT = period end + 1 month + 7 days; PAYE = 22nd of the following month; accounts = Companies House *next due* if looked up, else period end + 9 months; bookkeeping target = period end + 1 month. Active, unfinished tracks show as **card-front badges** (`VAT: In progress · 7 Aug`) coloured green (complete), blue (in progress), orange (≤14 days), red (overdue), grey (not started). Badges can be turned off in Settings.
* **Board view:** **Client CRM** board button → every client card in a table (stage per track, deadlines, Companies House dates, priority), with search, track filter, hide-completed, counters and CSV export. Click a row to open the card.
* **Code:** `public/js/features/crm.js`, `public/js/tabs/crm.js`, `public/js/views/crm-board.js`.

## 8. Audit of logins and board activity
* **Built:** see §3 — the **Activity audit** modal is the audit log. It also lists scheduled actions that were executed and by what rule.
* **Limit:** Trello never tells a Power-Up when someone logs in. If you need true login auditing, that is only available to Trello Enterprise admins through Atlassian's audit log, not to Power-Ups.

## 9. Search bar at the start of a list that filters only that list
* **Built:** list menu (⋯) → **Filter cards in this list…** opens a popup with a live search over that list only (name, label, member) plus a priority filter; click a result to open the card.
* **Limit:** Power-Ups cannot add elements inside Trello's list header, so an inline search box is not possible from a Power-Up. If that exact placement is essential, it would need a browser extension (per-user install) instead. Trello's own board filter (`F`) filters all lists at once.
* **Code:** `public/js/features/list-filter.js`, `public/js/views/list-filter.js`.

## 10. Processes and routines
* **Built:** **Routines** board button → create named step lists (one step per line, `↳ ` for sub-points). Card button **Apply routine** adds the routine to the card as a checklist. Requires Authorise.
* **Limit:** routines live in the board's 4 KB bucket; the editor shows projected usage and refuses a save that would exceed it. Roughly 60–80 short steps in total per board. If you need more, the natural upgrade is to keep routine templates as cards in a "Templates" list and copy their checklists (REST) — ask for it if you hit the limit.
* **Code:** `public/js/features/routines.js`, `public/js/views/routines.js`.

## 11. Scheduled card actions
* **Built:** card button **Schedule action** → archive / move to list / mark due complete / set priority, at a chosen date and time. The front badge shows the next action (`⏰ Move to Done · 12 Jan 09:00`). Executed actions are logged in the Activity audit.
* **How it runs:** there is no server. Whenever a board member who has authorised the Power-Up opens the board, the Power-Up checks all cards (at most once a minute per browser tab) and runs any action that is due, using that member's token — so Trello's history will show that member as the actor. If nobody opens the board, due actions wait until someone does.
* **Exact timing options:** (a) Trello's built-in Automation (Butler) handles "on date X do Y" natively and server-side; (b) a scheduled Cloudflare Worker could poll the board with a stored token — this is a straightforward extension of `worker/` if you want it.
* **Code:** `public/js/features/scheduler.js`, `public/js/views/schedule.js`.

## 12. Who viewed
* See §3 (**Who viewed** tab on the card).

## 13. Bulk card actions
* **Built:** **Bulk actions** board button → filter by list/name, tick cards (or "Select visible"), choose move / archive / add label / add member / set due date / set or clear priority / mark complete, confirm, progress shown. Requires Authorise for everything except priority.
* **Code:** `public/js/views/bulk.js`.

## 14. Temporary cards
* **Built:** card button **Temporary card** → expire at end of today / 24 h / 3 days / 7 days / custom. Shows a pink `⌛ Temp · expires …` badge (orange within 2 days, red when due) and archives the card through the scheduler (§11), so the same execution rules apply.
* **Code:** `public/js/views/schedule.js` (mode `temp`), `public/js/features/scheduler.js`.

## 15. Feature switches (defaults, per-card, bulk)
* **Board defaults:** Power-Up gear → Settings → **Default features for cards**. Tick the features that should be on for cards. Every card that has not been customised follows these defaults, so a feature you switch off here disappears from all uncustomised cards at once (and comes back when you switch it on).
* **Per card:** card back → **⚙ Features** tab. Tick/untick any feature; the card is then "custom" and keeps its own full set. **Reset to board defaults** removes the override. A pill shows where a card differs from the board default.
* **Bulk:** board button **Bulk actions** → select cards → *Turn feature ON…*, *Turn feature OFF…* or *Reset features to board defaults*. These need no REST authorisation.
* **What a switch does:** off hides the feature's card-front badges, detail badges, card buttons and card-back tab, stops recording views (for *Who viewed*), hides the card from the Client CRM table (for *Client stages*), ignores the card's priority when sorting, and pauses scheduled actions on that card (they stay stored and resume if the feature is turned back on). Data is never deleted by a switch.
* **Switchable features:** Priority · Companies House · Fields · Client stages (CRM) · Subtasks & parent · Checklist sub-points · Card history · Who viewed · Scheduled actions & temporary cards · Apply routines. Board-level tools (Client CRM, Fields, Bulk actions, Routines, Activity audit, list filter) are always available.
* **Code:** `public/js/lib/features.js`, `public/js/tabs/features.js`, `public/js/views/settings.js`, `public/js/views/bulk.js`.

---

## 16. Custom fields (replacement for Amazing Fields)
* **Add / edit fields** (board button **Fields**): a sidebar lists the board's fields (drag, or Alt+↑/↓, to reorder; fields under a section tab are indented). **+ Add** opens a gallery of field types with live examples, searchable and grouped into *Basic*, *Examples* (VAT status, company number, UTR, status, priority, deadline, year end, fee, percentage, services, things to check, required text) and *Layout*. The editor for the selected field has: name, **Editor style** (switch between related types, e.g. segment buttons / dropdown / coloured chips, or text / multi-line / link / email / phone), options with colours, number format (£ € $ %) and decimals, number of stars, deadline colours; **Display**: show value on card front, show field name on card front, hide on new cards by default, required (red while empty), help text, placeholder; **Field editor layout**: width (full, 1/2, 1/3), label on top or on the left, background colour. **Clone field** and **Delete field** (two clicks). A **preview card** on the right shows any card of the board with the unsaved changes. Nothing is saved until **Save fields**; saving is refused if someone else saved the list in the meantime.
* **Field types (the full Amazing Fields catalogue, 112 types, plus 8 practice presets):**
  * *Basic (10):* Text, Checkbox, Dropdown, Segment Button, Coloured Chips, Number, Date / Time, Member, Progress Bar, Duration.
  * *Examples (16):* Status, Priority, URL, Phone, Email, Required Text, Multi-line Text Area, Like (thumbs up), Checklist Progress (worked out from the card's checklists, optionally one checklist by name), Percentage with Colour, Card ID Text (the card's number on the board with a prefix), Currency, Rating, Deadline Date (warning days), Ball Colour Progress (your own symbols), Last Updated (card created / last activity / due).
  * *Advanced (3):* Card Reference (link other cards; click to open), Field Header, Section Tab.
  * *Progress Bars (13):* Smooth, Block / Low, Braille Smooth, Braille Block, Circles, Squares, Block / Shade, Emoji Squares, Parallelogram, Rounded Rect, Tall Bar, Large Dots, Emoji Dots (plus a simple bar and your own symbols). Number and progress fields can be coloured by value (red / yellow / green thresholds, optionally reversed).
  * *Ratings (19):* Classic, Outlined, Pinwheel and 4-Point Stars, Circles, Large Circles, Bullseye, Squares, Diamonds, Hexagons, Hearts, Gold Stars, Red Hearts, Red Circles, Green Circles, Blue Squares, Moons, Batteries, Target; 3 to 10 symbols.
  * *Toggles (14):* Checkbox, Circle Check, Radio Dot, Check Only, Circle Check Only, Square Check Only, Toggle Switch, Star, Thumbs Up / Down, Lock / Unlock, Arrow Up / Down, Circle Arrow, Square Caret, Check / X (plus Like).
  * *Numbers (8):* Standard, No Grouping, Scientific, Engineering, Currency (any ISO currency), Accounting (brackets for negatives), Percent (0-1), Percent (0-100); 0–6 decimals.
  * *Dates (29):* 8 date formats (short, extra short, medium, medium weekday, full, huge, year only, month/year), 5 time formats (12-hour, 24-hour, with short or long timezone) and 16 date-and-time formats. Times are stored as HH:MM; dates with times as UTC and shown in each viewer's timezone.
  * *Practice:* VAT status, company number, UTR, year end, fee, services, things to check, time spent.
  * Not included: Amazing Fields' sample boards (they are board templates, not field types), formulas, and text validation / colour rules.
* **Card:** card back → **Fields** tab; each change saves immediately. **Visible fields** picks which fields this card shows (*All*, *None*, *Board default* or tick individual fields, grouped by section). Badges follow the card's visible fields; a required field that is empty shows a red "missing" badge if its badge is on.
* **Table view:** saved views as tabs (**+** saves the current settings as a new view; **Save view** updates the open one; views are shared by everyone on the board), search, **Filter** (per field: is / is not / contains / empty / before / after / > / <, and by list), **Sort** (or click a column heading), **Columns**, **Group by** (list, choice field or checkbox; groups collapse), **Show** 50–1000 rows, **Export to spreadsheet** (CSV of the filtered rows and shown columns, formula-injection safe). Choice buttons, chips, checkboxes and stars are edited directly in the cell; other cells become editable on click. ↗ opens the card.
* **Storage:** definitions, values and views are kept in the Keel worker's D1 database, not in Trello pluginData, so the 4 KB per-card limit does not apply (limits: 200 fields per board, 20,000 characters per notes field, 100 KB per card, 20 views). Every request carries the user's Trello token; the worker asks Trello whether that token can open the board/card before reading or writing, and caches a successful check for 5 minutes. Two people editing different fields of the same card do not overwrite each other.
* **Import:** **Fields → Import → Scan this board** reads other Power-Ups' data on the board and its cards through the Trello API (read-only) and lists what it finds. **Save a copy for import setup** stores that data in the D1 database so a mapping into Keel fields can be built from the real format.
* **Limits:** fields need the person to have authorised Keel; without it the tab shows an Authorise button and no badges are drawn. Badges refresh within a minute, or straight away after a change made in Keel.
* **Code:** `public/js/lib/fields.js` (types, gallery, formatting, badges, API), `public/js/lib/field-ui.js` (editors and card layout), `public/js/tabs/fields.js`, `public/js/views/fields-board.js` + `fields-manage.js` + `fields-table.js` + `fields-import.js`, `public/js/features/fields.js`, `worker/src/fields.js`, `worker/src/index.js`.

## 17. Card-front deadlines
* **Built:** Power-Up settings → **Card-front deadlines** chooses, per board, which deadline badges appear on card fronts: Companies House status (when not active), accounts due, confirmation statement due, corporation tax payment, CT600 return (off by default), and the client-stage badges for bookkeeping, year-end accounts, VAT and PAYE. Card-back details are unaffected. Badges for custom fields are chosen per field (**Show field value on card front**).
* **Code:** `public/js/lib/deadline-badges.js`, `public/js/features/companies-house.js`, `public/js/features/crm.js`, `public/js/views/settings.js`.

## 18. Several tabs at once on a card
* **Why not several Keel sections:** Trello allows one card-back section per Power-Up. A second copy of Keel registered as another Power-Up would have its own, separate storage, so it could not see Keel's data.
* **Built:** the Keel section's **⊞ Several tabs** button turns the tab bar into tick-boxes; each ticked tab shows as its own panel, **Side by side** (columns when the card is wide enough) or **Stack**ed. **×** on a panel hides it; **✕ One tab** goes back to a single tab. Ctrl/Cmd/Shift-click on a tab adds it as a panel in one step. The choice is remembered per person (in this browser) and applies to every card.
* **Code:** `public/js/views/card-back.js`.

## Data stored by the Power-Up

| Scope | Key | Contents |
|---|---|---|
| card | `priority` | `'urgent' \| 'high' \| 'medium' \| 'low'` |
| card | `company` | Companies House snapshot (number, name, status, dates, ≤8 officers) |
| card | `views` | `{ total, viewers: { memberId: { n, u, at, c } } }` |
| card | `parent` / `children` | `{ id, name }` / `[cardId]` |
| card | `crm` | `{ bookkeeping|accounts|vat|paye: { on, stage, period, note } }` |
| card | `schedule` | `[{ id, at, type, listId?, listName?, value?, temp? }]` |
| card | `fieldsRev` | time of the last Fields change (only used to refresh badges; values live in D1) |
| card | `features` | per-card override `{ featureId: true/false }` (absent = follows board defaults) |
| board | `settings` | `{ chProxyUrl, cardBadges: { badgeId: true/false }, defaults: { featureId: true/false } }` |
| board | `routines` | `[{ id, name, steps[] }]` |
| board | `audit` | `{ members: { id: { n, u, first, last, v } }, log: [{ m, at }] }` |
| board | `scheduleLog` | last 15 executed scheduled actions |

Removing the Power-Up from a board (`remove-data`) clears the board-level keys; card-level data stays with the cards and is reused if the Power-Up is re-added.
