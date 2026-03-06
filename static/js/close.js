// ---- Close / Assign / Roll Trade ----

let closingTradeId = null;
let closeAction = null;

const STATUS_CONFIG = {
    open:     { label: "Open",     cls: "bg-yellow-100 text-yellow-700" },
    expired:  { label: "Expired",  cls: "bg-gray-200 text-gray-600" },
    btc:      { label: "BTC",      cls: "bg-blue-100 text-blue-700" },
    assigned: { label: "Assigned", cls: "bg-orange-100 text-orange-700" },
    rolled:   { label: "Rolled",   cls: "bg-purple-100 text-purple-700" },
};

function statusBadge(s) { return (STATUS_CONFIG[s] || STATUS_CONFIG.open).cls; }
function statusLabel(s) { return (STATUS_CONFIG[s] || STATUS_CONFIG.open).label; }

function openCloseModal(tradeId) {
    closingTradeId = tradeId;
    closeAction = null;
    // Reset all forms/buttons
    document.querySelectorAll(".close-action-btn").forEach(b => {
        b.classList.remove("bg-indigo-600", "text-white", "bg-orange-600", "bg-purple-600");
        b.classList.add("bg-white", "text-gray-700");
    });
    $("#close-form").classList.add("hidden");
    $("#assign-form").classList.add("hidden");
    $("#roll-form").classList.add("hidden");
    $("#close-form").reset();
    $("#assign-form").reset();
    $("#roll-form").reset();

    // Pre-fill today's date
    const today = new Date().toISOString().slice(0, 10);
    $("#close-form").querySelector("[name=closed_at]").value = today;
    $("#assign-form").querySelector("[name=assigned_at]").value = today;
    $("#roll-form").querySelector("[name=roll_date]").value = today;

    $("#close-modal-title").textContent = "Close Trade";
    $("#close-modal").classList.remove("hidden");
}

function closeCloseModal() {
    $("#close-modal").classList.add("hidden");
    closingTradeId = null;
    closeAction = null;
}

function setCloseAction(action) {
    closeAction = action;
    // Highlight active button
    document.querySelectorAll(".close-action-btn").forEach(b => {
        const isActive = b.dataset.action === action;
        b.classList.toggle("bg-indigo-600", isActive && (action === "expired" || action === "btc"));
        b.classList.toggle("bg-orange-600", isActive && action === "assigned");
        b.classList.toggle("bg-purple-600", isActive && action === "rolled");
        b.classList.toggle("text-white", isActive);
        b.classList.toggle("bg-white", !isActive);
        b.classList.toggle("text-gray-700", !isActive);
    });

    // Show the right form
    $("#close-form").classList.toggle("hidden", action !== "expired" && action !== "btc");
    $("#assign-form").classList.toggle("hidden", action !== "assigned");
    $("#roll-form").classList.toggle("hidden", action !== "rolled");

    // Adjust close form for expired vs BTC
    if (action === "expired") {
        $("#close-cost-field").classList.add("hidden");
        $("#close-form").querySelector("[name=closing_cost]").value = "0";
        $("#close-submit-btn").textContent = "Mark Expired";
    } else if (action === "btc") {
        $("#close-cost-field").classList.remove("hidden");
        $("#close-form").querySelector("[name=closing_cost]").value = "";
        $("#close-submit-btn").textContent = "Buy to Close";
    }

    // Update title
    const titles = { expired: "Expire Trade", btc: "Buy to Close", assigned: "Record Assignment", rolled: "Roll Trade" };
    $("#close-modal-title").textContent = titles[action] || "Close Trade";
}

async function handleCloseTrade(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.status = closeAction === "expired" ? "expired" : "btc";
    body.closing_cost = parseFloat(body.closing_cost) || 0;
    if (body.closing_spot) body.closing_spot = parseFloat(body.closing_spot);
    else delete body.closing_spot;

    const res = await fetch(`/api/trades/${closingTradeId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (res.ok) {
        closeCloseModal();
        loadTrades().then(loadPrices);
    } else {
        const err = await res.json();
        alert("Error: " + JSON.stringify(err.detail || err));
    }
}

async function handleAssignTrade(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    if (body.closing_spot) body.closing_spot = parseFloat(body.closing_spot);
    else delete body.closing_spot;

    const res = await fetch(`/api/trades/${closingTradeId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (res.ok) {
        closeCloseModal();
        loadTrades().then(loadPrices);
    } else {
        const err = await res.json();
        alert("Error: " + JSON.stringify(err.detail || err));
    }
}

async function handleRollTrade(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.closing_cost = parseFloat(body.closing_cost);
    body.new_strike = parseFloat(body.new_strike);
    body.new_total_premium = parseFloat(body.new_total_premium);
    if (body.closing_spot) body.closing_spot = parseFloat(body.closing_spot);
    else delete body.closing_spot;
    if (body.new_contracts) body.new_contracts = parseInt(body.new_contracts, 10);
    else delete body.new_contracts;

    const res = await fetch(`/api/trades/${closingTradeId}/roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (res.ok) {
        closeCloseModal();
        loadTrades().then(loadPrices);
    } else {
        const err = await res.json();
        alert("Error: " + JSON.stringify(err.detail || err));
    }
}
