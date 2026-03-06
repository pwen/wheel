let sortCol = null;
let sortAsc = true;

function applySorting(trades) {
    if (!sortCol) return trades;
    const sorted = [...trades];
    sorted.sort((a, b) => {
        let va = a[sortCol], vb = b[sortCol];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === "string") return va.localeCompare(vb);
        return va - vb;
    });
    if (!sortAsc) sorted.reverse();
    return sorted;
}

function updateSortArrows() {
    $$("th[data-sort]").forEach(th => {
        const arrow = th.querySelector(".sort-arrow");
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
