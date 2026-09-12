# SAL Papers / Dubble — weekly ops dashboard

Static briefing site for **SAL Papers / Dubble** (B2B label stock).  
Home plus two live reports:

| Route | Report | Data file |
| --- | --- | --- |
| `#home` | Overview cards + last updated | `data/reports.json` |
| `#label` | Barcode labels management | `data/labels.json` |
| `#rm` | Inventory / RM stock snapshot | `data/inventory.json` |

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
      "subtitle": "Barcode labels management",
      "hash": "#label",
      "dataFile": "data/labels.json",
      "status": "active"
    }
  ]
}
```

`status` is `active` or `upcoming`.

### `data/labels.json`

```json
{
  "asOf": "2026-09-08",
  "sample": true,
  "title": "Barcode labels management",
  "header": {
    "monthlyTrend": [
      { "month": "2026-08", "label": "Aug", "qty": 238150, "boxes": 953 }
    ],
    "mtd": {
      "qty": 86420,
      "boxes": 346,
      "skus": 41,
      "customers": 28,
      "avgBoxFill": 250
    },
    "activeInactive": {
      "active": 41,
      "inactive": 14,
      "newThisMonth": 2,
      "reactivated": 1
    }
  },
  "planning": [
    {
      "rank": 1,
      "item": "DT White 80 gsm",
      "size": "50 × 25 mm",
      "avgQty": 18400,
      "avgBoxes": 74,
      "customersA": 9,
      "customersB": 6
    }
  ],
  "lost": [
    {
      "item": "TT Gloss 60 × 40",
      "size": "60 × 40 mm",
      "reason": "No repeat in 6 weeks",
      "lastQty": 3200,
      "customersLost": 2,
      "weeksInactive": 6
    }
  ],
  "active": [
    {
      "item": "DT White 80 gsm",
      "size": "50 × 25 mm",
      "status": "running",
      "mtdQty": 21200,
      "mtdBoxes": 85,
      "customers": 9,
      "notes": "Core runner"
    }
  ]
}
```

- `customersA` — contract / regular accounts buying the SKU.  
- `customersB` — spot / trade accounts.  
- `active[].status` — `running` | `watch` | `new`.

### `data/inventory.json`

```json
{
  "asOf": "2026-09-08",
  "sample": true,
  "title": "Inventory / RM stock snapshot",
  "source": "Weekly RM desk close — 8 Sep 2026 (sample)",
  "excess": [
    {
      "item": "Glassine liner 62 gsm",
      "grade": "White / 1000 mm",
      "uom": "kg",
      "onHand": 18420,
      "norm": 9000,
      "excessQty": 9420,
      "location": "RM-2 / Bay C",
      "note": "Two lots landed together"
    }
  ],
  "shortage": [
    {
      "item": "Direct thermal facestock 80 gsm",
      "grade": "Top-coated / 330 mm",
      "uom": "kg",
      "onHand": 820,
      "reorder": 2500,
      "shortQty": 1680,
      "leadDays": 18,
      "action": "Expedite PO-4412"
    }
  ],
  "notes": [
    { "severity": "urgent", "text": "DT 80 gsm covers ~4 production days." }
  ]
}
```

`notes[].severity` — `urgent` | `watch` | `info`.

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
