/* recap.js — Daily Recap page */

const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : "—";

function plColor(v) {
    if (v == null) return "";
    return Number(v) >= 0 ? "text-green-600" : "text-red-600";
}

function card(label, value, sub, colorClass) {
    return `
    <div class="bg-white border rounded-lg p-4">
      <div class="text-xs text-gray-500 uppercase">${label}</div>
      <div class="text-xl font-semibold ${colorClass || ''}">${value}</div>
      ${sub ? `<div class="text-xs text-gray-500">${sub}</div>` : ""}
    </div>`;
}

/* ---------- Summary cards ---------- */
function renderSummary(attention, vixData) {
    const el = $("#summary-cards");
    const totalCapital = attention.reduce((s, t) =>
        s + (t.strategy_type === "CSP" ? t.strike * t.contracts * t.multiplier : 0), 0);

    // Regime label
    let regimeLabel = "—";
    if (vixData && vixData.regime) {
        const labels = { bull: "Bull", sideways: "Sideways", bear: "Bear", crisis: "Crisis" };
        regimeLabel = `${labels[vixData.regime]} (VIX ${vixData.vix.toFixed(1)})`;
    }

    el.innerHTML = [
        card("Open Positions", attention.length),
        card("Cash Reserved", fmtMoney(totalCapital), "Backing open CSPs"),
        '<div id="unreal-pl-card">' + card("Unrealized P/L", '<span class="text-gray-400 text-sm">Fetching…</span>') + '</div>',
        card("Market Regime", regimeLabel),
    ].join("");
}

/* ---------- Action items (flagged trades) ---------- */
function renderActions(attention) {
    const el = $("#action-list");
    const flagged = attention.filter(t => t.reasons.length > 0);

    if (!flagged.length) {
        el.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <span class="text-green-700 font-medium">✓ No action items today — all positions look good!</span>
        </div>`;
        return;
    }

    el.innerHTML = flagged.map(t => {
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

/* ---------- All open positions table ---------- */
function renderPositions(attention) {
    const el = $("#positions-table");
    if (!attention.length) {
        el.innerHTML = `<p class="text-gray-400 text-sm p-4">No open positions.</p>`;
        return;
    }

    const rows = attention.map(t => {
        const badge = t.strategy_type === "CSP"
            ? `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">CSP</span>`
            : `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-700">CC</span>`;
        const dteColor = t.remaining_dte <= 14 ? "text-red-600 font-semibold"
            : t.remaining_dte <= 21 ? "text-amber-600" : "";
        return `
        <tr class="border-t hover:bg-gray-50">
          <td class="px-4 py-2">${badge}</td>
          <td class="px-4 py-2 font-medium">
            <a href="/trade/${t.id}" class="text-indigo-600 hover:underline">${t.symbol}</a>
          </td>
          <td class="px-4 py-2 text-right">$${t.strike}</td>
          <td class="px-4 py-2 text-right">${t.expiry_date}</td>
          <td class="px-4 py-2 text-right ${dteColor}">${t.remaining_dte}d</td>
          <td class="px-4 py-2 text-right">${t.days_in_trade}d / ${t.dte}d</td>
          <td class="px-4 py-2 text-right">${fmtMoney(t.total_premium)}</td>
          <td class="px-4 py-2 text-right" id="upl-${t.id}">—</td>
        </tr>`;
    }).join("");

    el.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase">
          <th class="px-4 py-2">Type</th>
          <th class="px-4 py-2">Symbol</th>
          <th class="px-4 py-2 text-right">Strike</th>
          <th class="px-4 py-2 text-right">Expiry</th>
          <th class="px-4 py-2 text-right">DTE</th>
          <th class="px-4 py-2 text-right">Elapsed</th>
          <th class="px-4 py-2 text-right">Premium</th>
          <th class="px-4 py-2 text-right">Unreal. P/L</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ---------- Enrich with live prices ---------- */
async function enrichWithPrices(attention) {
    if (!attention.length) return;

    const symbols = [...new Set(attention.map(t => t.symbol))];
    const contracts = attention.map(t => ({
        trade_id: t.id,
        symbol: t.symbol,
        expiry_date: t.expiry_date,
        strike: t.strike,
        strategy_type: t.strategy_type,
    }));

    let prices = {};
    let optionPrices = {};
    try {
        const [priceRes, optRes] = await Promise.all([
            fetch("/api/prices?" + symbols.map(s => "symbols=" + s).join("&")),
            fetch("/api/option-prices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(contracts),
            }),
        ]);
        prices = priceRes.ok ? await priceRes.json() : {};
        optionPrices = optRes.ok ? await optRes.json() : {};
    } catch { /* ignore */ }

    // Enrich + compute unrealized P/L
    let changed = false;
    let totalUPL = 0;
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
            totalUPL += upl;

            // Update per-row unrealized P/L
            const cell = document.getElementById(`upl-${t.id}`);
            if (cell) {
                cell.textContent = fmtMoney(upl);
                cell.className = `px-4 py-2 text-right ${plColor(upl)}`;
            }

            const uplPct = t.total_premium > 0 ? (upl / t.total_premium) * 100 : 0;
            const inFirstHalf = t.days_in_trade <= t.dte / 2;
            if (inFirstHalf && uplPct >= 50) {
                t.reasons.push({ type: "profit_target", label: `${uplPct.toFixed(0)}% profit in first half — consider BTC` });
                changed = true;
            }
        }
    }

    // Update summary card
    const wrapper = $("#unreal-pl-card");
    if (wrapper) {
        const inner = wrapper.querySelector(".text-xl");
        if (inner) {
            inner.textContent = fmtMoney(totalUPL);
            inner.className = `text-xl font-semibold ${plColor(totalUPL)}`;
        }
    }

    if (changed) renderActions(attention);
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const [statsRes, vixRes] = await Promise.all([
            fetch("/api/dashboard/stats"),
            fetch("/api/vix"),
        ]);

        const vixData = vixRes.ok ? await vixRes.json() : null;
        const vixEl = document.getElementById("vix-banner");
        if (vixEl) renderVixBanner(vixEl, vixData);

        if (!statsRes.ok) throw new Error("Failed to load data");
        const data = await statsRes.json();

        renderSummary(data.attention, vixData);
        renderActions(data.attention);
        renderPositions(data.attention);

        // Async: enrich with live prices
        enrichWithPrices(data.attention);
    } catch (e) {
        $("#summary-cards").innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
    }
});
