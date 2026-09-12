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
  num(n) {
    if (n == null || n === "") return "—";
    return Number(n).toLocaleString("en-IN");
  },
};

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

function table(columns, rows, tableId) {
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
          return `<td class="${cls}">${raw}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
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
    return `
      <div><span class="stat-label">MTD labels</span><span class="stat-value">${fmt.num(data.header?.mtd?.qty)}</span></div>
      <div><span class="stat-label">Active SKUs</span><span class="stat-value">${fmt.num(data.header?.activeInactive?.active)}</span></div>`;
  }
  if (id === "rm") {
    return `
      <div><span class="stat-label">Shortages</span><span class="stat-value">${fmt.num(data.shortage?.length)}</span></div>
      <div><span class="stat-label">Excess lines</span><span class="stat-value">${fmt.num(data.excess?.length)}</span></div>`;
  }
  return `
    <div><span class="stat-label">As of</span><span class="stat-value">${escapeHtml(fmt.date(data.asOf))}</span></div>`;
}

function renderLabels(data) {
  const mtd = data.header?.mtd || {};
  const ai = data.header?.activeInactive || {};
  const trend = data.header?.monthlyTrend || [];
  const maxQty = Math.max(...trend.map((t) => t.qty), 1);

  const bars = trend
    .map((t) => {
      const h = Math.max(8, Math.round((t.qty / maxQty) * 140));
      const partial = /mtd/i.test(t.label || "");
      return `
        <div class="bar-col ${partial ? "partial" : ""}">
          <div class="bar" style="height:${h}px" title="${escapeHtml(t.label)}: ${fmt.num(t.qty)}"></div>
          <div class="bar-meta"><b>${escapeHtml(t.label)}</b>${fmt.num(t.qty)}</div>
        </div>`;
    })
    .join("");

  app.replaceChildren(el(`
    ${pageChrome("Labels", data.title || "Barcode labels management", data.asOf)}
    ${sampleBanner(data.sample)}
    <section class="kpis">
      <div class="kpi"><span>MTD quantity</span><strong>${fmt.num(mtd.qty)}</strong></div>
      <div class="kpi"><span>MTD boxes</span><strong>${fmt.num(mtd.boxes)}</strong></div>
      <div class="kpi"><span>Active SKUs</span><strong>${fmt.num(ai.active)}</strong></div>
      <div class="kpi"><span>Inactive / lost watch</span><strong>${fmt.num(ai.inactive)}</strong></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Monthly trend</h2>
        <p class="hint">Quantity (labels). Sep is month-to-date.</p>
      </div>
      <div class="bars">${bars}</div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Planning — average movers</h2>
        <p class="hint">customersA = contract / regular · customersB = spot / trade</p>
      </div>
      ${table(
        [
          { key: "rank", label: "Rank", align: "right", value: (r) => fmt.num(r.rank) },
          { key: "item", label: "Item", value: (r) => escapeHtml(r.item) },
          { key: "size", label: "Size", value: (r) => escapeHtml(r.size) },
          { key: "avgQty", label: "Avg qty", align: "right", value: (r) => fmt.num(r.avgQty) },
          { key: "avgBoxes", label: "Avg boxes", align: "right", value: (r) => fmt.num(r.avgBoxes) },
          { key: "customersA", label: "Cust. A", align: "right", value: (r) => fmt.num(r.customersA) },
          { key: "customersB", label: "Cust. B", align: "right", value: (r) => fmt.num(r.customersB) },
        ],
        data.planning || [],
        "planning-table"
      )}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Lost / quiet</h2>
        <p class="hint">${fmt.num((data.lost || []).length)} items without recent repeats</p>
      </div>
      ${table(
        [
          { key: "item", label: "Item", value: (r) => escapeHtml(r.item) },
          { key: "size", label: "Size", value: (r) => escapeHtml(r.size) },
          { key: "lastQty", label: "Last qty", align: "right", value: (r) => fmt.num(r.lastQty) },
          { key: "customersLost", label: "Cust. lost", align: "right", value: (r) => fmt.num(r.customersLost) },
          { key: "weeksInactive", label: "Weeks quiet", align: "right", value: (r) => fmt.num(r.weeksInactive) },
          { key: "reason", label: "Reason", value: (r) => escapeHtml(r.reason) },
        ],
        data.lost || [],
        "lost-table"
      )}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Active SKUs</h2>
        <p class="hint">${fmt.num(ai.newThisMonth)} new this month · ${fmt.num(ai.reactivated)} reactivated</p>
      </div>
      <div class="toolbar">
        <input type="search" id="active-filter" placeholder="Filter active SKUs…" aria-label="Filter active SKUs">
      </div>
      ${table(
        [
          { key: "item", label: "Item", value: (r) => escapeHtml(r.item) },
          { key: "size", label: "Size", value: (r) => escapeHtml(r.size) },
          { key: "status", label: "Status", value: (r) => badge(r.status) },
          { key: "mtdQty", label: "MTD qty", align: "right", value: (r) => fmt.num(r.mtdQty) },
          { key: "mtdBoxes", label: "MTD boxes", align: "right", value: (r) => fmt.num(r.mtdBoxes) },
          { key: "customers", label: "Customers", align: "right", value: (r) => fmt.num(r.customers) },
          { key: "notes", label: "Notes", value: (r) => escapeHtml(r.notes) },
        ],
        data.active || [],
        "active-table"
      )}
    </section>
  `));
  bindFilter("active-filter", "active-table");
}

function renderInventory(data) {
  app.replaceChildren(el(`
    ${pageChrome("Inventory / RM", data.title || "Raw material stock snapshot", data.asOf)}
    ${sampleBanner(data.sample)}
    <p class="source">${escapeHtml(data.source || "")}</p>
    <section class="kpis">
      <div class="kpi"><span>Shortage lines</span><strong>${fmt.num((data.shortage || []).length)}</strong></div>
      <div class="kpi"><span>Excess lines</span><strong>${fmt.num((data.excess || []).length)}</strong></div>
      <div class="kpi"><span>Notes</span><strong>${fmt.num((data.notes || []).length)}</strong></div>
      <div class="kpi"><span>Stock-outs</span><strong>${fmt.num((data.shortage || []).filter((r) => r.onHand === 0).length)}</strong></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Shortage</h2>
        <p class="hint">Below reorder — action this week</p>
      </div>
      <div class="toolbar">
        <input type="search" id="short-filter" placeholder="Filter shortages…" aria-label="Filter shortages">
      </div>
      ${table(
        [
          { key: "item", label: "Item", value: (r) => escapeHtml(r.item) },
          { key: "grade", label: "Grade", value: (r) => escapeHtml(r.grade) },
          { key: "uom", label: "UOM", value: (r) => escapeHtml(r.uom) },
          { key: "onHand", label: "On hand", align: "right", value: (r) => fmt.num(r.onHand) },
          { key: "reorder", label: "Reorder", align: "right", value: (r) => fmt.num(r.reorder) },
          { key: "shortQty", label: "Short", align: "right", value: (r) => fmt.num(r.shortQty) },
          { key: "leadDays", label: "Lead (d)", align: "right", value: (r) => fmt.num(r.leadDays) },
          { key: "action", label: "Action", value: (r) => escapeHtml(r.action) },
        ],
        data.shortage || [],
        "short-table"
      )}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Excess</h2>
        <p class="hint">Above norm — use or pause buying</p>
      </div>
      ${table(
        [
          { key: "item", label: "Item", value: (r) => escapeHtml(r.item) },
          { key: "grade", label: "Grade", value: (r) => escapeHtml(r.grade) },
          { key: "uom", label: "UOM", value: (r) => escapeHtml(r.uom) },
          { key: "onHand", label: "On hand", align: "right", value: (r) => fmt.num(r.onHand) },
          { key: "norm", label: "Norm", align: "right", value: (r) => fmt.num(r.norm) },
          { key: "excessQty", label: "Excess", align: "right", value: (r) => fmt.num(r.excessQty) },
          { key: "location", label: "Location", value: (r) => escapeHtml(r.location) },
          { key: "note", label: "Note", value: (r) => escapeHtml(r.note) },
        ],
        data.excess || [],
        "excess-table"
      )}
    </section>
    <section class="panel">
      <h2>Notes</h2>
      <ul class="notes">
        ${(data.notes || [])
          .map(
            (n) => `<li>${badge(n.severity)}<span>${escapeHtml(n.text)}</span></li>`
          )
          .join("")}
      </ul>
    </section>
  `));
  bindFilter("short-filter", "short-table");
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

const renderers = {
  label: renderLabels,
  rm: renderInventory,
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

window.addEventListener("hashchange", route);
route();
