const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmt = (v, decimals = 2) => v != null ? Number(v).toFixed(decimals) : "—";
const fmtMoney = (v) => {
    if (v == null) return "—";
    const n = Number(v);
    const abs = Math.abs(n);
    const formatted = abs >= 1000
        ? abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? "-$" : "$") + formatted;
};

let editingTradeId = null;

function openModal(trade) {
    const form = $("#trade-form");
    form.reset();
    const closeFields = $("#close-fields");
    if (trade) {
        editingTradeId = trade.id;
        $("#modal-title").textContent = "Edit Trade";
        $("#modal-submit-btn").textContent = "Update Trade";
        form.symbol.value = trade.symbol;
        form.strategy_type.value = trade.strategy_type;
        form.strike.value = trade.strike;
        form.expiry_date.value = trade.expiry_date;
        form.contracts.value = trade.contracts;
        form.total_premium.value = trade.total_premium;
        form.spot_price_at_open.value = trade.spot_price_at_open || "";
        form.iv_at_open.value = trade.iv_at_open != null ? trade.iv_at_open : "";
        form.opened_at.value = trade.opened_at;
        // Show closing fields only for closed trades
        if (trade.status !== "open") {
            closeFields.classList.remove("hidden");
            form.closed_at.value = trade.closed_at || "";
            $("#edit-status-display").textContent = statusLabel(trade.status);
            form.closing_cost.value = trade.closing_cost != null ? trade.closing_cost : "";
            form.closing_spot.value = trade.closing_spot != null ? trade.closing_spot : "";
        } else {
            closeFields.classList.add("hidden");
        }
    } else {
        editingTradeId = null;
        $("#modal-title").textContent = "New Trade";
        $("#modal-submit-btn").textContent = "Save Trade";
        closeFields.classList.add("hidden");
    }
    $("#modal").classList.remove("hidden");
    // Auto-fetch IV if editing and iv_at_open is empty
    if (trade && !trade.iv_at_open) fetchIVAtOpen();
}
function closeModal() { $("#modal").classList.add("hidden"); editingTradeId = null; }

// Auto-fetch spot price when symbol + opened_at are filled (new trade only)
let _spotPriceController = null;
async function fetchSpotPrice() {
    if (editingTradeId) return; // skip for edits
    const form = $("#trade-form");
    const symbol = form.symbol.value.trim();
    const openedAt = form.opened_at.value;
    if (!symbol || !openedAt) return;

    // Abort any in-flight request
    if (_spotPriceController) _spotPriceController.abort();
    _spotPriceController = new AbortController();

    const input = form.spot_price_at_open;
    const spinner = $("#spot-price-spinner");
    spinner.classList.remove("hidden");
    input.placeholder = "Fetching…";
    try {
        const res = await fetch(`/api/spot-price?symbol=${encodeURIComponent(symbol)}&on_date=${openedAt}`, {
            signal: _spotPriceController.signal,
        });
        const data = await res.json();
        if (data.price != null && !input.value) {
            input.value = data.price;
        }
        input.placeholder = "Auto-fills from market data";
        spinner.classList.add("hidden");
    } catch (e) {
        if (e.name !== "AbortError") {
            input.placeholder = "Auto-fills from market data";
            spinner.classList.add("hidden");
        }
    }
}

// Auto-fetch IV at open when symbol + expiry + strike + strategy_type are filled
let _ivController = null;
async function fetchIVAtOpen() {
    const form = $("#trade-form");
    const symbol = form.symbol.value.trim();
    const expiry = form.expiry_date.value;
    const strike = form.strike.value;
    const strategyType = form.strategy_type.value;
    if (!symbol || !expiry || !strike || !strategyType) return;

    if (_ivController) _ivController.abort();
    _ivController = new AbortController();

    const input = form.iv_at_open;
    const spinner = $("#iv-at-open-spinner");
    spinner.classList.remove("hidden");
    input.placeholder = "Fetching…";
    try {
        const res = await fetch(
            `/api/option-iv?symbol=${encodeURIComponent(symbol)}&expiry_date=${expiry}&strike=${strike}&strategy_type=${strategyType}`,
            { signal: _ivController.signal }
        );
        const data = await res.json();
        if (data.iv != null && !input.value) {
            input.value = data.iv;
        }
        input.placeholder = "Auto-fills when fields set";
        spinner.classList.add("hidden");
    } catch (e) {
        if (e.name !== "AbortError") {
            input.placeholder = "Auto-fills when fields set";
            spinner.classList.add("hidden");
        }
    }
}

(function () {
    const form = $("#trade-form");
    form.symbol.addEventListener("change", fetchSpotPrice);
    form.opened_at.addEventListener("change", fetchSpotPrice);
    // IV auto-fetch triggers
    form.symbol.addEventListener("change", fetchIVAtOpen);
    form.expiry_date.addEventListener("change", fetchIVAtOpen);
    form.strike.addEventListener("change", fetchIVAtOpen);
    form.strategy_type.addEventListener("change", fetchIVAtOpen);
})();
