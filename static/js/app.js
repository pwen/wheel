// ---- Wire up event listeners & init ----

// URL state management
function updateURL() {
    const params = new URLSearchParams();
    // Tab
    const activeTab = document.querySelector(".tab-btn.text-indigo-600");
    if (activeTab) params.set("tab", activeTab.dataset.tab);
    // Trade view (open / closed)
    params.set("view", tradeView);
    // Filters
    const spot = $("#filter-spot").value;
    const type = $("#filter-type").value;
    const status = $("#filter-status").value;
    if (spot) params.set("spot", spot);
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    // Sort
    if (sortCol) {
        params.set("sort", sortCol);
        params.set("dir", sortAsc ? "asc" : "desc");
    }
    history.replaceState(null, "", "?" + params.toString());
}

function restoreFromURL() {
    const p = new URLSearchParams(location.search);
    // Tab
    switchTab(p.get("tab") || "trades");
    // Trade view
    switchTradeView(p.get("view") || "open");
    // Filters (spot filter is populated after trades load, so set it later)
    if (p.get("type")) $("#filter-type").value = p.get("type");
    if (p.get("status")) $("#filter-status").value = p.get("status");
    // Sort
    if (p.get("sort")) {
        sortCol = p.get("sort");
        sortAsc = p.get("dir") !== "desc";
    }
}

// Tabs
function switchTab(tab) {
    $$(".tab-btn").forEach(b => {
        const active = b.dataset.tab === tab;
        b.classList.toggle("border-indigo-600", active);
        b.classList.toggle("text-indigo-600", active);
        b.classList.toggle("border-transparent", !active);
        b.classList.toggle("text-gray-500", !active);
    });
    $("#tab-trades").classList.toggle("hidden", tab !== "trades");
    $("#tab-holdings").classList.toggle("hidden", tab !== "holdings");
    $("#btn-new-trade").classList.toggle("hidden", tab !== "trades");
    $("#btn-add-shares").classList.toggle("hidden", tab !== "holdings");
}

$$(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        switchTab(btn.dataset.tab);
        updateURL();
    });
});

// Trade view sub-tabs (open / closed)
$$(".trade-view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        switchTradeView(btn.dataset.view);
        updateURL();
    });
});

// Sort headers — bind on both tables
$$("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
        const col = th.dataset.sort;
        if (sortCol === col) {
            sortAsc = !sortAsc;
        } else {
            sortCol = col;
            sortAsc = true;
        }
        renderTrades();
        updateURL();
    });
});

// Filters
["#filter-spot", "#filter-type", "#filter-status"].forEach(sel => {
    $(sel).addEventListener("change", () => {
        renderTrades();
        updateURL();
    });
});

// Restore state before loading data
restoreFromURL();
updateSortArrows();

// Trade form (new / edit)
$("#trade-form").addEventListener("submit", handleTradeFormSubmit);

// Close forms
$("#close-form").addEventListener("submit", handleCloseTrade);
$("#assign-form").addEventListener("submit", handleAssignTrade);
$("#roll-form").addEventListener("submit", handleRollTrade);

// Lot form
$("#lot-form").addEventListener("submit", handleLotFormSubmit);

// Load data — restore spot filter after trades populate the dropdown
loadTrades().then(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("spot")) $("#filter-spot").value = p.get("spot");
    renderTrades();
    loadPrices();
    loadOptionPrices();
});
loadLots();

