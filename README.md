# Financial Modeling Tool

Local-first dashboard for stock projections, portfolios, income/cost, savings, and net-worth overview.

## Data storage

- **Browser localStorage** — fast mirror while you work.
- **Linked data file** (Chrome/Edge) — optional JSON file you choose (e.g. under Documents or OneDrive). Edits are written there automatically. See **Data & backup** in the app.
- **Export / Import JSON** — works in every browser; use for backup or moving profiles.

No multi-user cloud database: one person, files you control.

## GitHub Pages (no dev server)

Deploy the static UI so you open a URL instead of `npm run dev`.

**Full steps:** [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md)

Short version:

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. If the site is `https://user.github.io/RepoName/`, set Actions variable `VITE_BASE` = `/RepoName/`.
3. Push to `DEV` (or run the **Deploy GitHub Pages** workflow).
4. Open the Pages URL → **Data & backup** → link or export your data file.

## Features

- **Live quotes** for any ticker (Yahoo Finance via local `/api/quote` proxy)
- **Easy mode** — one or more target years + projected market caps
- **Advanced mode** — P/S, P/FCF, and P/E projections (revenue/FCF/profit × multiple) + share dilution
- **ROI p.a.** shown prominently, plus total return and implied market cap
- **Market cap evolution** chart and projection table
- **Compare** two companies side by side
- **Saved projections** — named scenarios per ticker (Easy + Advanced) in browser `localStorage`, inline-editable tables, share price + mcap, charts
- **Portfolio** — allocate dollars to tickers + cash, drive future values from saved projections (or manual year overrides), year × position table, portfolio value chart; portfolios are persisted locally
- Manual market-cap override when needed

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## How ROI is calculated

\[
\text{ROI p.a.} = \left(\frac{\text{projected market cap}}{\text{current market cap}}\right)^{1/n} - 1
\]

where \(n\) is `target year − current year`.

| Mode | Projected market cap |
|------|----------------------|
| Easy | User-entered value |
| P/S | Revenue × P/S multiple |
| P/FCF | FCF × P/FCF multiple |
| P/E | Net profit × P/E multiple |

Money inputs accept suffixes: `50B`, `1.2T`, `500M`.

### Portfolio values

- Enter **shares held** per ticker; value today = shares × current price (scenario snapshot or manual price)
- Future position value = shares × scenario share price for that year (only years with real assumptions — no fill-in)
- Manual year overrides set position **$** for that year
- Cash is constant on every year column; **Total** = cash + non-empty equity cells

## Build

```bash
npm run build
npm run preview
```

The quote API middleware is available in both `dev` and `preview`.
