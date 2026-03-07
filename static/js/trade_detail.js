/* trade_detail.js — Per-trade detail page for open trades */

const $ = (sel) => document.querySelector(sel);
const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : "—";
const fmtMoney = (v) => {
    if (v == null) return "—";
    const n = Number(v);
    return (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
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

document.addEventListener("DOMContentLoaded", async () => {
    const parts = window.location.pathname.split("/");
    const tradeId = parts[parts.length - 1];

    try {
        const res = await fetch(`/api/trades/${tradeId}/detail`);
        if (!res.ok) throw new Error("Failed to load trade");
        const t = await res.json();

        // Also fetch current spot price
        const priceRes = await fetch(`/api/prices?symbols=${encodeURIComponent(t.symbol)}`);
        const prices = priceRes.ok ? await priceRes.json() : {};
        const currentPrice = prices[t.symbol] || null;

        renderHeader(t);
        renderGlance(t, currentPrice);
        renderRisk(t, currentPrice);
        renderMarket(t, currentPrice);
        renderEvents(t);
    } catch (e) {
        $("#td-glance").innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
    }
});


function renderHeader(t) {
    const stratBadge = badge(t.strategy_type, STRAT_COLORS[t.strategy_type] || "");
    const statusBadge = badge(t.status.toUpperCase(), STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600");
    const symbolLink = `<a href="/symbol/${encodeURIComponent(t.symbol)}" class="text-indigo-600 hover:underline">${t.symbol}</a>`;
    $("#td-header").innerHTML = `${symbolLink} ${fmt(t.strike, 0)}${t.strategy_type === "CSP" ? "P" : "C"} ${t.expiry_date} ${stratBadge} ${statusBadge}`;
}


function renderGlance(t, currentPrice) {
    const el = $("#td-glance");
    const premiumCollected = Number(t.total_premium);
    const isOpen = t.status === "open";

    const obligation = t.strategy_type === "CSP"
        ? `Obligated to buy ${t.contracts * t.multiplier} shares of ${t.symbol} at $${fmt(t.strike, 2)} if assigned by ${t.expiry_date}.`
        : `Obligated to sell ${t.contracts * t.multiplier} shares of ${t.symbol} at $${fmt(t.strike, 2)} if assigned by ${t.expiry_date}.`;

    // Unrealized P/L = premium collected - (mid * contracts * multiplier)
    let unrealPL = null;
    let unrealPLPct = null;
    let returnOnCapital = null;

    if (isOpen && t.live && t.live.mid != null) {
        const currentCost = t.live.mid * t.contracts * t.multiplier;
        unrealPL = premiumCollected - currentCost;
        unrealPLPct = premiumCollected > 0 ? (unrealPL / premiumCollected) * 100 : 0;
        const cashAtRisk = Number(t.strike) * t.contracts * t.multiplier;
        returnOnCapital = cashAtRisk > 0 ? (unrealPL / cashAtRisk) * 100 : 0;
    }

    // DTE progress
    const totalDte = t.dte;
    const elapsed = t.days_in_trade;
    const remaining = Math.max(0, totalDte - elapsed);
    const pctElapsed = totalDte > 0 ? Math.min(100, (elapsed / totalDte) * 100) : 100;

    const plColor = unrealPL != null ? (unrealPL >= 0 ? "text-green-600" : "text-red-600") : "";
    const rocColor = returnOnCapital != null ? (returnOnCapital >= 0 ? "text-green-600" : "text-red-600") : "";

    el.innerHTML = `
    <p class="text-sm text-gray-500 mb-3">${obligation}</p>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <div class="text-xs text-gray-500 uppercase">Premium Collected</div>
        <div class="text-lg font-semibold">${fmtMoney(premiumCollected)}</div>
      </div>
      <div>
        <div class="text-xs text-gray-500 uppercase">Unrealized P/L</div>
        <div class="text-lg font-semibold ${plColor}">${isOpen && t.live ? fmtMoney(unrealPL) : '<span class="text-gray-400 text-sm">Fetching…</span>'}</div>
        ${unrealPLPct != null ? `<div class="text-xs ${plColor}">${fmtPct(unrealPLPct)} of premium</div>` : ""}
      </div>
      <div>
        <div class="text-xs text-gray-500 uppercase">Return on Capital</div>
        <div class="text-lg font-semibold ${rocColor}">${returnOnCapital != null ? fmtPct(returnOnCapital) : '<span class="text-gray-400 text-sm">—</span>'}</div>
      </div>
      <div>
        <div class="text-xs text-gray-500 uppercase">Time Elapsed</div>
        <div class="text-lg font-semibold">${elapsed}d / ${totalDte}d</div>
        <div class="text-xs text-gray-500">${remaining}d remaining</div>
      </div>
    </div>
    <!-- Theta progress bar -->
    <div class="mt-4">
      <div class="flex justify-between text-xs text-gray-500 mb-1">
        <span>Opened ${t.opened_at}</span>
        <span>Expires ${t.expiry_date}</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="h-2 rounded-full ${pctElapsed >= 80 ? 'bg-green-500' : pctElapsed >= 50 ? 'bg-yellow-400' : 'bg-blue-500'}"
             style="width: ${pctElapsed}%"></div>
      </div>
    </div>`;
}


function renderRisk(t, currentPrice) {
    const el = $("#td-risk");
    const strike = Number(t.strike);
    const breakEven = Number(t.break_even);
    const isCSP = t.strategy_type === "CSP";

    if (!currentPrice) {
        el.innerHTML = `<p class="text-gray-400 text-sm">Current price unavailable.</p>`;
        return;
    }

    // Moneyness
    const distToStrike = currentPrice - strike;
    const distPct = (distToStrike / strike) * 100;

    // For CSP: safe if price > strike, at risk if near, ITM if price < strike
    // For CC: safe if price < strike, at risk if near, ITM if price > strike
    let status, statusColor, statusIcon;
    const absPct = Math.abs(distPct);

    if (isCSP) {
        if (currentPrice > strike * 1.03) {
            status = "OTM — Safe"; statusColor = "text-green-600"; statusIcon = "✓";
        } else if (currentPrice > strike) {
            status = "Near the money"; statusColor = "text-yellow-600"; statusIcon = "⚠";
        } else {
            status = "ITM — At risk"; statusColor = "text-red-600"; statusIcon = "✗";
        }
    } else {
        if (currentPrice < strike * 0.97) {
            status = "OTM — Safe"; statusColor = "text-green-600"; statusIcon = "✓";
        } else if (currentPrice < strike) {
            status = "Near the money"; statusColor = "text-yellow-600"; statusIcon = "⚠";
        } else {
            status = "ITM — At risk"; statusColor = "text-red-600"; statusIcon = "✗";
        }
    }

    // Break-even distance
    const distToBreakEven = currentPrice - breakEven;
    const distBEPct = (distToBreakEven / breakEven) * 100;
    const beColor = (isCSP ? distToBreakEven > 0 : distToBreakEven < 0) ? "text-green-600" : "text-red-600";

    el.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <div class="text-xs text-gray-500 uppercase">Status</div>
        <div class="text-lg font-semibold ${statusColor}">${statusIcon} ${status}</div>
      </div>
      <div>
        <div class="text-xs text-gray-500 uppercase">Distance to Strike</div>
        <div class="text-lg font-semibold">${fmtMoney(Math.abs(distToStrike))}</div>
        <div class="text-xs text-gray-500">${distPct >= 0 ? "+" : ""}${fmtPct(distPct)} ${isCSP ? "above" : (distToStrike < 0 ? "below" : "above")}</div>
      </div>
      <div>
        <div class="text-xs text-gray-500 uppercase">Break-Even</div>
        <div class="text-lg font-semibold">${fmtMoney(breakEven)}</div>
        <div class="text-xs ${beColor}">${fmtMoney(Math.abs(distToBreakEven))} ${isCSP ? (distToBreakEven > 0 ? "above" : "below") : (distToBreakEven < 0 ? "below" : "above")} current</div>
      </div>
    </div>
    <!-- Visual strike/price gauge -->
    <div class="mt-6 mb-2 relative h-8 mx-8">
      <div class="absolute inset-0 bg-gray-100 rounded-lg"></div>
      ${renderGauge(strike, breakEven, currentPrice, isCSP)}
    </div>`;
}


function renderGauge(strike, breakEven, currentPrice, isCSP) {
    // Simple visual showing relative positions of break-even, strike, and current price
    const allPts = [strike, breakEven, currentPrice];
    const lo = Math.min(...allPts) * 0.98;
    const hi = Math.max(...allPts) * 1.02;
    const range = hi - lo;
    if (range === 0) return "";

    const toPos = (v) => ((v - lo) / range) * 100;

    const strikePx = toPos(strike);
    const bePx = toPos(breakEven);
    const pricePx = toPos(currentPrice);

    // Danger zone: for CSP, below break-even; for CC, above break-even+premium area
    const dangerLeft = isCSP ? 0 : bePx;
    const dangerWidth = isCSP ? bePx : 100 - bePx;

    return `
    <div class="absolute inset-0">
      <!-- Danger zone -->
      <div class="absolute top-0 bottom-0 bg-red-50" style="left:${dangerLeft}%;width:${dangerWidth}%"></div>
      <!-- Break-even line -->
      <div class="absolute top-0 bottom-0 w-px bg-red-300" style="left:${bePx}%">
        <div class="absolute -top-0.5 -translate-x-1/2 text-[10px] text-red-500 whitespace-nowrap">BE $${fmt(breakEven, 0)}</div>
      </div>
      <!-- Strike line -->
      <div class="absolute top-0 bottom-0 w-0.5 bg-gray-400" style="left:${strikePx}%">
        <div class="absolute bottom-0 -translate-x-1/2 text-[10px] text-gray-600 whitespace-nowrap">K $${fmt(strike, 0)}</div>
      </div>
      <!-- Current price marker -->
      <div class="absolute top-1 bottom-1 w-2 rounded bg-blue-600" style="left:calc(${pricePx}% - 4px)">
        <div class="absolute -top-3 -translate-x-1/2 left-1 text-[10px] font-bold text-blue-700 whitespace-nowrap">$${fmt(currentPrice, 2)}</div>
      </div>
    </div>`;
}


function renderMarket(t, currentPrice) {
    const el = $("#td-market");
    const live = t.live;
    const spotIV = t.spot?.implied_volatility;

    const items = [];

    // Current price
    if (currentPrice) {
        const opened = Number(t.spot_price_at_open);
        const change = opened ? currentPrice - opened : null;
        const changePct = opened ? ((currentPrice - opened) / opened) * 100 : null;
        const chColor = change != null ? (change >= 0 ? "text-green-600" : "text-red-600") : "";
        items.push(`
        <div>
          <div class="text-xs text-gray-500 uppercase">Spot Price</div>
          <div class="text-lg font-semibold">${fmtMoney(currentPrice)}</div>
          ${change != null ? `<div class="text-xs ${chColor}">${change >= 0 ? "+" : ""}${fmtMoney(change)} (${fmtPct(changePct)}) since open</div>` : ""}
        </div>`);
    }

    // Live option data
    if (live) {
        items.push(`
        <div>
          <div class="text-xs text-gray-500 uppercase">Option Mid Price</div>
          <div class="text-lg font-semibold">${live.mid != null ? fmtMoney(live.mid) : "—"}</div>
          <div class="text-xs text-gray-500">per share</div>
        </div>`);

        // IV with change since open
        const ivAtOpen = t.iv_at_open != null ? Number(t.iv_at_open) : null;
        const currentIV = live.iv;
        let ivSub = "";
        if (ivAtOpen != null && currentIV != null) {
            const ivChange = currentIV - ivAtOpen;
            const ivChColor = ivChange <= 0 ? "text-green-600" : "text-red-600";
            ivSub = `<div class="text-xs ${ivChColor}">${ivChange >= 0 ? "+" : ""}${fmt(ivChange, 1)}% since open (was ${fmtPct(ivAtOpen)})</div>`;
        } else if (ivAtOpen != null) {
            ivSub = `<div class="text-xs text-gray-500">IV at open: ${fmtPct(ivAtOpen)}</div>`;
        } else {
            ivSub = spotIV ? `<div class="text-xs text-gray-500">ATM IV: ${fmtPct(spotIV * 100)}</div>` : "";
        }
        items.push(`
        <div>
          <div class="text-xs text-gray-500 uppercase">Option IV</div>
          <div class="text-lg font-semibold">${currentIV != null ? fmtPct(currentIV) : "—"}</div>
          ${ivSub}
        </div>`);
    }

    // IV Rank / Percentile
    const ivData = t.iv_rank_data;
    if (ivData && (ivData.iv_rank != null || ivData.iv_percentile != null)) {
        const rank = ivData.iv_rank;
        const pctile = ivData.iv_percentile;
        const rankColor = rank != null ? (rank >= 50 ? "text-orange-600" : "text-blue-600") : "";
        const rankLabel = rank != null ? (rank >= 80 ? "Very High" : rank >= 50 ? "Elevated" : rank >= 20 ? "Normal" : "Low") : "";
        items.push(`
        <div>
          <div class="text-xs text-gray-500 uppercase">IV Rank / Percentile</div>
          <div class="text-lg font-semibold ${rankColor}">${rank != null ? fmt(rank, 0) + "%" : "—"} / ${pctile != null ? fmt(pctile, 0) + "%" : "—"}</div>
          <div class="text-xs text-gray-500">${rankLabel}${ivData.current_iv != null ? ` · 30d HV: ${fmt(ivData.current_iv, 1)}%` : ""}</div>
        </div>`);
    }

    // What-if: close now
    if (live && live.mid != null) {
        const closeCost = live.mid * t.contracts * t.multiplier;
        const netPL = Number(t.total_premium) - closeCost;
        const plColor = netPL >= 0 ? "text-green-600" : "text-red-600";
        items.push(`
        <div>
          <div class="text-xs text-gray-500 uppercase">Close Now (BTC)</div>
          <div class="text-lg font-semibold ${plColor}">${fmtMoney(netPL)}</div>
          <div class="text-xs text-gray-500">Cost: ${fmtMoney(closeCost)}</div>
        </div>`);
    }

    if (items.length === 0) {
        el.innerHTML = `<p class="text-gray-400 text-sm">Market data unavailable (market may be closed).</p>`;
        return;
    }

    el.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-4 gap-4">${items.join("")}</div>`;
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
        <div class="flex items-center gap-3 py-2 border-b last:border-0">
            <div class="w-2 h-2 rounded-full ${e.event_type === 'open' ? 'bg-green-500' : e.event_type === 'close' ? 'bg-gray-400' : e.event_type === 'assignment' ? 'bg-red-500' : 'bg-blue-500'}"></div>
            <div class="text-sm font-medium w-24">${eventLabels[e.event_type] || e.event_type}</div>
            <div class="text-sm text-gray-600">${e.event_date}</div>
            <div class="text-sm ml-auto">${e.qty} × ${fmtMoney(e.price)}</div>
        </div>
    `).join("");

    el.innerHTML = rows;
}
