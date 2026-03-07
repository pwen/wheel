/* dashboard.js — Dashboard rendering */

const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : "—";

function card(label, value, sub, colorClass, tooltip) {
    const tipHtml = tooltip
        ? `<span class="relative group cursor-help inline-flex ml-1 align-middle">
             <svg class="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
             <span class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded shadow-lg whitespace-normal w-48 z-50 normal-case font-normal">${tooltip}</span>
           </span>` : "";
    return `
    <div class="bg-white border rounded-lg p-4">
      <div class="text-xs text-gray-500 uppercase">${label}${tipHtml}</div>
      <div class="text-xl font-semibold ${colorClass || ''}">${value}</div>
      ${sub ? `<div class="text-xs text-gray-500">${sub}</div>` : ""}
    </div>`;
}

function plColor(v) {
    if (v == null) return "";
    return Number(v) >= 0 ? "text-green-600" : "text-red-600";
}

function renderPerformance(p) {
    const el = $("#perf-cards");
    el.innerHTML = [
        card("Total Premium", fmtMoney(p.total_premium), `${p.total_trades} trades`),
        card("Realized P/L", fmtMoney(p.total_realized_pl),
            `${p.closed_trades} closed`, plColor(p.total_realized_pl)),
        card("Win Rate", p.win_rate != null ? fmtPct(p.win_rate) : "—",
            `${p.wins}W / ${p.losses}L`,
            p.win_rate != null ? (p.win_rate >= 70 ? "text-green-600" : p.win_rate >= 50 ? "text-yellow-600" : "text-red-600") : ""),
        card("Avg Days in Trade", p.avg_days_in_trade != null ? p.avg_days_in_trade + "d" : "—"),
        card("Avg P/L per Trade", fmtMoney(p.avg_pl_per_trade), null, plColor(p.avg_pl_per_trade)),
        card("Annualized ROC", p.annualized_roc != null ? fmtPct(p.annualized_roc) : "—",
            "Return on capital (annualized)", plColor(p.annualized_roc)),
        card("Avg Premium Yield", p.avg_premium_yield != null ? fmtPct(p.avg_premium_yield) : "—",
            "Premium / cash reserved", null,
            "Premium collected as a % of cash secured (strike × shares). Measures income earned relative to capital committed."),
        card("Open Positions", p.open_trades),
        card("Cash Reserved", fmtMoney(p.capital_deployed), "Backing open CSPs"),
    ].join("");
}

function renderAttention(attention) {
    const section = $("#attention-section");
    const el = $("#attention-list");
    if (!attention.length) { section.classList.add("hidden"); return; }

    section.classList.remove("hidden");
    el.innerHTML = attention.map(t => {
        const tags = t.reasons.map(r => {
            if (r.type === "dte_critical") return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">⚠️ ${r.label}</span>`;
            if (r.type === "dte_warning") return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">⏰ ${r.label}</span>`;
            if (r.type === "profit_target") return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">💰 ${r.label}</span>`;
            if (r.type === "itm") return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">🔴 ${r.label}</span>`;
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">${r.label}</span>`;
        }).join(" ");
        const badge = t.strategy_type === "CSP"
            ? `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">CSP</span>`
            : `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-700">CC</span>`;
        return `
        <a href="/trade/${t.id}" class="block bg-white border rounded-lg p-3 hover:border-indigo-300 transition-colors">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              ${badge}
              <span class="font-semibold">${t.symbol}</span>
              <span class="text-gray-500 text-sm">$${t.strike} exp ${t.expiry_date}</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">${tags}</div>
          </div>
        </a>`;
    }).join("");
}

async function enrichAttentionWithPrices(attention) {
    if (!attention.length) return;

    // Fetch spot prices for ITM check
    const symbols = [...new Set(attention.map(t => t.symbol))];
    let prices = {};
    try {
        const res = await fetch("/api/prices?" + symbols.map(s => "symbols=" + s).join("&"));
        prices = await res.json();
    } catch { /* ignore */ }

    // Fetch option prices for profit check
    const contracts = attention.map(t => ({
        trade_id: t.id,
        symbol: t.symbol,
        expiry_date: t.expiry_date,
        strike: t.strike,
        strategy_type: t.strategy_type,
    }));
    let optionPrices = {};
    try {
        const res = await fetch("/api/option-prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(contracts),
        });
        optionPrices = await res.json();
    } catch { /* ignore */ }

    // Enrich with live data flags
    let changed = false;
    for (const t of attention) {
        const spot = prices[t.symbol];
        if (spot != null) {
            const itm = t.strategy_type === "CSP" ? spot < t.strike : spot > t.strike;
            if (itm) {
                t.reasons.push({ type: "itm", label: `ITM — spot $${Number(spot).toFixed(2)}` });
                changed = true;
            }
        }
        const quote = optionPrices[t.id];
        if (quote && quote.mid != null) {
            const upl = (t.premium_per_share - quote.mid) * t.contracts * t.multiplier;
            const uplPct = t.total_premium > 0 ? (upl / t.total_premium) * 100 : 0;
            const inFirstHalf = t.days_in_trade <= t.dte / 2;
            if (inFirstHalf && uplPct >= 50) {
                t.reasons.push({ type: "profit_target", label: `${uplPct.toFixed(0)}% profit in first half — consider BTC` });
                changed = true;
            }
        }
    }
    if (changed) renderAttention(attention);
}

const OUTCOME_META = {
    expired: { label: "Expired", color: "bg-green-500", text: "text-green-700" },
    btc: { label: "Bought to Close", color: "bg-blue-500", text: "text-blue-700" },
    assigned: { label: "Assigned", color: "bg-amber-500", text: "text-amber-700" },
    rolled: { label: "Rolled", color: "bg-purple-500", text: "text-purple-700" },
};

function renderOutcomeDistribution(dist) {
    const section = $("#outcome-section");
    const el = $("#outcome-dist");
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (total === 0) { section.classList.add("hidden"); return; }

    section.classList.remove("hidden");
    const bar = Object.entries(OUTCOME_META).map(([key, meta]) => {
        const count = dist[key] || 0;
        if (count === 0) return "";
        const pct = (count / total * 100).toFixed(1);
        return `<div class="${meta.color} h-8 rounded" style="width:${pct}%" title="${meta.label}: ${count} (${pct}%)"></div>`;
    }).join("");

    const legend = Object.entries(OUTCOME_META).map(([key, meta]) => {
        const count = dist[key] || 0;
        if (count === 0) return "";
        const pct = (count / total * 100).toFixed(1);
        return `<div class="flex items-center gap-2 text-sm">
            <div class="w-3 h-3 rounded ${meta.color}"></div>
            <span class="${meta.text} font-medium">${meta.label}</span>
            <span class="text-gray-500">${count} (${pct}%)</span>
        </div>`;
    }).join("");

    el.innerHTML = `
        <div class="flex gap-1 rounded overflow-hidden mb-3">${bar}</div>
        <div class="flex flex-wrap gap-4">${legend}</div>`;
}

function renderStrategy(byStrat) {
    const el = $("#strat-cards");
    const items = [];
    for (const [name, s] of Object.entries(byStrat)) {
        const badgeColor = name === "CSP" ? "bg-purple-100 text-purple-700" : "bg-sky-100 text-sky-700";
        items.push(`
        <div class="bg-white border rounded-lg p-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="px-2 py-0.5 rounded text-xs font-semibold ${badgeColor}">${name}</span>
            <span class="text-sm text-gray-500">${s.count} trades (${s.open} open)</span>
          </div>
          <div class="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div class="text-xs text-gray-500 uppercase">Premium</div>
              <div class="font-semibold">${fmtMoney(s.premium)}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500 uppercase">Realized P/L</div>
              <div class="font-semibold ${plColor(s.realized_pl)}">${fmtMoney(s.realized_pl)}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500 uppercase">Win Rate</div>
              <div class="font-semibold">${s.win_rate != null ? fmtPct(s.win_rate) : "—"}</div>
            </div>
          </div>
        </div>`);
    }
    el.innerHTML = items.join("");
}

function renderSymbolTable(symbols) {
    const el = $("#symbol-table");
    if (!symbols.length) { el.innerHTML = `<p class="text-gray-400 text-sm p-4">No trades yet.</p>`; return; }

    const rows = symbols.map(s => `
      <tr class="border-t hover:bg-gray-50">
        <td class="px-4 py-2 font-medium">
          <a href="/symbol/${encodeURIComponent(s.symbol)}" class="text-indigo-600 hover:underline">${s.symbol}</a>
        </td>
        <td class="px-4 py-2 text-right">${s.count}</td>
        <td class="px-4 py-2 text-right">${fmtMoney(s.premium)}</td>
        <td class="px-4 py-2 text-right ${plColor(s.realized_pl)}">${fmtMoney(s.realized_pl)}</td>
        <td class="px-4 py-2 text-right">${s.wins + s.losses > 0 ? fmtPct(s.wins / (s.wins + s.losses) * 100) : "—"}</td>
        <td class="px-4 py-2 text-right">${s.assignment_rate != null ? fmtPct(s.assignment_rate) : "—"}</td>
      </tr>`).join("");

    el.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase">
          <th class="px-4 py-2">Symbol</th>
          <th class="px-4 py-2 text-right">Trades</th>
          <th class="px-4 py-2 text-right">Premium</th>
          <th class="px-4 py-2 text-right">Realized P/L</th>
          <th class="px-4 py-2 text-right">Win Rate</th>
          <th class="px-4 py-2 text-right">Assign Rate</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// --- P/L Over Time ---
let _monthData = [];
let _currentPeriod = "month";
let _currentView = "table";

function toQuarter(m) { const [y, mo] = m.split("-"); return `${y}-Q${Math.ceil(Number(mo) / 3)}`; }
function toYear(m) { return m.split("-")[0]; }

function aggregateByPeriod(months, period) {
    if (period === "month") return months;
    const map = {};
    const keyFn = period === "quarter" ? toQuarter : toYear;
    for (const m of months) {
        const k = keyFn(m.month);
        if (!map[k]) map[k] = { period: k, premium: 0, realized_pl: 0, opened: 0, closed: 0 };
        map[k].premium += m.premium;
        map[k].realized_pl += m.realized_pl;
        map[k].opened += m.opened;
        map[k].closed += m.closed;
    }
    return Object.values(map).sort((a, b) => a.period.localeCompare(b.period));
}

function renderPLTable(data, periodLabel) {
    let cumPL = 0;
    const rows = data.map(d => {
        cumPL += d.realized_pl;
        return `
        <tr class="border-t hover:bg-gray-50">
          <td class="px-4 py-2 font-medium">${d.period}</td>
          <td class="px-4 py-2 text-right">${d.opened}</td>
          <td class="px-4 py-2 text-right">${d.closed}</td>
          <td class="px-4 py-2 text-right">${fmtMoney(d.premium)}</td>
          <td class="px-4 py-2 text-right ${plColor(d.realized_pl)}">${fmtMoney(d.realized_pl)}</td>
          <td class="px-4 py-2 text-right ${plColor(cumPL)}">${fmtMoney(cumPL)}</td>
        </tr>`;
    }).join("");

    return `
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase">
          <th class="px-4 py-2">${periodLabel}</th>
          <th class="px-4 py-2 text-right">Opened</th>
          <th class="px-4 py-2 text-right">Closed</th>
          <th class="px-4 py-2 text-right">Premium</th>
          <th class="px-4 py-2 text-right">Realized P/L</th>
          <th class="px-4 py-2 text-right">Cumulative P/L</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderPLChart(data) {
    if (!data.length) return `<p class="text-gray-400 text-sm p-4">No data.</p>`;
    const maxAbs = Math.max(...data.map(d => Math.abs(d.realized_pl)), 1);

    let cumPL = 0;
    const bars = data.map(d => {
        cumPL += d.realized_pl;
        const pct = Math.abs(d.realized_pl) / maxAbs * 100;
        const isPos = d.realized_pl >= 0;
        return `
        <div class="flex items-center gap-2 group">
          <div class="w-20 text-xs text-gray-500 text-right shrink-0">${d.period}</div>
          <div class="flex-1 flex items-center h-7">
            <div class="${isPos ? 'bg-green-400' : 'bg-red-400'} h-5 rounded" style="width:${Math.max(pct, 2)}%"></div>
          </div>
          <div class="w-20 text-xs text-right shrink-0 ${plColor(d.realized_pl)}">${fmtMoney(d.realized_pl)}</div>
          <div class="w-20 text-xs text-right shrink-0 ${plColor(cumPL)}">${fmtMoney(cumPL)}</div>
        </div>`;
    }).join("");

    return `
    <div class="p-4 space-y-1">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-20"></div>
        <div class="flex-1 text-xs text-gray-400 uppercase">Realized P/L</div>
        <div class="w-20 text-xs text-gray-400 uppercase text-right">P/L</div>
        <div class="w-20 text-xs text-gray-400 uppercase text-right">Cum.</div>
      </div>
      ${bars}
    </div>`;
}

function renderPLTime() {
    const el = $("#pl-time");
    if (!_monthData.length) { el.innerHTML = `<p class="text-gray-400 text-sm p-4">No trades yet.</p>`; return; }
    const data = aggregateByPeriod(_monthData, _currentPeriod);
    const periodLabel = _currentPeriod === "month" ? "Month" : _currentPeriod === "quarter" ? "Quarter" : "Year";
    el.innerHTML = _currentView === "table" ? renderPLTable(data, periodLabel) : renderPLChart(data);
}

function initPLToggles() {
    document.querySelectorAll("#period-toggle button").forEach(btn => {
        btn.addEventListener("click", () => {
            _currentPeriod = btn.dataset.period;
            document.querySelectorAll("#period-toggle button").forEach(b => {
                b.className = b === btn
                    ? "px-2 py-1 rounded font-medium bg-white shadow text-gray-900"
                    : "px-2 py-1 rounded font-medium text-gray-500 hover:text-gray-700";
            });
            renderPLTime();
        });
    });
    document.querySelectorAll("#view-toggle button").forEach(btn => {
        btn.addEventListener("click", () => {
            _currentView = btn.dataset.view;
            document.querySelectorAll("#view-toggle button").forEach(b => {
                b.className = b === btn
                    ? "px-2 py-1 rounded font-medium bg-white shadow text-gray-900"
                    : "px-2 py-1 rounded font-medium text-gray-500 hover:text-gray-700";
            });
            renderPLTime();
        });
    });
}

// Init
document.addEventListener("DOMContentLoaded", async () => {
    // VIX banner
    const vixEl = document.getElementById("vix-banner");
    if (vixEl) renderVixBanner(vixEl);

    try {
        const res = await fetch("/api/dashboard/stats");
        if (!res.ok) throw new Error("Failed to load dashboard");
        const data = await res.json();

        renderPerformance(data.performance);
        renderAttention(data.attention);
        renderOutcomeDistribution(data.outcome_distribution);
        renderStrategy(data.by_strategy);
        renderSymbolTable(data.by_symbol);

        // P/L over time with toggles
        _monthData = data.by_month.map(m => ({ period: m.month, ...m }));
        initPLToggles();
        renderPLTime();

        // Async: enrich attention list with live prices (ITM + profit check)
        enrichAttentionWithPrices(data.attention);
    } catch (e) {
        $("#perf-cards").innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
    }
});
