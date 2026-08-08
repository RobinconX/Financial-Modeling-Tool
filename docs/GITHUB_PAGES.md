# GitHub Pages setup

Serve the **built** app as a static website so you (or a collaborator) open a URL instead of running `npm run dev`.

**Data is not stored on GitHub.** Each browser uses localStorage and, optionally, a **linked JSON file** on the user’s machine (see **Data & backup** in the app). Pages only hosts the UI.

Live **stock quotes** need a tiny proxy (Yahoo/Nasdaq block browser CORS). GitHub Pages has no server, so use the free **Cloudflare Worker** in `workers/market-api` (steps below). **FX (USD↔CHF)** can call Frankfurter directly from the browser as a fallback even without the worker.

---

## 1. Enable Pages on the repository

1. Open the repo on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment**:
   - **Source:** GitHub Actions  
   (not “Deploy from a branch”).
3. Save if prompted.

The workflow file is already in the repo:

`.github/workflows/deploy-pages.yml`

It builds on push to **`v1-prod`** only (other branches are for development), and on manual **Run workflow**.

---

## 2. Set the base path (project site)

If the site URL will be:

`https://<username>.github.io/<repository-name>/`

create a repository variable:

1. **Settings** → **Secrets and variables** → **Actions** → **Variables**.
2. **New repository variable**
   - Name: `VITE_BASE`
   - Value: `/<repository-name>/`  
     Example: repo `Financial-Modeling-Tool` → `/Financial-Modeling-Tool/`

If you use a **custom domain** or a **user/org site** (`https://<username>.github.io/`), leave `VITE_BASE` unset (defaults to `/`).

---

## 3. Stock quotes on Pages (Cloudflare Worker)

Local `npm run dev` / `preview` already serve `/api/quote` via Vite. Pages does not.

### 3a. Deploy the worker (once)

1. Create a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.
2. On your machine (Node installed):

```bash
cd workers/market-api
npm install
npx wrangler login
npx wrangler deploy
```

3. Wrangler prints a URL like:

`https://fmt-market-api.<your-subdomain>.workers.dev`

4. Open that URL in a browser — you should see a small JSON `{ "ok": true, ... }`.
5. Smoke-test a quote:

`https://fmt-market-api.<your-subdomain>.workers.dev/api/quote?symbol=AAPL`

### 3b. Point the Pages app at the worker

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **Variables**.
2. **New repository variable**
   - Name: `VITE_API_BASE`
   - Value: the worker URL **with no trailing slash**  
     Example: `https://fmt-market-api.myaccount.workers.dev`
3. Redeploy Pages (push to `v1-prod` or **Actions → Deploy GitHub Pages → Run workflow**).

The built app will call `${VITE_API_BASE}/api/quote?...` instead of same-origin `/api/quote`.

No API keys are required (Yahoo chart + Nasdaq public endpoints + Frankfurter).

---

## 4. Deploy

1. Push a commit to **`v1-prod`**, **or**
2. **Actions** → **Deploy GitHub Pages** → **Run workflow** (any branch, for a one-off deploy).

Wait for the green check. Then open:

- Project site: `https://<username>.github.io/<repository-name>/`
- Or the URL shown under **Settings → Pages**.

---

## 5. First use after opening Pages

1. Open the site in **Chrome or Edge** if you want to **link a data file**.
2. Go to **Data & backup** in the sidebar.
3. **Create new file…** or **Open / link file…** and pick a path (e.g. `Documents/Financial Modeling/financial-model.json`).
4. Optionally put that folder in OneDrive/Dropbox for multi-PC backup (still only your file).
5. Use **Export JSON…** anytime as a backup (works in all browsers).

If the browser cannot link a file (e.g. Firefox), use **Export / Import** only.

---

## 6. Private repo / restricted access

- **Private repository + Pages:** available on GitHub Pro/Team/Enterprise (and free private for some plans—check current GitHub docs).
- Collaborators need repo access to open a **private** Pages site (GitHub’s access model).
- Their **data** is still separate unless they import your JSON file.

---

## 7. Local “production” without Pages

```bash
npm install
npm run build
npm run preview
```

Open the printed URL. Quote API works here because Vite preview includes the local API plugin.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Blank page / wrong assets | Set `VITE_BASE` to `/YourRepoName/` and redeploy |
| 404 on refresh of deep links | SPA is only `index.html`; this app uses client tabs, no router paths—OK |
| Quotes fail on Pages | Deploy `workers/market-api`, set `VITE_API_BASE`, redeploy Pages |
| Linked file forgotten after restart | Re-link once; allow permission when the browser asks |
| Want same data on second PC | Copy the JSON file or use a synced folder + link the same file path style |
