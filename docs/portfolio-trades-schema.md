# Portfolio trades (`portfolioTrades`)

Executed **equity and option** trades for performance tracking. Stored at the **snapshot root** (not inside each `portfolios[]` book). Ledger-only: does not change `holdings[].sharesHeld` or planned `actions[]`.

## Shape

```json
{
  "portfolioTrades": {
    "version": 2,
    "trades": []
  }
}
```

`version` **1** loads as equity-only legacy rows. Option rows bump storage to **2**.

## Trade object

| Field | Required | Notes |
| --- | --- | --- |
| `portfolioId` | yes | UUID of a book in `portfolios[]` |
| `symbol` | yes* | Equity ticker **or** OCC option symbol (normalized on import) |
| `side` | yes** | `"buy"` or `"sell"` |
| `tradeDate` | yes | ISO calendar date `YYYY-MM-DD` |
| `shares` | yes | Positive number — **contracts** when `instrument` is `option` |
| `price` | yes* | Per-share premium/price in `currency` (USD per option share) |
| `currency` | no | Premium denomination; default **USD** |
| `fees` | no | Default `0` |
| `feesCurrency` | no | Defaults to `currency` (use **CHF** for IB commissions) |
| `instrument` | no | `equity` (default) or `option` |
| `event` | no | `trade` (default), `expire`, `assign`, `exercise` |
| `linkedTradeId` | no | Related equity trade id (e.g. assignment stock sale) |
| `multiplier` | no | Option contracts only; default **100** |
| `occSymbol` / `description` | import | IB `description` parsed in-app when `symbol` omitted |
| `underlying`, `right`, `strike`, `expiry` | import | Optional; filled from OCC when omitted |
| `note` | no | Short text |
| `id` | no | UUID; generated if omitted |
| `holdingId` | no | Equity UI link only |

\* Lifecycle rows (`expire`, `assign`, `exercise`) may use `price: 0`. Import accepts `description` instead of `symbol` for options.

\** Lifecycle rows still carry a `side` for sorting; expire/assign often use the closing side.

### Options behavior

- **Sell with zero open contracts** opens a **short** (options only; equities stay long-only).
- **Realized / unrealized** use `contracts × price × multiplier` (+ fees in `feesCurrency`).
- **Return %** — longs: vs premium paid (`grossBuys`); shorts: vs **premium received** (shorts do not add to gross buys).
- **Auto-expire**: day after `expiry` at $0 if still open and no explicit `expire` / `assign` / `exercise` row.

## Import behavior

- Invalid rows are **dropped** (no import failure).
- Equities: `symbol` uppercased, standard tickers.
- Options: `occSymbol`, OCC `symbol`, or IB **`description`** (`HIMS 16OCT26 25 P`).
- `currency` / `feesCurrency` omitted → **USD** for that field.

### Duplicate detection (import preview)

A row is treated as a duplicate of an existing trade or an earlier row in the same file when its **economic key** matches (pipe-separated, after normalization):

`instrument`, `event`, `symbol`, `side`, `tradeDate`, `shares`, `price`, `currency`, `fees`, `feesCurrency`, option `multiplier` (when `instrument` is `option`), and `linkedTradeId`.

Numeric fields in the key are rounded to **8** decimal places. **`note` is not part of the key** — optional text does not distinguish fills. Default import policy **skips** duplicates; you can import them anyway from the preview.

## JSON examples (agent)

**Option trade (short premium)**

```json
{
  "portfolioId": "11111111-1111-4111-8111-111111111111",
  "instrument": "option",
  "symbol": "HIMS261016P00025000",
  "side": "sell",
  "tradeDate": "2026-01-30",
  "shares": 1,
  "price": 5.43,
  "currency": "USD",
  "fees": 1.2,
  "feesCurrency": "CHF",
  "note": "STO"
}
```

**Expire (worthless)**

```json
{
  "portfolioId": "11111111-1111-4111-8111-111111111111",
  "instrument": "option",
  "event": "expire",
  "symbol": "IREN260320P00030000",
  "side": "buy",
  "tradeDate": "2026-03-21",
  "shares": 1,
  "price": 0,
  "currency": "USD"
}
```

**Assign (linked stock sale already in ledger)**

```json
{
  "portfolioId": "11111111-1111-4111-8111-111111111111",
  "instrument": "option",
  "event": "assign",
  "symbol": "PLTR250919C00047000",
  "side": "buy",
  "tradeDate": "2025-09-19",
  "shares": 2,
  "price": 0,
  "currency": "USD",
  "linkedTradeId": "existing-pltr-stock-sell-trade-uuid"
}
```

## CSV columns

`symbol,side,tradeDate,shares,price,currency,fees,feesCurrency,instrument,event,occSymbol,description,underlying,right,strike,expiry,multiplier,linkedTradeId,note`

Omit unknown columns. `description` can stand in for option `symbol`.