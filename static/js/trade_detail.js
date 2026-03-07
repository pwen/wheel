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

    // Store data for recommendation
    window._tradeData = t;
    window._currentPrice = currentPrice;

    renderHeader(t);
    renderGlance(t, currentPrice);
    renderRisk(t, currentPrice);
    renderMarket(t, currentPrice);
    renderEvents(t);

    // Hide recommendation section for closed trades
    if (t.status !== "open") {
      const recSection = $("#recommendation-section");
      if (recSection) recSection.classList.add("hidden");
    }

    // VIX banner in header
    const vixEl = document.getElementById("vix-banner");
    if (vixEl) renderVixBanner(vixEl);

    // Market status
    const mktEl = document.getElementById("market-status");
    if (mktEl) renderMarketStatus(mktEl);
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

  const shares = t.contracts * t.multiplier;
  const obligation = t.strategy_type === "CSP"
    ? `Obligated to buy <span class="font-bold">${shares}</span> shares of ${t.symbol} at <span class="font-bold">$${fmt(t.strike, 2)}</span> if assigned by <span class="font-bold">${t.expiry_date}</span>.`
    : `Obligated to sell <span class="font-bold">${shares}</span> shares of ${t.symbol} at <span class="font-bold">$${fmt(t.strike, 2)}</span> if assigned by <span class="font-bold">${t.expiry_date}</span>.`;

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

  // Render profit alert into recommendation section
  const alertEl = $("#rec-alert");
  if (alertEl) {
    if (unrealPLPct != null && elapsed <= totalDte / 2 && unrealPLPct >= 50) {
      alertEl.innerHTML = `
      <div class="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2">
        <span class="text-emerald-600 text-lg">💰</span>
        <div>
          <span class="font-semibold text-emerald-800 dark:text-emerald-400">50%+ Profit in first half!</span>
          <span class="text-sm text-emerald-700 dark:text-emerald-500 ml-1">Consider buying to close at ${fmtPct(unrealPLPct)} profit and redeploying capital.</span>
        </div>
      </div>`;
    } else {
      alertEl.innerHTML = "";
    }
  }

  el.innerHTML = `
    <p class="text-base text-gray-900 dark:text-gray-100 mb-3">${obligation}</p>
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Premium Collected</div>
        <div class="text-lg font-semibold">${fmtMoney(premiumCollected)}</div>
      </div>
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Unrealized P/L</div>
        <div class="text-lg font-semibold ${plColor}">${isOpen && t.live ? fmtMoney(unrealPL) : '<span class="text-gray-400 text-sm">Fetching…</span>'}</div>
        ${unrealPLPct != null ? `<div class="text-xs ${plColor}">${fmtPct(unrealPLPct)} of premium</div>` : ""}
        ${unrealPL != null ? `<div class="text-xs text-gray-600 dark:text-gray-400">Cost to close: ${fmtMoney(premiumCollected - unrealPL)}</div>` : ""}
      </div>
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Return on Capital</div>
        <div class="text-lg font-semibold ${rocColor}">${returnOnCapital != null ? fmtPct(returnOnCapital) : '<span class="text-gray-400 text-sm">—</span>'}</div>
      </div>
      <div>
        ${(() => {
      const cash = Number(t.strike) * t.contracts * t.multiplier;
      const rawYield = cash > 0 ? (premiumCollected / cash) * 100 : null;
      const annYield = rawYield != null && totalDte > 0 ? rawYield * (365 / totalDte) : null;
      const isCSP = t.strategy_type === "CSP";

      // Yield quality tiers (based on 30-45 DTE norms)
      const thresholds = isCSP
        ? { thin: 1, decent: 3, strong: 5 }   // CSP: <1% thin, 1-3% decent, 3-5% strong, 5%+ fat
        : { thin: 0.5, decent: 1.5, strong: 3 }; // CC: <0.5% thin, 0.5-1.5% decent, 1.5-3% strong, 3%+ fat
      let tier, tierColor, tierDesc;
      if (rawYield == null) { tier = ""; tierColor = ""; tierDesc = ""; }
      else if (rawYield < thresholds.thin) { tier = "Thin"; tierColor = "text-gray-600"; tierDesc = "low IV, slim pickings"; }
      else if (rawYield < thresholds.decent) { tier = "Decent"; tierColor = "text-blue-600"; tierDesc = "standard wheel income"; }
      else if (rawYield < thresholds.strong) { tier = "Strong"; tierColor = "text-green-600"; tierDesc = "elevated IV, sweet spot"; }
      else { tier = "Fat"; tierColor = "text-emerald-600 font-bold"; tierDesc = "rich premium, high risk priced in"; }

      const guide = isCSP
        ? `CSP guide (30-45 DTE):
< 1% → Thin (low IV)
1-3% → Decent
3-5% → Strong (sweet spot)
5%+ → Fat (high risk premium)`
        : `CC guide (30-45 DTE):
< 0.5% → Thin
0.5-1.5% → Decent
1.5-3% → Strong
3%+ → Fat`;

      return `
            <div class="text-xs text-gray-600 uppercase flex items-center gap-1">
              Premium Yield
              <span class="relative group cursor-help">
                <svg class="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
                <span class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded shadow-lg whitespace-pre-line w-52 z-50 normal-case font-normal">${guide}</span>
              </span>
            </div>
            <div class="text-lg font-semibold ${tierColor}">${rawYield != null ? fmtPct(rawYield) : '—'}</div>
            ${annYield != null ? `<div class="text-xs text-gray-600">${fmtPct(annYield)} annualized</div>` : ""}
            ${tier ? `<div class="text-xs ${tierColor}">${tier} — ${tierDesc}</div>` : ""}`;
    })()}
      </div>
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Time Elapsed</div>
        <div class="text-lg font-semibold">${elapsed}d / ${totalDte}d</div>
        <div class="text-xs ${remaining <= 14 ? 'text-red-600 font-semibold' : remaining <= 21 ? 'text-amber-600 font-medium' : 'text-gray-600 dark:text-gray-400'}">${remaining}d remaining${remaining <= 14 ? ' \u26a0\ufe0f' : remaining <= 21 ? ' \u23f3' : ''}</div>
      </div>
    </div>
    <!-- Theta progress bar -->
    <div class="mt-4">
      <div class="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span>Opened ${t.opened_at}</span>
        <span>Expires ${t.expiry_date}</span>
      </div>
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div class="h-2 rounded-full ${remaining <= 14 ? 'bg-red-500' : remaining <= 21 ? 'bg-amber-400' : pctElapsed >= 80 ? 'bg-green-500' : pctElapsed >= 50 ? 'bg-yellow-400' : 'bg-blue-500'}"
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
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Status</div>
        <div class="text-lg font-semibold ${statusColor}">${statusIcon} ${status}</div>
      </div>
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Distance to Strike</div>
        <div class="text-lg font-semibold">${fmtMoney(Math.abs(distToStrike))}</div>
        <div class="text-xs text-gray-600 dark:text-gray-400">${distPct >= 0 ? "+" : ""}${fmtPct(distPct)} ${isCSP ? "above" : (distToStrike < 0 ? "below" : "above")}</div>
      </div>
      <div>
        <div class="text-xs text-gray-600 dark:text-gray-400 uppercase">Break-Even</div>
        <div class="text-lg font-semibold">${fmtMoney(breakEven)}</div>
        <div class="text-xs ${beColor}">${fmtMoney(Math.abs(distToBreakEven))} ${isCSP ? (distToBreakEven > 0 ? "above" : "below") : (distToBreakEven < 0 ? "below" : "above")} current</div>
      </div>
    </div>
    <!-- Visual strike/price gauge -->
    <div class="mt-6 mb-2 relative h-8 mx-8">
      <div class="absolute inset-0 bg-gray-100 dark:bg-gray-700 rounded-lg"></div>
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

  // Tooltip helper: label with hover info icon
  const tip = (label, desc) => `
      <div class="text-xs text-gray-600 uppercase flex items-center gap-1">
        ${label}
        <span class="relative group cursor-help">
          <svg class="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
          <span class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded shadow-lg whitespace-normal w-48 z-50 normal-case font-normal">${desc}</span>
        </span>
      </div>`;

  const items = [];

  // Current price
  if (currentPrice) {
    const opened = Number(t.spot_price_at_open);
    const change = opened ? currentPrice - opened : null;
    const changePct = opened ? ((currentPrice - opened) / opened) * 100 : null;
    const chColor = change != null ? (change >= 0 ? "text-green-600" : "text-red-600") : "";
    items.push(`
        <div>
          ${tip("Spot Price", "Current price of the underlying stock or ETF.")}
          <div class="text-lg font-semibold">${fmtMoney(currentPrice)}</div>
          ${change != null ? `<div class="text-xs ${chColor}">${change >= 0 ? "+" : ""}${fmtMoney(change)} (${fmtPct(changePct)}) since open</div>` : ""}
        </div>`);
  }

  // Live option data
  if (live) {
    items.push(`
        <div>
          ${tip("Option Mid Price", "Midpoint between bid and ask. This is what it would roughly cost to buy-to-close.")}
          <div class="text-lg font-semibold">${live.mid != null ? fmtMoney(live.mid) : "—"}</div>
          <div class="text-xs text-gray-600 dark:text-gray-400">per share</div>
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
      ivSub = `<div class="text-xs text-gray-600 dark:text-gray-400">IV at open: ${fmtPct(ivAtOpen)}</div>`;
    } else {
      ivSub = spotIV ? `<div class="text-xs text-gray-600 dark:text-gray-400">ATM IV: ${fmtPct(spotIV * 100)}</div>` : "";
    }
    items.push(`
        <div>
          ${tip("Option IV", "Implied volatility of this specific contract. Higher IV = more premium but more risk.")}
          <div class="text-lg font-semibold">${currentIV != null ? fmtPct(currentIV) : "—"}</div>
          ${ivSub}
        </div>`);
  }

  // Theta
  if (live && live.theta != null) {
    const th = live.theta;
    const dailyIncome = Math.abs(th) * t.contracts * t.multiplier;
    items.push(`
        <div>
          ${tip("Theta", `This position earns ~$${fmt(dailyIncome, 2)}/day from time decay. The option loses $${fmt(Math.abs(th), 4)}/share daily, which is income for you as the seller.`)}
          <div class="text-lg font-semibold text-green-600">$${fmt(dailyIncome, 2)}<span class="text-sm text-gray-600 dark:text-gray-400">/day</span></div>
          <div class="text-xs text-gray-600 dark:text-gray-400">${fmt(th, 4)} per share</div>
        </div>`);
  }

  // Probability OTM
  if (live && live.prob_otm != null) {
    const p = live.prob_otm;
    const pColor = p >= 70 ? "text-green-600" : p >= 50 ? "text-yellow-600" : "text-red-600";
    items.push(`
        <div>
          ${tip("Prob OTM", `${fmt(p, 1)}% chance the option expires worthless — meaning you keep the full premium. ${p >= 70 ? "Odds are in your favor." : p >= 50 ? "Roughly a coin flip." : "Assignment is likely — consider rolling or closing."}`)}
          <div class="text-lg font-semibold ${pColor}">${fmt(p, 1)}%</div>
          <div class="text-xs text-gray-600 dark:text-gray-400">${p >= 70 ? "Favorable" : p >= 50 ? "Coin flip" : "At risk"}</div>
        </div>`);
  }

  // Gamma
  if (live && live.gamma != null) {
    const gRisk = live.gamma >= 0.05 ? "High gamma — delta can shift fast." : live.gamma >= 0.02 ? "Moderate gamma." : "Low gamma — position is stable.";
    items.push(`
        <div>
          ${tip("Gamma", `For every $1 the stock moves, delta changes by ${fmt(live.gamma, 4)}. ${gRisk}`)}
          <div class="text-lg font-semibold">${fmt(live.gamma, 4)}</div>
          <div class="text-xs text-gray-600 dark:text-gray-400">delta change per $1</div>
        </div>`);
  }

  // Bid-Ask Spread
  if (live && live.bid != null && live.ask != null) {
    const spread = live.ask - live.bid;
    const spreadPct = live.mid ? (spread / live.mid) * 100 : null;
    const spreadColor = spreadPct != null ? (spreadPct <= 10 ? "text-green-600" : spreadPct <= 25 ? "text-yellow-600" : "text-red-600") : "";
    const spreadLabel = spreadPct != null ? (spreadPct <= 10 ? "Tight" : spreadPct <= 25 ? "Moderate" : "Wide") : "";
    const spreadTip = `Bid $${fmt(live.bid, 2)} / Ask $${fmt(live.ask, 2)} — you'd lose ~$${fmt(spread / 2, 2)}/share to slippage. ${spreadPct != null && spreadPct > 25 ? "Wide spread — consider limit orders." : "Spread looks reasonable."}`;
    items.push(`
        <div>
          ${tip("Bid-Ask Spread", spreadTip)}
          <div class="text-lg font-semibold ${spreadColor}">${fmtMoney(spread)}</div>
          <div class="text-xs text-gray-600 dark:text-gray-400">${spreadLabel}${spreadPct != null ? ` \u00b7 ${fmt(spreadPct, 1)}% of mid` : ""}</div>
        </div>`);
  }

  // Volume / Open Interest
  if (live && (live.volume != null || live.open_interest != null)) {
    const vol = live.volume;
    const oi = live.open_interest;
    const ratio = vol != null && oi ? (vol / oi) : null;
    const liqLabel = oi != null ? (oi >= 1000 ? "Liquid" : oi >= 100 ? "Moderate" : "Thin") : "";
    const volOiTip = `${vol != null ? vol.toLocaleString() : "N/A"} contracts traded today out of ${oi != null ? oi.toLocaleString() : "N/A"} open. ${oi != null && oi < 100 ? "Low liquidity — may be hard to get good fills." : "Decent liquidity."}${ratio != null && ratio > 1 ? " Vol/OI > 1 suggests unusual activity." : ""}`;
    items.push(`
        <div>
          ${tip("Volume / OI", volOiTip)}
          <div class="text-lg font-semibold">${vol != null ? vol.toLocaleString() : "—"} / ${oi != null ? oi.toLocaleString() : "—"}</div>
          <div class="text-xs text-gray-600">${liqLabel}${ratio != null ? ` · Vol/OI: ${fmt(ratio, 2)}` : ""}</div>
        </div>`);
  }

  // IV Rank
  const ivData = t.iv_rank_data;
  if (ivData && ivData.iv_rank != null) {
    const rank = ivData.iv_rank;
    const rankColor = rank >= 50 ? "text-orange-600" : "text-blue-600";
    const rankLabel = rank >= 80 ? "Very High" : rank >= 50 ? "Elevated" : rank >= 20 ? "Normal" : "Low";
    items.push(`
        <div>
          ${tip("IV Rank", `IV is at the ${fmt(rank, 0)}th percentile of its 52-week range. ${rank >= 50 ? "Elevated — good time to sell premium." : "Below average — less premium available."}`)}
          <div class="text-lg font-semibold ${rankColor}">${fmt(rank, 0)}%</div>
          <div class="text-xs text-gray-600 dark:text-gray-400">${rankLabel}${ivData.current_iv != null ? ` \u00b7 30d HV: ${fmt(ivData.current_iv, 1)}%` : ""}</div>
        </div>`);
  }

  if (items.length === 0) {
    el.innerHTML = `<p class="text-gray-400 text-sm">Market data unavailable (market may be closed).</p>`;
    return;
  }

  const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(t.symbol)}/options/`;
  el.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">${items.join("")}</div>
    <div class="mt-3 pt-3 border-t dark:border-gray-700 text-right">
      <a href="${yahooUrl}" target="_blank" rel="noopener noreferrer" class="text-xs text-gray-400 hover:text-indigo-600 inline-flex items-center gap-1">
        View full option chain on Yahoo Finance
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-4.5-6H18m0 0v4.5m0-4.5-7.5 7.5"/></svg>
      </a>
    </div>`;
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


/* ---------- AI Recommendation ---------- */
function _buildTradeContext(t, currentPrice) {
  const live = t.live || {};
  const mid = live.mid;
  const premium = Number(t.total_premium);
  const costToClose = mid != null ? mid * t.contracts * t.multiplier : null;
  const upl = costToClose != null ? premium - costToClose : null;
  const uplPct = upl != null && premium > 0 ? (upl / premium) * 100 : null;

  let moneyness = null, dist = null, distPct = null;
  if (currentPrice) {
    dist = Math.abs(currentPrice - Number(t.strike));
    distPct = (dist / Number(t.strike)) * 100;
    moneyness = t.strategy_type === "CSP"
      ? (currentPrice < Number(t.strike) ? "ITM" : "OTM")
      : (currentPrice > Number(t.strike) ? "ITM" : "OTM");
  }

  return {
    strategy_type: t.strategy_type,
    strategy_label: t.strategy_type === "CSP" ? "Cash-Secured Put" : "Covered Call",
    symbol: t.symbol,
    spot_name: t.spot?.name || "?",
    strike: Number(t.strike),
    expiry_date: t.expiry_date,
    remaining_dte: t.dte - t.days_in_trade,
    contracts: t.contracts,
    shares: t.contracts * t.multiplier,
    total_premium: premium,
    premium_per_share: t.premium_per_share,
    break_even: t.break_even,
    opened_at: t.opened_at,
    days_in_trade: t.days_in_trade,
    dte: t.dte,
    status: t.status,
    current_price: currentPrice,
    moneyness,
    dist_to_strike: dist,
    dist_to_strike_pct: distPct,
    iv_at_open: t.iv_at_open != null ? Number(t.iv_at_open) : null,
    live: Object.keys(live).length ? live : null,
    upl,
    upl_pct: uplPct,
    cost_to_close: costToClose,
    iv_rank: t.iv_rank_data?.iv_rank ?? null,
    theta_daily_income: live.theta ? Math.abs(live.theta) * t.contracts * t.multiplier : 0,
    vix: _vixCache,
  };
}

async function fetchRecommendation() {
  const el = $("#td-recommendation");
  const t = window._tradeData;
  const currentPrice = window._currentPrice;

  if (!t) {
    el.innerHTML = `<p class="text-red-500 text-sm">Trade data not loaded yet.</p>`;
    return;
  }

  el.innerHTML = `<p class="text-gray-600 text-sm animate-pulse">Analyzing trade data…</p>`;

  try {
    const res = await fetch("/api/trades/recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(_buildTradeContext(t, currentPrice)),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to get recommendation");
    }
    const data = await res.json();
    renderRecommendation(data.recommendation, data.tokens);
  } catch (e) {
    el.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
  }
}

function renderRecommendation(text, tokens) {
  const el = $("#td-recommendation");

  // Parse the structured response — each field is "LABEL: value" on one line
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Extract fields
  const extract = (prefix) => {
    const line = lines.find(l => new RegExp(`^${prefix}:`, "i").test(l));
    return line ? line.replace(new RegExp(`^${prefix}:\\s*`, "i"), "").trim() : null;
  };

  const rec = extract("RECOMMENDATION");
  const reasoning = extract("REASONING");
  const risk = extract("KEY RISK") || extract("KEY RISKS");
  const rollDir = extract("ROLL DIRECTION");

  // Color-code the recommendation
  let recColor = "bg-gray-100 text-gray-700";
  if (rec) {
    const lower = rec.toLowerCase();
    if (lower.includes("hold") || lower.includes("let expire")) recColor = "bg-green-100 text-green-700";
    else if (lower.includes("buy to close") || lower.includes("close")) recColor = "bg-amber-100 text-amber-700";
    else if (lower.includes("roll")) recColor = "bg-purple-100 text-purple-700";
  }

  let html = "";

  if (rec) {
    html += `<div class="mb-3"><span class="inline-block px-3 py-1.5 rounded-lg text-sm font-bold ${recColor}">${rec}</span></div>`;
  }

  if (reasoning) {
    html += `<div class="mb-2">
      <span class="text-xs font-semibold text-gray-600 uppercase">Reasoning:</span>
      <span class="text-sm text-gray-700 ml-1">${reasoning}</span>
    </div>`;
  }

  if (risk) {
    html += `<div class="mb-2">
      <span class="text-xs font-semibold text-gray-600 uppercase">Key Risk:</span>
      <span class="text-sm text-gray-700 ml-1">${risk}</span>
    </div>`;
  }

  if (rollDir) {
    html += `<div class="mb-2">
      <span class="text-xs font-semibold text-gray-600 uppercase">Roll Direction:</span>
      <span class="text-sm text-gray-700 ml-1">${rollDir}</span>
    </div>`;
  }

  // Fallback: if parsing failed, show raw text
  if (!html) {
    html = `<p class="text-sm text-gray-700 whitespace-pre-line">${text}</p>`;
  }

  // Token usage footer
  if (tokens && tokens.total) {
    html += `<p class="text-[10px] text-gray-300 mt-3">${tokens.total} tokens used</p>`;
  }

  el.innerHTML = html;
}
