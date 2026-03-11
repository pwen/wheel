/* trade_shared.js — shared utilities for trade detail pages */

const $ = (sel) => document.querySelector(sel);
const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : "—";
const fmtMoney = (v) => {
    if (v == null) return "—";
    const n = Number(v);
    const abs = Math.abs(n);
    const formatted = abs >= 1000
        ? abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? "-$" : "$") + formatted;
};
const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : "—";

const STATUS_COLORS = {
    open: "bg-green-100 text-green-700",
    expired: "bg-gray-100 text-gray-600",
    btc: "bg-yellow-100 text-yellow-700",
    assigned: "bg-red-100 text-red-700",
    rolled: "bg-blue-100 text-blue-700",
};

const STRAT_COLORS = {
    CSP: "bg-purple-100 text-purple-700",
    CC: "bg-sky-100 text-sky-700",
};

function badge(text, colorClass) {
    return `<span class="px-2 py-0.5 rounded text-xs font-semibold ${colorClass}">${text}</span>`;
}

function renderHeader(t) {
    const stratBadge = badge(t.strategy_type, STRAT_COLORS[t.strategy_type] || "");
    const statusBadge = badge(t.status.toUpperCase(), STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600");
    const symbolLink = `<a href="/symbol/${encodeURIComponent(t.symbol)}" class="text-indigo-600 hover:underline">${t.symbol}</a>`;
    $("#td-header").innerHTML = `${symbolLink} ${fmt(t.strike, 0)}${t.strategy_type === "CSP" ? "P" : "C"} ${t.expiry_date} ${stratBadge} ${statusBadge}`;
}

function renderEvents(t) {
    const el = $("#td-events");
    const events = t.events || [];

    if (events.length === 0) {
        el.innerHTML = `<p class="text-gray-400 text-sm">No events recorded.</p>`;
        return;
    }

    const eventLabels = {
        open: "Opened", close: "Closed", assignment: "Assigned",
        exercise: "Exercised", roll_open: "Roll (new)", roll_close: "Roll (closed)", adjustment: "Adjusted",
    };

    const rows = events.map(e => `
        <div class="flex items-center gap-3 py-2 border-b dark:border-gray-700 last:border-0">
            <div class="w-2 h-2 rounded-full ${e.event_type === 'open' ? 'bg-green-500' : e.event_type === 'close' ? 'bg-gray-400' : e.event_type === 'assignment' ? 'bg-red-500' : 'bg-blue-500'}"></div>
            <div class="text-sm font-medium w-24">${eventLabels[e.event_type] || e.event_type}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">${e.event_date}</div>
            <div class="text-sm ml-auto">${e.qty} × ${fmtMoney(e.price)}</div>
        </div>
    `).join("");

    el.innerHTML = rows;
}

/* Premium yield helper used by both open and closed views */
function premiumYieldHtml(t) {
    const premiumCollected = Number(t.total_premium);
    const totalDte = t.dte;
    const cash = Number(t.strike) * t.contracts * t.multiplier;
    const rawYield = cash > 0 ? (premiumCollected / cash) * 100 : null;
    const annYield = rawYield != null && totalDte > 0 ? rawYield * (365 / totalDte) : null;
    const isCSP = t.strategy_type === "CSP";

    const thresholds = isCSP
        ? { thin: 1, decent: 3, strong: 5 }
        : { thin: 0.5, decent: 1.5, strong: 3 };
    let tier, tierColor, tierDesc;
    if (rawYield == null) { tier = ""; tierColor = ""; tierDesc = ""; }
    else if (rawYield < thresholds.thin) { tier = "Thin"; tierColor = "text-gray-600"; tierDesc = "low IV, slim pickings"; }
    else if (rawYield < thresholds.decent) { tier = "Decent"; tierColor = "text-blue-600"; tierDesc = "standard wheel income"; }
    else if (rawYield < thresholds.strong) { tier = "Strong"; tierColor = "text-green-600"; tierDesc = "elevated IV, sweet spot"; }
    else { tier = "Fat"; tierColor = "text-emerald-600 font-bold"; tierDesc = "rich premium, high risk priced in"; }

    return `
    <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Premium Yield</div>
    <div class="text-lg font-semibold ${tierColor}">${rawYield != null ? fmtPct(rawYield) : '—'}</div>
    ${annYield != null ? `<div class="text-xs text-gray-600">${fmtPct(annYield)} annualized</div>` : ""}
    ${tier ? `<div class="text-xs ${tierColor}">${tier} — ${tierDesc}</div>` : ""}`;
}
