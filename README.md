# SAL Papers / Dubble — weekly ops dashboard

Static briefing site for **SAL Papers / Dubble** (B2B label stock).  
Home plus two live reports:

| Route | Report | Data file |
| --- | --- | --- |
| `#home` | Overview cards + last updated | `data/reports.json` |
| `#label` | Labels management report | `data/labels.json` |
| `#rm` | Inventory management / RM stock | `data/inventory.json` |

Gumming sheets is registered as **upcoming** in `data/reports.json` so the next report can land without a layout rewrite.

The first commit ships **realistic sample numbers**. They are marked `sample: true` and bannered in the UI. Do not use them for purchasing or planning.

## Public URL

After GitHub Pages is enabled (see below):

**https://apoorv9496.github.io/sal-dashboard/**

- Home: https://apoorv9496.github.io/sal-dashboard/#home  
- Labels: https://apoorv9496.github.io/sal-dashboard/#label  
- Inventory / RM: https://apoorv9496.github.io/sal-dashboard/#rm  

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

1. Replace `data/labels.json` and `data/inventory.json` with that week’s extract (keep the same keys).
2. Set `asOf` on each file to the Monday date (`YYYY-MM-DD`).
3. Set `lastUpdated` in `data/reports.json` to the same Monday.
4. Set `"sample": false` once real figures replace the placeholders.
5. Commit and push to `main`. Pages republishes in a minute or two.

To add a report later (e.g. gumming):

1. Add `data/gumming.json`.
2. In `data/reports.json`, set the `gumming` entry `status` to `"active"`.
3. Add a renderer in `js/app.js` on the `renderers` map (`gumming: renderGumming`).

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

`status` is `active` or `upcoming`.

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
| `planning` | Top 5 movers plus optional `+1` (`supplementary: true`) — sample uses **DT Label Roll (Y) 4/6**. |
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

## Layout

```
index.html                 Home + hash-routed reports
404.html                   Pointers back to hash routes
css/styles.css
js/app.js                  Router, tables, renderers
data/reports.json          Manifest / extension registry
data/labels.json
data/inventory.json
.github/workflows/deploy-pages.yml
```

Out of scope: Google Drive, Gmail, live ERP, and any server runtime on Pages.
