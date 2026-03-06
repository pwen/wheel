async function loadPrices() {
    const cells = document.querySelectorAll("[data-price-sym]");
    const symbols = [...new Set([...cells].map(c => c.dataset.priceSym))];
    if (symbols.length === 0) return;

    try {
        const res = await fetch("/api/prices?" + symbols.map(s => "symbols=" + s).join("&"));
        const prices = await res.json();
        cells.forEach(cell => {
            const sym = cell.dataset.priceSym;
            const price = prices[sym];
            cell.textContent = price != null ? fmtMoney(price) : "—";
        });
    } catch {
        cells.forEach(cell => cell.textContent = "—");
    }
}
