// ---- Symbol Detail Page ----

const $ = (sel) => document.querySelector(sel);
const fmt = (v, decimals = 2) => v != null ? Number(v).toFixed(decimals) : "—";
const fmtMoney = (v) => v != null ? (Number(v) < 0 ? "-$" + Math.abs(Number(v)).toFixed(2) : "$" + Number(v).toFixed(2)) : "—";

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

        renderSDOpenTrades(data.open_trades);
        renderSDClosedTrades(data.closed_trades);
        renderSDLots(data.lots);
        renderSDTotals(data.totals);

        if (data.lots.length > 0) {
            loadSDLotPrices(symbol, data.lots);
        }
    } catch (e) {
        console.error("Symbol detail error:", e);
    }
}

document.addEventListener("DOMContentLoaded", loadSymbolDetail);

function renderSDOpenTrades(trades) {
    const tbody = $("#sd-open-body");
    const empty = $("#sd-open-empty");
    if (trades.length === 0) { empty.classList.remove("hidden"); return; }
    tbody.innerHTML = trades.map(t => `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold
          ${t.strategy_type === 'CSP' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}">
          ${t.strategy_type}</span>
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
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold
          ${t.strategy_type === 'CSP' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}">
          ${t.strategy_type}</span>
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

function renderSDLots(lots) {
    const tbody = $("#sd-lots-body");
    const empty = $("#sd-lots-empty");
    if (lots.length === 0) { empty.classList.remove("hidden"); return; }
    tbody.innerHTML = lots.map(lot => {
        const totalCost = lot.cost_per_share * lot.remaining_qty;
        return `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2 text-right">${lot.qty}</td>
      <td class="px-3 py-2 text-right">${lot.remaining_qty}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(lot.cost_per_share)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(totalCost)}</td>
      <td class="px-3 py-2 text-right" data-sd-mktval="${lot.id}">…</td>
      <td class="px-3 py-2 text-right" data-sd-upl="${lot.id}">…</td>
      <td class="px-3 py-2 whitespace-nowrap">${lot.acquired_at}</td>
      <td class="px-3 py-2">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold
          ${lot.source === 'assignment' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}">
          ${lot.source === 'assignment' ? 'Assignment' : 'Purchase'}</span>
      </td>
    </tr>`;
    }).join("");
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

        // Update totals with live share P/L
        const totalShareMktVal = lots.reduce((s, l) => s + price * l.remaining_qty, 0);
        const totalShareCost = lots.reduce((s, l) => s + l.cost_per_share * l.remaining_qty, 0);
        const shareUpl = totalShareMktVal - totalShareCost;
        const sharePLCard = document.querySelector("#sd-totals [data-sd-share-pl]");
        if (sharePLCard) {
            sharePLCard.textContent = fmtMoney(shareUpl);
            sharePLCard.classList.remove("text-green-600", "text-red-600");
            sharePLCard.classList.add(shareUpl >= 0 ? "text-green-600" : "text-red-600");
        }
    } catch { /* ignore */ }
}

function renderSDTotals(totals) {
    const cards = [
        { label: "Premium Collected", value: fmtMoney(totals.total_premium_collected) },
        { label: "Closing Costs", value: fmtMoney(totals.total_closing_cost) },
        { label: "Realized P/L (Options)", value: fmtMoney(totals.total_realized_pl), color: totals.total_realized_pl >= 0 ? "text-green-600" : "text-red-600" },
        { label: "Unrealized P/L (Shares)", value: "…", attr: 'data-sd-share-pl', color: "" },
        { label: "Total Shares Held", value: totals.total_shares },
        { label: "Share Cost Basis", value: fmtMoney(totals.total_share_cost) },
        { label: "Open Trades", value: totals.open_trade_count },
        { label: "Closed Trades", value: totals.closed_trade_count },
    ];

    $("#sd-totals").innerHTML = cards.map(c => `
    <div class="bg-gray-50 rounded-lg p-3">
      <div class="text-xs text-gray-500 mb-1">${c.label}</div>
      <div class="text-lg font-semibold ${c.color || ''}" ${c.attr || ''}>${c.value}</div>
    </div>`).join("");
}
