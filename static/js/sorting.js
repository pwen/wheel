let sortCol = null;
let sortAsc = true;

function applySorting(trades) {
    if (!sortCol) return trades;
    const sorted = [...trades];
    sorted.sort((a, b) => {
        let va, vb;
        if (sortCol === "dte") {
            va = a.dte - a.days_in_trade;
            vb = b.dte - b.days_in_trade;
        } else {
            va = a[sortCol];
            vb = b[sortCol];
        }
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        let cmp;
        if (typeof va === "string") cmp = va.localeCompare(vb);
        else cmp = va - vb;
        if (cmp !== 0) return sortAsc ? cmp : -cmp;
        // Secondary sort: symbol ascending
        const sa = (a.symbol || "").localeCompare(b.symbol || "");
        return sa;
    });
    return sorted;
}

function updateSortArrows() {
    $$("th[data-sort]").forEach(th => {
        const arrow = th.querySelector(".sort-arrow");
        if (!arrow) return;
        if (th.dataset.sort === sortCol) {
            arrow.textContent = sortAsc ? " ▲" : " ▼";
            arrow.classList.remove("text-gray-400");
            arrow.classList.add("text-indigo-600");
        } else {
            arrow.textContent = " ⇅";
            arrow.classList.remove("text-indigo-600");
            arrow.classList.add("text-gray-400");
        }
    });
}
