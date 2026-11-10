# Keel — a Trello Power-Up

A Trello Power-Up built for an accountancy practice. It adds, to any board you enable it on:

| Feature | Where you find it in Trello |
|---|---|
| Card priority (Urgent / High / Medium / Low) | Badge on the card front · "Priority" badge on the card back · list menu → *Sort by* → Priority |
| Companies House lookup + deadlines at a glance | Card back → **Keel** section → **Company** tab · deadline badges on the card front |
| Client CRM (bookkeeping / accounts / VAT / PAYE stages) | Card back → **Client stages** tab · board button **Client CRM** (all clients in one table, CSV export) |
| Task card ↔ subtask cards | Card button **Subtasks** · card back → **Subtasks** tab · badges "↑ parent" and "☑ 2/5 subtasks" |
| Checklist sub-points and ordering | Card back → **Checklist** tab (numbered 1, 1.1, 1.2…, move up/down, indent/outdent) |
| Card history | Card back → **History** tab |
| Who viewed a card / card views | Card back → **Who viewed** tab · "Views" badge on the card back |
| Board visits & activity audit | Board button **Activity audit** |
| Filter the cards of one list | List menu (⋯) → **Filter cards in this list…** |
| Processes & routines (step templates → checklists) | Board button **Routines** · card button **Apply routine** |
| Scheduled card actions | Card button **Schedule action** (archive, move, complete, set priority at a date/time) |
| Temporary cards | Card button **Temporary card** (auto-archive after a period) |
| Bulk card actions | Board button **Bulk actions** |
| Feature switches: defaults for cards, per-card and bulk on/off | Power-Up settings → **Default features for cards** · card back → **⚙ Features** tab · Bulk actions → *Turn feature ON/OFF* / *Reset to board defaults* |

`docs/FEATURES.md` explains how each one works and where Trello's Power-Up platform limits what is possible (for example, Trello gives no real "viewed" or "logged in" events, and a Power-Up cannot place a search box inside a list header).

---

## How a Trello Power-Up works (2-minute version)

A Power-Up is **not** uploaded to Trello. It is a small website that you host, and Trello loads it inside hidden iframes:

```
Trello board  ──loads──▶  https://cristimarin9-blip.github.io/Trello-Plugin/   (this repo's /public folder)
                               │
                               ├── index.html + js/client.js  registers the buttons, badges and sections
                               ├── views/*.html               the popups and panels users see
                               └── (Companies House tab) ──▶ Cloudflare Worker ──▶ Companies House API
```

So "deploying" means three things:

1. publish the `public/` folder on an HTTPS host (we use GitHub Pages, free);
2. tell Trello the URL in the Power-Up admin portal;
3. (for Companies House only) deploy the tiny proxy in `worker/`, because the Companies House API needs a secret key and blocks browser calls.

Nothing here needs a server you maintain, and both hosts have free tiers that are plenty for a practice.

---

## Step-by-step deployment

### Step 1 — Get the code onto the `main` branch

This work was pushed to the branch `claude/kind-noether-scwkbs`. The deploy workflow publishes from `main`, so either:

* open a pull request from `claude/kind-noether-scwkbs` into `main` on GitHub and merge it, **or**
* on GitHub go to **Actions → Deploy Power-Up to GitHub Pages → Run workflow**, pick the branch and run it (fine for a first test).

### Step 2 — Turn on GitHub Pages

1. In the repository go to **Settings → Pages**.
2. Under **Build and deployment → Source** choose **GitHub Actions**. Save.
3. Go to **Actions**. If no run is listed, run **Deploy Power-Up to GitHub Pages** manually. A green tick takes about a minute.
4. Your Power-Up URL is now **`https://cristimarin9-blip.github.io/Trello-Plugin/`**.
   Opening it shows a blank page — that is correct, the connector has no visible content.
   Open `https://cristimarin9-blip.github.io/Trello-Plugin/views/settings.html` instead: you should see the settings form (it will complain it is not inside Trello, which is fine).

Every later push to `main` that touches `public/` redeploys automatically.

### Step 3 — Register the Power-Up with Trello and set up OAuth 2.0

1. Go to **https://trello.com/power-ups/admin** and click **New**.
2. Under **Basic information** fill in:
   * **Name**: Keel
   * **Workspace**: the workspace whose boards will use it (custom Power-Ups are only visible inside this workspace)
   * **Iframe connector URL**: `https://cristimarin9-blip.github.io/Trello-Plugin/`
   * Email / support contact / author: your details
3. Open **Authorization → OAuth 2.0** in the left menu:
   * **Client security type**: Public (Keel has no server, so there is no secret).
   * **Callback URL(s)**: paste exactly `https://cristimarin9-blip.github.io/Trello-Plugin/views/oauth-callback.html` and click **Add**.
   * **Scopes**: *Read boards* and *Write boards* are pre-ticked and are all Keel needs. Leave the rest unticked.
   * Click **Save**.
4. Copy the **Client ID** shown on that page and put it in `public/js/config.js`:

```js
export const OAUTH_CLIENT_ID = 'paste-your-client-id-here';
```

   The Client ID is a public identifier, so committing it is normal. Commit, push to `main` (or merge) and wait for the Pages deploy.

You can ignore **Authorization → Trello Auth**. That is the older API-key flow; Keel uses OAuth 2.0 instead.

### Step 4 — Tick the capabilities in the admin portal

Trello only calls the capabilities you enable. In the Power-Up admin open the **Capabilities** tab and switch on exactly these:

- Board buttons
- Card badges
- Card back section
- Card buttons
- Card detail badges
- List actions
- List sorters
- Show settings
- Authorization status
- Show authorization
- On enable
- Remove data

(They match the keys registered in `public/js/client.js`. If you add a capability in code later, tick it here too.)

### Step 5 — Add it to a board and authorise

1. Open a board in that workspace → **Power-Ups** (top bar or board menu) → **Custom** tab → **Keel → Add**.
2. The settings popup opens (it also opens later from the Power-Up's gear icon). Click **Authorise**: Trello's consent screen opens in a popup, click **Allow**, and the popup closes itself. This grants Keel an OAuth 2.0 token to read and write cards on your behalf, which card history, checklist tools, routines, bulk and scheduled actions need. Each team member authorises once per workspace; tokens refresh themselves and only need renewing if unused for 90 days.
3. Open any card: you should see the **Keel** section with the tabs, and the new card buttons on the right.

If something does not appear, do a hard refresh (Ctrl/Cmd + Shift + R) — Trello caches the connector.

### Step 6 — Companies House (optional but recommended)

**6a. Get a Companies House API key**

1. Create an account at **https://developer.company-information.service.gov.uk/** and sign in.
2. **Manage applications → Create an application**. Name it, choose environment **Live**, create.
3. Inside the application: **Create new key** → key type **REST** → create. Copy the key. (Leave IP restrictions empty; the worker's IP changes.)

**6b. Deploy the proxy worker (free Cloudflare account)**

Install Node.js from https://nodejs.org if you do not have it, then in a terminal:

```bash
cd worker
```

```bash
npm install
```

```bash
npx wrangler login
```

```bash
npx wrangler secret put CH_API_KEY
```

(paste the Companies House key when prompted)

```bash
npx wrangler deploy
```

The last command prints the worker URL, e.g. `https://trello-companies-house-proxy.<your-account>.workers.dev`.
Test it in a browser: `<worker-url>/company/00000006` should return JSON for a real company.

`worker/wrangler.toml` already restricts browser access to `https://cristimarin9-blip.github.io`; change `ALLOWED_ORIGINS` if you host the Power-Up elsewhere.

**6c. Point the Power-Up at it**

Board → Power-Up gear icon → **Settings** → paste the worker URL into **Proxy URL** → **Save settings**.

Now open a client card → **Company** tab → type the company number → **Look up**. The card front gets badges for accounts, confirmation statement and estimated corporation-tax deadlines, coloured red/orange/yellow/green by proximity. Snapshots refresh automatically when a card is opened after 24 hours.

---

## Day-to-day

* **Changing the Power-Up**: edit files under `public/`, push to `main`, wait ~1 minute, hard-refresh Trello.
* **Checks before pushing**: `npm run check` parses every module and runs the date/number unit tests; `npm run smoke` loads every page in headless Chromium with a fake Trello client (needs Playwright installed locally: `npm i -D playwright && npx playwright install chromium`). The **Check** GitHub Action runs `npm run check` on every push.
* **Testing without deploying**: Trello only loads HTTPS pages, so serve `public/` locally (`npm run serve`) and expose it with a tunnel such as `npx cloudflared tunnel --url http://localhost:8080` or ngrok, then create a second Power-Up ("Keel DEV") in the admin portal pointing at the tunnel URL.
* **Other workspaces**: a custom Power-Up is only listed in the workspace chosen in step 3. Create another Power-Up entry per workspace (same URL), or go through Trello's public-listing review.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Power-Up not in the **Custom** tab | Board is not in the workspace chosen in the admin portal |
| No buttons/badges after adding | Capabilities not ticked (step 5), or Trello cache — hard refresh |
| "Authorise" popup shows an error or never closes | Callback URL in the OAuth 2.0 tab does not match `.../views/oauth-callback.html` exactly, the OAuth 2.0 settings were not saved, or `OAUTH_CLIENT_ID` is still the placeholder (step 3) |
| Authorised on one board but not another | OAuth 2.0 tokens for Power-Ups are per workspace; authorise again on a board in the other workspace |
| Checklist / History tab says "Authorise…" | That browser has not authorised yet — Power-Up gear → Settings → Authorise |
| Companies House lookup fails | Proxy URL not saved, worker not deployed, `CH_API_KEY` secret missing, or `ALLOWED_ORIGINS` does not match the Pages origin |
| "Too much routine text" | Trello allows 4 KB of Power-Up data per board; shorten or delete routines |
| Scheduled action did not run at the exact time | Actions run when a board member next opens the board (see `docs/FEATURES.md`); use Trello Automation for exact timing |

## Repository layout

```
public/                 the Power-Up (deployed to GitHub Pages)
  index.html            connector loaded by Trello
  js/config.js          OAuth 2.0 client ID, redirect URI, APP_NAME, storage keys
  js/client.js          registers all capabilities
  js/features/*.js      badge/button logic per feature
  js/tabs/*.js          tabs of the card-back section
  js/views/*.js         popups and modals
  views/*.html          the pages for those popups and modals
worker/                 Cloudflare Worker proxy for Companies House
scripts/                check.mjs (syntax + unit tests), smoke.mjs (headless page test)
.github/workflows/      Pages deploy + checks
docs/FEATURES.md        feature-by-feature notes and limitations
```
