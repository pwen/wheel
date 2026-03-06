// ---- Wire up event listeners & init ----

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

// Load data
loadTrades().then(loadPrices);

