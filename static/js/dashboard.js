/* dashboard.js — Dashboard tab (IIFE to avoid global collisions) */

var initDashboard = (function () {
    let _loaded = false;

    const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : "—";

    function card(label, value, sub, colorClass, tooltip) {
        const tipHtml = tooltip
            ? `<span class="relative group cursor-help inline-flex ml-1 align-middle">
                 <svg class="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
                 <span class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded shadow-lg whitespace-normal w-48 z-50 normal-case font-normal">${tooltip}</span>
               </span>` : "";
        return `
        <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">${label}${tipHtml}</div>
          <div class="text-xl font-semibold ${colorClass || ''}">${value}</div>
          ${sub ? `<div class="text-xs text-gray-500 dark:text-gray-400">${sub}</div>` : ""}
        </div>`;
    }

    function plColor(v) {
        if (v == null) return "";
        return Number(v) >= 0 ? "text-green-600" : "text-red-600";
    }

    function renderPerformance(p, vixData) {
        const el = $("#perf-cards");

        let dteSub = null;
        if (p.avg_dte_at_open != null) {
            dteSub = "at open";
            if (vixData && vixData.regime) {
                const ideal = { bull: "30-45d", sideways: "30-45d", bear: "45-60d", crisis: "60-90d" };
                dteSub = `Regime suggests ${ideal[vixData.regime] || "30-45d"}`;
            }
        }

        el.innerHTML = [
            card("Total Premium", fmtMoney(p.total_premium), `${p.total_trades} trades`),
            card("Realized P/L", fmtMoney(p.total_realized_pl),
                `${p.closed_trades} closed`, plColor(p.total_realized_pl)),
            '<div id="dash-unreal-pl-card">' + card("Unrealized P/L", '<span class="text-gray-400 text-sm">Fetching…</span>', `${p.open_trades} open`) + '</div>',
            card("Win Rate", p.win_rate != null ? fmtPct(p.win_rate) : "—",
                `${p.wins}W / ${p.losses}L`,
                p.win_rate != null ? (p.win_rate >= 70 ? "text-green-600" : p.win_rate >= 50 ? "text-yellow-600" : "text-red-600") : ""),
            card("Avg Days in Trade", p.avg_days_in_trade != null ? p.avg_days_in_trade + "d" : "—"),
            card("Avg DTE at Open", p.avg_dte_at_open != null ? p.avg_dte_at_open + "d" : "—",
                dteSub, null,
                "Average days to expiration when trades were opened. Wheel sweet spot is typically 30-45 DTE."),
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

    function updateUnrealizedPL(totalUPL) {
        const wrapper = $("#dash-unreal-pl-card");
        if (!wrapper) return;
        const inner = wrapper.querySelector(".text-xl");
        if (inner) {
            inner.textContent = fmtMoney(totalUPL);
            inner.className = `text-xl font-semibold ${plColor(totalUPL)}`;
        }
    }

    async function fetchUnrealizedPL(attention) {
        if (!attention.length) return;

        const contracts = attention.map(t => ({
            trade_id: t.id,
            symbol: t.symbol,
            expiry_date: t.expiry_date,
            strike: t.strike,
            strategy_type: t.strategy_type,
        }));

        try {
            const res = await fetch("/api/option-prices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(contracts),
            });
            if (!res.ok) return;
            const optionPrices = await res.json();

            let totalUPL = 0;
            for (const t of attention) {
                const quote = optionPrices[t.id];
                if (quote && quote.mid != null) {
                    totalUPL += (t.premium_per_share - quote.mid) * t.contracts * t.multiplier;
                }
            }
            updateUnrealizedPL(totalUPL);
        } catch { /* ignore */ }
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
            <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
              <div class="flex items-center gap-2 mb-3">
                <span class="px-2 py-0.5 rounded text-xs font-semibold ${badgeColor}">${name}</span>
                <span class="text-sm text-gray-500 dark:text-gray-400">${s.count} trades (${s.open} open)</span>
              </div>
              <div class="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Premium</div>
                  <div class="font-semibold">${fmtMoney(s.premium)}</div>
                </div>
                <div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Realized P/L</div>
                  <div class="font-semibold ${plColor(s.realized_pl)}">${fmtMoney(s.realized_pl)}</div>
                </div>
                <div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Win Rate</div>
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
          <tr class="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
            <td class="px-4 py-2 font-medium">
              <a href="/symbol/${encodeURIComponent(s.symbol)}" class="text-indigo-600 hover:underline">${s.symbol}</a>
            </td>
            <td class="px-4 py-2 text-right">${s.count}</td>
            <td class="px-4 py-2 text-right">${fmtMoney(s.premium)}</td>
            <td class="px-4 py-2 text-right ${plColor(s.realized_pl)}">${fmtMoney(s.realized_pl)}</td>
            <td class="px-4 py-2 text-right ${plColor(s.annualized_roc)}">${s.annualized_roc != null ? fmtPct(s.annualized_roc) : "—"}</td>
            <td class="px-4 py-2 text-right">${s.wins + s.losses > 0 ? fmtPct(s.wins / (s.wins + s.losses) * 100) : "—"}</td>
            <td class="px-4 py-2 text-right">${s.assignment_rate != null ? fmtPct(s.assignment_rate) : "—"}</td>
          </tr>`).join("");

        el.innerHTML = `
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 dark:bg-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
              <th class="px-4 py-2">Symbol</th>
              <th class="px-4 py-2 text-right">Trades</th>
              <th class="px-4 py-2 text-right">Premium</th>
              <th class="px-4 py-2 text-right">Realized P/L</th>
              <th class="px-4 py-2 text-right">Ann. ROC</th>
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
            <tr class="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
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
            <tr class="bg-gray-50 dark:bg-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
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
              <div class="w-20 text-xs text-gray-500 dark:text-gray-400 text-right shrink-0">${d.period}</div>
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
            <div class="flex-1 text-xs text-gray-400 dark:text-gray-500 uppercase">Realized P/L</div>
            <div class="w-20 text-xs text-gray-400 dark:text-gray-500 uppercase text-right">P/L</div>
            <div class="w-20 text-xs text-gray-400 dark:text-gray-500 uppercase text-right">Cum.</div>
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
                        ? "px-2 py-1 rounded font-medium bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-gray-100"
                        : "px-2 py-1 rounded font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200";
                });
                renderPLTime();
            });
        });
        document.querySelectorAll("#view-toggle button").forEach(btn => {
            btn.addEventListener("click", () => {
                _currentView = btn.dataset.view;
                document.querySelectorAll("#view-toggle button").forEach(b => {
                    b.className = b === btn
                        ? "px-2 py-1 rounded font-medium bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-gray-100"
                        : "px-2 py-1 rounded font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200";
                });
                renderPLTime();
            });
        });
    }

    /* ---------- Init (called on tab activation) ---------- */
    async function init() {
        if (_loaded) return;
        _loaded = true;

        try {
            const statsRes = await fetch("/api/dashboard/stats");

            // Use shared VIX data from app.js if available
            const vixData = window._sharedVixData || null;

            if (!statsRes.ok) throw new Error("Failed to load dashboard");
            const data = await statsRes.json();

            renderPerformance(data.performance, vixData);
            renderOutcomeDistribution(data.outcome_distribution);
            renderStrategy(data.by_strategy);
            renderSymbolTable(data.by_symbol);

            _monthData = data.by_month.map(m => ({ period: m.month, ...m }));
            initPLToggles();
            renderPLTime();

            fetchUnrealizedPL(data.attention);
        } catch (e) {
            $("#perf-cards").innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
        }
    }

    return init;
})();
