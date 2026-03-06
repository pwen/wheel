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

            // Conditional color: is the option ITM (danger) or OTM (safe)?
            cell.classList.remove("text-green-600", "text-red-600");
            if (price != null && cell.dataset.strike) {
                const strike = parseFloat(cell.dataset.strike);
                const type = cell.dataset.type;
                const itm = type === "CSP" ? price < strike : price > strike;
                cell.classList.add(itm ? "text-red-600" : "text-green-600");
            }
        });
    } catch {
        cells.forEach(cell => cell.textContent = "—");
    }
}
