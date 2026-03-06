// ---- Share Lots ----

let allLots = [];
let editingLotId = null;

function openLotModal(lot) {
    const form = $("#lot-form");
    form.reset();
    if (lot) {
        editingLotId = lot.id;
        $("#lot-modal-title").textContent = "Edit Shares";
        $("#lot-submit-btn").textContent = "Update Shares";
        form.symbol.value = lot.symbol;
        form.qty.value = lot.qty;
        form.cost_per_share.value = lot.cost_per_share;
        form.acquired_at.value = lot.acquired_at;
        form.source.value = lot.source;
        // Disable symbol for edits
        form.symbol.disabled = true;
    } else {
        editingLotId = null;
        $("#lot-modal-title").textContent = "Add Shares";
        $("#lot-submit-btn").textContent = "Add Shares";
        form.symbol.disabled = false;
    }
    $("#lot-modal").classList.remove("hidden");
}

function closeLotModal() {
    $("#lot-modal").classList.add("hidden");
    editingLotId = null;
    $("#lot-form").symbol.disabled = false;
}

function renderLots() {
    const tbody = $("#lots-body");
    const emptyMsg = $("#lots-empty-msg");

    if (allLots.length === 0) {
        tbody.innerHTML = "";
        emptyMsg.classList.remove("hidden");
        return;
    }

    emptyMsg.classList.add("hidden");
    tbody.innerHTML = allLots.map(lot => {
        const totalCost = lot.cost_per_share * lot.remaining_qty;
        return `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2 font-medium"><a href="/symbol/${encodeURIComponent(lot.symbol)}" class="text-indigo-600 hover:underline">${lot.symbol}</a></td>
      <td class="px-3 py-2 text-right">${lot.qty}</td>
      <td class="px-3 py-2 text-right">${lot.remaining_qty}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(lot.cost_per_share)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(totalCost)}</td>
      <td class="px-3 py-2 text-right" data-lot-price="${lot.symbol}">…</td>
      <td class="px-3 py-2 text-right" data-lot-mktval="${lot.id}">…</td>
      <td class="px-3 py-2 text-right" data-lot-upl="${lot.id}">…</td>
      <td class="px-3 py-2 text-right" data-lot-upl-pct="${lot.id}">…</td>
      <td class="px-3 py-2">${lot.acquired_at}</td>
      <td class="px-3 py-2">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold
          ${lot.source === 'assignment' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}">
          ${lot.source === 'assignment' ? 'Assignment' : 'Purchase'}
        </span>
      </td>
      <td class="px-3 py-2 text-center whitespace-nowrap">
        <button onclick='editLot(${JSON.stringify(lot.id)})' class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit</button>
        <button onclick='deleteLot(${JSON.stringify(lot.id)})' class="ml-2 text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
      </td>
    </tr>
  `;
    }).join("");
}

async function loadLots() {
    const res = await fetch("/api/lots");
    allLots = await res.json();
    renderLots();
    loadLotPrices();
}

async function loadLotPrices() {
    const symbols = [...new Set(allLots.map(l => l.symbol))];
    if (symbols.length === 0) return;
    try {
        const res = await fetch("/api/prices?" + symbols.map(s => "symbols=" + s).join("&"));
        const prices = await res.json();
        // Fill current price cells
        document.querySelectorAll("[data-lot-price]").forEach(cell => {
            const sym = cell.dataset.lotPrice;
            const price = prices[sym];
            cell.textContent = price != null ? fmtMoney(price) : "—";
        });
        // Compute market value + P/L per lot
        allLots.forEach(lot => {
            const price = prices[lot.symbol];
            const mktCell = document.querySelector(`[data-lot-mktval="${lot.id}"]`);
            const uplCell = document.querySelector(`[data-lot-upl="${lot.id}"]`);
            const uplPctCell = document.querySelector(`[data-lot-upl-pct="${lot.id}"]`);
            if (!mktCell) return;
            if (price == null || lot.remaining_qty === 0) {
                mktCell.textContent = "—";
                uplCell.textContent = "—";
                uplPctCell.textContent = "—";
                return;
            }
            const totalCost = lot.cost_per_share * lot.remaining_qty;
            const mktVal = price * lot.remaining_qty;
            const upl = mktVal - totalCost;
            const uplPct = totalCost > 0 ? (upl / totalCost) * 100 : 0;

            mktCell.textContent = fmtMoney(mktVal);
            uplCell.textContent = fmtMoney(upl);
            uplCell.classList.remove("text-green-600", "text-red-600");
            uplCell.classList.add(upl >= 0 ? "text-green-600" : "text-red-600");
            uplPctCell.textContent = fmt(uplPct) + "%";
            uplPctCell.classList.remove("text-green-600", "text-red-600");
            uplPctCell.classList.add(uplPct >= 0 ? "text-green-600" : "text-red-600");
        });
    } catch {
        document.querySelectorAll("[data-lot-price]").forEach(c => c.textContent = "—");
        document.querySelectorAll("[data-lot-mktval]").forEach(c => c.textContent = "—");
        document.querySelectorAll("[data-lot-upl]").forEach(c => c.textContent = "—");
        document.querySelectorAll("[data-lot-upl-pct]").forEach(c => c.textContent = "—");
    }
}

function editLot(id) {
    const lot = allLots.find(l => l.id === id);
    if (lot) openLotModal(lot);
}

async function deleteLot(id) {
    if (!confirm("Delete this share lot?")) return;
    const res = await fetch(`/api/lots/${id}`, { method: "DELETE" });
    if (res.ok) loadLots();
    else alert("Failed to delete lot");
}

function handleLotFormSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());

    body.qty = parseInt(body.qty, 10);
    body.cost_per_share = parseFloat(body.cost_per_share);

    const url = editingLotId ? `/api/lots/${editingLotId}` : "/api/lots";
    const method = editingLotId ? "PATCH" : "POST";

    fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }).then(res => {
        if (res.ok) {
            closeLotModal();
            e.target.reset();
            loadLots();
        } else {
            res.json().then(err => alert("Error: " + JSON.stringify(err.detail || err)));
        }
    });
}
