// ---- Pairings sub-view ----
let _pairingsLoaded = false;

async function initPairingsView() {
    if (_pairingsLoaded) return;
    _pairingsLoaded = true;

    const container = document.getElementById("pairings-container");
    container.innerHTML = `<div class="text-gray-400 dark:text-gray-500 text-sm py-4">Loading pairings…</div>`;

    try {
        const data = await fetch("/api/pairings/grouped").then(r => r.json());
        renderPairingsView(data);
    } catch (e) {
        console.error("initPairingsView failed:", e);
        container.innerHTML = `<div class="text-red-500 text-sm py-4">Failed to load pairings.</div>`;
    }
}

function renderPairingsView(data) {
    const container = document.getElementById("pairings-container");

    // Group by group name
    const byGroup = {};
    for (const ac of data) {
        const g = ac.group || "Other";
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(ac);
    }

    const groupOrder = [
        "US Equity", "International Equity", "Single Country",
        "Thematic/Sector", "Fixed Income", "Commodities",
        "Real Assets", "Digital Assets"
    ];
    const sortedGroups = groupOrder.filter(g => byGroup[g]);
    for (const g of Object.keys(byGroup)) {
        if (!sortedGroups.includes(g)) sortedGroups.push(g);
    }

    let html = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/50 px-4 py-3 flex items-center justify-between mb-4">
            <span class="text-sm text-gray-500 dark:text-gray-400">${data.length} asset classes configured</span>
            <button id="pairings-reset-btn" class="text-xs px-3 py-1.5 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 font-medium">
                Reset Pairings from Seed
            </button>
        </div>`;

    for (const groupName of sortedGroups) {
        const acs = byGroup[groupName];
        html += `<div class="mb-6">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 px-1">${groupName}</h3>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/50 overflow-hidden">
                <table class="min-w-full text-sm">
                    <thead>
                        <tr class="bg-gray-50 dark:bg-gray-700 text-left text-xs text-gray-600 dark:text-gray-400 uppercase">
                            <th class="px-3 py-2 w-48">Asset Class</th>
                            <th class="px-3 py-2">Core</th>
                            <th class="px-3 py-2">Proxy</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">`;

        for (const ac of acs) {
            const coreSymbols = ac.core.map(e => symbolPill(e, "core")).join(" ");
            const proxySymbols = ac.proxy.map(e => symbolPill(e, "proxy")).join(" ");
            html += `
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td class="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">${ac.asset_class}</td>
                            <td class="px-3 py-2">${coreSymbols || '<span class="text-gray-400">—</span>'}</td>
                            <td class="px-3 py-2">${proxySymbols || '<span class="text-gray-400">—</span>'}</td>
                        </tr>`;
        }

        html += `</tbody></table></div></div>`;
    }

    container.innerHTML = html;

    // Wire reset button
    document.getElementById("pairings-reset-btn").addEventListener("click", async () => {
        const btn = document.getElementById("pairings-reset-btn");
        btn.disabled = true;
        btn.textContent = "Resetting…";
        try {
            const res = await fetch("/api/pairings/reset", { method: "POST" });
            const d = await res.json();
            btn.textContent = `Done — ${d.seeded} pairings loaded`;
            btn.classList.replace("bg-red-50", "bg-green-50");
            btn.classList.replace("dark:bg-red-900/30", "dark:bg-green-900/30");
            btn.classList.replace("text-red-600", "text-green-600");
            btn.classList.replace("dark:text-red-400", "dark:text-green-400");
            // Refresh both pairings and allocations views
            _pairingsLoaded = false;
            _allocLoaded = false;
            setTimeout(() => initPairingsView(), 800);
        } catch {
            btn.textContent = "Reset failed";
        }
    });
}

function symbolPill(entry, role) {
    const note = entry.note ? ` title="${entry.note.replace(/"/g, '&quot;')}"` : "";
    if (role === "core") {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 mr-1 mb-1 cursor-default"${note}>${entry.symbol}</span>`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 mr-1 mb-1 cursor-default"${note}>${entry.symbol}</span>`;
}
