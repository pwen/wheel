const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmt = (v, decimals = 2) => v != null ? Number(v).toFixed(decimals) : "—";
const fmtMoney = (v) => v != null ? "$" + Number(v).toFixed(2) : "—";

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
        form.opened_at.value = trade.opened_at;
        // Show closing fields only for closed trades
        if (trade.status !== "open") {
            closeFields.classList.remove("hidden");
            form.closed_at.value = trade.closed_at || "";
            form.status.value = trade.status;
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
}
function closeModal() { $("#modal").classList.add("hidden"); editingTradeId = null; }
