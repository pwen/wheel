/* dashboard.js — Dashboard rendering */

const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : "—";

function card(label, value, sub, colorClass, tooltip) {
    const tipAttr = tooltip ? ` title="${tooltip}" style="cursor:help; text-decoration:underline dotted"` : "";
    return `
    <div class="bg-white border rounded-lg p-4">
      <div class="text-xs text-gray-500 uppercase"${tipAttr}>${label}</div>
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
            if (uplPct >= 50) {
                t.reasons.push({ type: "profit_target", label: `${uplPct.toFixed(0)}% profit — consider BTC` });
                changed = true;
            }
        }
    }
    if (changed) renderAttention(attention);
}

const OUTCOME_META = {
    expired: { label: "Expired", color: "bg-green-500", text: "text-green-700" },
    btc:     { label: "Bought to Close", color: "bg-blue-500", text: "text-blue-700" },
    assigned:{ label: "Assigned", color: "bg-amber-500", text: "text-amber-700" },
    rolled:  { label: "Rolled", color: "bg-purple-500", text: "text-purple-700" },
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

function renderMonthTable(months) {
    const el = $("#month-table");
    if (!months.length) { el.innerHTML = `<p class="text-gray-400 text-sm p-4">No trades yet.</p>`; return; }

    // Running total for cumulative P/L
    let cumPL = 0;
    const rows = months.map(m => {
        cumPL += m.realized_pl;
        return `
        <tr class="border-t hover:bg-gray-50">
          <td class="px-4 py-2 font-medium">${m.month}</td>
          <td class="px-4 py-2 text-right">${m.opened}</td>
          <td class="px-4 py-2 text-right">${m.closed}</td>
          <td class="px-4 py-2 text-right">${fmtMoney(m.premium)}</td>
          <td class="px-4 py-2 text-right ${plColor(m.realized_pl)}">${fmtMoney(m.realized_pl)}</td>
          <td class="px-4 py-2 text-right ${plColor(cumPL)}">${fmtMoney(cumPL)}</td>
        </tr>`;
    }).join("");

    el.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase">
          <th class="px-4 py-2">Month</th>
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
        renderMonthTable(data.by_month);

        // Async: enrich attention list with live prices (ITM + profit check)
        enrichAttentionWithPrices(data.attention);
    } catch (e) {
        $("#perf-cards").innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
    }
});
