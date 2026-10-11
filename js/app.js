const app = document.getElementById("app");
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const RUPEES_PER_LAKH = 1e5;
const RUPEES_PER_CRORE = 1e7;

/**
 * Central money formatter (Indian system, no millions/K).
 *   ≥ ₹1,00,00,000   → crores, 2 decimals      "₹ 5.30 Cr"
 *   ₹1,00,000 – <1 Cr → lakhs, `lakhDigits`     "₹ 63.2 L"
 *   < ₹1,00,000       → full figure, en-IN      "₹ 85,000"
 * `full: true` always prints the full en-IN figure ("₹ 12,40,000").
 * `symbol: false` drops the "₹ " prefix (chart ticks / labels).
 */
function fmtINR(rupees, { lakhDigits = 1, crDigits = 2, full = false, symbol = true } = {}) {
  if (rupees == null || rupees === "") return "—";
  const r = Number(rupees);
  if (!Number.isFinite(r)) return "—";
  const sign = r < 0 ? "-" : "";
  const a = Math.abs(r);
  const pre = `${sign}${symbol ? "₹ " : ""}`;
  const grp = (n, d) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (full || a < RUPEES_PER_LAKH) return `${pre}${grp(Math.round(a), 0)}`;
  const lakhs = a / RUPEES_PER_LAKH;
  // 99.96 L would round to "100.0 L" → show as crores instead.
  if (a >= RUPEES_PER_CRORE || Number(lakhs.toFixed(lakhDigits)) >= 100) {
    return `${pre}${grp(a / RUPEES_PER_CRORE, crDigits)} Cr`;
  }
  return `${pre}${grp(lakhs, lakhDigits)} L`;
}

/** Same rule for values stored in lakh (the JSON's *Lakh fields). */
function fmtLakhINR(lakh, opts) {
  if (lakh == null || lakh === "") return "—";
  const n = Number(lakh);
  if (!Number.isFinite(n)) return "—";
  return fmtINR(n * RUPEES_PER_LAKH, opts);
}

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
  /** Amount given in lakh → ₹ Cr / L / full figure via fmtINR (1-decimal lakh). */
  lakh(n) {
    return fmtLakhINR(n);
  },
  /** Full rupee figure, Indian grouping (AOV floors, avg order value). */
  inr(n) {
    return fmtINR(n, { full: true });
  },
  tonnes(n) {
    if (n == null || n === "") return "—";
    return `${fmt.num(n, 2)} T`;
  },
  pct(n) {
    if (n == null || n === "") return "—";
    return `${fmt.num(n, 1)}%`;
  },
  /** ▲/▼ percent for home comparisons. Returns HTML. */
  delta(pct) {
    if (pct == null || pct === "") return "—";
    const n = Number(pct);
    if (!Number.isFinite(n)) return "—";
    const cls = n >= 0 ? "up" : "down";
    const arrow = n >= 0 ? "▲" : "▼";
    return `<span class="${cls}">${arrow} ${fmt.num(Math.abs(n), 1)}%</span>`;
  },
  /** Average invoice value keeps 2-decimal lakh (crores are always 2 dp). */
  lakh2(n) {
    return fmtLakhINR(n, { lakhDigits: 2 });
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

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function isoParts(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d, mon: MONTHS_SHORT[m - 1], monLong: MONTHS_LONG[m - 1] };
}

/** "1–26 Sep" or, withYear, "1–26 Sep 2026". */
function sameMonthDayRange(range, withYear) {
  if (!range || range.length < 2) return "";
  const a = isoParts(range[0]);
  const b = isoParts(range[1]);
  if (!a || !b) return "";
  const days = a.m === b.m && a.y === b.y ? `${a.d}–${b.d} ${b.mon}` : `${a.d} ${a.mon}–${b.d} ${b.mon}`;
  return withYear ? `${days} ${b.y}` : days;
}

/** "Sep 1–26" for table headers. */
function monthDaySpan(range) {
  if (!range || range.length < 2) return "";
  const a = isoParts(range[0]);
  const b = isoParts(range[1]);
  if (!a || !b) return "";
  if (a.m === b.m && a.y === b.y) return `${a.mon} ${a.d}–${b.d}`;
  return `${a.mon} ${a.d}–${b.mon} ${b.d}`;
}

/** Labels planning is 3-month only. Prefer planningWindows["3mo"], else data.planning. */
function labelsPlanningRows(data) {
  const threeMo = data.planningWindows?.["3mo"]?.planning;
  return Array.isArray(threeMo) ? threeMo : data.planning || [];
}

function labelsPlanningHint(data) {
  const months = data.planningWindows?.["3mo"]?.months;
  let range = "";
  if (Array.isArray(months) && months.length) {
    const a = isoParts(`${months[0]}-01`);
    const b = isoParts(`${months[months.length - 1]}-01`);
    if (a && b) range = ` (${a.mon}–${b.mon} ${b.y})`;
    else range = ` (${months[0]} – ${months[months.length - 1]})`;
  }
  return `Top 6 by sales over the past 3 months${range}; +1/+2/+3 fixed (DT Y 4/6, DT TC Y 4/6, CHROMO W 3/5); Stock/req uses 3-month avgs`;
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

function labelsPlanningTable(data, activeSet) {
  return table(
    labelsPlanningColumns(activeSet),
    labelsPlanningRows(data),
    "planning-table",
    (r) => (isSupplementaryRow(r) ? "supplementary" : "")
  );
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

function homeReportCards(manifest, reportsData) {
  return manifest.reports
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
}

function renderHomeCards(manifest, reportsData) {
  app.replaceChildren(el(`
    ${pageChrome(
      "Weekly operations",
      `${manifest.company} / ${manifest.brand} — labels, raw materials, and the next report in one place.`,
      manifest.lastUpdated
    )}
    ${sampleBanner(manifest.sample)}
    <section class="cards">${homeReportCards(manifest, reportsData)}</section>
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

const HOME_TAB_KEY = "salHomeTab";
const HOME_TAB_COLOR = {
  all: "#1c1915",
  label: "#9a4d24",
  gumming: "#2f5b45",
  roll: "#2c4a6e",
  other: "#8a5a12",
};

function homeOverviewReady(home) {
  return Boolean(home && Array.isArray(home.tabs) && home.tabs.length);
}

function readStoredHomeTab(home) {
  let stored = "";
  try {
    stored = sessionStorage.getItem(HOME_TAB_KEY) || "";
  } catch (_) {
    stored = "";
  }
  const ids = new Set(home.tabs.map((t) => t.id));
  if (ids.has(stored)) return stored;
  if (ids.has(home.defaultTab)) return home.defaultTab;
  return home.tabs[0].id;
}

function persistHomeTab(id) {
  try {
    sessionStorage.setItem(HOME_TAB_KEY, id);
  } catch (_) {
    /* ignore quota / private mode */
  }
}

function pctChange(now, prev) {
  const a = Number(now);
  const b = Number(prev);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return (a / b - 1) * 100;
}

function homeLede(home) {
  const mtd = sameMonthDayRange(home.periods?.mtd, true);
  const last = fmt.date(home.lastInvoiceDate);
  return `All categories (excl. own group companies SAL Papers and Shree Arihant Laminates), then each. MTD = ${mtd} (last invoice ${last}), compared with the same days last month.`;
}

function homeTrendHint(home, tab) {
  const periods = home.periods || {};
  const trend = tab.monthlyTrend || [];
  const last = trend[trend.length - 1];
  const mtdRange = sameMonthDayRange(periods.mtd, false);
  const partialBit = last?.partial && last.label ? `${last.label} = ${mtdRange}` : mtdRange;
  const prev = isoParts(periods.prevSamePeriod?.[1] || periods.prevFullMonth?.[0]);
  const avg = periods.avgMonths || [];
  const avgA = avg.length ? isoParts(`${avg[0]}-01`) : null;
  const avgB = avg.length ? isoParts(`${avg[avg.length - 1]}-01`) : null;
  const avgBit = avgA && avgB ? `${avgA.mon}–${avgB.mon}` : "6 mo";
  return `₹ (L = lakh, Cr = crore), GST-incl. · ${partialBit} (hollow dot) · ◆ same days of ${prev ? prev.mon : "last month"} · dashed = 6-mo avg (${avgBit}), as on category pages`;
}

function homeSourceLine(home) {
  const cutoff = fmt.date(home.periods?.activeCutoffExclusive);
  return `${home.source || "Sales Analysis"} · active = billed in last 45 days (after ${cutoff}).`;
}

function homeCategoryNote(home) {
  const buyers = (home.definition?.excludedBuyers || []).join(", ");
  const ex = home.notes?.excludedOwnCompany;
  const mon = isoParts(home.periods?.mtd?.[0]);
  const excluded =
    ex && ex.mtdLakh != null && mon ? `: ${mon.mon} MTD ${fmt.lakh2(ex.mtdLakh)} excluded` : "";
  const who = buyers ? ` (${buyers})` : "";
  return `L = lakh, Cr = crore. Tabs sum to All. All tabs exclude own group companies${who}${excluded}. PFW included (Labels).`;
}

function homeTabsHtml(home, cur) {
  return home.tabs
    .map((t) => {
      const badge = t.onDashboard === false ? `<span class="off">new</span>` : "";
      const selected = t.id === cur ? "true" : "false";
      return `<button type="button" role="tab" id="home-tab-${escapeHtml(t.id)}" aria-selected="${selected}" aria-controls="home-panel" data-home-tab="${escapeHtml(t.id)}">${escapeHtml(t.label)}${badge}</button>`;
    })
    .join("");
}

function homeKpisHtml(home, tab) {
  const periods = home.periods || {};
  const m = tab.mtd || {};
  const ps = tab.prevSamePeriod || {};
  const pf = tab.prevFullMonth || {};
  const ly = tab.lastYearSamePeriod || {};
  const av = tab.avgInvoiceValue || {};
  const c45 = tab.customers45d || {};
  const mtdRange = sameMonthDayRange(periods.mtd, false);
  const prevRange = sameMonthDayRange(periods.prevSamePeriod, false);
  const full = isoParts(periods.prevFullMonth?.[0]);
  const lyA = isoParts(periods.lastYearSamePeriod?.[0]);
  const lyB = isoParts(periods.lastYearSamePeriod?.[1]);
  const lyHeading = lyA && lyB ? `vs ${lyA.mon} ${lyA.y} (${lyA.d}–${lyB.d})` : "vs last year";
  const avg = periods.avgMonths || [];
  const avgA = avg.length ? isoParts(`${avg[0]}-01`) : null;
  const avgB = avg.length ? isoParts(`${avg[avg.length - 1]}-01`) : null;
  const avgSpan = avgA && avgB ? ` (${avgA.mon}–${avgB.mon})` : "";
  const star = (tab.footnotes || []).length ? "<sup>*</sup>" : "";
  const fullPct = pf.mtdPctOfPrevFull == null ? "—" : `${fmt.num(pf.mtdPctOfPrevFull, 1)}%`;
  const avgPct = m.pctOfAvg == null ? "—" : `${fmt.num(m.pctOfAvg, 1)}%`;
  return `
    <div class="kpi"><span>Sales MTD · ${escapeHtml(mtdRange)}${star}</span><strong>${fmt.lakh(m.amountLakh)}</strong><small>${fmt.delta(ps.changePct)} vs ${escapeHtml(prevRange)} (${fmt.lakh(ps.amountLakh)})</small></div>
    <div class="kpi"><span>vs full ${escapeHtml(full ? full.monLong : "last month")}</span><strong>${fullPct}</strong><small>of ${escapeHtml(full ? full.mon : "last month")} total ${fmt.lakh(pf.amountLakh)}</small></div>
    <div class="kpi"><span>MTD vs avg month</span><strong>${avgPct}</strong><small>6-mo avg ${fmt.lakh(m.avgMonthlyLakh)}${escapeHtml(avgSpan)}</small></div>
    <div class="kpi"><span>${escapeHtml(lyHeading)}</span><strong>${fmt.delta(ly.changePct)}</strong><small>last year ${fmt.lakh(ly.amountLakh)}</small></div>
    <div class="kpi"><span>Invoices MTD</span><strong>${fmt.num(m.invoices)}</strong><small>${escapeHtml(prevRange)}: ${fmt.num(ps.invoices)}</small></div>
    <div class="kpi"><span>Avg invoice value</span><strong>${fmt.lakh2(av.mtdLakh)}</strong><small>${fmt.delta(pctChange(av.mtdLakh, av.prevSamePeriodLakh))} vs ${fmt.lakh2(av.prevSamePeriodLakh)}</small></div>
    <div class="kpi"><span>Customers billed MTD</span><strong>${fmt.num(m.customers)}</strong><small>${escapeHtml(prevRange)}: ${fmt.num(ps.customers)}</small></div>
    <div class="kpi"><span>Active customers (45 d)</span><strong>${fmt.num(c45.activeBilled)}</strong><small>billed since ${escapeHtml(fmt.date(periods.activeCutoffExclusive))}</small></div>`;
}

function niceChartMax(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  let max = (nums.length ? Math.max(...nums) : 0) * 1.12;
  if (!(max > 0)) return { max: 1, step: 1 };
  const mag = 10 ** Math.floor(Math.log10(max));
  const ratio = max / mag;
  const step = mag * (ratio > 5 ? 2 : ratio > 2 ? 1 : 0.5);
  max = Math.ceil(max / step) * step;
  return { max, step };
}

/**
 * Y-axis tick in lakh → one unit per chart: Cr for every tick when the axis max ≥ 1 Cr
 * (100 L), else L. Trailing zeros trimmed ("2 Cr", "0.5 Cr", "20 L"); 0 stays "0".
 */
function axisTickLabel(v, maxLakh) {
  const n = Number(v);
  if (!(Math.abs(n) > 1e-9)) return "0";
  const useCr = Number(maxLakh) * RUPEES_PER_LAKH >= RUPEES_PER_CRORE;
  const val = useCr ? (n * RUPEES_PER_LAKH) / RUPEES_PER_CRORE : n;
  const txt = (Math.round(val * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${txt} ${useCr ? "Cr" : "L"}`;
}

/** Inline SVG line chart: 13 months, hollow partial month, dashed 6-mo avg, ◆ same-days marker. */
function trendLineSvg(tab) {
  const s = tab.monthlyTrend || [];
  if (!s.length) return `<p class="empty">No monthly trend in this snapshot.</p>`;
  const W = 1060;
  const Hh = 270;
  const pl = 52;
  const pr = 16;
  const pt = 16;
  const pb = 28;
  const n = s.length;
  const prev = Number(tab.prevSamePeriod?.amountLakh);
  const avg = Number(tab.mtd?.avgMonthlyLakh);
  const { max, step } = niceChartMax(s.map((m) => m.amountLakh).concat([prev, avg]));
  const X = (i) => pl + (i * (W - pl - pr)) / Math.max(1, n - 1);
  const Y = (v) => pt + (Hh - pt - pb) * (1 - Number(v) / max);
  const c = HOME_TAB_COLOR[tab.id] || "#1c1915";
  const last = s[n - 1];
  const partial = Boolean(last?.partial);
  let g = "";
  const ticks = Math.round(max / step);
  for (let i = 0; i <= ticks; i++) {
    const v = i * step;
    const y = Y(v);
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="#e6ddd0"/>`;
    g += `<text x="${pl - 6}" y="${y + 4}" font-size="10" text-anchor="end" fill="#6b645a">${axisTickLabel(v, max)}</text>`;
  }
  s.forEach((m, i) => {
    const label = String(m.label || "");
    const suffix = i === 0 || label.startsWith("Jan") || i === n - 1 ? label.slice(3) : "";
    g += `<text x="${X(i)}" y="${Hh - 8}" font-size="10" text-anchor="middle" fill="#6b645a">${escapeHtml(label.slice(0, 3) + suffix)}</text>`;
  });
  if (Number.isFinite(avg)) {
    g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="#6b645a" stroke-dasharray="5 4"/>`;
  }
  const solidUntil = partial ? n - 1 : n;
  if (solidUntil >= 2) {
    const pts = s
      .slice(0, solidUntil)
      .map((m, i) => `${X(i)},${Y(m.amountLakh)}`)
      .join(" ");
    g += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  if (partial && n >= 2) {
    g += `<line x1="${X(n - 2)}" y1="${Y(s[n - 2].amountLakh)}" x2="${X(n - 1)}" y2="${Y(last.amountLakh)}" stroke="${c}" stroke-width="2.5" stroke-dasharray="3 4"/>`;
  }
  s.forEach((m, i) => {
    const hollow = Boolean(m.partial);
    if (hollow) {
      g += `<circle cx="${X(i)}" cy="${Y(m.amountLakh)}" r="5" fill="#fffdf8" stroke="${c}" stroke-width="2.5"><title>${escapeHtml(m.label)}: ${escapeHtml(fmt.lakh(m.amountLakh))}</title></circle>`;
    } else {
      g += `<circle cx="${X(i)}" cy="${Y(m.amountLakh)}" r="3" fill="${c}"><title>${escapeHtml(m.label)}: ${escapeHtml(fmt.lakh(m.amountLakh))}</title></circle>`;
    }
  });
  if (last && last.amountLakh != null) {
    const labelY = Math.max(12, Y(last.amountLakh) - 9);
    g += `<text x="${X(n - 1) - 8}" y="${labelY}" font-size="11" font-weight="700" text-anchor="end" fill="${c}">${escapeHtml(fmt.lakh(last.amountLakh))}</text>`;
  }
  if (Number.isFinite(prev)) {
    const py = Y(prev);
    const px = X(n - 1);
    g += `<path d="M${px} ${py - 6} L${px + 6} ${py} L${px} ${py + 6} L${px - 6} ${py} Z" fill="#8f2d2d"><title>Same days last month: ${escapeHtml(fmt.lakh(prev))}</title></path>`;
  }
  return `<svg class="trend-svg" viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Monthly trend for ${escapeHtml(tab.label)}">${g}</svg>`;
}

function homeFootnotesHtml(tab) {
  const notes = tab.footnotes || [];
  if (!notes.length) return "";
  return `<p class="hint home-foot">${notes.map((f) => `<sup>*</sup> ${escapeHtml(f)}`).join("<br>")}</p>`;
}

function homeCategoryTable(home, cur, colMtd, colPrev, colFull) {
  return table(
    [
      {
        key: "label",
        label: "Category",
        value: (r) => {
          const color = HOME_TAB_COLOR[r.id] || "#1c1915";
          const flag = r.onDashboard === false ? `<span class="flag">not on dashboard</span>` : "";
          return `<i class="swatch" style="background:${color}" aria-hidden="true"></i><span class="cat-name">${escapeHtml(r.label)}</span>${flag}`;
        },
      },
      { key: "mtd", label: colMtd, align: "right", value: (r) => fmt.lakh(r.mtd?.amountLakh) },
      { key: "prev", label: colPrev, align: "right", value: (r) => fmt.lakh(r.prevSamePeriod?.amountLakh) },
      { key: "delta", label: "Δ", align: "right", value: (r) => fmt.delta(r.prevSamePeriod?.changePct) },
      { key: "full", label: colFull, align: "right", value: (r) => fmt.lakh(r.prevFullMonth?.amountLakh) },
      {
        key: "share",
        label: "Share",
        align: "right",
        value: (r) => (r.shareOfMtdPct == null ? "—" : `${fmt.num(r.shareOfMtdPct, 1)}%`),
      },
    ],
    home.tabs,
    "home-cat-table",
    (r) => (r.id === cur ? "sel" : "")
  );
}

function homeTopTable(tab, colMtd, colPrev) {
  const rows = (tab.topCustomersMtd || []).map((r, i) => ({ ...r, _i: i + 1 }));
  return table(
    [
      { key: "rank", label: "#", align: "right", value: (r) => String(r._i) },
      {
        key: "customer",
        label: "Customer",
        value: (r) =>
          `${escapeHtml(r.customer)}${r.intraGroup ? `<span class="flag">intra-group</span>` : ""}`,
      },
      { key: "amountLakh", label: colMtd, align: "right", value: (r) => fmt.lakh(r.amountLakh) },
      {
        key: "sharePct",
        label: "Share",
        align: "right",
        value: (r) => (r.sharePct == null ? "—" : `${fmt.num(r.sharePct, 1)}%`),
      },
      { key: "prevSamePeriodLakh", label: colPrev, align: "right", value: (r) => fmt.lakh(r.prevSamePeriodLakh) },
    ],
    rows,
    "home-top-table"
  );
}

function homeConcHtml(tab) {
  const c = tab.concentration;
  if (!c) return "";
  const cell = (label, value) => `<div>${escapeHtml(label)}<b>${value}</b></div>`;
  const pct = (n) => (n == null || n === "" ? "—" : `${fmt.num(n, 1)}%`);
  return `<div class="conc">
    ${cell("Top 5 share MTD", pct(c.top5SharePctMtd))}
    ${cell("Top 5 share, 12 mo", pct(c.top5SharePct12m))}
    ${cell("Top 10 share, 12 mo", pct(c.top10SharePct12m))}
    ${cell("Customers, 12 mo", fmt.num(c.customers12m))}
  </div>`;
}

function renderHome(manifest, reportsData, home) {
  if (!homeOverviewReady(home)) {
    renderHomeCards(manifest, reportsData);
    return;
  }
  let cur = readStoredHomeTab(home);
  const paint = () => {
    const tab = home.tabs.find((t) => t.id === cur) || home.tabs[0];
    cur = tab.id;
    const periods = home.periods || {};
    const colMtd = monthDaySpan(periods.mtd) || "MTD";
    const colPrev = monthDaySpan(periods.prevSamePeriod) || "Prior";
    const full = isoParts(periods.prevFullMonth?.[0]);
    const colFull = full ? `${full.mon} full` : "Full month";
    app.replaceChildren(el(`
      ${pageChrome(home.title || "Sales overview", homeLede(home), home.asOf || manifest.lastUpdated)}
      ${sampleBanner(home.sample)}
      <div class="tabs" role="tablist" aria-label="Sales category">${homeTabsHtml(home, cur)}</div>
      <section class="kpis home" id="home-panel" role="tabpanel" aria-labelledby="home-tab-${escapeHtml(tab.id)}">${homeKpisHtml(home, tab)}</section>
      <section class="panel">
        <div class="panel-head">
          <h2>Monthly trend — ${escapeHtml(tab.label)}</h2>
          <p class="hint">${escapeHtml(homeTrendHint(home, tab))}</p>
        </div>
        ${trendLineSvg(tab)}
        ${homeFootnotesHtml(tab)}
      </section>
      <div class="home-split">
        <section class="panel">
          <div class="panel-head">
            <h2>By category</h2>
            <p class="hint">${escapeHtml(colMtd)} vs ${escapeHtml(colPrev)}</p>
          </div>
          ${homeCategoryTable(home, cur, colMtd, colPrev, colFull)}
          <p class="hint home-note">${escapeHtml(homeCategoryNote(home))}</p>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2>Top customers — ${escapeHtml(isoParts(periods.mtd?.[0])?.mon || "MTD")} MTD</h2>
            <p class="hint">${escapeHtml(tab.label)}</p>
          </div>
          ${homeTopTable(tab, colMtd, colPrev)}
          ${homeConcHtml(tab)}
        </section>
      </div>
      <section class="cards">${homeReportCards(manifest, reportsData)}</section>
      <p class="source">${escapeHtml(homeSourceLine(home))}</p>
    `));
    app.querySelectorAll("[data-home-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-home-tab");
        if (!id || id === cur) return;
        cur = id;
        persistHomeTab(id);
        paint();
      });
    });
    bindPrint();
  };
  paint();
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
  if (id === "attribution") {
    const all = (data.tabs || []).find((t) => t.id === "all") || data.tabs?.[0];
    const period =
      (all?.periods || []).find((p) => p.id === "lastMonth") || (all?.periods || [])[0];
    const share = period?.totals?.knownSourceSharePct;
    const top = (period?.sources || []).find((s) => s.source !== "other" && s.source !== "unknown");
    const topTxt = top ? `${escapeHtml(top.label)} ${fmt.lakh(top.amountLakh)}` : "—";
    return `
      <div><span class="stat-label">Known source (last month)</span><span class="stat-value">${share == null ? "—" : fmt.pct(share)}</span></div>
      <div><span class="stat-label">Top channel</span><span class="stat-value">${topTxt}</span></div>`;
  }
  if (id === "customers") {
    const rows = data.customers || [];
    const active = rows.reduce((n, c) => n + (c.status === "active" ? 1 : 0), 0);
    return `
      <div><span class="stat-label">Active / total</span><span class="stat-value">${fmt.num(active)} / ${fmt.num(rows.length)}</span></div>
      <div><span class="stat-label">Inactive</span><span class="stat-value">${fmt.num(rows.length - active)}</span></div>`;
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
  const trendHasPartial = trend.some((t) => t.partial || /mtd/i.test(t.label || ""));
  const trendHint = trendHasPartial
    ? "Billing in ₹ (L = lakh, Cr = crore). The latest bar is month-to-date."
    : "Billing in ₹ (L = lakh, Cr = crore). Bars are complete months; month-to-date is the MTD figure above.";

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
        <p class="hint">${trendHint}</p>
      </div>
      <div class="bars">${bars}</div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Planning — 6 + 3</h2>
          <p class="hint">${escapeHtml(labelsPlanningHint(data))}</p>
        </div>
      </div>
      <div id="planning-table-host">${labelsPlanningTable(data, activeSet)}</div>
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
        <p class="hint">Billing in ₹ (L = lakh, Cr = crore).</p>
      </div>
      <div class="bars">${bars}</div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>Planning — top 10</h2>
        <p class="hint">Top 10 by sales over the past 3 months (Jun–Aug 2026); AOV ≥ ${fmt.inr(ai.aovFloor || 100000)} pool; customers & products lists capped at top 5; Sheet Form category</p>
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

const ATTR_PERIOD_KEY = "salAttrPeriod";
const ATTR_COLOR = {
  indiamart: "#2c4a6e",
  google: "#3a7d44",
  social: "#6b4fa0",
  reference: "#9a4d24",
  direct: "#1c1915",
  exhibition: "#8a5a12",
  other: "#9b9387",
  unknown: "#c9c2b6",
};

function attrRead(key, fallback, allowed) {
  let stored = "";
  try {
    stored = sessionStorage.getItem(key) || "";
  } catch (_) {
    stored = "";
  }
  if (allowed.has(stored)) return stored;
  if (allowed.has(fallback)) return fallback;
  const first = allowed.values().next().value;
  return first || "";
}

function attrWrite(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch (_) {
    /* ignore quota / private mode */
  }
}

function attrSwatch(id) {
  if (id === "unknown") return `<i class="swatch attr-swatch-unknown" aria-hidden="true"></i>`;
  const color = ATTR_COLOR[id] || "#1c1915";
  return `<i class="swatch" style="background:${color}" aria-hidden="true"></i>`;
}

function attrMuted(id) {
  return id === "other" || id === "unknown" ? " attr-muted" : "";
}

function attrDelta(src) {
  if (src?.changePct != null && src.changePct !== "") return fmt.delta(src.changePct);
  const prevAmt = src?.prev && src.prev.amountLakh != null ? Number(src.prev.amountLakh) : null;
  const now = src?.amountLakh == null || src.amountLakh === "" ? null : Number(src.amountLakh);
  if (now === 0 && prevAmt > 0) return fmt.delta(-100);
  return "—";
}

function attrControlsHtml(tab, period) {
  const periods = (tab.periods || [])
    .map((p) => {
      const on = p.id === period.id;
      return `<button type="button" class="pill${on ? " pill-active" : ""}" role="tab" aria-selected="${on ? "true" : "false"}" data-attr-period="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>`;
    })
    .join("");
  const bits = [];
  if (period.partial) bits.push(`<span class="chip">partial</span>`);
  if (period.compareLabel) bits.push(`vs ${escapeHtml(period.compareLabel)}`);
  else if (period.compareNote) bits.push(escapeHtml(period.compareNote));
  return `
    <div class="attr-controls">
      <div class="pills attr-periods" role="tablist" aria-label="Period">${periods}</div>
      <p class="hint attr-compare">${bits.join(" · ")}</p>
    </div>`;
}

function attrBarsHtml(sources) {
  if (!sources.length) return `<p class="empty">No sources in this period.</p>`;
  return `<ul class="attr-src">${sources
    .map((s) => {
      const share = Number(s.sharePct);
      const width = Number.isFinite(share) ? Math.max(0, Math.min(100, share)) : 0;
      const shown = width === 0 && Number(s.amountLakh) > 0 ? 1.2 : width;
      const color = ATTR_COLOR[s.source] || "#1c1915";
      const fill = s.source === "unknown" ? `background-color:${ATTR_COLOR.unknown}` : `background:${color}`;
      const hatch = s.source === "unknown" ? " attr-fill-unknown" : "";
      const shareTxt = s.sharePct == null ? "—" : `${fmt.num(s.sharePct, 1)}%`;
      return `<li>
        <div class="attr-src-name${attrMuted(s.source)}">${attrSwatch(s.source)}<span>${escapeHtml(s.label)}</span></div>
        <div class="attr-track" aria-hidden="true"><div class="attr-fill${hatch}" style="width:${shown}%;${fill}"></div></div>
        <div class="attr-val"><b>${fmt.lakh(s.amountLakh)}</b><span>${shareTxt}</span>${attrDelta(s)}</div>
      </li>`;
    })
    .join("")}</ul>`;
}

function attrMatrixHtml(data, period, mode) {
  const block = data.sourceByCategory?.[period.id];
  if (!block) return "";
  const cats = block.categories || [];
  const range = sameMonthDayRange(block.range, true);
  const modeLabel = mode === "col" ? "share of the category (column)" : "share of the source (row)";
  const head = `<tr><th>Source</th>${cats
    .map((c) => `<th class="num">${escapeHtml(c.label)}</th>`)
    .join("")}<th class="num">Total</th></tr>`;
  const body = (block.rows || [])
    .map((row) => {
      const cells = cats
        .map((c) => {
          const cell = (row.cells || {})[c.id] || {};
          const pct = mode === "col" ? cell.colPct : cell.rowPct;
          const alpha = Math.max(0, Math.min(0.5, ((Number(pct) || 0) / 100) * 0.5));
          const pctTxt = pct == null || pct === "" ? "—" : `${fmt.num(pct, 1)}%`;
          return `<td class="num attr-heat" style="--heat:${alpha.toFixed(3)}" data-label="${escapeHtml(c.label)}">${fmt.lakh(cell.amountLakh)}<span class="attr-sub">${pctTxt}</span></td>`;
        })
        .join("");
      return `<tr><td data-label="Source">${attrSwatch(row.source)}<span class="${attrMuted(row.source).trim()}">${escapeHtml(row.label)}</span></td>${cells}<td class="num" data-label="Total">${fmt.lakh(row.totalLakh)}</td></tr>`;
    })
    .join("");
  const totalCells = cats
    .map((c) => `<td class="num" data-label="${escapeHtml(c.label)}">${fmt.lakh((block.columnTotalsLakh || {})[c.id])}</td>`)
    .join("");
  const foot = `<tr class="attr-total"><td data-label="Source">Total</td>${totalCells}<td class="num" data-label="Total">${fmt.lakh(block.totalLakh)}</td></tr>`;
  const partial = period.partial ? ` <span class="chip">partial</span>` : "";
  return `<section class="panel">
    <div class="panel-head">
      <div>
        <h2>Source × category</h2>
        <p class="hint">${escapeHtml(range || period.id)}${partial} · tint is ${escapeHtml(modeLabel)}</p>
      </div>
      <div class="actions" role="group" aria-label="Matrix percent">
        <button type="button" class="attr-toggle" data-attr-matrix="row" aria-pressed="${mode === "row" ? "true" : "false"}">Row %</button>
        <button type="button" class="attr-toggle" data-attr-matrix="col" aria-pressed="${mode === "col" ? "true" : "false"}">Column %</button>
      </div>
    </div>
    <div class="table-wrap attr-scroll">
      <table id="attr-matrix"><thead>${head}</thead><tbody>${body}${foot}</tbody></table>
    </div>
  </section>`;
}

function renderAttribution(data) {
  const tab = (data.tabs || []).find((t) => t.id === "all") || (data.tabs || [])[0];
  if (!tab || !(tab.periods || []).length) {
    app.replaceChildren(el(`
      ${pageChrome(data.title || "Sales attribution", "No periods in this snapshot.", data.asOf)}
    `));
    return;
  }
  const periodIds = new Set(tab.periods.map((p) => p.id));
  let curPeriod = attrRead(ATTR_PERIOD_KEY, data.defaultPeriod, periodIds);
  let matrixMode = "row";

  const paint = () => {
    const period =
      tab.periods.find((p) => p.id === curPeriod) ||
      tab.periods.find((p) => p.id === data.defaultPeriod) ||
      tab.periods[0];
    curPeriod = period.id;
    const compareHint = period.compareLabel
      ? `Change vs ${escapeHtml(period.compareLabel)}.`
      : escapeHtml(period.compareNote || "");
    app.replaceChildren(el(`
      ${pageChrome(data.title || "Sales attribution", data.note || "Other and Unknown are untagged, so channel shares are indicative.", data.asOf)}
      ${sampleBanner(data.sample)}
      ${attrControlsHtml(tab, period)}
      <section class="panel" id="attr-panel">
        <div class="panel-head">
          <h2>Revenue by source</h2>
          <p class="hint">${compareHint}</p>
        </div>
        ${attrBarsHtml(period.sources || [])}
      </section>
      ${attrMatrixHtml(data, period, matrixMode)}
    `));
    app.querySelectorAll("[data-attr-period]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-attr-period");
        if (!id || id === curPeriod) return;
        curPeriod = id;
        attrWrite(ATTR_PERIOD_KEY, id);
        paint();
      });
    });
    app.querySelectorAll("[data-attr-matrix]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-attr-matrix");
        if (!id || id === matrixMode) return;
        matrixMode = id;
        paint();
      });
    });
    bindPrint();
  };
  paint();
}

const CUST_PRESET_KEY = "salCustPreset";
const CUST_FROM_KEY = "salCustFrom";
const CUST_TO_KEY = "salCustTo";
const CUST_FILTER_KEY = "salCustFilters";
const CUST_DEFAULT_DIR = {
  company: "asc",
  mp: "asc",
  source: "asc",
  revenue: "desc",
  aov: "desc",
  delta: "desc",
  tier: "asc",
  status: "asc",
  items: "asc",
  follow: "asc",
  gap: "asc",
};
const CUST_COLS = [
  ["company", "Company", ""],
  ["mp", "Marketing person", ""],
  ["source", "Source", ""],
  ["revenue", "Revenue", "num"],
  ["aov", "AOV", "num"],
  ["delta", "Δ vs prev period", "num"],
  ["tier", "Tier", ""],
  ["status", "Status", ""],
  ["items", "Last 3 items", ""],
  ["follow", "Next follow-up", ""],
  ["gap", "Orders every", "num"],
];
const CUST_SORTS = [
  ["revenue:desc", "Revenue (high to low)"],
  ["revenue:asc", "Revenue (low to high)"],
  ["aov:desc", "AOV (high to low)"],
  ["aov:asc", "AOV (low to high)"],
  ["delta:desc", "Change (high to low)"],
  ["delta:asc", "Change (low to high)"],
  ["company:asc", "Company (A–Z)"],
  ["company:desc", "Company (Z–A)"],
  ["mp:asc", "Marketing person (A–Z)"],
  ["mp:desc", "Marketing person (Z–A)"],
  ["source:asc", "Source (A–Z)"],
  ["source:desc", "Source (Z–A)"],
  ["tier:asc", "Tier (A–C)"],
  ["tier:desc", "Tier (C–A)"],
  ["status:asc", "Status (Active first)"],
  ["status:desc", "Status (Inactive first)"],
  ["follow:asc", "Next follow-up (soonest)"],
  ["follow:desc", "Next follow-up (latest)"],
  ["gap:asc", "Orders every (shortest)"],
  ["gap:desc", "Orders every (longest)"],
  ["items:asc", "Last 3 items (A–Z)"],
  ["items:desc", "Last 3 items (Z–A)"],
  ["due", "Due this week (overdue first)"],
];

function custIso(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function custParts(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return { y, m, d };
}

function custUtc(iso) {
  const p = custParts(iso);
  return Date.UTC(p.y, p.m - 1, p.d);
}

function custFromUtc(ms) {
  const dt = new Date(ms);
  return custIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function custAddDays(iso, days) {
  return custFromUtc(custUtc(iso) + days * 86400000);
}

function custDiffDays(a, b) {
  return Math.round((custUtc(b) - custUtc(a)) / 86400000);
}

function custAddMonths(y, m, k) {
  const t = y * 12 + (m - 1) + k;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}

function custMonthEnd(y, m) {
  const n = custAddMonths(y, m, 1);
  return custAddDays(custIso(n.y, n.m, 1), -1);
}

function custPresetRange(pid, asOf, dataStart) {
  const { y, m } = custParts(asOf);
  if (pid === "mtd") return [custIso(y, m, 1), asOf];
  if (pid === "lastMonth") {
    const p = custAddMonths(y, m, -1);
    return [custIso(p.y, p.m, 1), custMonthEnd(p.y, p.m)];
  }
  if (pid === "last3m" || pid === "last6m" || pid === "last12m") {
    const k = pid === "last3m" ? 3 : pid === "last6m" ? 6 : 12;
    const s = custAddMonths(y, m, -k);
    const p = custAddMonths(y, m, -1);
    return [custIso(s.y, s.m, 1), custMonthEnd(p.y, p.m)];
  }
  if (pid === "fytd") {
    const fy = m >= 4 ? y : y - 1;
    return [custIso(fy, 4, 1), asOf];
  }
  if (pid === "lifetime") return [dataStart, asOf];
  return null;
}

function custPriorRange(a, b, pid, dataStart) {
  if (pid === "lifetime") return null;
  let pa;
  let pb;
  const ap = custParts(a);
  const bp = custParts(b);
  if (pid === "mtd") {
    const p = custAddMonths(ap.y, ap.m, -1);
    pa = custIso(p.y, p.m, 1);
    const end = custMonthEnd(p.y, p.m);
    const candidate = custAddDays(pa, bp.d - 1);
    pb = candidate > end ? end : candidate;
  } else if (pid === "lastMonth" || pid === "last3m" || pid === "last6m" || pid === "last12m") {
    const k = { lastMonth: 1, last3m: 3, last6m: 6, last12m: 12 }[pid];
    const s = custAddMonths(ap.y, ap.m, -k);
    const e = custAddMonths(ap.y, ap.m, -1);
    pa = custIso(s.y, s.m, 1);
    pb = custMonthEnd(e.y, e.m);
  } else if (pid === "fytd") {
    pa = custIso(ap.y - 1, ap.m, ap.d);
    pb = custIso(bp.y - 1, bp.m, bp.d);
  } else {
    const days = custDiffDays(a, b) + 1;
    pa = custAddDays(a, -days);
    pb = custAddDays(a, -1);
  }
  if (pa < dataStart) return null;
  return [pa, pb];
}

function custRound0(n) {
  const neg = n < 0;
  const x = Math.abs(n);
  const base = Math.floor(x);
  const frac = x - base;
  let r;
  if (frac > 0.5) r = base + 1;
  else if (frac < 0.5) r = base;
  else r = base % 2 === 0 ? base : base + 1;
  return neg ? -r : r;
}

function custChange(rev, prev) {
  if (prev == null) {
    return { text: "—", cls: "", tip: "No comparable prior period in the data", pct: null };
  }
  if (rev === 0 && prev === 0) return { text: "—", cls: "", tip: "", pct: null };
  if (prev === 0) return { text: "New", cls: "", tip: "", pct: Infinity };
  const pct = ((rev - prev) / prev) * 100;
  const rounded = custRound0(Math.abs(pct));
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "";
  return {
    text: `${arrow}${rounded}%`,
    cls: pct > 0 ? "up" : pct < 0 ? "down" : "",
    tip: "",
    pct,
  };
}

function custFmtRange(a, b) {
  const ap = isoParts(a);
  const bp = isoParts(b);
  if (!ap || !bp) return `${a} – ${b}`;
  if (ap.y === bp.y && ap.m === bp.m) return `${ap.d}–${bp.d} ${bp.mon} ${bp.y}`;
  if (ap.y === bp.y) return `${ap.d} ${ap.mon} – ${bp.d} ${bp.mon} ${bp.y}`;
  return `${ap.d} ${ap.mon} ${ap.y} – ${bp.d} ${bp.mon} ${bp.y}`;
}

function custDayMon(iso) {
  const p = isoParts(iso);
  if (!p) return "—";
  return `${p.d} ${p.mon}`;
}

function custAgo(n) {
  const d = Number(n);
  if (!Number.isFinite(d)) return "";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

function custGapText(gap) {
  if (gap == null || gap === "") return "—";
  const n = Number(gap);
  if (!Number.isFinite(n)) return "—";
  return n === 1 ? "~1 day" : `~${n} days`;
}

function custTrunc(value) {
  const text = String(value ?? "");
  if (text.length <= 18) return text;
  return `${text.slice(0, 18).trimEnd()}…`;
}

function custCmpText(a, b) {
  const au = String(a || "").toUpperCase();
  const bu = String(b || "").toUpperCase();
  if (au < bu) return -1;
  if (au > bu) return 1;
  return 0;
}

function custCmpNum(a, b, dir) {
  const an = a == null || Number.isNaN(a);
  const bn = b == null || Number.isNaN(b);
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (a === b) return 0;
  const d = a < b ? -1 : 1;
  return dir === "asc" ? d : -d;
}

function custCsvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function custNumList(value, max) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 0 && n < max && !out.includes(n)) out.push(n);
  }
  return out;
}

function custStrList(value, allowed) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const s = String(item);
    if (allowed.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function renderCustomers(data) {
  const customers = data.customers || [];
  const persons = data.marketingPersons || [];
  const sources = data.sources || [];
  const categories = data.categories || [];
  const follow = data.followUp || { statuses: [], dueThisWeek: [] };
  const fuLabel = Object.fromEntries((follow.statuses || []).map((s) => [s.id, s.label]));
  const fuAllowed = new Set((follow.statuses || []).map((s) => s.id));
  const tierAllowed = new Set(["A", "B", "C"]);
  const presetIds = new Set((data.presets || []).map((p) => p.id));
  const storedFilters = (() => {
    try {
      const raw = sessionStorage.getItem(CUST_FILTER_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  })();
  let fromStored = "";
  let toStored = "";
  try {
    fromStored = sessionStorage.getItem(CUST_FROM_KEY) || "";
    toStored = sessionStorage.getItem(CUST_TO_KEY) || "";
  } catch (_) {
    fromStored = "";
    toStored = "";
  }
  const clampDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= data.dataStart && iso <= data.asOf ? iso : "");
  const state = {
    preset: attrRead(CUST_PRESET_KEY, data.defaultPreset || "last3m", presetIds),
    from: clampDate(fromStored),
    to: clampDate(toStored),
    q: typeof storedFilters.q === "string" ? storedFilters.q : "",
    status: storedFilters.status === "active" || storedFilters.status === "inactive" ? storedFilters.status : "all",
    mp: custNumList(storedFilters.mp, persons.length),
    src: custNumList(storedFilters.src, sources.length),
    cat: custNumList(storedFilters.cat, categories.length),
    tier: custStrList(storedFilters.tier, tierAllowed),
    fu: custStrList(storedFilters.fu, fuAllowed),
    due: Boolean(storedFilters.due),
    dueSort: Boolean(storedFilters.dueSort),
    sortKey: CUST_DEFAULT_DIR[storedFilters.sortKey] ? storedFilters.sortKey : "revenue",
    sortDir: storedFilters.sortDir === "asc" || storedFilters.sortDir === "desc" ? storedFilters.sortDir : "desc",
    dueSaved: null,
  };
  if (state.due) state.fu = (follow.dueThisWeek || []).slice();
  if (storedFilters.dueSaved && typeof storedFilters.dueSaved === "object") {
    const saved = storedFilters.dueSaved;
    state.dueSaved = {
      fu: custStrList(saved.fu, fuAllowed),
      sortKey: CUST_DEFAULT_DIR[saved.sortKey] ? saved.sortKey : "revenue",
      sortDir: saved.sortDir === "asc" ? "asc" : "desc",
      dueSort: Boolean(saved.dueSort),
    };
  }
  if (state.preset === "custom") ensureCustom();

  let current = { view: [], range: null };

  function ensureCustom() {
    if (state.from && state.to) return;
    const fallback = custPresetRange("last3m", data.asOf, data.dataStart) || [data.dataStart, data.asOf];
    if (!state.from) state.from = fallback[0];
    if (!state.to) state.to = fallback[1];
  }

  function persist() {
    attrWrite(CUST_PRESET_KEY, state.preset);
    attrWrite(CUST_FROM_KEY, state.from || "");
    attrWrite(CUST_TO_KEY, state.to || "");
    try {
      sessionStorage.setItem(CUST_FILTER_KEY, JSON.stringify({
        q: state.q,
        status: state.status,
        mp: state.mp,
        src: state.src,
        cat: state.cat,
        tier: state.tier,
        fu: state.fu,
        due: state.due,
        dueSort: state.dueSort,
        sortKey: state.sortKey,
        sortDir: state.sortDir,
        dueSaved: state.dueSaved,
      }));
    } catch (_) {
      /* ignore quota / private mode */
    }
  }

  function passesBase(c) {
    if (state.q && !String(c.n || "").toLowerCase().includes(state.q.toLowerCase())) return false;
    if (state.status !== "all" && c.status !== state.status) return false;
    if (state.mp.length && !state.mp.includes(c.mp)) return false;
    if (state.src.length && !state.src.includes(c.src)) return false;
    return true;
  }

  function countDue() {
    const ids = new Set(follow.dueThisWeek || []);
    let n = 0;
    for (const c of customers) {
      if (!passesBase(c)) continue;
      if (ids.has(c.fu?.status)) n++;
    }
    return n;
  }

  function filtersOn() {
    return Boolean(
      state.q ||
      state.status !== "all" ||
      state.mp.length ||
      state.src.length ||
      state.cat.length ||
      state.tier.length ||
      state.fu.length ||
      state.due
    );
  }

  function custSum(inv, fromOff, toOff, catSet) {
    let rev = 0;
    let lines = 0;
    const seen = new Set();
    for (let i = 0; i < inv.length; i++) {
      const e = inv[i];
      const day = e[0];
      if (day < fromOff || day > toOff) continue;
      if (catSet && !catSet.has(e[3])) continue;
      lines += 1;
      rev += e[2];
      seen.add(`${day}\t${e[1]}`);
    }
    if (!lines) return null;
    return { rev, orders: seen.size };
  }

  function custRev(inv, fromOff, toOff, catSet) {
    let rev = 0;
    for (let i = 0; i < inv.length; i++) {
      const e = inv[i];
      const day = e[0];
      if (day < fromOff || day > toOff) continue;
      if (catSet && !catSet.has(e[3])) continue;
      rev += e[2];
    }
    return rev;
  }

  function resolveRange() {
    if (state.preset === "custom") {
      if (!state.from || !state.to || state.from > state.to) return { error: "From must be on or before to." };
      return { from: state.from, to: state.to };
    }
    const span = custPresetRange(state.preset, data.asOf, data.dataStart);
    if (!span) return { error: "Unknown period." };
    return { from: span[0], to: span[1] };
  }

  function buildModel(range) {
    const prior = custPriorRange(range.from, range.to, state.preset, data.dataStart);
    const fromOff = custDiffDays(data.dataStart, range.from);
    const toOff = custDiffDays(data.dataStart, range.to);
    const catSet = state.cat.length ? new Set(state.cat) : null;
    const rows = [];
    for (const c of customers) {
      const cur = custSum(c.inv || [], fromOff, toOff, catSet);
      if (!cur) continue;
      const prev = prior
        ? custRev(c.inv || [], custDiffDays(data.dataStart, prior[0]), custDiffDays(data.dataStart, prior[1]), catSet)
        : null;
      rows.push({
        c,
        rev: cur.rev,
        orders: cur.orders,
        aov: cur.orders ? cur.rev / cur.orders : null,
        prev,
        change: custChange(cur.rev, prev),
        tier: "C",
      });
    }
    rows.sort((a, b) => b.rev - a.rev || custCmpText(a.c.n, b.c.n));
    const tot = rows.reduce((sum, r) => sum + r.rev, 0);
    let cum = 0;
    for (const r of rows) {
      r.tier = tot > 0 && cum < 0.8 * tot ? "A" : tot > 0 && cum < 0.95 * tot ? "B" : "C";
      cum += r.rev;
    }
    return { rows, byCust: new Map(rows.map((r) => [r.c, r])), prior, tot };
  }

  function blankRow(c) {
    return {
      c,
      rev: null,
      orders: null,
      aov: null,
      prev: null,
      change: { text: "—", cls: "", tip: "", pct: null },
      tier: "—",
    };
  }

  function compareRows(a, b) {
    if (state.dueSort) {
      const ar = a.c.fu?.status === "overdue" ? 0 : 1;
      const br = b.c.fu?.status === "overdue" ? 0 : 1;
      if (ar !== br) return ar - br;
      const an = a.c.fu?.next || "";
      const bn = b.c.fu?.next || "";
      if (an !== bn) return an < bn ? -1 : 1;
      return custCmpText(a.c.n, b.c.n);
    }
    const dir = state.sortDir === "asc" ? "asc" : "desc";
    let cmp = 0;
    if (state.sortKey === "company") cmp = dir === "asc" ? custCmpText(a.c.n, b.c.n) : custCmpText(b.c.n, a.c.n);
    else if (state.sortKey === "mp") cmp = dir === "asc" ? custCmpText(persons[a.c.mp], persons[b.c.mp]) : custCmpText(persons[b.c.mp], persons[a.c.mp]);
    else if (state.sortKey === "source") cmp = dir === "asc" ? custCmpText(sources[a.c.src]?.label, sources[b.c.src]?.label) : custCmpText(sources[b.c.src]?.label, sources[a.c.src]?.label);
    else if (state.sortKey === "revenue") cmp = custCmpNum(a.rev, b.rev, dir);
    else if (state.sortKey === "aov") cmp = custCmpNum(a.aov, b.aov, dir);
    else if (state.sortKey === "delta") cmp = custCmpNum(a.change?.pct, b.change?.pct, dir);
    else if (state.sortKey === "tier") {
      const rank = { A: 0, B: 1, C: 2 };
      cmp = custCmpNum(rank[a.tier] ?? null, rank[b.tier] ?? null, dir);
    } else if (state.sortKey === "status") cmp = dir === "asc" ? custCmpText(a.c.status, b.c.status) : custCmpText(b.c.status, a.c.status);
    else if (state.sortKey === "items") {
      const ai = (a.c.last3 || []).map((row) => row[1] || "").join("; ");
      const bi = (b.c.last3 || []).map((row) => row[1] || "").join("; ");
      cmp = dir === "asc" ? custCmpText(ai, bi) : custCmpText(bi, ai);
    } else if (state.sortKey === "follow") {
      const ac = a.c.fu?.callNow ? 0 : 1;
      const bc = b.c.fu?.callNow ? 0 : 1;
      if (ac !== bc) cmp = dir === "asc" ? ac - bc : bc - ac;
      else {
        const an = a.c.fu?.next || "";
        const bn = b.c.fu?.next || "";
        if (an !== bn) cmp = dir === "asc" ? (an < bn ? -1 : 1) : (an < bn ? 1 : -1);
      }
    } else if (state.sortKey === "gap") cmp = custCmpNum(a.c.fu?.gap, b.c.fu?.gap, dir);
    if (cmp) return cmp;
    return custCmpText(a.c.n, b.c.n);
  }

  function buildView(model) {
    const list = [];
    const passFu = (c) => !state.fu.length || state.fu.includes(c.fu?.status);
    const passTier = (tier) => !state.tier.length || state.tier.includes(tier);
    if (state.due) {
      for (const c of customers) {
        if (!passesBase(c) || !passFu(c)) continue;
        const row = model.byCust.get(c);
        const tier = row ? row.tier : "—";
        if (!passTier(tier)) continue;
        list.push(row || blankRow(c));
      }
    } else {
      for (const row of model.rows) {
        if (!passesBase(row.c) || !passFu(row.c) || !passTier(row.tier)) continue;
        list.push(row);
      }
    }
    list.sort(compareRows);
    return list;
  }

  function lastOrderTip(c) {
    const when = custDayMon(c.last);
    const ago = custAgo(c.fu?.since);
    return ago ? `Last order ${when} · ${ago}` : `Last order ${when}`;
  }

  function followHtml(c) {
    const fu = c.fu || {};
    const last = lastOrderTip(c);
    if (fu.callNow) {
      const tip = `Follow-up date was ${custDayMon(fu.next)}. ${last}`;
      return `<span class="chip cust-callnow" title="${escapeHtml(tip)}">Call now</span>`;
    }
    const label = fuLabel[fu.status] || fu.status || "—";
    const cls = fu.status === "overdue"
      ? "flag cust-overdue"
      : fu.status === "callThisWeek"
        ? "flag"
        : fu.status === "notEnoughHistory"
          ? "chip cust-fu-thin"
          : fu.status === "dormant"
            ? "chip cust-fu-dormant"
            : "chip";
    return `<span title="${escapeHtml(last)}">${escapeHtml(custDayMon(fu.next))} <span class="${cls}">${escapeHtml(label)}</span></span>`;
  }

  function gapHtml(c) {
    const fu = c.fu || {};
    const tip = fu.gap != null && fu.gapEff != null && fu.gapEff > fu.gap
      ? ` title="Follow-up uses a 7-day minimum"`
      : "";
    return `<span${tip}>${escapeHtml(custGapText(fu.gap))}</span>`;
  }

  function statusHtml(status) {
    const on = status === "active";
    return `<span class="chip${on ? " cust-status-on" : ""}">${on ? "Active" : "Inactive"}</span>`;
  }

  function sourceHtml(c) {
    const src = sources[c.src];
    const label = src?.label || "—";
    const muted = src && (src.id === "other" || src.id === "unknown");
    return `<span class="${muted ? "cust-muted" : ""}">${escapeHtml(label)}</span>`;
  }

  function tierHtml(tier) {
    if (!tier || tier === "—") return "—";
    return `<span class="chip">${escapeHtml(tier)}</span>`;
  }

  function last3Html(c) {
    const rows = c.last3 || [];
    if (!rows.length) return "—";
    const shown = rows.map((row) => custTrunc(row[1])).join("; ");
    const full = rows.map((row) => `${custDayMon(row[0])} · ${row[1]}`).join("; ");
    return `<span title="${escapeHtml(full)}">${escapeHtml(shown)}</span>`;
  }

  function deltaHtml(change) {
    const ch = change || { text: "—", cls: "", tip: "" };
    const tip = ch.tip ? ` title="${escapeHtml(ch.tip)}"` : "";
    if (ch.cls) return `<span class="${ch.cls}"${tip}>${escapeHtml(ch.text)}</span>`;
    return `<span${tip}>${escapeHtml(ch.text)}</span>`;
  }

  function rowHtml(r) {
    const c = r.c;
    return `<tr>
      <td class="cust-name">${escapeHtml(c.n)}</td>
      <td>${escapeHtml(persons[c.mp] || "—")}</td>
      <td>${sourceHtml(c)}</td>
      <td class="num">${fmtINR(r.rev)}</td>
      <td class="num">${fmtINR(r.aov, { lakhDigits: 2 })}</td>
      <td class="num">${deltaHtml(r.change)}</td>
      <td>${tierHtml(r.tier)}</td>
      <td>${statusHtml(c.status)}</td>
      <td class="cust-items">${last3Html(c)}</td>
      <td>${followHtml(c)}</td>
      <td class="num">${gapHtml(c)}</td>
    </tr>`;
  }

  function cardHtml(r) {
    const c = r.c;
    return `<article class="cust-card">
      <div class="cust-card-top"><strong>${escapeHtml(c.n)}</strong>${statusHtml(c.status)}${tierHtml(r.tier)}</div>
      <div class="cust-card-line">${escapeHtml(persons[c.mp] || "—")} · ${sourceHtml(c)}</div>
      <div class="cust-card-line">${fmtINR(r.rev)} · ${fmtINR(r.aov, { lakhDigits: 2 })} · ${deltaHtml(r.change)}</div>
      <div class="cust-card-line">${followHtml(c)} · ${gapHtml(c)}</div>
      <div class="cust-card-items">${last3Html(c)}</div>
    </article>`;
  }

  function followText(c) {
    const fu = c.fu || {};
    if (fu.callNow) return "Call now";
    const label = fuLabel[fu.status] || fu.status || "";
    return `${custDayMon(fu.next)} · ${label}`;
  }

  function fuStatusText(c) {
    const fu = c.fu || {};
    if (fu.callNow) return "Call now";
    return fuLabel[fu.status] || fu.status || "";
  }

  function summaryText(shown, inRange) {
    const parts = [];
    if (shown == null) parts.push("Choose a valid date range");
    else if (state.due) parts.push(`Showing ${fmt.num(shown)} customers`);
    else parts.push(`Showing ${fmt.num(shown)} of ${fmt.num(inRange)} in this range`);
    if (state.q) parts.push(`Search: ${state.q}`);
    if (state.status === "active") parts.push("Active");
    if (state.status === "inactive") parts.push("Inactive");
    if (state.mp.length) parts.push(state.mp.map((i) => persons[i]).filter(Boolean).join(", "));
    if (state.src.length) parts.push(state.src.map((i) => sources[i]?.label).filter(Boolean).join(", "));
    if (state.cat.length) parts.push(state.cat.map((i) => categories[i]?.label).filter(Boolean).join(", "));
    if (state.tier.length) parts.push(`Tier ${state.tier.join(", ")}`);
    if (state.due) parts.push("Due this week");
    else if (state.fu.length) parts.push(state.fu.map((id) => fuLabel[id] || id).join(", "));
    return parts.join(" · ");
  }

  function rangeHint(range) {
    if (range.error) return "";
    const prior = custPriorRange(range.from, range.to, state.preset, data.dataStart);
    const bits = [escapeHtml(custFmtRange(range.from, range.to))];
    if (state.preset === "mtd" && data.lastInvoiceDate) {
      bits.push(`<span class="chip">MTD to ${escapeHtml(fmt.date(data.lastInvoiceDate))}</span>`);
    }
    if (state.preset === "lifetime") bits.push(`history starts ${escapeHtml(fmt.date(data.dataStart))}`);
    if (prior) bits.push(`vs ${escapeHtml(custFmtRange(prior[0], prior[1]))}`);
    else if (state.preset !== "lifetime") {
      bits.push(`<span title="No comparable prior period in the data">no comparable prior period</span>`);
    }
    return bits.join(" · ");
  }

  function checkGroup(key, label, options) {
    const selected = new Set((state[key] || []).map(String));
    const boxes = options.map((opt) => {
      const value = String(opt.value);
      return `<label><input type="checkbox" value="${escapeHtml(value)}"${selected.has(value) ? " checked" : ""}> ${escapeHtml(opt.label)}</label>`;
    }).join("");
    const n = state[key].length;
    const summary = n ? `${label} (${n})` : label;
    return `<details class="cust-drop${n ? " is-on" : ""}" data-filter="${key}">
      <summary data-label="${escapeHtml(label)}">${escapeHtml(summary)}</summary>
      <div class="cust-drop-panel">${boxes}</div>
    </details>`;
  }

  function sortValue() {
    return state.dueSort ? "due" : `${state.sortKey}:${state.sortDir}`;
  }

  function syncControls() {
    document.querySelectorAll("[data-cust-preset]").forEach((btn) => {
      const on = btn.getAttribute("data-cust-preset") === state.preset;
      btn.classList.toggle("pill-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    const custom = document.getElementById("cust-custom");
    if (custom) custom.hidden = state.preset !== "custom";
    const from = document.getElementById("cust-from");
    const to = document.getElementById("cust-to");
    if (from && from.value !== state.from) from.value = state.from || "";
    if (to && to.value !== state.to) to.value = state.to || "";
    const search = document.getElementById("cust-search");
    if (search && search.value !== state.q) search.value = state.q;
    const status = document.getElementById("cust-status");
    if (status) status.value = state.status;
    document.querySelectorAll(".cust-drop").forEach((drop) => {
      const key = drop.getAttribute("data-filter");
      const summary = drop.querySelector("summary");
      const label = summary?.getAttribute("data-label") || "";
      const selected = new Set((state[key] || []).map(String));
      drop.classList.toggle("is-on", selected.size > 0);
      if (summary) summary.textContent = selected.size ? `${label} (${selected.size})` : label;
      drop.querySelectorAll("input").forEach((input) => {
        input.checked = selected.has(input.value);
      });
    });
    const dueBtn = document.getElementById("cust-due");
    if (dueBtn) dueBtn.setAttribute("aria-pressed", state.due ? "true" : "false");
    const sort = document.getElementById("cust-sort");
    if (sort) {
      const value = sortValue();
      if ([...sort.options].some((opt) => opt.value === value)) sort.value = value;
    }
  }

  function renderResults() {
    const range = resolveRange();
    current.range = range;
    const errEl = document.getElementById("cust-range-error");
    if (errEl) {
      errEl.hidden = !range.error;
      errEl.textContent = range.error || "";
    }
    const hint = document.getElementById("cust-compare");
    if (hint) hint.innerHTML = rangeHint(range);
    const dueBtn = document.getElementById("cust-due");
    if (dueBtn) {
      dueBtn.textContent = `Due this week (${fmt.num(countDue())})`;
      dueBtn.setAttribute("aria-pressed", state.due ? "true" : "false");
    }
    const clearBtn = document.getElementById("cust-clear");
    if (clearBtn) clearBtn.hidden = !filtersOn();
    const csvBtn = document.getElementById("cust-csv");
    if (csvBtn) csvBtn.disabled = Boolean(range.error);
    document.querySelectorAll("#cust-table th").forEach((th) => {
      const key = th.querySelector("button")?.getAttribute("data-sort");
      const sort = !state.dueSort && key === state.sortKey
        ? (state.sortDir === "asc" ? "ascending" : "descending")
        : "none";
      th.setAttribute("aria-sort", sort);
    });
    const body = document.getElementById("cust-body");
    const cards = document.getElementById("cust-cards");
    const kpis = document.getElementById("cust-kpis");
    const summary = document.getElementById("cust-summary");
    if (range.error) {
      current.view = [];
      if (summary) summary.textContent = summaryText(null, 0);
      if (kpis) kpis.innerHTML = "";
      if (body) body.innerHTML = `<tr><td colspan="11">Choose a valid date range.</td></tr>`;
      if (cards) cards.innerHTML = `<p class="empty">Choose a valid date range.</p>`;
      return;
    }
    const model = buildModel(range);
    const view = buildView(model);
    current.view = view;
    if (summary) summary.textContent = summaryText(view.length, model.rows.length);
    let revSum = 0;
    let orderSum = 0;
    let activeN = 0;
    let inactiveN = 0;
    let dueN = 0;
    const dueIds = new Set(follow.dueThisWeek || []);
    for (const r of view) {
      if (r.rev != null) revSum += r.rev;
      if (r.orders) orderSum += r.orders;
      if (r.c.status === "active") activeN += 1;
      else inactiveN += 1;
      if (dueIds.has(r.c.fu?.status)) dueN += 1;
    }
    if (kpis) {
      const aov = orderSum ? fmtINR(revSum / orderSum, { lakhDigits: 2 }) : "—";
      const cells = [
        ["Customers", fmt.num(view.length)],
        ["Revenue", fmtINR(revSum)],
        ["AOV", aov],
        ["Active", fmt.num(activeN)],
        ["Inactive", fmt.num(inactiveN)],
        ["Due this week", fmt.num(dueN)],
      ];
      kpis.innerHTML = cells.map(([label, value]) =>
        `<div class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
      ).join("");
    }
    if (!view.length) {
      if (body) body.innerHTML = `<tr><td colspan="11">No customers match.</td></tr>`;
      if (cards) cards.innerHTML = `<p class="empty">No customers match.</p>`;
      return;
    }
    if (body) body.innerHTML = view.map(rowHtml).join("");
    if (cards) cards.innerHTML = view.map(cardHtml).join("");
  }

  function downloadCsv() {
    const range = current.range;
    if (!range || range.error) return;
    const header = [
      "Company", "Marketing person", "Source", "Revenue", "AOV", "Delta vs prev period",
      "Tier", "Status", "Last 3 items", "Next follow-up", "Orders every",
      "lastOrderDate", "daysSinceLastOrder", "followUpStatus", "nextFollowUp",
      "medianGapDays", "effectiveGapDays", "prevRevenue",
    ];
    const lines = [header.map(custCsvCell).join(",")];
    for (const r of current.view) {
      const c = r.c;
      const fu = c.fu || {};
      const items = (c.last3 || []).map((row) => `${row[0]} ${row[1]}`).join("; ");
      const cells = [
        c.n,
        persons[c.mp] || "",
        sources[c.src]?.label || "",
        r.rev == null ? "" : String(Math.round(r.rev)),
        r.aov == null ? "" : String(Math.round(r.aov)),
        r.change?.text || "",
        r.tier || "",
        c.status === "active" ? "Active" : "Inactive",
        items,
        followText(c),
        custGapText(fu.gap),
        c.last || "",
        fu.since == null ? "" : String(fu.since),
        fuStatusText(c),
        fu.next || "",
        fu.gap == null ? "" : String(fu.gap),
        fu.gapEff == null ? "" : String(fu.gapEff),
        r.prev == null ? "" : String(Math.round(r.prev)),
      ];
      lines.push(cells.map(custCsvCell).join(","));
    }
    const csvBody = new TextEncoder().encode(lines.join("\r\n"));
    const bom = new Uint8Array(csvBody.length + 3);
    bom.set([0xef, 0xbb, 0xbf], 0);
    bom.set(csvBody, 3);
    const blob = new Blob([bom], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers_${range.from}_${range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const head = CUST_COLS.map(([key, label, cls]) => {
    const sort = !state.dueSort && state.sortKey === key
      ? (state.sortDir === "asc" ? "ascending" : "descending")
      : "none";
    return `<th class="${cls}" aria-sort="${sort}"><button type="button" class="cust-sort" data-sort="${key}">${escapeHtml(label)}</button></th>`;
  }).join("");
  const periods = (data.presets || []).map((p) => {
    const on = p.id === state.preset;
    return `<button type="button" class="pill${on ? " pill-active" : ""}" role="tab" aria-selected="${on ? "true" : "false"}" data-cust-preset="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>`;
  }).join("");
  const sortOptions = CUST_SORTS.map(([value, label]) =>
    `<option value="${value}"${value === sortValue() ? " selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
  const excluded = (data.excludedBuyers || []).join(", ");
  const sourceLine = [data.source, excluded ? `Excludes ${excluded}.` : ""].filter(Boolean).join(". ").replace(/\.\./g, ".");
  const statusNote = data.status?.rule || "";

  app.replaceChildren(el(`
    ${pageChrome(data.title || "Customers", "Customers, AOV and follow-ups.", data.asOf)}
    ${sampleBanner(data.sample)}
    <div class="attr-controls" id="cust-periods">
      <div class="pills attr-periods" role="tablist" aria-label="Period">${periods}</div>
      <p class="hint attr-compare" id="cust-compare"></p>
    </div>
    <div class="cust-custom" id="cust-custom"${state.preset === "custom" ? "" : " hidden"}>
      <label>From <input type="date" id="cust-from" min="${escapeHtml(data.dataStart)}" max="${escapeHtml(data.asOf)}" value="${escapeHtml(state.from)}"></label>
      <label>To <input type="date" id="cust-to" min="${escapeHtml(data.dataStart)}" max="${escapeHtml(data.asOf)}" value="${escapeHtml(state.to)}"></label>
    </div>
    <p class="hint cust-error" id="cust-range-error" hidden></p>
    <details class="cust-filters" id="cust-filters">
      <summary>Filters</summary>
      <div class="cust-filter-body">
        <input type="search" id="cust-search" placeholder="Search company…" aria-label="Search company" value="${escapeHtml(state.q)}">
        <select id="cust-status" class="cust-select" aria-label="Status">
          <option value="all"${state.status === "all" ? " selected" : ""}>All statuses</option>
          <option value="active"${state.status === "active" ? " selected" : ""}>Active</option>
          <option value="inactive"${state.status === "inactive" ? " selected" : ""}>Inactive</option>
        </select>
        ${checkGroup("mp", "Marketing person", persons.map((name, i) => ({ value: i, label: name })))}
        ${checkGroup("src", "Source", sources.map((s, i) => ({ value: i, label: s.label })))}
        ${checkGroup("cat", "Category", categories.map((s, i) => ({ value: i, label: s.label })))}
        ${checkGroup("tier", "Tier", ["A", "B", "C"].map((id) => ({ value: id, label: id })))}
        ${checkGroup("fu", "Follow-up", (follow.statuses || []).map((s) => ({ value: s.id, label: s.label })))}
      </div>
    </details>
    <div class="cust-tools">
      <button type="button" class="chip cust-due" id="cust-due" aria-pressed="${state.due ? "true" : "false"}">Due this week</button>
      <button type="button" id="cust-csv">Download CSV</button>
      <label class="cust-sort-mobile">Sort
        <select id="cust-sort" class="cust-select" aria-label="Sort">${sortOptions}</select>
      </label>
    </div>
    <p class="hint cust-summary-line"><span id="cust-summary"></span><button type="button" id="cust-clear" hidden>Clear filters</button></p>
    <section class="kpis cust" id="cust-kpis" aria-label="Summary"></section>
    <div class="table-wrap cust-table-wrap">
      <table class="cust-table" id="cust-table">
        <thead><tr>${head}</tr></thead>
        <tbody id="cust-body"></tbody>
      </table>
    </div>
    <div class="cust-cards" id="cust-cards"></div>
    ${sourceLine ? `<p class="source">${escapeHtml(sourceLine)}</p>` : ""}
    ${statusNote ? `<p class="hint">${escapeHtml(statusNote)}</p>` : ""}
  `));

  document.getElementById("cust-periods")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-cust-preset]");
    if (!btn) return;
    const id = btn.getAttribute("data-cust-preset");
    if (!id || id === state.preset) return;
    state.preset = id;
    if (id === "custom") ensureCustom();
    persist();
    syncControls();
    renderResults();
  });
  document.getElementById("cust-from")?.addEventListener("change", (event) => {
    state.from = event.target.value;
    persist();
    renderResults();
  });
  document.getElementById("cust-to")?.addEventListener("change", (event) => {
    state.to = event.target.value;
    persist();
    renderResults();
  });
  document.getElementById("cust-filters")?.addEventListener("change", (event) => {
    const t = event.target;
    if (t.id === "cust-search") return;
    if (t.id === "cust-status") {
      state.status = t.value === "active" || t.value === "inactive" ? t.value : "all";
    } else {
      const group = t.closest("[data-filter]");
      if (!group) return;
      const key = group.getAttribute("data-filter");
      state[key] = [...group.querySelectorAll("input:checked")].map((input) =>
        key === "tier" || key === "fu" ? input.value : Number(input.value)
      );
      if (key === "fu" && state.due) {
        const dueIds = follow.dueThisWeek || [];
        const same = state.fu.length === dueIds.length && dueIds.every((id) => state.fu.includes(id));
        if (!same) {
          state.due = false;
          state.dueSort = false;
          state.dueSaved = null;
        }
      }
    }
    persist();
    syncControls();
    renderResults();
  });
  document.getElementById("cust-search")?.addEventListener("input", (event) => {
    state.q = event.target.value;
    persist();
    renderResults();
  });
  document.getElementById("cust-due")?.addEventListener("click", () => {
    if (!state.due) {
      state.dueSaved = {
        fu: state.fu.slice(),
        sortKey: state.sortKey,
        sortDir: state.sortDir,
        dueSort: state.dueSort,
      };
      state.due = true;
      state.fu = (follow.dueThisWeek || []).slice();
      state.dueSort = true;
    } else {
      const saved = state.dueSaved;
      state.due = false;
      state.dueSort = false;
      if (saved) {
        state.fu = saved.fu.slice();
        state.sortKey = saved.sortKey;
        state.sortDir = saved.sortDir;
        state.dueSort = Boolean(saved.dueSort);
      }
      state.dueSaved = null;
    }
    persist();
    syncControls();
    renderResults();
  });
  document.getElementById("cust-clear")?.addEventListener("click", () => {
    if (state.due && state.dueSaved) {
      state.sortKey = state.dueSaved.sortKey;
      state.sortDir = state.dueSaved.sortDir;
    }
    state.q = "";
    state.status = "all";
    state.mp = [];
    state.src = [];
    state.cat = [];
    state.tier = [];
    state.fu = [];
    state.due = false;
    state.dueSort = false;
    state.dueSaved = null;
    persist();
    syncControls();
    renderResults();
  });
  document.querySelector("#cust-table thead")?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-sort]");
    if (!btn) return;
    const key = btn.getAttribute("data-sort");
    if (!state.dueSort && state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    else {
      state.sortKey = key;
      state.sortDir = CUST_DEFAULT_DIR[key] || "asc";
    }
    state.dueSort = false;
    persist();
    syncControls();
    renderResults();
  });
  document.getElementById("cust-sort")?.addEventListener("change", (event) => {
    const value = event.target.value;
    if (value === "due") state.dueSort = true;
    else {
      const [key, dir] = value.split(":");
      if (!CUST_DEFAULT_DIR[key]) return;
      state.sortKey = key;
      state.sortDir = dir === "asc" ? "asc" : "desc";
      state.dueSort = false;
    }
    persist();
    syncControls();
    renderResults();
  });
  document.getElementById("cust-csv")?.addEventListener("click", downloadCsv);

  persist();
  renderResults();
}

const renderers = {
  label: renderLabels,
  rm: renderInventory,
  gumming: renderGumming,
  attribution: renderAttribution,
  customers: renderCustomers,
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
      let home = null;
      try {
        home = await loadJSON(manifest.homeDataFile || "data/home.json");
      } catch (_) {
        home = null;
      }
      renderHome(manifest, Object.fromEntries(pairs), home);
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

  bindPrint();
}

function bindPrint() {
  const printBtn = document.getElementById("print-btn");
  if (printBtn) printBtn.onclick = () => window.print();
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
