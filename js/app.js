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

/** Y-axis ceiling: max(max month, avgMonthly×1.15), rounded up a little; floor 0. */
function trendScaleCeiling(amounts, avgMonthly) {
  const nums = amounts.filter((n) => n != null && Number.isFinite(n));
  const maxAmt = nums.length ? Math.max(...nums) : 0;
  const avg = Number(avgMonthly);
  const avgPad = Number.isFinite(avg) && avg > 0 ? avg * 1.15 : 0;
  const raw = Math.max(maxAmt, avgPad, 0);
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = mag < 1 ? 0.1 : mag / 10;
  return Math.ceil(raw / step - 1e-9) * step;
}

function monthlyTrendBars(trend, avgMonthly) {
  const amounts = trend.map(trendAmount);
  const scaleMax = trendScaleCeiling(amounts, avgMonthly);
  return trend
    .map((t) => {
      const amt = trendAmount(t);
      const pct = Math.max(0, Math.min(100, Math.round(((amt || 0) / scaleMax) * 100)));
      const partial = /mtd/i.test(t.label || "");
      return `
        <div class="bar-col ${partial ? "partial" : ""}">
          <div class="bar" style="--bar:${pct}" title="${escapeHtml(t.label)}: ${fmt.lakh(amt)}"></div>
          <div class="bar-meta"><b>${escapeHtml(t.label)}</b>${fmt.lakh(amt)}</div>
        </div>`;
    })
    .join("");
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
  const rank = row.rank;
  if (rank === "+1" || rank === "+2" || rank === "+3") return escapeHtml(rank);
  if (row.supplementary) return "+1";
  return escapeHtml(rank);
}

function isSupplementaryRow(row) {
  const rank = String(row?.rank ?? "");
  return Boolean(row?.supplementary) || rank === "+1" || rank === "+2" || rank === "+3";
}

const LABEL_PLANNING_WINDOW_KEY = "salLabelPlanningWindow";

function resolveLabelPlanningWindow(data) {
  let stored = "";
  try {
    stored = sessionStorage.getItem(LABEL_PLANNING_WINDOW_KEY) || "";
  } catch (_) {
    stored = "";
  }
  if (stored === "6mo" || stored === "3mo") return stored;
  return data.defaultPlanningWindow || "6mo";
}

function planningForWindow(data, windowId) {
  const fromWindows = data.planningWindows?.[windowId]?.planning;
  if (Array.isArray(fromWindows)) return fromWindows;
  return data.planning || [];
}

function persistLabelPlanningWindow(windowId) {
  try {
    sessionStorage.setItem(LABEL_PLANNING_WINDOW_KEY, windowId);
  } catch (_) {
    /* ignore quota / private mode */
  }
}

function labelsPlanningColumns(activeSet) {
  return [
    { key: "rank", label: "Rank", align: "right", value: rankLabel },
    { key: "item", label: "Item", value: (r) => escapeHtml(r.item) },
    { key: "size", label: "Size", value: (r) => escapeHtml(r.size) },
    { key: "avgQtyPerMo", label: "Avg qty / mo", align: "right", value: (r) => fmt.num(r.avgQtyPerMo) },
    { key: "currentStockRolls", label: "Current stock (rolls)", align: "right", value: (r) => fmt.num(r.currentStockRolls) },
    { key: "boxesRequirement", label: "Stock / req (boxes)", align: "right", value: (r) => escapeHtml(r.boxesRequirement || (r.currentBoxes != null && r.avgBoxesPerMo != null ? `${r.currentBoxes} / ${r.avgBoxesPerMo}` : "—")) },
    { key: "customersA", label: "Customers A", value: (r) => customerPills(r.customersAMeta || r.customersA, activeSet) },
    { key: "customersB", label: "Customers B", value: (r) => customerPills(r.customersBMeta || r.customersB, activeSet) },
  ];
}

function labelsPlanningTable(data, windowId, activeSet) {
  return table(
    labelsPlanningColumns(activeSet),
    planningForWindow(data, windowId),
    "planning-table",
    (r) => (isSupplementaryRow(r) ? "supplementary" : "")
  );
}

function bindLabelPlanningWindow(data, activeSet) {
  const select = document.getElementById("planning-window");
  const host = document.getElementById("planning-table-host");
  if (!select || !host) return;
  select.addEventListener("change", () => {
    const id = select.value === "3mo" ? "3mo" : "6mo";
    persistLabelPlanningWindow(id);
    host.innerHTML = labelsPlanningTable(data, id, activeSet);
  });
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

function tableRowsHtml(columns, rows, rowClass) {
  return rows
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
}

function table(columns, rows, tableId, rowClass) {
  if (!rows.length) return `<p class="empty">No rows in this snapshot.</p>`;
  const head = columns
    .map((c) => `<th class="${c.align === "right" ? "num" : ""}">${escapeHtml(c.label)}</th>`)
    .join("");
  return `
    <div class="table-wrap">
      <table id="${tableId || ""}">
        <thead><tr>${head}</tr></thead>
        <tbody>${tableRowsHtml(columns, rows, rowClass)}</tbody>
      </table>
    </div>`;
}

function pagedTable(columns, rows, tableId, pageSize = 5) {
  if (!rows.length) return `<p class="empty">No rows in this snapshot.</p>`;
  const total = rows.length;
  const end = Math.min(pageSize, total);
  return `
    ${table(columns, rows.slice(0, pageSize), tableId)}
    <div class="pager" id="${tableId}-pager">
      <span class="pager-range">1–${end} of ${total}</span>
      <div class="pager-actions">
        <button type="button" data-page-dir="prev" disabled>Prev</button>
        <button type="button" data-page-dir="next"${total <= pageSize ? " disabled" : ""}>Next</button>
      </div>
    </div>`;
}

function rowSearchText(columns, row) {
  return columns
    .map((c) => {
      const raw = c.value ? c.value(row) : row[c.key];
      return String(raw ?? "").replace(/<[^>]*>/g, " ");
    })
    .join(" ")
    .toLowerCase();
}

function renderPagedBody(tableId) {
  const state = pagedState[tableId];
  const tableEl = document.getElementById(tableId);
  if (!state || !tableEl) return;
  const tbody = tableEl.querySelector("tbody");
  const pager = document.getElementById(`${tableId}-pager`);
  const total = state.filtered.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize) || 1);
  if (state.page > pages) state.page = pages;
  if (state.page < 1) state.page = 1;
  const startIdx = total ? (state.page - 1) * state.pageSize : 0;
  const pageRows = state.filtered.slice(startIdx, startIdx + state.pageSize);
  tbody.innerHTML = tableRowsHtml(state.columns, pageRows, state.rowClass);
  const start = total ? startIdx + 1 : 0;
  const end = startIdx + pageRows.length;
  const range = pager?.querySelector(".pager-range");
  if (range) range.textContent = `${start}–${end} of ${total}`;
  const prev = pager?.querySelector('[data-page-dir="prev"]');
  const next = pager?.querySelector('[data-page-dir="next"]');
  if (prev) prev.disabled = state.page <= 1 || total === 0;
  if (next) next.disabled = state.page >= pages || total === 0;
}

const pagedState = {};

function bindPagination(tableId) {
  const pager = document.getElementById(`${tableId}-pager`);
  if (!pager) return;
  pager.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-page-dir]");
    const state = pagedState[tableId];
    if (!btn || !state || btn.disabled) return;
    if (btn.getAttribute("data-page-dir") === "next") state.page += 1;
    else state.page -= 1;
    renderPagedBody(tableId);
  });
}

/** Filter text for a row: selected <select> value only, not every <option>. */
function tableRowFilterText(tr) {
  let text = "";
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === "SELECT") {
      const opt = node.options[node.selectedIndex];
      if (opt && opt.value) text += ` ${opt.textContent} `;
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(tr);
  return text.toLowerCase();
}

function bindFilter(input, tableId, columns, allRows, pageSize = 5) {
  const field = document.getElementById(input);
  const tableEl = document.getElementById(tableId);
  if (!field || !tableEl) return;
  if (columns && allRows) {
    pagedState[tableId] = {
      columns,
      rows: allRows,
      filtered: allRows,
      page: 1,
      pageSize,
      rowClass: null,
    };
    bindPagination(tableId);
    field.addEventListener("input", () => {
      const q = field.value.trim().toLowerCase();
      const state = pagedState[tableId];
      state.filtered = q
        ? state.rows.filter((row) => rowSearchText(state.columns, row).includes(q))
        : state.rows;
      state.page = 1;
      renderPagedBody(tableId);
    });
    return;
  }
  field.addEventListener("input", () => {
    const q = field.value.trim().toLowerCase();
    tableEl.querySelectorAll("tbody tr").forEach((tr) => {
      tr.hidden = q !== "" && !tableRowFilterText(tr).includes(q);
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

const LABEL_LOST_ISSUE_KEY_PREFIX = "sal-dashboard:label-lost-issue:";
const LABEL_LOST_ISSUE_VALUES = ["quality", "payment", "rate", "communication", "delay", "duplicate"];

function normalizeLabelLostCustomer(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function labelLostIssueStorageKey(customer) {
  return LABEL_LOST_ISSUE_KEY_PREFIX + normalizeLabelLostCustomer(customer);
}

function readLabelLostIssue(customer) {
  let stored = "";
  try {
    stored = localStorage.getItem(labelLostIssueStorageKey(customer)) || "";
  } catch (_) {
    stored = "";
  }
  return LABEL_LOST_ISSUE_VALUES.includes(stored) ? stored : "";
}

function persistLabelLostIssue(customer, value) {
  const next = LABEL_LOST_ISSUE_VALUES.includes(value) ? value : "";
  try {
    const key = labelLostIssueStorageKey(customer);
    if (next) localStorage.setItem(key, next);
    else localStorage.removeItem(key);
  } catch (_) {
    /* ignore quota / private mode */
  }
}

function labelLostIssueSelect(customer) {
  const current = readLabelLostIssue(customer);
  const options = [`<option value="">—</option>`]
    .concat(
      LABEL_LOST_ISSUE_VALUES.map(
        (value) =>
          `<option value="${value}"${current === value ? " selected" : ""}>${value}</option>`
      )
    )
    .join("");
  return `<select class="issue-select" data-customer="${escapeHtml(customer)}" aria-label="Issue">${options}</select>`;
}

function bindLabelLostIssueSelects() {
  const host = document.getElementById("label-lost");
  if (!host) return;
  host.addEventListener("change", (event) => {
    const select = event.target.closest("select.issue-select");
    if (!select || !host.contains(select)) return;
    persistLabelLostIssue(select.getAttribute("data-customer") || "", select.value);
  });
}

function renderLabels(data) {
  const mtd = data.header?.mtd || {};
  const ai = data.header?.activeInactive || {};
  const trend = data.header?.monthlyTrend || [];
  const bars = monthlyTrendBars(trend, mtd.avgMonthlyLakh);
  const activeSet = new Set(
    (data.active || []).map((row) => String(row.customer || "").toLowerCase())
  );
  const windowId = resolveLabelPlanningWindow(data);

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
        <div>
          <h2>Planning — 6 + 3</h2>
          <p class="hint">window re-ranks top 6; +1/+2/+3 fixed (DT Y 4/6, DT TC Y 4/6, CHROMO W 3/5); Stock/req uses selected window avgs</p>
        </div>
        <select id="planning-window" class="planning-window" aria-label="Planning window">
          <option value="6mo"${windowId === "6mo" ? " selected" : ""}>6 months</option>
          <option value="3mo"${windowId === "3mo" ? " selected" : ""}>3 months</option>
        </select>
      </div>
      <div id="planning-table-host">${labelsPlanningTable(data, windowId, activeSet)}</div>
    </section>
    <section class="panel" id="label-lost">
      <div class="panel-head">
        <h2>Lost</h2>
        <p class="hint">AOV ≥ ${fmt.inr(ai.aovFloor || 50000)}, no dispatch in 45+ days · ${fmt.num((data.lost || []).length)} accounts</p>
      </div>
      <div class="toolbar">
        <input type="search" id="lost-filter" placeholder="Filter lost accounts…" aria-label="Filter lost accounts">
      </div>
      ${table(
        [
          { key: "marketingPerson", label: "Marketing", value: (r) => escapeHtml(r.marketingPerson) },
          { key: "customer", label: "Customer", value: (r) => escapeHtml(r.customer) },
          { key: "issue", label: "Issue", value: (r) => labelLostIssueSelect(r.customer) },
          { key: "products", label: "Products", value: (r) => pills(r.products) },
        ],
        data.lost || [],
        "lost-table"
      )}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Active</h2>
        <p class="hint">AOV ≥ ${fmt.inr(ai.aovFloor || 50000)}, dispatch in last 45 days. Avgs from past 2 months. Pool ${fmt.num(ai.pool)}.</p>
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
          { key: "ordersMTD", label: "Orders MTD", align: "right", value: (r) => fmt.num(r.ordersMTD) },
          { key: "products", label: "Products", value: (r) => pills(r.products) },
        ],
        data.active || [],
        "active-table"
      )}
    </section>
    ${ai.note ? `<p class="source">${escapeHtml(ai.note)}</p>` : ""}
    <section class="panel">
      <div class="panel-head">
        <h2>RM Shortage Report</h2>
        <p class="hint">top 10 · DT/DT TC then BO/yellow then white by shortfall · stock &lt; 1.5× avg · RM mail · ${escapeHtml(fmt.date(data.rmShortage?.asOf))}</p>
      </div>
      <div class="toolbar">
        <input type="search" id="rm-shortage-filter" placeholder="Filter RM shortages…" aria-label="Filter RM shortages">
      </div>
      ${table(
        [
          { key: "family", label: "Family", value: (r) => escapeHtml(r.family) },
          { key: "itemName", label: "Item", value: (r) => escapeHtml(r.itemName) },
          { key: "type", label: "Type", value: (r) => (r.type ? escapeHtml(r.type) : "—") },
          { key: "width", label: "Width", align: "right", value: (r) => fmt.dim(r.width, " mm") },
          { key: "gsm", label: "GSM", align: "right", value: (r) => fmt.dim(r.gsm) },
          { key: "currentStockT", label: "Stock (T)", align: "right", value: (r) => fmt.tonnes(r.currentStockT) },
          { key: "avgConsumedT", label: "Avg consume (T)", align: "right", value: (r) => fmt.tonnes(r.avgConsumedT) },
          { key: "pendingPoT", label: "Pending PO (T)", align: "right", value: (r) => fmt.tonnes(r.pendingPoT) },
          { key: "note", label: "Note", value: (r) => escapeHtml(r.note) },
        ],
        data.rmShortage?.rows || [],
        "rm-shortage-table"
      )}
    </section>
  `));
  bindFilter("rm-shortage-filter", "rm-shortage-table");
  bindFilter("lost-filter", "lost-table");
  bindFilter("active-filter", "active-table");
  bindLabelLostIssueSelects();
  bindLabelPlanningWindow(data, activeSet);
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

function overbookColumns() {
  const cols = rmColumns();
  const note = cols.pop();
  cols.push(
    { key: "overbookT", label: "Overbook (T)", align: "right", value: (r) => fmt.tonnes(r.overbookT) },
    { key: "poMonths", label: "PO months", align: "right", value: (r) => fmt.num(r.poMonths) },
    note
  );
  return cols;
}

function renderInventory(data) {
  const stockouts = (data.shortage || []).filter((r) => !r.currentStockT).length;
  const shortage = data.shortage || [];
  const excess = data.excess || [];
  const overbooked = data.overbooked || [];
  const shortCols = rmColumns();
  const excessCols = rmColumns();
  const overCols = overbookColumns();
  app.replaceChildren(el(`
    ${pageChrome("Inventory / RM", data.title || "Inventory management / RM stock", data.asOf)}
    ${sampleBanner(data.sample)}
    <p class="source">${escapeHtml(data.source || "")}</p>
    <section class="kpis">
      <div class="kpi"><span>Shortage lines</span><strong>${fmt.num(shortage.length)}</strong></div>
      <div class="kpi"><span>Excess lines</span><strong>${fmt.num(excess.length)}</strong></div>
      <div class="kpi"><span>Overbooked</span><strong>${fmt.num(overbooked.length)}</strong></div>
      <div class="kpi"><span>Stock-outs</span><strong>${fmt.num(stockouts)}</strong></div>
      <div class="kpi"><span>Notes</span><strong>${fmt.num((data.notes || []).length)}</strong></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Shortage</h2>
        <p class="hint">Top 10 · 5 per page · tonnes</p>
      </div>
      <div class="toolbar">
        <input type="search" id="short-filter" placeholder="Filter shortages…" aria-label="Filter shortages">
      </div>
      ${pagedTable(shortCols, shortage, "short-table", 5)}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Excess</h2>
        <p class="hint">Top 10 · 5 per page · tonnes</p>
      </div>
      <div class="toolbar">
        <input type="search" id="excess-filter" placeholder="Filter excess…" aria-label="Filter excess">
      </div>
      ${pagedTable(excessCols, excess, "excess-table", 5)}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Overbooked POs</h2>
        <p class="hint">Top 10 vs consumption · PO beyond 1.5 mo cover need · 5 per page</p>
      </div>
      <div class="toolbar">
        <input type="search" id="overbook-filter" placeholder="Filter overbooked…" aria-label="Filter overbooked">
      </div>
      ${pagedTable(overCols, overbooked, "overbook-table", 5)}
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
  bindFilter("short-filter", "short-table", shortCols, shortage, 5);
  bindFilter("excess-filter", "excess-table", excessCols, excess, 5);
  bindFilter("overbook-filter", "overbook-table", overCols, overbooked, 5);
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

const GUMMING_LOST_ISSUE_KEY_PREFIX = "sal-dashboard:gumming-lost-issue:";
const GUMMING_LOST_ISSUE_VALUES = ["quality", "payment", "rate", "communication", "delay", "duplicate"];

function normalizeGummingLostCustomer(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function gummingLostIssueStorageKey(customer) {
  return GUMMING_LOST_ISSUE_KEY_PREFIX + normalizeGummingLostCustomer(customer);
}

function readGummingLostIssue(customer) {
  let stored = "";
  try {
    stored = localStorage.getItem(gummingLostIssueStorageKey(customer)) || "";
  } catch (_) {
    stored = "";
  }
  return GUMMING_LOST_ISSUE_VALUES.includes(stored) ? stored : "";
}

function persistGummingLostIssue(customer, value) {
  const next = GUMMING_LOST_ISSUE_VALUES.includes(value) ? value : "";
  try {
    const key = gummingLostIssueStorageKey(customer);
    if (next) localStorage.setItem(key, next);
    else localStorage.removeItem(key);
  } catch (_) {
    /* ignore quota / private mode */
  }
}

function gummingLostIssueSelect(customer) {
  const current = readGummingLostIssue(customer);
  const options = [`<option value="">—</option>`]
    .concat(
      GUMMING_LOST_ISSUE_VALUES.map(
        (value) =>
          `<option value="${value}"${current === value ? " selected" : ""}>${value}</option>`
      )
    )
    .join("");
  return `<select class="issue-select" data-customer="${escapeHtml(customer)}" aria-label="Issue">${options}</select>`;
}

function bindGummingLostIssueSelects() {
  const host = document.getElementById("gumming-lost");
  if (!host) return;
  host.addEventListener("change", (event) => {
    const select = event.target.closest("select.issue-select");
    if (!select || !host.contains(select)) return;
    persistGummingLostIssue(select.getAttribute("data-customer") || "", select.value);
  });
}

function renderGumming(data) {
  const mtd = data.header?.mtd || {};
  const ai = data.header?.activeInactive || {};
  const trend = data.header?.monthlyTrend || [];
  const bars = monthlyTrendBars(trend, mtd.avgMonthlyLakh);
  const activeSet = new Set(
    (data.active || []).map((row) => String(row.customer || "").toLowerCase())
  );

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
    <section class="panel" id="gumming-lost">
      <div class="panel-head">
        <h2>Lost</h2>
        <p class="hint">AOV ≥ ${fmt.inr(ai.aovFloor || 100000)}, no dispatch in 45+ days · ${fmt.num((data.lost || []).length)} accounts</p>
      </div>
      <div class="toolbar">
        <input type="search" id="gumming-lost-filter" placeholder="Filter lost accounts…" aria-label="Filter lost accounts">
      </div>
      ${table(
        [
          { key: "marketingPerson", label: "Marketing", value: (r) => escapeHtml(r.marketingPerson) },
          { key: "customer", label: "Customer", value: (r) => escapeHtml(r.customer) },
          { key: "issue", label: "Issue", value: (r) => gummingLostIssueSelect(r.customer) },
          { key: "products", label: "Products", value: (r) => pills(r.products) },
        ],
        data.lost || [],
        "gumming-lost-table"
      )}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Active</h2>
        <p class="hint">AOV ≥ ${fmt.inr(ai.aovFloor || 100000)}, dispatch in last 45 days. Avgs from past 2 months. Pool ${fmt.num(ai.pool)}.</p>
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
          { key: "ordersMTD", label: "Orders MTD", align: "right", value: (r) => fmt.num(r.ordersMTD) },
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
  bindGummingLostIssueSelects();
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
