let sortCol = null;
let sortAsc = true;

function _getSortValue(t, col) {
    if (col === "dte") return t.dte - t.days_in_trade;
    // Live-data columns (open trades only)
    if (col === "spot_price") return _priceCache[t.symbol] ?? null;
    if (col === "option_mid") { const q = _optionCache[t.id]; return q ? q.mid : null; }
    if (col === "iv") { const q = _optionCache[t.id]; return q ? q.iv : null; }
    if (col === "unrealized_pl") {
        const q = _optionCache[t.id];
        if (!q || q.mid == null) return null;
        return (t.premium_per_share - q.mid) * t.contracts * t.multiplier;
    }
    if (col === "unrealized_pl_pct") {
        const q = _optionCache[t.id];
        if (!q || q.mid == null || !t.total_premium) return null;
        const upl = (t.premium_per_share - q.mid) * t.contracts * t.multiplier;
        return (upl / t.total_premium) * 100;
    }
    return t[col];
}

function applySorting(trades) {
    if (!sortCol) return trades;
    const sorted = [...trades];
    sorted.sort((a, b) => {
        let va = _getSortValue(a, sortCol);
        let vb = _getSortValue(b, sortCol);
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
