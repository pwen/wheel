// ---- Helpers ----
const $ = (sel) => document.querySelector(sel);
const fmt = (v, decimals = 2) => v != null ? Number(v).toFixed(decimals) : "—";
const fmtMoney = (v) => v != null ? "$" + Number(v).toFixed(2) : "—";

// ---- Modal ----
function openModal() { $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); }

// ---- Render trades ----
async function loadTrades() {
    const res = await fetch("/api/trades");
    const trades = await res.json();
    const tbody = $("#trades-body");
    const emptyMsg = $("#empty-msg");

    if (trades.length === 0) {
        tbody.innerHTML = "";
        emptyMsg.classList.remove("hidden");
        return;
    }

    emptyMsg.classList.add("hidden");
    tbody.innerHTML = trades.map((t) => `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2 font-medium">${t.symbol}</td>
      <td class="px-3 py-2">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold
          ${t.strategy_type === 'CSP' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}">
          ${t.strategy_type}
        </span>
      </td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.spot_price_at_open)}</td>
      <td class="px-3 py-2 text-right font-medium" data-price-sym="${t.symbol}">…</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.strike)}</td>
      <td class="px-3 py-2">${t.expiry_date}</td>
      <td class="px-3 py-2 text-right">${t.contracts}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.total_premium)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.premium_per_share)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.break_even)}</td>
      <td class="px-3 py-2">${t.opened_at}</td>
      <td class="px-3 py-2 text-right">${t.dte}</td>
      <td class="px-3 py-2">${t.closed_at || "—"}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.closing_cost)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.closing_spot)}</td>
      <td class="px-3 py-2 text-right">${t.days_in_trade}</td>
      <td class="px-3 py-2 text-right ${t.realized_pl != null ? (t.realized_pl >= 0 ? 'text-green-600' : 'text-red-600') : ''}">
        ${fmtMoney(t.realized_pl)}
      </td>
      <td class="px-3 py-2 text-right ${t.realized_pl_pct != null ? (t.realized_pl_pct >= 0 ? 'text-green-600' : 'text-red-600') : ''}">
        ${t.realized_pl_pct != null ? fmt(t.realized_pl_pct) + '%' : '—'}
      </td>
      <td class="px-3 py-2">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold
          ${t.status === 'open' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-200 text-gray-600'}">
          ${t.status}
        </span>
      </td>
      <td class="px-3 py-2 max-w-[200px] truncate">${t.notes || ""}</td>
    </tr>
  `).join("");
}

// ---- Form submit ----
$("#trade-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());

    // Convert numeric fields
    body.strike = parseFloat(body.strike);
    body.contracts = parseInt(body.contracts, 10);
    body.total_premium = parseFloat(body.total_premium);
    if (body.spot_price_at_open) body.spot_price_at_open = parseFloat(body.spot_price_at_open);
    else delete body.spot_price_at_open;
    if (!body.notes) delete body.notes;

    const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (res.ok) {
        closeModal();
        e.target.reset();
        loadTrades();
    } else {
        const err = await res.json();
        alert("Error: " + JSON.stringify(err.detail || err));
    }
});

// ---- Live prices (async backfill) ----
async function loadPrices() {
    const cells = document.querySelectorAll("[data-price-sym]");
    const symbols = [...new Set([...cells].map(c => c.dataset.priceSym))];
    if (symbols.length === 0) return;

    try {
        const res = await fetch("/api/prices?" + symbols.map(s => "symbols=" + s).join("&"));
        const prices = await res.json();
        cells.forEach(cell => {
            const sym = cell.dataset.priceSym;
            const price = prices[sym];
            cell.textContent = price != null ? fmtMoney(price) : "—";
        });
    } catch {
        cells.forEach(cell => cell.textContent = "—");
    }
}

// ---- Init ----
loadTrades().then(loadPrices);
