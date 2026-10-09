# SAL Papers / Dubble — weekly ops dashboard

Static briefing site for **SAL Papers / Dubble** (B2B label stock).  
Home is a sales overview. Four reports sit under it:

| Route | Report | Data file |
| --- | --- | --- |
| `#home` | Sales overview (tabs, KPIs, trend) plus report cards | `data/home.json` (cards also use `data/reports.json`) |
| `#label` | Labels management report | `data/labels.json` |
| `#rm` | Inventory management / RM stock | `data/inventory.json` |
| `#gumming` | Gumming sheets management report | `data/gumming.json` |
| `#attribution` | Sales attribution — revenue by customer source | `data/attribution.json` |

If `data/home.json` fails to load, `#home` falls back to the report cards only.

Files with `"sample": true` are bannered in the UI. Do not use sample figures for purchasing or planning.

## Sales figures — own group companies

Every sales figure on `#home`, `#label`, `#gumming`, and `#attribution` **excludes only** billing to these own group companies:

- M/S SAL PAPERS PVT LTD
- M/S SHREE ARIHANT LAMINATES

PFW LABEL SOLUTIONS is included (it is not an own group company). The home page footnotes repeat the excluded amount. Match is case- and punctuation-insensitive; a leading `M/S` is ignored.

## Production planning — past 3 months

Labels and gumming production planning both use the **past 3 complete months** only (currently Jun–Aug 2026).

- `#label` has no 3-month / 6-month dropdown. The table is the top 6 by sales over those 3 months, plus fixed `+1` / `+2` / `+3` rows. Stock / requirement uses the 3-month averages. `planningWindows` contains only `"3mo"`.
- `#gumming` ranks the top 10 on the same 3-month window. The header monthly trend and the 6-month average (Mar–Aug) are unchanged.

## Public URL

After GitHub Pages is enabled (see below):

**https://apoorv9496.github.io/sal-dashboard/**

- Home: https://apoorv9496.github.io/sal-dashboard/#home  
- Labels: https://apoorv9496.github.io/sal-dashboard/#label  
- Inventory / RM: https://apoorv9496.github.io/sal-dashboard/#rm  
- Gumming sheets: https://apoorv9496.github.io/sal-dashboard/#gumming  
- Sales attribution: https://apoorv9496.github.io/sal-dashboard/#attribution  

No Node runtime on Pages. The site is HTML + CSS + vanilla JS that `fetch`es the JSON files.

## Enable GitHub Pages (one-time)

This repo deploys with GitHub Actions from `main` (`.github/workflows/deploy-pages.yml`).

1. Repo **Settings → Pages**.
2. **Source:** GitHub Actions.
3. Merge to `main` (or run the **Deploy GitHub Pages** workflow).
4. The environment URL should resolve to `https://apoorv9496.github.io/sal-dashboard/`.

Fallback if Actions Pages is unavailable: **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**. Keep `.nojekyll` so GitHub does not run Jekyll.

## Local preview

Browsers block `fetch` of JSON from `file://`. Serve the repo root:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080/

## Monday update

Weekly refresh is a **data commit**, not an HTML edit.

1. Replace `data/labels.json`, `data/gumming.json`, `data/inventory.json`, `data/home.json`, and `data/attribution.json` with that week’s extract (keep the same keys). Rebuild `data/home.json` and `data/attribution.json` from Sales Analysis (Total Bill Amount, GST-inclusive); do not total them by hand in the page. `#attribution` reads `Buyer_Source` as already aggregated in `data/attribution.json`.
2. Keep the own-company exclusion (only M/S SAL PAPERS PVT LTD and M/S SHREE ARIHANT LAMINATES) and keep production planning on the past 3 complete months.
3. Set `asOf` on each file to the Monday date (`YYYY-MM-DD`).
4. Set `lastUpdated` in `data/reports.json` to the same Monday.
5. Set `"sample": false` once real figures replace the placeholders.
6. Commit and push to `main`. Pages republishes in a minute or two.

To add a report later:

1. Add `data/<id>.json`.
2. In `data/reports.json`, set that entry’s `status` to `"active"`.
3. Add a renderer in `js/app.js` on the `renderers` map.

## JSON schemas

### `data/reports.json`

Registry + home-page last-updated. Upcoming rows appear as disabled cards.

```json
{
  "company": "SAL Papers",
  "brand": "Dubble",
  "tagline": "Weekly operations briefing",
  "lastUpdated": "2026-09-08",
  "sample": true,
  "reports": [
    {
      "id": "label",
      "title": "Labels",
      "subtitle": "Labels management report",
      "hash": "#label",
      "dataFile": "data/labels.json",
      "status": "active"
    }
  ]
}
```

`status` is `active` or `upcoming`. Optional `homeDataFile` overrides the default `data/home.json` path.

### `data/home.json`

Sales overview for `#home`. Amounts are ₹ lakh, GST-inclusive Total Bill Amount. The page does not recompute them.

```json
{
  "asOf": "2026-09-28",
  "sample": false,
  "title": "Sales overview",
  "source": "Sales Analysis · ERP_Sales_Data · Total Bill Amount (col 81, GST-inclusive)",
  "lastInvoiceDate": "2026-09-26",
  "definition": {
    "excludedBuyers": ["M/S SAL PAPERS PVT LTD", "M/S SHREE ARIHANT LAMINATES"],
    "appliesTo": "every tab and metric"
  },
  "periods": {
    "mtd": ["2026-09-01", "2026-09-26"],
    "prevSamePeriod": ["2026-08-01", "2026-08-26"],
    "prevFullMonth": ["2026-08-01", "2026-08-31"],
    "lastYearSamePeriod": ["2025-09-01", "2025-09-26"],
    "avgMonths": ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"],
    "activeCutoffExclusive": "2026-08-14"
  },
  "defaultTab": "all",
  "tabs": [
    {
      "id": "all",
      "label": "All",
      "onDashboard": true,
      "shareOfMtdPct": 100,
      "monthlyTrend": [{ "month": "2026-09", "label": "Sep'26", "amountLakh": 529.69, "partial": true }],
      "mtd": { "amountLakh": 529.69, "invoices": 134, "customers": 76, "pctOfAvg": 89.4, "avgMonthlyLakh": 592.81 },
      "prevSamePeriod": { "amountLakh": 358.19, "invoices": 111, "customers": 69, "changePct": 47.9 },
      "prevFullMonth": { "amountLakh": 482.9, "mtdPctOfPrevFull": 109.7 },
      "lastYearSamePeriod": { "amountLakh": 480.01, "changePct": 10.3 },
      "customers45d": { "activeBilled": 97 },
      "avgInvoiceValue": { "mtdLakh": 3.95, "prevSamePeriodLakh": 3.23 },
      "topCustomersMtd": [{ "customer": "EXAMPLE", "amountLakh": 63.2, "sharePct": 11.9, "prevSamePeriodLakh": 50.4 }],
      "concentration": { "top5SharePctMtd": 37.9, "top5SharePct12m": 38.2, "top10SharePct12m": 55.4, "customers12m": 232 },
      "footnotes": ["Excludes own group companies…"]
    }
  ],
  "notes": { "excludedOwnCompany": { "mtdLakh": 65.78 } }
}
```

| Field | Meaning |
| --- | --- |
| `defaultTab` | Tab selected on a fresh visit. The choice is remembered in `sessionStorage` for the rest of the session. |
| `tabs[]` | All, Labels, Gumming sheets, Roll form, Other / misc. `onDashboard: false` shows a “new” chip (no report page yet). |
| `monthlyTrend[].partial` | Current month. Drawn as a hollow dot on a dotted segment. |
| `mtd.pctOfAvg` / `avgMonthlyLakh` | MTD as a percent of the average of `periods.avgMonths` (the 6 complete months before this month, Mar–Aug). |
| `prevSamePeriod` | Same day-of-month range last month. The chart marks it with a ◆ on the current month’s x position. |
| `customers45d` | Customers billed after `activeCutoffExclusive`. No AOV floor, so this count differs from the label and gumming pools. |
| `footnotes` | Shown under the chart, including the own-company exclusion. |

### `data/labels.json`

Matches the weekly **labels management** report. Amounts are ₹ lakh.

```json
{
  "asOf": "2026-09-08",
  "sample": true,
  "title": "Labels management report",
  "header": {
    "monthlyTrend": [
      { "month": "2026-08", "label": "Aug", "amountLakh": 48.8 }
    ],
    "mtd": {
      "amountLakh": 18.4,
      "pctOfAvg": 40.7,
      "avgMonthlyLakh": 45.2
    },
    "activeInactive": {
      "active": 24,
      "inactive": 11,
      "pool": 35,
      "aovFloor": 50000,
      "note": "Pool = customers with AOV ≥ ₹50,000. Active = dispatch in last 60 days."
    }
  },
  "planning": [
    {
      "rank": 1,
      "item": "DT Label Roll",
      "size": "50×25",
      "avgQtyPerMo": 18400,
      "avgBoxesPerMo": 74,
      "customersA": ["Medico Pack"],
      "customersB": ["Kiran Labels"]
    },
    {
      "rank": "+1",
      "item": "DT Label Roll (Y)",
      "size": "4/6",
      "avgQtyPerMo": 2400,
      "avgBoxesPerMo": 12,
      "customersA": ["Orbit Retail"],
      "customersB": ["Festive Print Co"],
      "supplementary": true
    }
  ],
  "lost": [
    {
      "marketingPerson": "Rahul S.",
      "customer": "Vishal Distributors",
      "products": ["[DT Label Roll 50×25]", "[TT Label Roll 75×50]"]
    }
  ],
  "active": [
    {
      "marketingPerson": "Rahul S.",
      "customer": "Medico Pack",
      "avgDispatchDays": 11,
      "avgOrderValue": 186000,
      "products": ["[DT Label Roll 50×25]"]
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `monthlyTrend[].amountLakh` | Billing that month in ₹ lakh. `amount` is also accepted. |
| `mtd.pctOfAvg` | MTD billing as % of `avgMonthlyLakh`. |
| `activeInactive.pool` | Customers with AOV ≥ `aovFloor` (₹50,000). |
| `planning` / `planningWindows["3mo"]` | Top 6 by sales over the past 3 months, plus fixed `+1` / `+2` / `+3`. There is no 6-month window. |
| `avgBoxesPerMo` | `null` renders as —. Used for 50×30 in the sample. |
| `customersA` / `customersB` | Arrays of customer **names** (two columns on the weekly sheet). |
| `lost` | AOV ≥ ₹50K and no dispatch in 60+ days. |
| `active` | AOV ≥ ₹50K and dispatch in the last 60 days. `avgDispatchDays` / `avgOrderValue` are past-2-month averages. |
| `products` | Strings like `"[ITEM SIZE]"`. |

### `data/inventory.json`

Matches the weekly **inventory management** report (Dashboard tab 4 / RM mail). Quantities are **tonnes**.

```json
{
  "asOf": "2026-09-08",
  "sample": true,
  "title": "Inventory management / RM stock",
  "source": "Dashboard tab 4 — mail dated 8 Sep 2026 (sample)",
  "excess": [
    {
      "itemName": "Glassine liner",
      "type": "Liner",
      "width": 1000,
      "micron": null,
      "gsm": 62,
      "currentStockT": 18.42,
      "avgConsumedT": 4.10,
      "pendingPoT": 0,
      "note": "Two lots landed together"
    }
  ],
  "shortage": [
    {
      "itemName": "DT facestock",
      "type": "Paper",
      "width": 330,
      "micron": null,
      "gsm": 80,
      "currentStockT": 0.82,
      "avgConsumedT": 4.50,
      "pendingPoT": 6.00,
      "note": "Expedite PO-4412"
    }
  ],
  "notes": [
    { "severity": "watch", "text": "Also watch: PET liner stock-out." }
  ]
}
```

`excess` and `shortage` share the same row shape. `width` is mm; use `null` when the spec is not a slit width. `micron` (films) and `gsm` (papers) are optional. `notes` is optional — use it for **Also watch** lines. `severity` is `urgent` | `watch` | `info`.

### `data/attribution.json`

Sales attribution for `#attribution`. Amounts are ₹ lakh, GST-inclusive Total Bill Amount, credited entirely to the customer’s recorded `Buyer_Source` (single source). The page does not recompute them.

The page is two panels driven by the period pills (month-to-date, last month, last 3 months, trailing 12 months, lifetime). The choice is remembered in `sessionStorage` (`salAttrPeriod`). Revenue by source uses all categories. Source × category is the category split, so there are no category tabs. Other and Unknown are untagged. Weekly rebuild: replace this file and keep the same keys; set `asOf` to the Monday date.

## Layout

```
index.html                 Home + hash-routed reports
404.html                   Pointers back to hash routes
css/styles.css
js/app.js                  Router, tables, inline SVG trend, renderers
data/reports.json          Manifest / extension registry
data/home.json             Sales overview
data/labels.json
data/gumming.json
data/inventory.json
data/attribution.json      Sales attribution (`#attribution`)
.github/workflows/deploy-pages.yml
```

Out of scope: Google Drive, Gmail, live ERP, and any server runtime on Pages.
