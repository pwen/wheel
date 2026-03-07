/* dashboard.js — Dashboard rendering */

const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : "—";

function card(label, value, sub, colorClass) {
    return `
    <div class="bg-white border rounded-lg p-4">
      <div class="text-xs text-gray-500 uppercase">${label}</div>
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
        card("Open Positions", p.open_trades, `${fmtMoney(p.capital_deployed)} deployed`),
    ].join("");
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
        renderStrategy(data.by_strategy);
        renderSymbolTable(data.by_symbol);
        renderMonthTable(data.by_month);
    } catch (e) {
        $("#perf-cards").innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
    }
});
