let allTrades = [];
let tradeView = "open"; // "open" or "closed"

function getVisibleTrades() {
    const base = tradeView === "open"
        ? allTrades.filter(t => t.status === "open")
        : allTrades.filter(t => t.status !== "open");
    return base;
}

function renderTrades() {
    const filtered = applyFilters(getVisibleTrades());
    const sorted = applySorting(filtered);

    if (tradeView === "open") {
        renderOpenTrades(sorted);
    } else {
        renderClosedTrades(sorted);
    }
    updateSortArrows();
    // Re-apply cached live data to newly rendered DOM
    if (typeof applyPrices === "function") applyPrices();
    if (typeof applyOptionPrices === "function") applyOptionPrices();
}

function renderOpenTrades(trades) {
    const tbody = $("#open-trades-body");
    const emptyMsg = $("#open-empty-msg");

    if (trades.length === 0) {
        tbody.innerHTML = "";
        emptyMsg.classList.remove("hidden");
        return;
    }

    emptyMsg.classList.add("hidden");
    tbody.innerHTML = trades.map(t => `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2 font-medium"><a href="/symbol/${encodeURIComponent(t.symbol)}" class="text-indigo-600 hover:underline">${t.symbol}</a></td>
      <td class="px-3 py-2">
        <a href="/trade/${t.id}" class="inline-block px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80
          ${t.strategy_type === 'CSP' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}">
          ${t.strategy_type}
        </a>
      </td>
      <td class="px-3 py-2 text-right font-medium" data-price-sym="${t.symbol}" data-strike="${t.strike}" data-type="${t.strategy_type}">…</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.strike)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.expiry_date}</td>
      <td class="px-3 py-2 text-right">${t.contracts}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.total_premium)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.premium_per_share)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.break_even)}</td>
      <td class="px-3 py-2 text-right" data-opt-mid="${t.id}">…</td>
      <td class="px-3 py-2 text-right" data-opt-upl="${t.id}">…</td>
      <td class="px-3 py-2 text-right" data-opt-upl-pct="${t.id}">…</td>
      <td class="px-3 py-2 text-right" data-opt-iv="${t.id}">…</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.opened_at}</td>
      <td class="px-3 py-2 text-right ${(() => { const rem = t.dte - t.days_in_trade; return rem <= 14 ? 'text-red-600 font-semibold' : rem <= 21 ? 'text-amber-600 font-medium' : ''; })()}">${t.dte - t.days_in_trade}</td>
      <td class="px-3 py-2 text-right">${t.days_in_trade}</td>
      <td class="px-3 py-2 text-center whitespace-nowrap">
        <button onclick='editTrade(${JSON.stringify(t.id)})' title="Edit" class="text-gray-400 hover:text-indigo-600"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487a2.1 2.1 0 1 1 2.97 2.97L7.5 19.79l-4 1 1-4L16.862 4.487z"/></svg></button>
        <button onclick='openCloseModal(${JSON.stringify(t.id)})' title="Close" class="ml-1.5 text-gray-400 hover:text-orange-600"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-3-3v6m-7.5 3a2.25 2.25 0 0 1-2.25-2.25V6.75A2.25 2.25 0 0 1 4.5 4.5h15a2.25 2.25 0 0 1 2.25 2.25v10.5A2.25 2.25 0 0 1 19.5 19.5H12l-4.5 3v-3H4.5z"/><line x1="7" y1="12" x2="17" y2="12"/></svg></button>
        <button onclick='deleteTrade(${JSON.stringify(t.id)})' title="Delete" class="ml-1.5 text-gray-400 hover:text-red-600"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg></button>
      </td>
    </tr>
  `).join("");
}

function renderClosedTrades(trades) {
    const tbody = $("#closed-trades-body");
    const emptyMsg = $("#closed-empty-msg");

    if (trades.length === 0) {
        tbody.innerHTML = "";
        emptyMsg.classList.remove("hidden");
        return;
    }

    emptyMsg.classList.add("hidden");
    tbody.innerHTML = trades.map(t => `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2 font-medium"><a href="/symbol/${encodeURIComponent(t.symbol)}" class="text-indigo-600 hover:underline">${t.symbol}</a></td>
      <td class="px-3 py-2">
        <a href="/trade/${t.id}" class="inline-block px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80
          ${t.strategy_type === 'CSP' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}">
          ${t.strategy_type}
        </a>
      </td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.strike)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.expiry_date}</td>
      <td class="px-3 py-2 text-right">${t.contracts}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.total_premium)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.premium_per_share)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.break_even)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.opened_at}</td>
      <td class="px-3 py-2 whitespace-nowrap">${t.closed_at || "—"}</td>
      <td class="px-3 py-2 text-right">${t.days_in_trade}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.closing_cost)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(t.closing_spot)}</td>
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
        <button onclick='editTrade(${JSON.stringify(t.id)})' title="Edit" class="text-gray-400 hover:text-indigo-600"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487a2.1 2.1 0 1 1 2.97 2.97L7.5 19.79l-4 1 1-4L16.862 4.487z"/></svg></button>
        <button onclick='deleteTrade(${JSON.stringify(t.id)})' title="Delete" class="ml-1.5 text-gray-400 hover:text-red-600"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg></button>
      </td>
    </tr>
  `).join("");
}

function switchTradeView(view) {
    tradeView = view;
    $$(".trade-view-btn").forEach(b => {
        const active = b.dataset.view === view;
        b.classList.toggle("bg-indigo-600", active);
        b.classList.toggle("text-white", active);
        b.classList.toggle("bg-white", !active);
        b.classList.toggle("text-gray-700", !active);
        b.classList.toggle("border", !active);
    });
    $("#view-open").classList.toggle("hidden", view !== "open");
    $("#view-closed").classList.toggle("hidden", view !== "closed");
    // Show status filter only for closed view
    $("#filter-status-wrap").classList.toggle("hidden", view !== "closed");
    renderTrades();
    if (view === "open") {
        loadPrices();
        loadOptionPrices();
    }
}

async function loadTrades() {
    try {
        const res = await fetch("/api/trades");
        allTrades = await res.json();
        populateSpotFilter(allTrades);
        renderTrades();
    } catch (e) {
        console.error("loadTrades failed:", e);
    }
}

function editTrade(id) {
    const trade = allTrades.find(t => t.id === id);
    if (trade) openModal(trade);
}

async function deleteTrade(id) {
    if (!confirm("Delete this trade and all its events / linked lots? This cannot be undone.")) return;
    try {
        const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
        if (res.ok) {
            await loadTrades();
        } else {
            const err = await res.json();
            alert("Error: " + JSON.stringify(err.detail || err));
        }
    } catch (e) {
        console.error("deleteTrade failed:", e);
    }
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
    if (body.iv_at_open) body.iv_at_open = parseFloat(body.iv_at_open);
    else delete body.iv_at_open;
    // Closing fields (only sent when editing a closed trade)
    if (body.closing_cost) body.closing_cost = parseFloat(body.closing_cost);
    else delete body.closing_cost;
    if (body.closing_spot) body.closing_spot = parseFloat(body.closing_spot);
    else delete body.closing_spot;
    if (!body.closed_at) delete body.closed_at;

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
            loadTrades().then(() => { loadPrices(); loadOptionPrices(); });
        } else {
            res.json().then(err => alert("Error: " + JSON.stringify(err.detail || err)));
        }
    });
}
