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

/* ---------- Market Flash ---------- */
async function loadMarketFlash() {
    const el = $("#market-flash");
    try {
        const res = await fetch("/api/market-flash");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (data.markdown) {
            el.innerHTML = marked.parse(data.markdown);
        } else {
            el.innerHTML = `
            <div class="text-center py-4">
              <p class="text-gray-500 text-sm mb-3">No market flash generated for today yet.</p>
              <button id="gen-flash-btn"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
                Generate Market Flash
              </button>
            </div>`;
            $("#gen-flash-btn").addEventListener("click", generateMarketFlash);
        }
    } catch {
        el.innerHTML = `<p class="text-gray-400 text-sm">Market flash unavailable.</p>`;
    }
}

async function generateMarketFlash() {
    const el = $("#market-flash");
    const btn = $("#gen-flash-btn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Generating…";
        btn.classList.add("opacity-50", "cursor-not-allowed");
    }
    try {
        const res = await fetch("/api/market-flash", { method: "POST" });
        if (!res.ok) throw new Error("Generation failed");
        const data = await res.json();
        el.innerHTML = marked.parse(data.markdown);
    } catch {
        el.innerHTML = `<p class="text-red-500 text-sm">Failed to generate market flash. Check API key.</p>`;
    }
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

/* ---------- Expiring this week ---------- */
function renderExpiring(attention) {
    const section = $("#expiring-section");
    const el = $("#expiring-list");
    const expiring = attention.filter(t => t.remaining_dte >= 0 && t.remaining_dte <= 7);
    if (!expiring.length) { section.classList.add("hidden"); return; }

    section.classList.remove("hidden");
    el.innerHTML = expiring
        .sort((a, b) => a.remaining_dte - b.remaining_dte)
        .map(t => {
            const badge = t.strategy_type === "CSP"
                ? `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">CSP</span>`
                : `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-700">CC</span>`;
            const dteColor = t.remaining_dte <= 2 ? "text-red-600 font-semibold" : t.remaining_dte <= 5 ? "text-amber-600" : "text-gray-600";
            const dayLabel = t.remaining_dte === 0 ? "Today" : t.remaining_dte === 1 ? "Tomorrow" : `${t.remaining_dte}d`;
            return `
            <a href="/trade/${t.id}" class="block bg-white border rounded-lg p-3 hover:border-indigo-300 transition-colors">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  ${badge}
                  <span class="font-semibold">${t.symbol}</span>
                  <span class="text-gray-500 text-sm">$${t.strike}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-sm">${fmtMoney(t.total_premium)} premium</span>
                  <span class="${dteColor} text-sm font-medium">Exp ${dayLabel}</span>
                </div>
              </div>
            </a>`;
        }).join("");
}

/* ---------- Recently closed ---------- */
function renderRecentlyClosed(trades) {
    const section = $("#recent-section");
    const el = $("#recent-list");
    if (!trades.length) { section.classList.add("hidden"); return; }

    section.classList.remove("hidden");
    const statusMeta = {
        expired: { label: "Expired", color: "bg-green-100 text-green-700" },
        btc: { label: "BTC", color: "bg-blue-100 text-blue-700" },
        assigned: { label: "Assigned", color: "bg-amber-100 text-amber-700" },
        rolled: { label: "Rolled", color: "bg-purple-100 text-purple-700" },
    };

    const rows = trades.map(t => {
        const sm = statusMeta[t.status] || { label: t.status, color: "bg-gray-100 text-gray-700" };
        const badge = t.strategy_type === "CSP"
            ? `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">CSP</span>`
            : `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-700">CC</span>`;
        return `
        <tr class="border-t hover:bg-gray-50">
          <td class="px-4 py-2">${badge}</td>
          <td class="px-4 py-2 font-medium">
            <a href="/trade/${t.id}" class="text-indigo-600 hover:underline">${t.symbol}</a>
          </td>
          <td class="px-4 py-2 text-right">$${t.strike}</td>
          <td class="px-4 py-2"><span class="px-2 py-0.5 rounded text-xs font-medium ${sm.color}">${sm.label}</span></td>
          <td class="px-4 py-2 text-right">${t.closed_at}</td>
          <td class="px-4 py-2 text-right">${t.days_in_trade}d</td>
          <td class="px-4 py-2 text-right ${plColor(t.realized_pl)}">${t.realized_pl != null ? fmtMoney(t.realized_pl) : "—"}</td>
        </tr>`;
    }).join("");

    el.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase">
          <th class="px-4 py-2">Type</th>
          <th class="px-4 py-2">Symbol</th>
          <th class="px-4 py-2 text-right">Strike</th>
          <th class="px-4 py-2">Outcome</th>
          <th class="px-4 py-2 text-right">Closed</th>
          <th class="px-4 py-2 text-right">Days</th>
          <th class="px-4 py-2 text-right">P/L</th>
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
        renderExpiring(data.attention);
        renderRecentlyClosed(data.recently_closed || []);

        // Async: enrich with live prices + load market flash (don't block page)
        enrichWithPrices(data.attention);
        loadMarketFlash();
    } catch (e) {
        $("#summary-cards").innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`;
    }
});
