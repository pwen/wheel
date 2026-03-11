/* closed_trade_detail.js — Rendering for closed (non-open) trades */

function renderClosedView(t) {
    // Hide open-trade-only sections
    const recSection = $("#recommendation-section");
    if (recSection) recSection.classList.add("hidden");

    // Relabel sections for closed context
    const riskHeader = document.querySelector("#td-risk")?.closest("section")?.querySelector("h3");
    if (riskHeader) riskHeader.textContent = "Trade Outcome";

    const marketHeader = document.querySelector("#td-market")?.closest("section")?.querySelector("h3");
    if (marketHeader) marketHeader.closest("section").classList.add("hidden");

    renderHeader(t);
    renderClosedGlance(t);
    renderClosedOutcome(t);
    renderEvents(t);
}


function renderClosedGlance(t) {
    const el = $("#td-glance");
    const premiumCollected = Number(t.total_premium);
    const closingCost = t.closing_cost != null ? Number(t.closing_cost) : 0;
    const realizedPL = t.realized_pl != null ? Number(t.realized_pl) : premiumCollected - closingCost;
    const realizedPLPct = t.realized_pl_pct != null ? Number(t.realized_pl_pct) : null;
    const shares = t.contracts * t.multiplier;

    const plColor = realizedPL >= 0 ? "text-green-600" : "text-red-600";
    const plIcon = realizedPL >= 0 ? "✓" : "✗";

    // Outcome label based on status
    const outcomeLabels = {
        expired: "Expired worthless — full premium kept",
        btc: `Bought to close for ${fmtMoney(closingCost)}`,
        assigned: `Assigned — ${t.strategy_type === "CSP" ? `bought ${shares} shares at $${fmt(t.strike, 2)}` : `sold ${shares} shares at $${fmt(t.strike, 2)}`}`,
        rolled: "Rolled to a new position",
    };
    const outcomeText = outcomeLabels[t.status] || `Closed (${t.status})`;

    // Duration
    const duration = t.days_in_trade;
    const totalDte = t.dte;

    // Cash at risk for return on capital
    const cashAtRisk = Number(t.strike) * t.contracts * t.multiplier;
    const returnOnCapital = cashAtRisk > 0 ? (realizedPL / cashAtRisk) * 100 : null;
    const rocColor = returnOnCapital != null ? (returnOnCapital >= 0 ? "text-green-600" : "text-red-600") : "";

    el.innerHTML = `
    <!-- Outcome banner -->
    <div class="mb-4 px-3 py-2 rounded-lg ${realizedPL >= 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}">
      <div class="flex items-center gap-2">
        <span class="text-lg">${realizedPL >= 0 ? '💰' : '📉'}</span>
        <span class="font-semibold ${plColor}">${outcomeText}</span>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Premium Collected</div>
        <div class="text-lg font-semibold">${fmtMoney(premiumCollected)}</div>
      </div>
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Closing Cost</div>
        <div class="text-lg font-semibold">${closingCost > 0 ? fmtMoney(closingCost) : '<span class="text-green-600">$0</span>'}</div>
        ${t.status === 'expired' ? '<div class="text-xs text-green-600">Expired worthless</div>' : ''}
      </div>
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Realized P/L</div>
        <div class="text-lg font-semibold ${plColor}">${plIcon} ${fmtMoney(realizedPL)}</div>
        ${realizedPLPct != null ? `<div class="text-xs ${plColor}">${fmtPct(realizedPLPct)} return on risk</div>` : ''}
      </div>
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Return on Capital</div>
        <div class="text-lg font-semibold ${rocColor}">${returnOnCapital != null ? fmtPct(returnOnCapital) : '—'}</div>
      </div>
      <div>
        ${premiumYieldHtml(t)}
      </div>
    </div>

    <!-- Duration bar -->
    <div class="mt-4">
      <div class="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span>Opened ${t.opened_at}</span>
        <span>${t.closed_at ? `Closed ${t.closed_at}` : `Expired ${t.expiry_date}`}</span>
      </div>
      <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <span>Held <span class="font-semibold text-gray-900 dark:text-gray-100">${duration}d</span> of ${totalDte}d DTE</span>
        ${duration < totalDte ? `<span class="text-xs">(closed ${totalDte - duration}d early)</span>` : '<span class="text-xs">(held to expiry)</span>'}
      </div>
    </div>`;
}


function renderClosedOutcome(t) {
    const el = $("#td-risk");
    const strike = Number(t.strike);
    const closingSpot = t.closing_spot != null ? Number(t.closing_spot) : null;
    const spotAtOpen = t.spot_price_at_open != null ? Number(t.spot_price_at_open) : null;
    const isCSP = t.strategy_type === "CSP";
    const breakEven = Number(t.break_even);

    const items = [];

    // Strike vs closing spot
    if (closingSpot != null) {
        const distPct = ((closingSpot - strike) / strike) * 100;
        const wasOTM = isCSP ? closingSpot > strike : closingSpot < strike;
        items.push(`
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Spot at Close</div>
        <div class="text-lg font-semibold">${fmtMoney(closingSpot)}</div>
        <div class="text-xs ${wasOTM ? 'text-green-600' : 'text-red-600'}">
          ${wasOTM ? 'OTM' : 'ITM'} — ${Math.abs(distPct).toFixed(1)}% ${distPct >= 0 ? 'above' : 'below'} strike
        </div>
      </div>`);
    }

    // Spot at open
    if (spotAtOpen != null) {
        items.push(`
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Spot at Open</div>
        <div class="text-lg font-semibold">${fmtMoney(spotAtOpen)}</div>
        ${closingSpot != null ? (() => {
                const move = closingSpot - spotAtOpen;
                const movePct = (move / spotAtOpen) * 100;
                const moveColor = move >= 0 ? 'text-green-600' : 'text-red-600';
                return `<div class="text-xs ${moveColor}">Stock moved ${move >= 0 ? '+' : ''}${fmtPct(movePct)} during trade</div>`;
            })() : ''}
      </div>`);
    }

    // Break-even
    items.push(`
    <div>
      <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Break-Even</div>
      <div class="text-lg font-semibold">${fmtMoney(breakEven)}</div>
      ${closingSpot != null ? (() => {
            const dist = closingSpot - breakEven;
            const safe = isCSP ? dist > 0 : dist < 0;
            return `<div class="text-xs ${safe ? 'text-green-600' : 'text-red-600'}">${safe ? 'Safe' : 'Breached'} — ${fmtMoney(Math.abs(dist))} ${dist >= 0 ? 'above' : 'below'} spot at close</div>`;
        })() : ''}
    </div>`);

    // IV at open
    if (t.iv_at_open != null) {
        items.push(`
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">IV at Open</div>
        <div class="text-lg font-semibold">${fmtPct(Number(t.iv_at_open))}</div>
      </div>`);
    }

    if (items.length === 0) {
        el.innerHTML = `<p class="text-gray-400 text-sm">No outcome data available.</p>`;
        return;
    }

    el.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-4 gap-4">${items.join("")}</div>`;
}
