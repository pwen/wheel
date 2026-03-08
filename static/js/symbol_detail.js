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
        renderSDTotals(data.totals);
        loadWheelGuidance(symbol);

        if (data.lots.length > 0) {
            loadSDLotPrices(symbol, data.lots);
        }
    } catch (e) {
        console.error("Symbol detail error:", e);
    }
}

document.addEventListener("DOMContentLoaded", loadSymbolDetail);


async function loadWheelGuidance(symbol) {
    const guidanceEl = $("#sd-wheel-guidance");
    const candidateEl = $("#sd-wheel-candidates");
    if (!guidanceEl || !candidateEl) return;

    try {
        const res = await fetch(`/api/spots/${encodeURIComponent(symbol)}/wheel-guidance`);
        if (!res.ok) throw new Error("Failed to load wheel guidance");
        const data = await res.json();
        renderSDWheelGuidance(data);
        renderSDWheelCandidates(data);
    } catch (e) {
        guidanceEl.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
        candidateEl.innerHTML = `<p class="text-gray-500 text-sm">Candidates unavailable.</p>`;
    }
}


function renderSDWheelGuidance(data) {
    const el = $("#sd-wheel-guidance");
    if (!el) return;

    const phase1 = data.phase1 || {};
    const setup = phase1.setup || {};
    const context = data.context || {};
    const regime = data.regime || {};

    const actionLabels = {
        hold_or_manage_current: "Manage Current Position First",
        sell_next: "Sell Next Option",
    };
    const confidenceCls =
        phase1.confidence === "high" ? "text-green-700 bg-green-100" :
            phase1.confidence === "low" ? "text-red-700 bg-red-100" :
                "text-amber-700 bg-amber-100";

    const reasons = (phase1.reasons || []).map(r => `<li class="text-sm text-gray-700 dark:text-gray-300">${r}</li>`).join("");
    const blocks = (phase1.blocking_flags || []).map(f => `<li class="text-sm text-red-700 dark:text-red-400">${f}</li>`).join("");

    const deltaMin = setup.delta_min_abs != null ? Number(setup.delta_min_abs).toFixed(2) : "—";
    const deltaMax = setup.delta_max_abs != null ? Number(setup.delta_max_abs).toFixed(2) : "—";

    el.innerHTML = `
            <div class="space-y-4">
                <div class="flex items-center justify-between gap-2">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Phase 1 · Wheel Coach</div>
                <span class="px-2 py-0.5 rounded text-xs font-semibold ${confidenceCls}">${(phase1.confidence || "medium").toUpperCase()} CONFIDENCE</span>
                </div>
                <div>
                <span class="inline-block px-2 py-1 rounded text-sm font-semibold bg-indigo-100 text-indigo-700">${actionLabels[phase1.action] || "Guidance"}</span>
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Next lane: <span class="font-semibold">${phase1.next_strategy || "—"}</span></span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Regime</div>
                    <div class="text-sm font-semibold">${regime.regime || "—"}${regime.vix != null ? ` (VIX ${regime.vix})` : ""}</div>
                </div>
                <div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Target DTE</div>
                    <div class="text-sm font-semibold">${setup.dte_min ?? "—"} - ${setup.dte_max ?? "—"} days</div>
                </div>
                <div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Target Delta</div>
                    <div class="text-sm font-semibold">${deltaMin} - ${deltaMax} (abs)</div>
                </div>
                <div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Shares / Basis</div>
                    <div class="text-sm font-semibold">${context.shares_held ?? 0} / ${context.avg_cost != null ? fmtMoney(context.avg_cost) : "—"}</div>
                </div>
                </div>
                ${reasons
            ? `<div>
                        <div class="text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold mb-1.5">Why</div>
                        <ul class="list-disc pl-5 space-y-1">${reasons}</ul>
                    </div>`
            : '<p class="text-sm text-gray-500">No additional context.</p>'}
                ${blocks
            ? `<div class="pt-3 border-t dark:border-gray-700">
                        <div class="text-xs uppercase text-red-600 font-semibold mb-1.5">Do Not Trade If</div>
                        <ul class="list-disc pl-5 space-y-1">${blocks}</ul>
                    </div>`
            : ""}
            </div>
        `;
}


function renderSDWheelCandidates(data) {
    const el = $("#sd-wheel-candidates");
    if (!el) return;

    const phase2 = data.phase2 || {};
    const candidates = phase2.candidates || [];
    const notes = phase2.notes || [];

    if (!candidates.length) {
        el.innerHTML = `
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Phase 2 · Candidate Contracts</div>
                <p class="text-sm text-gray-500 dark:text-gray-400">No candidates found in the current lane.</p>
                ${notes.length ? `<ul class="mt-3 list-disc pl-5 space-y-1">${notes.map(n => `<li class="text-xs text-gray-500 dark:text-gray-400">${n}</li>`).join("")}</ul>` : ""}
            `;
        return;
    }

    const rows = candidates.map(c => `
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
            </tr>
        `).join("");

    el.innerHTML = `
            <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Phase 2 · Candidate Contracts</div>
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
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${notes.length ? `<ul class="mt-3 list-disc pl-5 space-y-1">${notes.map(n => `<li class="text-xs text-gray-500 dark:text-gray-400">${n}</li>`).join("")}</ul>` : ""}
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

        const mktValCard = document.querySelector("#sd-totals [data-sd-mktval]");
        if (mktValCard) mktValCard.textContent = fmtMoney(totalShareMktVal);

        const sharePLCard = document.querySelector("#sd-totals [data-sd-share-pl]");
        if (sharePLCard) {
            sharePLCard.textContent = fmtMoney(shareUpl);
            sharePLCard.classList.remove("text-green-600", "text-red-600");
            sharePLCard.classList.add(shareUpl >= 0 ? "text-green-600" : "text-red-600");
        }
    } catch { /* ignore */ }
}

function renderSDTotals(totals) {
    const optionsIncome = totals.total_premium_collected - totals.total_closing_cost;
    const row1 = [
        { label: "Options Income", value: fmtMoney(optionsIncome), color: optionsIncome >= 0 ? "text-green-600" : "text-red-600" },
        { label: "Realized P/L", value: fmtMoney(totals.total_realized_pl), color: totals.total_realized_pl >= 0 ? "text-green-600" : "text-red-600" },
        { label: "Open Trades", value: totals.open_trade_count },
        { label: "Closed Trades", value: totals.closed_trade_count },
    ];
    const row2 = [
        { label: "Shares Held", value: totals.total_shares },
        { label: "Market Value", value: "…", attr: 'data-sd-mktval' },
        { label: "Cost Basis", value: fmtMoney(totals.total_share_cost) },
        { label: "Unrealized P/L", value: "…", attr: 'data-sd-share-pl', color: "" },
    ];
    const all = [...row1, ...row2];

    $("#sd-totals").innerHTML = all.map(c => `
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
        }
    } catch { /* ignore */ }
    btn.textContent = "Refresh";
    btn.disabled = false;
}
