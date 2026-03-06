let allTrades = [];

function renderTrades() {
    const filtered = applyFilters(allTrades);
    const sorted = applySorting(filtered);
    const tbody = $("#trades-body");
    const emptyMsg = $("#empty-msg");

    if (sorted.length === 0) {
        tbody.innerHTML = "";
        emptyMsg.classList.remove("hidden");
        return;
    }

    emptyMsg.classList.add("hidden");
    tbody.innerHTML = sorted.map((t) => `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2 font-medium">${t.symbol}</td>
      <td class="px-3 py-2">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold
          ${t.strategy_type === 'CSP' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}">
          ${t.strategy_type}
        </span>
      </td>
      <td class="px-3 py-2 text-right font-medium" data-price-sym="${t.symbol}" data-strike="${t.strike}" data-type="${t.strategy_type}">…</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.strike)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.expiry_date}</td>
      <td class="px-3 py-2 text-right">${t.contracts}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.total_premium)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.premium_per_share)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.break_even)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.opened_at}</td>
      <td class="px-3 py-2 text-right">${t.dte}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.closed_at || "—"}</td>
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
          ${statusBadge(t.status)}">
          ${statusLabel(t.status)}
        </span>
      </td>
      <td class="px-3 py-2 text-center whitespace-nowrap">
        <button onclick='editTrade(${JSON.stringify(t.id)})' class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit</button>
        ${t.status === 'open' ? `<button onclick='openCloseModal(${JSON.stringify(t.id)})' class="ml-2 text-red-600 hover:text-red-800 text-xs font-medium">Close</button>` : ''}
      </td>
    </tr>
  `).join("");

    updateSortArrows();
}

async function loadTrades() {
    const res = await fetch("/api/trades");
    allTrades = await res.json();
    populateSpotFilter(allTrades);
    renderTrades();
}

function editTrade(id) {
    const trade = allTrades.find(t => t.id === id);
    if (trade) openModal(trade);
}

function handleTradeFormSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());

    body.strike = parseFloat(body.strike);
    body.contracts = parseInt(body.contracts, 10);
    body.total_premium = parseFloat(body.total_premium);
    if (body.spot_price_at_open) body.spot_price_at_open = parseFloat(body.spot_price_at_open);
    else delete body.spot_price_at_open;

    const url = editingTradeId ? `/api/trades/${editingTradeId}` : "/api/trades";
    const method = editingTradeId ? "PATCH" : "POST";

    fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }).then(res => {
        if (res.ok) {
            closeModal();
            e.target.reset();
            loadTrades().then(loadPrices);
        } else {
            res.json().then(err => alert("Error: " + JSON.stringify(err.detail || err)));
        }
    });
}
