// ---- Spots tab ----
let _spotsLoaded = false;
let _spotsData = [];        // merged spot + lots + prices
let _spotsSortCol = "symbol";
let _spotsSortAsc = true;

async function initSpots() {
    if (_spotsLoaded) return;
    _spotsLoaded = true;

    try {
        const [spots, lots, pricesRes] = await Promise.all([
            fetch("/api/spots").then(r => r.json()),
            fetch("/api/lots").then(r => r.json()),
            Promise.resolve(null), // prices fetched after we know symbols
        ]);

        // Aggregate shares per symbol from lots
        const sharesBySymbol = {};
        const costBySymbol = {};
        for (const lot of lots) {
            const sym = lot.symbol;
            const qty = lot.remaining_qty ?? lot.qty;
            sharesBySymbol[sym] = (sharesBySymbol[sym] || 0) + qty;
            costBySymbol[sym] = (costBySymbol[sym] || 0) + qty * Number(lot.cost_per_share);
        }

        // Fetch live prices for all spot symbols
        const allSymbols = spots.map(s => s.symbol);
        let priceMap = {};
        if (allSymbols.length > 0) {
            try {
                const pRes = await fetch(`/api/prices?symbols=${allSymbols.join(",")}`);
                const pData = await pRes.json();
                priceMap = pData.prices || pData;
            } catch { /* ignore price errors */ }
        }

        // Merge: spot metadata + shares + market value
        _spotsData = spots.map(s => {
            const shares = sharesBySymbol[s.symbol] || 0;
            const price = priceMap[s.symbol] || null;
            const marketValue = shares > 0 && price ? shares * price : null;
            return {
                ...s,
                shares,
                cost_basis: costBySymbol[s.symbol] || 0,
                price,
                market_value: marketValue,
            };
        });

        renderSpots();
        wireSpotsSorting();
        wireSpotsSearch();
    } catch (e) {
        console.error("initSpots failed:", e);
        $("#spots-body").innerHTML = `<tr><td colspan="10" class="px-3 py-4 text-red-500 text-sm">Failed to load spots.</td></tr>`;
    }
}

function renderSpots() {
    const tbody = $("#spots-body");
    const filter = ($("#spots-search").value || "").toLowerCase();

    let rows = _spotsData;
    if (filter) {
        rows = rows.filter(s =>
            s.symbol.toLowerCase().includes(filter) ||
            (s.name || "").toLowerCase().includes(filter)
        );
    }

    // Sort
    rows = [...rows].sort((a, b) => {
        let va = a[_spotsSortCol], vb = b[_spotsSortCol];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
        if (va < vb) return _spotsSortAsc ? -1 : 1;
        if (va > vb) return _spotsSortAsc ? 1 : -1;
        return 0;
    });

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="px-3 py-4 text-gray-400 dark:text-gray-500 text-sm">No spots found.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(s => {
        const typeBadge = s.asset_type === "etf"
            ? `<span class="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">ETF</span>`
            : s.asset_type === "stock"
                ? `<span class="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">Stock</span>`
                : `<span class="text-gray-400">—</span>`;

        return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors" data-symbol="${s.symbol}">
      <td class="px-3 py-2 font-semibold text-indigo-600 dark:text-indigo-400">${s.symbol}</td>
      <td class="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">${s.name || "—"}</td>
      <td class="px-3 py-2">${typeBadge}</td>
      <td class="px-3 py-2 text-gray-600 dark:text-gray-400">${s.sector || "—"}</td>
      <td class="px-3 py-2 text-right">${s.pe_ratio != null ? fmt(s.pe_ratio, 1) : "—"}</td>
      <td class="px-3 py-2 text-right">${s.beta != null ? fmt(s.beta, 2) : "—"}</td>
      <td class="px-3 py-2 text-right">${s.expense_ratio != null ? fmt(s.expense_ratio * 100, 2) + "%" : "—"}</td>
      <td class="px-3 py-2 text-right">${s.price != null ? fmtMoney(s.price) : "—"}</td>
      <td class="px-3 py-2 text-right">${s.shares > 0 ? s.shares : "—"}</td>
      <td class="px-3 py-2 text-right">${s.market_value != null ? fmtMoney(s.market_value) : "—"}</td>
    </tr>`;
    }).join("");

    // Row click → symbol detail
    tbody.querySelectorAll("tr[data-symbol]").forEach(tr => {
        tr.addEventListener("click", () => {
            window.location.href = `/symbol/${tr.dataset.symbol}`;
        });
    });
}

function wireSpotsSorting() {
    $$("#spots-table thead th[data-spot-sort]").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.spotSort;
            if (_spotsSortCol === col) {
                _spotsSortAsc = !_spotsSortAsc;
            } else {
                _spotsSortCol = col;
                _spotsSortAsc = true;
            }
            // Update header indicators
            $$("#spots-table thead th[data-spot-sort]").forEach(h => {
                h.textContent = h.textContent.replace(/ [▲▼]$/, "");
            });
            th.textContent += _spotsSortAsc ? " ▲" : " ▼";
            renderSpots();
        });
    });
}

function wireSpotsSearch() {
    const input = $("#spots-search");
    if (!input) return;
    input.addEventListener("input", () => renderSpots());
}
