// ---- Symbol Detail Page ----

const $ = (sel) => document.querySelector(sel);
const fmt = (v, decimals = 2) => v != null ? Number(v).toFixed(decimals) : "—";
const fmtMoney = (v) => {
    if (v == null) return "—";
    const n = Number(v);
    const abs = Math.abs(n);
    const formatted = abs >= 1000
        ? abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? "-$" : "$") + formatted;
};

const STATUS_CONFIG = {
    open: { label: "Open", cls: "bg-yellow-100 text-yellow-700" },
    expired: { label: "Expired", cls: "bg-gray-200 text-gray-600" },
    btc: { label: "BTC", cls: "bg-blue-100 text-blue-700" },
    assigned: { label: "Assigned", cls: "bg-orange-100 text-orange-700" },
    rolled: { label: "Rolled", cls: "bg-purple-100 text-purple-700" },
};
function statusBadge(s) { return (STATUS_CONFIG[s] || STATUS_CONFIG.open).cls; }
function statusLabel(s) { return (STATUS_CONFIG[s] || STATUS_CONFIG.open).label; }

async function loadSymbolDetail() {
    // Extract symbol from URL: /symbol/AAPL
    const parts = window.location.pathname.split("/");
    const symbol = decodeURIComponent(parts[parts.length - 1]);
    if (!symbol) return;

    try {
        const res = await fetch(`/api/spots/${encodeURIComponent(symbol)}/detail`);
        if (!res.ok) return;
        const data = await res.json();

        renderSDSpotInfo(data.spot);
        renderSDOpenTrades(data.open_trades);
        renderSDClosedTrades(data.closed_trades);
        const cashReservedCsp = (data.open_trades || [])
            .filter(t => t.strategy_type === "CSP")
            .reduce((sum, t) => sum + (Number(t.strike) * Number(t.contracts) * Number(t.multiplier || 100)), 0);
        renderSDTotals(data.totals, cashReservedCsp, data.open_trades || []);

        const roles = (data.spot && data.spot.pairing_roles) || [];
        const isProxy = roles.includes("proxy");
        const wheelSection = $("#sd-wheel-section");
        if (isProxy && wheelSection) {
            wheelSection.style.display = "";
            loadWheelGuidance(symbol);
        }

        if (data.lots.length > 0) {
            loadSDLotPrices(symbol, data.lots);
        }
        if (data.open_trades && data.open_trades.length > 0) {
            loadSDOpenOptionMarks(data.open_trades);
        }

        loadSDEvents(symbol);
    } catch (e) {
        console.error("Symbol detail error:", e);
    }
}

document.addEventListener("DOMContentLoaded", loadSymbolDetail);


async function loadWheelGuidance(symbol) {
    const cardEl = $("#sd-wheel-card");
    if (!cardEl) return;

    try {
        const res = await fetch(`/api/spots/${encodeURIComponent(symbol)}/wheel-guidance`);
        if (!res.ok) throw new Error("Failed to load wheel guidance");
        const data = await res.json();
        renderSDWheelCard(data);
    } catch (e) {
        cardEl.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
    }
}


function renderSDWheelCard(data) {
    const el = $("#sd-wheel-card");
    if (!el) return;

    const regime = data.regime || {};
    const sentiment = data.sentiment || {};
    const context = data.context || {};

    const legHtml = (title, leg, theme) => {
        const target = leg.target || {};
        const reasons = (leg.reasons || []).map(r => `<li class="text-sm text-gray-700 dark:text-gray-300">${r}</li>`).join("");
        const flags = (leg.flags || []).map(f => `<li class="text-sm text-red-700 dark:text-red-400">${f}</li>`).join("");
        const candidates = leg.candidates || [];

        const recBadge = {
            consider: "bg-green-100 text-green-700",
            consider_small: "bg-emerald-100 text-emerald-700",
            wait: "bg-amber-100 text-amber-700",
            not_available: "bg-gray-200 text-gray-700",
        }[leg.recommendation] || "bg-gray-100 text-gray-700";

        const recLabel = {
            consider: "Consider Selling",
            consider_small: "Consider Small / Selective",
            wait: "Wait",
            not_available: "Not Available",
        }[leg.recommendation] || "Review";

        const summaryParts = [
            `${recLabel}`,
            `${leg.available_contracts ?? 0} contract(s) available`,
            `DTE ${target.dte_min ?? "—"}-${target.dte_max ?? "—"}`,
            `Delta ${target.delta_min_abs != null ? Number(target.delta_min_abs).toFixed(2) : "—"}-${target.delta_max_abs != null ? Number(target.delta_max_abs).toFixed(2) : "—"}`,
        ];
        if (flags && flags.length > 0) {
            summaryParts.push("has warnings");
        }
        const oneLiner = summaryParts.join(" • ");

        const rows = candidates.slice(0, 2).map(c => `
            <tr class="border-t dark:border-gray-700">
                <td class="px-3 py-2 text-sm font-medium">${c.expiry}</td>
                <td class="px-3 py-2 text-sm text-right">${c.dte}</td>
                <td class="px-3 py-2 text-sm text-right">${fmtMoney(c.strike)}</td>
                <td class="px-3 py-2 text-sm text-right">${c.delta != null ? Number(c.delta).toFixed(3) : "—"}</td>
                <td class="px-3 py-2 text-sm text-right">${fmtMoney(c.mid)}</td>
                <td class="px-3 py-2 text-sm text-right">${c.premium_yield_pct != null ? `${Number(c.premium_yield_pct).toFixed(2)}%` : "—"}</td>
                <td class="px-3 py-2 text-sm text-right">${c.prob_otm != null ? `${Number(c.prob_otm).toFixed(1)}%` : "—"}</td>
                <td class="px-3 py-2 text-sm text-right ${c.spread_pct != null && c.spread_pct > 25 ? "text-red-600" : ""}">${c.spread_pct != null ? `${Number(c.spread_pct).toFixed(1)}%` : "—"}</td>
                <td class="px-3 py-2 text-sm text-right">${(c.open_interest ?? 0).toLocaleString()}</td>
                <td class="px-3 py-2 text-sm text-right">${(c.volume ?? 0).toLocaleString()}</td>
            </tr>
        `).join("");

        return `
            <div class="rounded-lg border ${theme.border} ${theme.bg} p-4 space-y-3">
                <div class="flex items-center gap-2">
                    <div class="font-semibold ${theme.text}">${title}</div>
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${recBadge}">${recLabel}</span>
                </div>
                <details class="group rounded-lg border dark:border-gray-700 bg-white/60 dark:bg-gray-800/60">
                    <summary class="list-none cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between gap-3">
                        <span class="truncate">${oneLiner}</span>
                        <span class="text-[10px] text-gray-500 group-open:hidden">Expand</span>
                        <span class="text-[10px] text-gray-500 hidden group-open:inline">Collapse</span>
                    </summary>
                    <div class="px-3 pb-3 space-y-3 border-t dark:border-gray-700">
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                            <div>
                                <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Available</div>
                                <div class="text-sm font-semibold">${leg.available_contracts ?? 0} contract(s)</div>
                            </div>
                            <div>
                                <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Target DTE</div>
                                <div class="text-sm font-semibold">${target.dte_min ?? "—"}-${target.dte_max ?? "—"}</div>
                            </div>
                            <div>
                                <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Target Delta</div>
                                <div class="text-sm font-semibold">${target.delta_min_abs != null ? Number(target.delta_min_abs).toFixed(2) : "—"}-${target.delta_max_abs != null ? Number(target.delta_max_abs).toFixed(2) : "—"}</div>
                            </div>
                            <div>
                                <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Eligible</div>
                                <div class="text-sm font-semibold">${leg.eligible ? "Yes" : "No"}</div>
                            </div>
                        </div>
                        ${reasons ? `<div><div class="text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold mb-1">Guidance</div><ul class="list-disc pl-5 space-y-1">${reasons}</ul></div>` : ""}
                        ${flags ? `<div><div class="text-xs uppercase text-red-600 font-semibold mb-1">Warnings</div><ul class="list-disc pl-5 space-y-1">${flags}</ul></div>` : ""}
                        ${rows ? `
                            <div class="overflow-x-auto rounded-lg border dark:border-gray-700">
                                <table class="w-full text-xs">
                                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                                        <tr class="text-gray-500 dark:text-gray-400 uppercase text-[11px]">
                                            <th class="px-3 py-2 text-left">Expiry</th>
                                            <th class="px-3 py-2 text-right">DTE</th>
                                            <th class="px-3 py-2 text-right">Strike</th>
                                            <th class="px-3 py-2 text-right">Delta</th>
                                            <th class="px-3 py-2 text-right">Mid</th>
                                            <th class="px-3 py-2 text-right">Yield</th>
                                            <th class="px-3 py-2 text-right">Prob OTM</th>
                                            <th class="px-3 py-2 text-right">Spread</th>
                                            <th class="px-3 py-2 text-right">OI</th>
                                            <th class="px-3 py-2 text-right">Vol</th>
                                        </tr>
                                    </thead>
                                    <tbody>${rows}</tbody>
                                </table>
                            </div>`
                : ""}
                    </div>
                </details>
            </div>
        `;
    };

    el.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Regime And Sentiment</div>
                    <div class="text-sm font-semibold">${regime.regime || "—"}${regime.vix != null ? ` (VIX ${regime.vix})` : ""} · ${sentiment.label || "neutral"}</div>
                </div>
                <div class="text-xs text-gray-600 dark:text-gray-400">
                    Shares: <span class="font-semibold">${context.shares_held ?? 0}</span> · Open CC: <span class="font-semibold">${context.open_cc_contracts ?? 0}</span> · Open CSP: <span class="font-semibold">${context.open_csp_contracts ?? 0}</span>
                </div>
            </div>
            ${legHtml("Covered Call (CC)", data.cc || {}, { border: "border-sky-200 dark:border-sky-800", bg: "bg-sky-50/40 dark:bg-sky-900/15", text: "text-sky-700 dark:text-sky-300" })}
            ${legHtml("Cash-Secured Put (CSP)", data.csp || {}, { border: "border-purple-200 dark:border-purple-800", bg: "bg-purple-50/40 dark:bg-purple-900/15", text: "text-purple-700 dark:text-purple-300" })}
        </div>
    `;
}

function renderSDOpenTrades(trades) {
    const tbody = $("#sd-open-body");
    const empty = $("#sd-open-empty");
    if (trades.length === 0) { empty.classList.remove("hidden"); return; }
    tbody.innerHTML = trades.map(t => `
    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td class="px-3 py-2">
        <a href="/trade/${t.id}" class="inline-block px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80
          ${t.strategy_type === 'CSP' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}">
          ${t.strategy_type}</a>
      </td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.strike)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.expiry_date}</td>
      <td class="px-3 py-2 text-right">${t.contracts}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.total_premium)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.premium_per_share)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.break_even)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.opened_at}</td>
      <td class="px-3 py-2 text-right">${t.dte}</td>
    </tr>`).join("");
}

function renderSDClosedTrades(trades) {
    const tbody = $("#sd-closed-body");
    const empty = $("#sd-closed-empty");
    if (trades.length === 0) { empty.classList.remove("hidden"); return; }
    tbody.innerHTML = trades.map(t => `
    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td class="px-3 py-2">
        <a href="/trade/${t.id}" class="inline-block px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80
          ${t.strategy_type === 'CSP' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}">
          ${t.strategy_type}</a>
      </td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.strike)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.expiry_date}</td>
      <td class="px-3 py-2 text-right">${t.contracts}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.total_premium)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.closing_cost)}</td>
      <td class="px-3 py-2 text-right ${t.realized_pl != null ? (t.realized_pl >= 0 ? 'text-green-600' : 'text-red-600') : ''}">
        ${fmtMoney(t.realized_pl)}</td>
      <td class="px-3 py-2 text-right ${t.realized_pl_pct != null ? (t.realized_pl_pct >= 0 ? 'text-green-600' : 'text-red-600') : ''}">
        ${t.realized_pl_pct != null ? fmt(t.realized_pl_pct) + '%' : '—'}</td>
      <td class="px-3 py-2">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(t.status)}">
          ${statusLabel(t.status)}</span>
      </td>
      <td class="px-3 py-2 whitespace-nowrap">${t.opened_at}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.closed_at || '—'}</td>
    </tr>`).join("");
}

async function loadSDOpenOptionMarks(openTrades) {
    try {
        const contracts = openTrades.map(t => ({
            trade_id: t.id,
            symbol: t.symbol,
            expiry_date: t.expiry_date,
            strike: Number(t.strike),
            strategy_type: t.strategy_type,
        }));

        const res = await fetch("/api/option-prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(contracts),
        });
        if (!res.ok) return;

        const quotes = await res.json();
        const grossPremium = openTrades.reduce((sum, t) => sum + Number(t.total_premium || 0), 0);

        let closeCost = 0;
        let markedCount = 0;
        for (const t of openTrades) {
            const q = quotes[t.id];
            if (!q || q.mid == null) continue;
            closeCost += Number(q.mid) * Number(t.contracts || 0) * Number(t.multiplier || 100);
            markedCount += 1;
        }

        const netEl = document.querySelector("#sd-totals [data-sd-net-open]");
        if (!netEl) return;

        if (markedCount === 0) {
            netEl.textContent = "—";
            return;
        }

        const netOpen = grossPremium - closeCost;
        netEl.textContent = fmtMoney(netOpen);
        netEl.classList.remove("text-green-600", "text-red-600");
        netEl.classList.add(netOpen >= 0 ? "text-green-600" : "text-red-600");
    } catch {
        // Keep placeholder if quotes are unavailable.
    }
}

async function loadSDLotPrices(symbol, lots) {
    try {
        const res = await fetch(`/api/prices?symbols=${encodeURIComponent(symbol)}`);
        const prices = await res.json();
        const price = prices[symbol];
        if (price == null) return;

        lots.forEach(lot => {
            const mktCell = document.querySelector(`[data-sd-mktval="${lot.id}"]`);
            const uplCell = document.querySelector(`[data-sd-upl="${lot.id}"]`);
            if (!mktCell) return;
            const totalCost = lot.cost_per_share * lot.remaining_qty;
            const mktVal = price * lot.remaining_qty;
            const upl = mktVal - totalCost;

            mktCell.textContent = fmtMoney(mktVal);
            uplCell.textContent = fmtMoney(upl);
            uplCell.classList.remove("text-green-600", "text-red-600");
            uplCell.classList.add(upl >= 0 ? "text-green-600" : "text-red-600");
        });

        // Update totals with live share data
        const totalShareMktVal = lots.reduce((s, l) => s + price * l.remaining_qty, 0);
        const totalShareCost = lots.reduce((s, l) => s + l.cost_per_share * l.remaining_qty, 0);
        const shareUpl = totalShareMktVal - totalShareCost;

        const totalsEl = $("#sd-totals");
        const cashReserved = totalsEl ? Number(totalsEl.dataset.cashReserved || 0) : 0;

        const mktValCard = document.querySelector("#sd-totals [data-sd-mktval]");
        if (mktValCard) mktValCard.textContent = fmtMoney(totalShareMktVal);

        const sharePLCard = document.querySelector("#sd-totals [data-sd-share-pl]");
        if (sharePLCard) {
            sharePLCard.textContent = fmtMoney(shareUpl);
            sharePLCard.classList.remove("text-green-600", "text-red-600");
            sharePLCard.classList.add(shareUpl >= 0 ? "text-green-600" : "text-red-600");
        }

        const totalCommitCard = document.querySelector("#sd-totals [data-sd-total-commitment]");
        if (totalCommitCard) totalCommitCard.textContent = fmtMoney(totalShareMktVal + cashReserved);
    } catch { /* ignore */ }
}

function renderSDTotals(totals, cashReservedCsp = 0, openTrades = []) {
    const optionsIncome = totals.total_premium_collected - totals.total_closing_cost;
    const hasShares = Number(totals.total_shares || 0) > 0;
    const initialMktValue = hasShares ? null : 0;
    const initialCommitment = hasShares ? null : cashReservedCsp;
    const avgShareBasis = hasShares ? (Number(totals.total_share_cost || 0) / Number(totals.total_shares || 1)) : null;
    const hasOpenTrades = (openTrades || []).length > 0;

    const totalsEl = $("#sd-totals");
    if (totalsEl) totalsEl.dataset.cashReserved = String(cashReservedCsp);

    const row1 = [
        { label: "Options Income", value: fmtMoney(optionsIncome), color: optionsIncome >= 0 ? "text-green-600" : "text-red-600" },
        { label: "Realized P/L", value: fmtMoney(totals.total_realized_pl), color: totals.total_realized_pl >= 0 ? "text-green-600" : "text-red-600" },
        { label: "Net Premium (Open)", value: hasOpenTrades ? "…" : fmtMoney(0), attr: 'data-sd-net-open' },
        { label: "Open Trades", value: totals.open_trade_count },
        { label: "Closed Trades", value: totals.closed_trade_count },
        { label: "Cash Reserved (CSP)", value: fmtMoney(cashReservedCsp), color: "text-amber-700 dark:text-amber-400", attr: 'data-sd-cash-reserved' },
        { label: "Total Commitment", value: initialCommitment != null ? fmtMoney(initialCommitment) : "…", attr: 'data-sd-total-commitment', color: "text-indigo-700 dark:text-indigo-400" },
    ];
    const row2 = [
        { label: "Shares Held", value: totals.total_shares },
        { label: "Avg Share Basis", value: avgShareBasis != null ? fmtMoney(avgShareBasis) : "—" },
        { label: "Market Value", value: initialMktValue != null ? fmtMoney(initialMktValue) : "…", attr: 'data-sd-mktval' },
        { label: "Cost Basis", value: fmtMoney(totals.total_share_cost) },
        { label: "Unrealized P/L", value: initialMktValue != null ? fmtMoney(initialMktValue - Number(totals.total_share_cost || 0)) : "…", attr: 'data-sd-share-pl', color: "" },
    ];
    const all = [...row1, ...row2];

    totalsEl.innerHTML = all.map(c => `
    <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
      <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">${c.label}</div>
      <div class="text-lg font-semibold ${c.color || ''}" ${c.attr || ''}>${c.value}</div>
    </div>`).join("");
}

function fmtBigNum(v) {
    if (v == null) return "—";
    if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    return "$" + v.toLocaleString();
}

function fmtVol(v) {
    if (v == null) return "—";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
    return v.toLocaleString();
}

function renderSDSpotInfo(spot) {
    const el = $("#sd-spot-info");
    if (!spot || !spot.name) {
        el.innerHTML = `<p class="text-gray-400 text-sm">No data yet — click Refresh to fetch from market.</p>`;
        return;
    }
    const typeBadge = spot.asset_type === "etf"
        ? '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-700">ETF</span>'
        : '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">Stock</span>';

    const roles = Array.isArray(spot.pairing_roles) ? spot.pairing_roles : [];
    const roleBadges = roles.map(role => {
        if (role === "core") {
            return '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">Core</span>';
        }
        if (role === "proxy") {
            return '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-violet-100 text-violet-700">Proxy</span>';
        }
        return '';
    }).join(" ");

    const roleSummary = roles.length
        ? `<span class="text-gray-600 dark:text-gray-400 text-sm">Role:</span> <span class="text-sm capitalize">${roles.join(" / ")}</span>`
        : "";

    const items = [
        spot.sector && `<span class="text-gray-600 dark:text-gray-400 text-sm">Sector:</span> <span class="text-sm">${spot.sector}</span>`,
        spot.industry && `<span class="text-gray-600 dark:text-gray-400 text-sm">Industry:</span> <span class="text-sm">${spot.industry}</span>`,
        spot.region && `<span class="text-gray-600 dark:text-gray-400 text-sm">Region:</span> <span class="text-sm">${spot.region}</span>`,
        spot.market_cap && `<span class="text-gray-600 dark:text-gray-400 text-sm">Mkt Cap:</span> <span class="text-sm">${fmtBigNum(spot.market_cap)}</span>`,
        spot.pe_ratio && `<span class="text-gray-600 dark:text-gray-400 text-sm">P/E:</span> <span class="text-sm">${fmt(spot.pe_ratio)}</span>`,
        spot.beta && `<span class="text-gray-600 dark:text-gray-400 text-sm">Beta:</span> <span class="text-sm">${fmt(spot.beta, 3)}</span>`,
        spot.avg_daily_volume && `<span class="text-gray-600 dark:text-gray-400 text-sm">Avg Vol:</span> <span class="text-sm">${fmtVol(spot.avg_daily_volume)}</span>`,
        spot.aum && `<span class="text-gray-600 dark:text-gray-400 text-sm">AUM:</span> <span class="text-sm">${fmtBigNum(spot.aum)}</span>`,
        spot.expense_ratio && `<span class="text-gray-600 dark:text-gray-400 text-sm">Expense:</span> <span class="text-sm">${(spot.expense_ratio * 100).toFixed(2)}%</span>`,
        roleSummary,
    ].filter(Boolean);

    const optItems = [
        spot.implied_volatility && `<span class="text-gray-600 dark:text-gray-400 text-sm">IV (30d ATM):</span> <span class="text-sm">${(spot.implied_volatility * 100).toFixed(1)}%</span>`,
        spot.option_volume && `<span class="text-gray-600 dark:text-gray-400 text-sm">Opt Vol:</span> <span class="text-sm">${fmtVol(spot.option_volume)}</span>`,
        spot.open_interest && `<span class="text-gray-600 dark:text-gray-400 text-sm">Open Int:</span> <span class="text-sm">${fmtVol(spot.open_interest)}</span>`,
        spot.bid_ask_spread != null && `<span class="text-gray-600 dark:text-gray-400 text-sm">Bid-Ask:</span> <span class="text-sm">$${spot.bid_ask_spread.toFixed(2)}</span>`,
    ].filter(Boolean);

    el.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <span class="font-semibold">${spot.name}</span>
      ${typeBadge}
            ${roleBadges}
    </div>
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      ${items.join("")}
    </div>
    ${optItems.length ? `
    <div class="border-t mt-2 pt-2 flex flex-wrap gap-x-4 gap-y-1">
      <span class="text-gray-400 text-xs font-semibold uppercase tracking-wide w-full">Options</span>
      ${optItems.join("")}
    </div>` : ""}`;
}

async function refreshSpotInfo() {
    const parts = window.location.pathname.split("/");
    const symbol = decodeURIComponent(parts[parts.length - 1]);
    const btn = $("#sd-refresh-btn");
    btn.textContent = "Refreshing…";
    btn.disabled = true;
    try {
        const res = await fetch(`/api/spots/${encodeURIComponent(symbol)}/refresh`, { method: "POST" });
        if (res.ok) {
            // Re-fetch detail to get updated spot info
            const detRes = await fetch(`/api/spots/${encodeURIComponent(symbol)}/detail`);
            if (detRes.ok) {
                const data = await detRes.json();
                renderSDSpotInfo(data.spot);
            }
            // Refresh events too
            loadSDEvents(symbol);
        }
    } catch { /* ignore */ }
    btn.textContent = "Refresh";
    btn.disabled = false;
}


async function loadSDEvents(symbol) {
    const el = $("#sd-events");
    if (!el) return;

    try {
        const now = new Date();
        const start = new Date(now);
        start.setMonth(start.getMonth() - 6);
        const end = new Date(now);
        end.setMonth(end.getMonth() + 6);
        const startStr = start.toISOString().split("T")[0];
        const endStr = end.toISOString().split("T")[0];
        const res = await fetch(`/api/events?symbol=${encodeURIComponent(symbol)}&start=${startStr}&end=${endStr}`);
        if (!res.ok) throw new Error("Failed to load events");
        const events = await res.json();

        if (events.length === 0) {
            el.innerHTML = '<p class="text-gray-400 text-sm">No events found — click Refresh to fetch from yfinance.</p>';
            return;
        }

        const EVENT_TYPE_LABELS = {
            us_earnings: "Earnings",
            us_ex_dividend: "Ex-Dividend",
        };
        const IMPACT_LABELS = { 1: "Low", 2: "Medium", 3: "High" };
        const IMPACT_COLORS = {
            1: "text-gray-400",
            2: "text-yellow-500",
            3: "text-red-500",
        };
        const todayMs = new Date().setHours(0,0,0,0);

        let html = '<div class="space-y-2">';
        for (const ev of events) {
            const label = EVENT_TYPE_LABELS[ev.event_type] || ev.event_type;
            const d = new Date(ev.event_date + "T00:00:00");
            const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            const daysAway = Math.ceil((d - todayMs) / 86400000);
            const isPast = daysAway < 0;
            const daysLabel = daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : isPast ? `${Math.abs(daysAway)}d ago` : `in ${daysAway}d`;
            const impact = ev.impact || 2;
            const impactColor = IMPACT_COLORS[impact] || IMPACT_COLORS[2];
            const opacity = isPast ? "opacity-50" : "";

            html += `<div class="flex items-center justify-between py-1.5 border-b dark:border-gray-700 last:border-b-0 ${opacity}">`;
            html += `<div class="flex items-center gap-3">`;
            html += `<span class="text-sm font-medium text-gray-900 dark:text-gray-100">${label}</span>`;
            html += `<span class="text-xs text-gray-500 dark:text-gray-400">${dateStr}</span>`;
            html += `</div>`;
            html += `<div class="flex items-center gap-3">`;
            html += `<span class="text-xs ${impactColor} font-medium">${IMPACT_LABELS[impact]}</span>`;
            html += `<span class="text-xs text-gray-500 dark:text-gray-400">${daysLabel}</span>`;
            html += `</div>`;
            html += `</div>`;
        }
        html += '</div>';
        el.innerHTML = html;
    } catch {
        el.innerHTML = '<p class="text-gray-400 text-sm">Failed to load events.</p>';
    }
}
