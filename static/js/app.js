// ---- Wire up event listeners & init ----

// Tabs
$$(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        // Toggle tab button styles
        $$(".tab-btn").forEach(b => {
            const active = b.dataset.tab === tab;
            b.classList.toggle("border-indigo-600", active);
            b.classList.toggle("text-indigo-600", active);
            b.classList.toggle("border-transparent", !active);
            b.classList.toggle("text-gray-500", !active);
        });
        // Toggle tab panels
        $("#tab-trades").classList.toggle("hidden", tab !== "trades");
        $("#tab-holdings").classList.toggle("hidden", tab !== "holdings");
        // Toggle header buttons
        $("#btn-new-trade").classList.toggle("hidden", tab !== "trades");
        $("#btn-add-shares").classList.toggle("hidden", tab !== "holdings");
    });
});

// Sort headers
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
    });
});

// Show default sort icons on load
updateSortArrows();

// Filters
["#filter-spot", "#filter-type", "#filter-status"].forEach(sel => {
    $(sel).addEventListener("change", () => renderTrades());
});

// Trade form (new / edit)
$("#trade-form").addEventListener("submit", handleTradeFormSubmit);

// Close forms
$("#close-form").addEventListener("submit", handleCloseTrade);
$("#assign-form").addEventListener("submit", handleAssignTrade);
$("#roll-form").addEventListener("submit", handleRollTrade);

// Lot form
$("#lot-form").addEventListener("submit", handleLotFormSubmit);

// Load data
loadTrades().then(loadPrices);
loadLots();

