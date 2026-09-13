const app = document.getElementById("app");
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const fmt = {
  date(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  },
  num(n, digits = 0) {
    if (n == null || n === "") return "—";
    return Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  },
  lakh(n) {
    if (n == null || n === "") return "—";
    return `₹ ${fmt.num(n, 1)} L`;
  },
  inr(n) {
    if (n == null || n === "") return "—";
    return `₹ ${Number(n).toLocaleString("en-IN")}`;
  },
  tonnes(n) {
    if (n == null || n === "") return "—";
    return `${fmt.num(n, 2)} T`;
  },
  pct(n) {
    if (n == null || n === "") return "—";
    return `${fmt.num(n, 1)}%`;
  },
  /** Width / GSM / micron: numbers stay formatted; BizSol ranges stay readable strings. */
  dim(value, suffix = "") {
    if (value == null || value === "") return "—";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "—";
      return `${fmt.num(value)}${suffix}`;
    }
    const raw = String(value).trim();
    if (!raw) return "—";
    if (/^[+-]?\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw))) {
      return `${fmt.num(raw)}${suffix}`;
    }
    const escaped = escapeHtml(raw);
    if (!suffix) return escaped;
    const unit = suffix.trim();
    if (unit && raw.toLowerCase().includes(unit.toLowerCase())) return escaped;
    // "1001-1030" is numeric-ish → add unit; "1101-Any" / "63g-75g" keep letters as-is.
    if (/^[\d.\s-]+$/.test(raw)) return `${escaped}${suffix}`;
    return escaped;
  },
};

function trendAmount(row) {
  if (row?.amountLakh != null && row.amountLakh !== "") return Number(row.amountLakh);
  if (row?.amount != null && row.amount !== "") return Number(row.amount);
  return null;
}

function pills(items) {
  if (!items || !items.length) return "—";
  return `<span class="pills">${items
    .map((item) => `<span class="pill">${escapeHtml(item)}</span>`)
    .join("")}</span>`;
}

function customerPills(itemsOrMeta, activeSet) {
  if (!itemsOrMeta || !itemsOrMeta.length) return "—";
  return `<span class="pills">${itemsOrMeta
    .map((item) => {
      const isMeta = item && typeof item === "object";
      const name = isMeta ? item.name : item;
      const active = isMeta
        ? Boolean(item.active)
        : activeSet.has(String(name).toLowerCase());
      const cls = active ? "pill pill-active" : "pill";
      return `<span class="${cls}">${escapeHtml(name)}</span>`;
    })
    .join("")}</span>`;
}

function rankLabel(row) {
  if (row.supplementary || row.rank === "+1") return "+1";
  return escapeHtml(row.rank);
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content;
}

function badge(status) {
  const s = String(status || "").toLowerCase();
  return `<span class="badge ${s}">${escapeHtml(status)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function table(columns, rows, tableId, rowClass) {
  if (!rows.length) return `<p class="empty">No rows in this snapshot.</p>`;
  const head = columns
    .map((c) => `<th class="${c.align === "right" ? "num" : ""}">${escapeHtml(c.label)}</th>`)
    .join("");
  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const raw = c.value ? c.value(row) : row[c.key];
          const cls = c.align === "right" ? "num" : "";
          return `<td class="${cls}" data-label="${escapeHtml(c.label)}">${raw}</td>`;
        })
        .join("");
      const extra = rowClass ? rowClass(row) : "";
      return `<tr class="${extra}">${cells}</tr>`;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table id="${tableId || ""}">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function bindFilter(input, tableId) {
  const field = document.getElementById(input);
  const tableEl = document.getElementById(tableId);
  if (!field || !tableEl) return;
  field.addEventListener("input", () => {
    const q = field.value.trim().toLowerCase();
    tableEl.querySelectorAll("tbody tr").forEach((tr) => {
      tr.hidden = q !== "" && !tr.textContent.toLowerCase().includes(q);
    });
  });
}

function sampleBanner(isSample) {
  if (!isSample) return "";
  return `<div class="banner" role="status">Sample placeholder data — replace the JSON files under <code>data/</code> on Monday. Not live ERP figures.</div>`;
}

function pageChrome(title, lede, asOf, extra = "") {
  return `
    <div class="page-head">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">${escapeHtml(lede)}</p>
      </div>
      <div class="meta-stack">
        <span>Snapshot as of</span>
        <strong>${escapeHtml(fmt.date(asOf))}</strong>
        <div class="actions" style="margin-top:8px;justify-content:flex-end">
          <button type="button" id="print-btn">Print</button>
        </div>
      </div>
    </div>
    ${extra}`;
}

function setNav(route) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.getAttribute("data-nav") === route;
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function renderHome(manifest, reportsData) {
  const cards = manifest.reports
    .map((r) => {
      const data = reportsData[r.id];
      if (r.status === "upcoming") {
        return `
          <article class="card upcoming">
            <span class="card-kicker">Upcoming</span>
            <h2>${escapeHtml(r.title)}</h2>
            <p>${escapeHtml(r.subtitle)}</p>
            <div class="card-stats">
              <div><span class="stat-label">Status</span><span class="stat-value">Not live</span></div>
              <div><span class="stat-label">Add</span><span class="stat-value">${escapeHtml(r.dataFile || "data/*.json")}</span></div>
            </div>
          </article>`;
      }
      const stats = cardStats(r.id, data);
      return `
        <a class="card" href="${escapeHtml(r.hash)}">
          <span class="card-kicker">${escapeHtml(fmt.date(data?.asOf || manifest.lastUpdated))}</span>
          <h2>${escapeHtml(r.title)}</h2>
          <p>${escapeHtml(r.subtitle)}</p>
          <div class="card-stats">${stats}</div>
        </a>`;
    })
    .join("");

  app.replaceChildren(el(`
    ${pageChrome(
      "Weekly operations",
      `${manifest.company} / ${manifest.brand} — labels, raw materials, and the next report in one place.`,
      manifest.lastUpdated
    )}
    ${sampleBanner(manifest.sample)}
    <section class="cards">${cards}</section>
    <section class="panel how">
      <h2>Monday update</h2>
      <p class="hint">Keep the HTML. Refresh the JSON, commit, and this page updates after GitHub Pages deploys.</p>
      <ol>
        <li>Overwrite <code>data/labels.json</code> and <code>data/inventory.json</code> with that week’s extract.</li>
        <li>Set each file’s <code>asOf</code> (and <code>data/reports.json</code> <code>lastUpdated</code>) to the Monday date.</li>
        <li>Set <code>sample</code> to <code>false</code> once real numbers are in.</li>
        <li>Commit to <code>main</code>. The Pages workflow publishes the site.</li>
      </ol>
    </section>
  `));
}

function cardStats(id, data) {
  if (!data) {
    return `<div><span class="stat-label">Data</span><span class="stat-value">Missing</span></div>`;
  }
  if (id === "label") {
    const ai = data.header?.activeInactive || {};
    return `
      <div><span class="stat-label">MTD</span><span class="stat-value">${fmt.lakh(data.header?.mtd?.amountLakh)}</span></div>
      <div><span class="stat-label">Active / pool</span><span class="stat-value">${fmt.num(ai.active)} / ${fmt.num(ai.pool)}</span></div>`;
  }
  if (id === "rm") {
    return `
      <div><span class="stat-label">Shortage</span><span class="stat-value">${fmt.num(data.shortage?.length)} lines</span></div>
      <div><span class="stat-label">Excess</span><span class="stat-value">${fmt.num(data.excess?.length)} lines</span></div>`;
  }
  if (id === "gumming") {
    const ai = data.header?.activeInactive || {};
    return `
      <div><span class="stat-label">MTD</span><span class="stat-value">${fmt.lakh(data.header?.mtd?.amountLakh)}</span></div>
      <div><span class="stat-label">Active / pool</span><span class="stat-value">${fmt.num(ai.active)} / ${fmt.num(ai.pool)}</span></div>`;
  }
  return `
    <div><span class="stat-label">As of</span><span class="stat-value">${escapeHtml(fmt.date(data.asOf))}</span></div>`;
}

function renderLabels(data) {
  const mtd = data.header?.mtd || {};
  const ai = data.header?.activeInactive || {};
  const trend = data.header?.monthlyTrend || [];
  const amounts = trend.map(trendAmount);
  const maxAmt = Math.max(...amounts.filter((n) => n != null), 1);
  const activeSet = new Set(
    (data.active || []).map((row) => String(row.customer || "").toLowerCase())
  );

  const bars = trend
    .map((t) => {
      const amt = trendAmount(t);
      const pct = Math.max(6, Math.round(((amt || 0) / maxAmt) * 100));
      const partial = /mtd/i.test(t.label || "");
      return `
        <div class="bar-col ${partial ? "partial" : ""}">
          <div class="bar" style="--bar:${pct}%" title="${escapeHtml(t.label)}: ${fmt.lakh(amt)}"></div>
          <div class="bar-meta"><b>${escapeHtml(t.label)}</b>${fmt.lakh(amt)}</div>
        </div>`;
    })
    .join("");

  app.replaceChildren(el(`
    ${pageChrome("Labels", data.title || "Labels management report", data.asOf)}
    ${sampleBanner(data.sample)}
    <section class="kpis">
      <div class="kpi"><span>MTD</span><strong>${fmt.lakh(mtd.amountLakh)}</strong></div>
      <div class="kpi"><span>MTD vs avg month</span><strong>${fmt.pct(mtd.pctOfAvg)}</strong></div>
      <div class="kpi"><span>Avg monthly</span><strong>${fmt.lakh(mtd.avgMonthlyLakh)}</strong></div>
      <div class="kpi"><span>Active / inactive</span><strong>${fmt.num(ai.active)} / ${fmt.num(ai.inactive)}</strong></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Monthly trend</h2>
        <p class="hint">Billing in ₹ lakh. Sep is month-to-date.</p>
      </div>
      <div class="bars">${bars}</div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Planning — 6 + 1</h2>
        <p class="hint">Stock / req = current boxes (from S-19 rolls ÷ rolls/box) / avg boxes per month. Boxing 4/6÷24, 3/5÷36, 50×30÷48.</p>
      </div>
      ${table(
        [
          { key: "rank", label: "Rank", align: "right", value: rankLabel },
          { key: "item", label: "Item", value: (r) => escapeHtml(r.item) },
          { key: "size", label: "Size", value: (r) => escapeHtml(r.size) },
          { key: "avgQtyPerMo", label: "Avg qty / mo", align: "right", value: (r) => fmt.num(r.avgQtyPerMo) },
          { key: "currentStockRolls", label: "Current stock (rolls)", align: "right", value: (r) => fmt.num(r.currentStockRolls) },
          { key: "boxesRequirement", label: "Stock / req (boxes)", align: "right", value: (r) => escapeHtml(r.boxesRequirement || (r.currentBoxes != null && r.avgBoxesPerMo != null ? `${r.currentBoxes} / ${r.avgBoxesPerMo}` : "—")) },
          { key: "customersA", label: "Customers A", value: (r) => customerPills(r.customersAMeta || r.customersA, activeSet) },
          { key: "customersB", label: "Customers B", value: (r) => customerPills(r.customersBMeta || r.customersB, activeSet) },
        ],
        data.planning || [],
        "planning-table",
        (r) => (r.supplementary || r.rank === "+1" ? "supplementary" : "")
      )}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Lost</h2>
        <p class="hint">AOV ≥ ${fmt.inr(ai.aovFloor || 50000)}, no dispatch in 60+ days · ${fmt.num((data.lost || []).length)} accounts</p>
      </div>
      <div class="toolbar">
        <input type="search" id="lost-filter" placeholder="Filter lost accounts…" aria-label="Filter lost accounts">
      </div>
      ${table(
        [
          { key: "marketingPerson", label: "Marketing", value: (r) => escapeHtml(r.marketingPerson) },
          { key: "customer", label: "Customer", value: (r) => escapeHtml(r.customer) },
          { key: "products", label: "Products", value: (r) => pills(r.products) },
        ],
        data.lost || [],
        "lost-table"
      )}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Active</h2>
        <p class="hint">AOV ≥ ${fmt.inr(ai.aovFloor || 50000)}, dispatch in last 60 days. Avgs from past 2 months. Pool ${fmt.num(ai.pool)}.</p>
      </div>
      <div class="toolbar">
        <input type="search" id="active-filter" placeholder="Filter active accounts…" aria-label="Filter active accounts">
      </div>
      ${table(
        [
          { key: "marketingPerson", label: "Marketing", value: (r) => escapeHtml(r.marketingPerson) },
          { key: "customer", label: "Customer", value: (r) => escapeHtml(r.customer) },
          { key: "avgDispatchDays", label: "Avg dispatch days", align: "right", value: (r) => fmt.num(r.avgDispatchDays) },
          { key: "avgOrderValue", label: "Avg order value", align: "right", value: (r) => fmt.inr(r.avgOrderValue) },
          { key: "products", label: "Products", value: (r) => pills(r.products) },
        ],
        data.active || [],
        "active-table"
      )}
    </section>
    ${ai.note ? `<p class="source">${escapeHtml(ai.note)}</p>` : ""}
  `));
  bindFilter("lost-filter", "lost-table");
  bindFilter("active-filter", "active-table");
}

function rmColumns() {
  return [
    { key: "itemName", label: "Item", value: (r) => escapeHtml(r.itemName) },
    { key: "type", label: "Type", value: (r) => escapeHtml(r.type) },
    { key: "width", label: "Width", align: "right", value: (r) => fmt.dim(r.width, " mm") },
    { key: "micron", label: "Micron", align: "right", value: (r) => fmt.dim(r.micron) },
    { key: "gsm", label: "GSM", align: "right", value: (r) => fmt.dim(r.gsm) },
    { key: "currentStockT", label: "Stock (T)", align: "right", value: (r) => fmt.tonnes(r.currentStockT) },
    { key: "avgConsumedT", label: "Avg consume (T)", align: "right", value: (r) => fmt.tonnes(r.avgConsumedT) },
    { key: "pendingPoT", label: "Pending PO (T)", align: "right", value: (r) => fmt.tonnes(r.pendingPoT) },
    { key: "note", label: "Note", value: (r) => escapeHtml(r.note) },
  ];
}

function renderInventory(data) {
  const stockouts = (data.shortage || []).filter((r) => !r.currentStockT).length;
  app.replaceChildren(el(`
    ${pageChrome("Inventory / RM", data.title || "Inventory management / RM stock", data.asOf)}
    ${sampleBanner(data.sample)}
    <p class="source">${escapeHtml(data.source || "")}</p>
    <section class="kpis">
      <div class="kpi"><span>Shortage lines</span><strong>${fmt.num((data.shortage || []).length)}</strong></div>
      <div class="kpi"><span>Excess lines</span><strong>${fmt.num((data.excess || []).length)}</strong></div>
      <div class="kpi"><span>Stock-outs</span><strong>${fmt.num(stockouts)}</strong></div>
      <div class="kpi"><span>Notes</span><strong>${fmt.num((data.notes || []).length)}</strong></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Shortage</h2>
        <p class="hint">Top short items · quantities in tonnes</p>
      </div>
      <div class="toolbar">
        <input type="search" id="short-filter" placeholder="Filter shortages…" aria-label="Filter shortages">
      </div>
      ${table(rmColumns(), data.shortage || [], "short-table")}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Excess</h2>
        <p class="hint">Top excess items · quantities in tonnes</p>
      </div>
      <div class="toolbar">
        <input type="search" id="excess-filter" placeholder="Filter excess…" aria-label="Filter excess">
      </div>
      ${table(rmColumns(), data.excess || [], "excess-table")}
    </section>
    ${
      (data.notes || []).length
        ? `<section class="panel">
      <div class="panel-head">
        <h2>Notes / also watch</h2>
      </div>
      <ul class="notes">
        ${data.notes
          .map((n) => `<li>${badge(n.severity)}<span>${escapeHtml(n.text)}</span></li>`)
          .join("")}
      </ul>
    </section>`
        : ""
    }
  `));
  bindFilter("short-filter", "short-table");
  bindFilter("excess-filter", "excess-table");
}

function renderUpcoming(report) {
  app.replaceChildren(el(`
    ${pageChrome(report.title, report.subtitle, null)}
    <div class="banner" role="status">${escapeHtml(report.note || "This report is not live yet.")}</div>
    <section class="panel">
      <h2>Extension point</h2>
      <p>Add <code>${escapeHtml(report.dataFile || "data/<id>.json")}</code>, set this report’s <code>status</code> to <code>active</code> in <code>data/reports.json</code>, and register a renderer in <code>js/app.js</code> (<code>renderers</code> map).</p>
    </section>
  `));
}

function renderGumming(data) {
  const mtd = data.header?.mtd || {};
  const ai = data.header?.activeInactive || {};
  const trend = data.header?.monthlyTrend || [];
  const amounts = trend.map(trendAmount);
  const maxAmt = Math.max(...amounts.filter((n) => n != null), 1);
  const activeSet = new Set(
    (data.active || []).map((row) => String(row.customer || "").toLowerCase())
  );

  const bars = trend
    .map((t) => {
      const amt = trendAmount(t);
      const pct = Math.max(6, Math.round(((amt || 0) / maxAmt) * 100));
      const partial = /mtd/i.test(t.label || "");
      return `
        <div class="bar-col ${partial ? "partial" : ""}">
          <div class="bar" style="--bar:${pct}%" title="${escapeHtml(t.label)}: ${fmt.lakh(amt)}"></div>
          <div class="bar-meta"><b>${escapeHtml(t.label)}</b>${fmt.lakh(amt)}</div>
        </div>`;
    })
    .join("");

  app.replaceChildren(el(`
    ${pageChrome("Gumming sheets", data.title || "Gumming sheets management report", data.asOf)}
    ${sampleBanner(data.sample)}
    <section class="kpis">
      <div class="kpi"><span>MTD</span><strong>${fmt.lakh(mtd.amountLakh)}</strong></div>
      <div class="kpi"><span>MTD vs avg month</span><strong>${fmt.pct(mtd.pctOfAvg)}</strong></div>
      <div class="kpi"><span>Avg monthly</span><strong>${fmt.lakh(mtd.avgMonthlyLakh)}</strong></div>
      <div class="kpi"><span>Active / inactive</span><strong>${fmt.num(ai.active)} / ${fmt.num(ai.inactive)}</strong></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Monthly trend</h2>
        <p class="hint">Billing in ₹ lakh.</p>
      </div>
      <div class="bars">${bars}</div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Planning — top 10</h2>
        <p class="hint">AOV ≥ ₹1L pool; customers & products lists capped at top 5; Sheet Form category</p>
      </div>
      ${table(
        [
          { key: "rank", label: "Rank", align: "right", value: rankLabel },
          { key: "item", label: "Item", value: (r) => escapeHtml(r.item) },
          { key: "size", label: "Size", value: (r) => escapeHtml(r.size) },
          { key: "avgQtyPerMo", label: "Avg qty / mo", align: "right", value: (r) => fmt.num(r.avgQtyPerMo) },
          { key: "customersA", label: "Customers A", value: (r) => customerPills(r.customersAMeta || r.customersA, activeSet) },
          { key: "customersB", label: "Customers B", value: (r) => customerPills(r.customersBMeta || r.customersB, activeSet) },
        ],
        data.planning || [],
        "gumming-planning-table"
      )}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Lost</h2>
        <p class="hint">AOV ≥ ${fmt.inr(ai.aovFloor || 100000)}, no dispatch in 60+ days · ${fmt.num((data.lost || []).length)} accounts</p>
      </div>
      <div class="toolbar">
        <input type="search" id="gumming-lost-filter" placeholder="Filter lost accounts…" aria-label="Filter lost accounts">
      </div>
      ${table(
        [
          { key: "marketingPerson", label: "Marketing", value: (r) => escapeHtml(r.marketingPerson) },
          { key: "customer", label: "Customer", value: (r) => escapeHtml(r.customer) },
          { key: "products", label: "Products", value: (r) => pills(r.products) },
        ],
        data.lost || [],
        "gumming-lost-table"
      )}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Active</h2>
        <p class="hint">AOV ≥ ${fmt.inr(ai.aovFloor || 100000)}, dispatch in last 60 days. Avgs from past 2 months. Pool ${fmt.num(ai.pool)}.</p>
      </div>
      <div class="toolbar">
        <input type="search" id="gumming-active-filter" placeholder="Filter active accounts…" aria-label="Filter active accounts">
      </div>
      ${table(
        [
          { key: "marketingPerson", label: "Marketing", value: (r) => escapeHtml(r.marketingPerson) },
          { key: "customer", label: "Customer", value: (r) => escapeHtml(r.customer) },
          { key: "avgDispatchDays", label: "Avg dispatch days", align: "right", value: (r) => fmt.num(r.avgDispatchDays) },
          { key: "avgOrderValue", label: "Avg order value", align: "right", value: (r) => fmt.inr(r.avgOrderValue) },
          { key: "products", label: "Products", value: (r) => pills(r.products) },
        ],
        data.active || [],
        "gumming-active-table"
      )}
    </section>
    ${ai.note ? `<p class="source">${escapeHtml(ai.note)}</p>` : ""}
  `));
  bindFilter("gumming-lost-filter", "gumming-lost-table");
  bindFilter("gumming-active-filter", "gumming-active-table");
}

const renderers = {
  label: renderLabels,
  rm: renderInventory,
  gumming: renderGumming,
};

function renderError(err) {
  app.replaceChildren(el(`
    <div class="page-head"><div><h1>Could not load report</h1>
    <p class="lede">Open the site over HTTP (GitHub Pages or a local static server). <code>file://</code> cannot fetch JSON.</p></div></div>
    <div class="banner err">${escapeHtml(err.message)}</div>
  `));
}

async function route() {
  const raw = (location.hash || "#home").replace("#", "") || "home";
  const routeId = raw === "" ? "home" : raw;
  setNav(routeId === "home" ? "home" : routeId);
  document.title =
    routeId === "home"
      ? "SAL Papers / Dubble — Weekly ops"
      : `${routeId} — SAL Papers / Dubble`;

  try {
    const manifest = await loadJSON("data/reports.json");
    if (routeId === "home") {
      const pairs = await Promise.all(
        manifest.reports
          .filter((r) => r.status === "active" && r.dataFile)
          .map(async (r) => [r.id, await loadJSON(r.dataFile)])
      );
      renderHome(manifest, Object.fromEntries(pairs));
    } else {
      const report = manifest.reports.find((r) => r.id === routeId);
      if (!report) {
        app.replaceChildren(el(`<div class="page-head"><div><h1>Unknown report</h1><p class="lede">No page for <code>#${escapeHtml(routeId)}</code>.</p></div></div>`));
        return;
      }
      if (report.status !== "active") {
        renderUpcoming(report);
        return;
      }
      const data = await loadJSON(report.dataFile);
      const render = renderers[report.id];
      if (!render) {
        renderUpcoming({
          ...report,
          note: `Data loaded, but no renderer is registered for "${report.id}". Add one in js/app.js.`,
        });
        return;
      }
      render(data);
    }
  } catch (err) {
    renderError(err);
  }

  document.getElementById("print-btn")?.addEventListener("click", () => window.print());
}

const UNLOCK_KEY = "salDashUnlocked";
const PASS_HASH = "cfe9e7f9b8631de788bd3f8e1f1a6de4c184eabe9c3fb589aa6490c3937ae638";

async function sha256Hex(code) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function startApp() {
  window.addEventListener("hashchange", route);
  route();
}

function removeGate() {
  document.documentElement.classList.remove("is-locked");
  document.getElementById("gate")?.remove();
}

async function onGateSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("gate-code");
  const error = document.getElementById("gate-error");
  if (!input) return;
  const hex = await sha256Hex(input.value);
  if (hex === PASS_HASH) {
    sessionStorage.setItem(UNLOCK_KEY, "1");
    removeGate();
    startApp();
    return;
  }
  if (error) {
    error.hidden = false;
    error.textContent = "Wrong passcode";
  }
  input.value = "";
  input.focus();
}

function initGate() {
  if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
    removeGate();
    startApp();
    return;
  }
  document.documentElement.classList.add("is-locked");
  const form = document.getElementById("gate-form");
  const input = document.getElementById("gate-code");
  form?.addEventListener("submit", onGateSubmit);
  input?.focus();
}

initGate();
