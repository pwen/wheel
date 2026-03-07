let _priceCache = {};   // symbol -> price
let _optionCache = {};  // trade_id -> {mid, iv}

function applyPrices() {
    document.querySelectorAll("[data-price-sym]").forEach(cell => {
        const sym = cell.dataset.priceSym;
        const price = _priceCache[sym];
        cell.textContent = price != null ? fmtMoney(price) : "…";
        cell.classList.remove("text-green-600", "text-red-600");
        if (price != null && cell.dataset.strike) {
            const strike = parseFloat(cell.dataset.strike);
            const type = cell.dataset.type;
            const itm = type === "CSP" ? price < strike : price > strike;
            cell.classList.add(itm ? "text-red-600" : "text-green-600");
        }
    });
}

function applyOptionPrices() {
    allTrades.forEach(t => {
        const midCell = document.querySelector(`[data-opt-mid="${t.id}"]`);
        const uplCell = document.querySelector(`[data-opt-upl="${t.id}"]`);
        const uplPctCell = document.querySelector(`[data-opt-upl-pct="${t.id}"]`);
        const ivCell = document.querySelector(`[data-opt-iv="${t.id}"]`);
        if (!midCell) return;

        const quote = _optionCache[t.id];
        if (t.status !== "open" || !quote) {
            midCell.textContent = "—";
            uplCell.textContent = "—";
            uplPctCell.textContent = "—";
            ivCell.textContent = "—";
            return;
        }

        const mid = quote.mid;
        const iv = quote.iv;
        midCell.textContent = mid != null ? fmtMoney(mid) : "—";
        ivCell.textContent = iv != null ? fmt(iv) + "%" : "—";

        if (mid != null) {
            const upl = (t.premium_per_share - mid) * t.contracts * t.multiplier;
            const uplPct = t.total_premium > 0 ? (upl / t.total_premium) * 100 : 0;
            uplCell.textContent = fmtMoney(upl);
            uplCell.classList.remove("text-green-600", "text-red-600");
            uplCell.classList.add(upl >= 0 ? "text-green-600" : "text-red-600");
            uplPctCell.innerHTML = fmt(uplPct) + "%" + (uplPct >= 50 ? ' <span title="50%+ profit — consider BTC and redeploy">💰</span>' : '');
            uplPctCell.classList.remove("text-green-600", "text-red-600");
            uplPctCell.classList.add(uplPct >= 0 ? "text-green-600" : "text-red-600");
        } else {
            uplCell.textContent = "—";
            uplPctCell.textContent = "—";
        }
    });
}

async function loadPrices() {
    const cells = document.querySelectorAll("[data-price-sym]");
    const symbols = [...new Set([...cells].map(c => c.dataset.priceSym))];
    if (symbols.length === 0) return;

    try {
        const res = await fetch("/api/prices?" + symbols.map(s => "symbols=" + s).join("&"));
        _priceCache = await res.json();
        applyPrices();
    } catch {
        cells.forEach(cell => cell.textContent = "—");
    }
}

async function loadOptionPrices() {
    const openTrades = allTrades.filter(t => t.status === "open");
    if (openTrades.length === 0) {
        applyOptionPrices();
        return;
    }

    const contracts = openTrades.map(t => ({
        trade_id: t.id,
        symbol: t.symbol,
        expiry_date: t.expiry_date,
        strike: t.strike,
        strategy_type: t.strategy_type,
    }));

    try {
        const res = await fetch("/api/option-prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(contracts),
        });
        _optionCache = await res.json();
        applyOptionPrices();
    } catch {
        document.querySelectorAll("[data-opt-mid]").forEach(c => c.textContent = "—");
    }
}
