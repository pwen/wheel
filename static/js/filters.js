function getFilters() {
    return {
        spot: $("#filter-spot").value,
        type: $("#filter-type").value,
        status: $("#filter-status").value,
    };
}

function applyFilters(trades) {
    const f = getFilters();
    return trades.filter(t =>
        (!f.spot || t.symbol === f.spot) &&
        (!f.type || t.strategy_type === f.type) &&
        (!f.status || t.status === f.status)
    );
}

function populateSpotFilter(allTrades) {
    const select = $("#filter-spot");
    const current = select.value;
    const symbols = [...new Set(allTrades.map(t => t.symbol))].sort();
    select.innerHTML = '<option value="">All</option>' +
        symbols.map(s => `<option value="${s}">${s}</option>`).join("");
    select.value = current;
}
