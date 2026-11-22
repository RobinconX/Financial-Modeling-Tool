# Portfolio trades (`portfolioTrades`)

Executed equity buys and sells for performance tracking. Stored at the **snapshot root** (not inside each `portfolios[]` book). Ledger-only: does not change `holdings[].sharesHeld` or planned `actions[]`.

## Shape

```json
{
  "portfolioTrades": {
    "version": 1,
    "trades": []
  }
}
```

## Trade object

| Field | Required | Notes |
| --- | --- | --- |
| `portfolioId` | yes | UUID of a book in `portfolios[]` |
| `symbol` | yes | Equity ticker; uppercased on import (e.g. `AAPL`) |
| `side` | yes | `"buy"` or `"sell"` |
| `tradeDate` | yes | ISO calendar date `YYYY-MM-DD` |
| `shares` | yes | Positive number |
| `price` | yes | Per-share execution price in `currency` |
| `currency` | no | `"USD"` or `"CHF"`; defaults to **USD** when omitted (migration + import) |
| `fees` | no | In `currency`; defaults to `0` |
| `note` | no | Short text |
| `id` | no | UUID; generated if omitted |
| `holdingId` | no | Optional Positions row link (UI only) |

> **Stored vs displayed** — Price and fees are kept in the trade’s own `currency`. Performance math converts them to the portfolio **display currency** (USD/CHF toggle) using the live USD/CHF rate, and converts marks from quote/history currency the same way.

## Import behavior

- Rows missing required fields or invalid tickers/dates are **dropped** (no import failure).
- `symbol` is trimmed and uppercased.
- `currency` omitted or empty → **USD**.
- `fees` omitted or empty → `0`.

## Example (agent-filled)

```json
{
  "version": 1,
  "exportedAt": "2026-11-21T00:00:00.000Z",
  "scenarios": [],
  "portfolios": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Main",
      "currentCash": 0,
      "deposits": [],
      "holdings": [],
      "actions": [],
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "incomeCost": { "version": 3, "scenarios": [], "lines": [], "draws": [] },
  "savings": { "version": 1, "accounts": [] },
  "overview": { "version": 2, "scenarios": [], "selectedScenarioId": null },
  "portfolioTrades": {
    "version": 1,
    "trades": [
      {
        "portfolioId": "11111111-1111-4111-8111-111111111111",
        "symbol": "aapl",
        "side": "buy",
        "tradeDate": "2024-01-10",
        "shares": 50,
        "price": 185.2,
        "currency": "USD"
      },
      {
        "portfolioId": "11111111-1111-4111-8111-111111111111",
        "symbol": "AAPL",
        "side": "sell",
        "tradeDate": "2025-03-01",
        "shares": 10,
        "price": 210,
        "currency": "USD",
        "fees": 1.5,
        "note": "Trim"
      }
    ]
  }
}
```

After import, both rows normalize to symbol `AAPL`; the first row receives a generated `id` if none was provided.

## Bulk import (Performance tab)

**Import** on **Portfolio → Performance** appends to the **selected book** only:

- **JSON:** `{ "trades": [ … ] }`, a bare `[ … ]` array, or full snapshot `portfolioTrades.trades`
- **CSV:** header row plus data. Required columns: `symbol`, `side`, `tradeDate`, `shares`, `price`. Optional: `currency`, `fees`, `note`, `id`, `holdingId`, `portfolioId`
- Rows with another `portfolioId` are **reassigned** to the current book (noted in preview)
- `holdingId` is kept only when it matches a holding on the current book; otherwise stripped
- **Duplicates** (same `symbol`, `side`, `tradeDate`, `shares`, `price`, `currency` as an existing trade or an earlier row in the file): preview offers **Skip duplicates** (default) or **Import anyway**
- Invalid rows are listed with reasons; only valid rows are imported on confirm

### Export

**Export** downloads a JSON file for the **current book** in the same shape as import (`{ "version": 1, "exportedAt", "portfolioId", "trades": [ … ] }`). Export → Import round-trips the ledger including `currency`.

**Clear** removes all trades on the current book after confirmation (use Export first for backup).

### CSV example

```csv
symbol,side,tradeDate,shares,price,currency,fees,note
AAPL,buy,2024-01-10,50,185.2,USD,1.00,Open
AAPL,sell,2025-03-01,10,210,USD,,
```