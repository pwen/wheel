// ---- Allocations (By Allocation) sub-view ----
let _allocLoaded = false;
let _allocData = null;

async function initAllocations() {
    if (_allocLoaded) return;
    _allocLoaded = true;

    const summaryEl = $("#alloc-summary");
    const groupsEl = $("#alloc-groups");
    groupsEl.innerHTML = `<div class="text-gray-400 dark:text-gray-500 text-sm py-4">Loading allocations…</div>`;

    try {
        const data = await fetch("/api/allocations").then(r => r.json());
        _allocData = data;

        // Gather all symbols to fetch prices
        const allSymbols = new Set();
        for (const ac of data.asset_classes) {
            for (const e of ac.core) if (e.shares > 0) allSymbols.add(e.symbol);
            for (const e of ac.proxy) if (e.shares > 0) allSymbols.add(e.symbol);
        }

        let priceMap = {};
        if (allSymbols.size > 0) {
            try {
                const params = [...allSymbols].map(s => `symbols=${encodeURIComponent(s)}`).join("&");
                const pRes = await fetch(`/api/prices?${params}`);
                const pData = await pRes.json();
                priceMap = pData.prices || pData;
            } catch { /* ignore */ }
        }

        renderAllocations(data, priceMap);
    } catch (e) {
        console.error("initAllocations failed:", e);
        groupsEl.innerHTML = `<div class="text-red-500 text-sm py-4">Failed to load allocations.</div>`;
    }
}

function renderAllocations(data, priceMap) {
    const summaryEl = $("#alloc-summary");
    const groupsEl = $("#alloc-groups");

    // Calculate market values per asset class
    let totalSharesValue = 0;
    let totalCspCommitted = 0;
    const acValues = data.asset_classes.map(ac => {
        let coreValue = 0, proxyValue = 0, cspValue = 0;
        const coreDetails = ac.core.map(e => {
            const price = priceMap[e.symbol] || 0;
            const mv = e.shares * price;
            coreValue += mv;
            return { ...e, price, market_value: mv };
        });
        const proxyDetails = ac.proxy.map(e => {
            const price = priceMap[e.symbol] || 0;
            const mv = e.shares * price;
            proxyValue += mv;
            cspValue += e.csp_committed || 0;
            return { ...e, price, market_value: mv };
        });
        const sharesTotal = coreValue + proxyValue;
        const total = sharesTotal + cspValue;
        totalSharesValue += sharesTotal;
        totalCspCommitted += cspValue;
        return { ...ac, core: coreDetails, proxy: proxyDetails, core_value: coreValue, proxy_value: proxyValue, csp_committed: cspValue, total_value: total };
    });

    const totalWheelValue = totalSharesValue + totalCspCommitted;

    // Summary bar
    summaryEl.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/50 px-4 py-3 flex items-center justify-between">
            <div class="flex items-center gap-4">
                <div>
                    <span class="text-sm text-gray-500 dark:text-gray-400">Total Wheel Capital</span>
                    <span class="ml-2 text-lg font-bold text-gray-900 dark:text-gray-100">${fmtMoney(totalWheelValue)}</span>
                </div>
                <span class="text-gray-300 dark:text-gray-600">|</span>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                    Shares <span class="font-medium text-gray-700 dark:text-gray-300">${fmtMoney(totalSharesValue)}</span>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                    CSP Committed <span class="font-medium text-gray-700 dark:text-gray-300">${fmtMoney(totalCspCommitted)}</span>
                </div>
            </div>
        </div>`;

    // Group by group name for visual sections
    const byGroup = {};
    for (const ac of acValues) {
        const g = ac.group || "Other";
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(ac);
    }

    let html = "";
    for (const [groupName, acs] of Object.entries(byGroup)) {
        html += `<div class="mb-6">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">${esc(groupName)}</h3>`;

        for (const ac of acs) {
            const allEntries = [
                ...ac.core.map(e => ({ ...e, role: "core" })),
                ...ac.proxy.map(e => ({ ...e, role: "proxy" })),
            ];

            const actualPct = totalWheelValue > 0 ? (ac.total_value / totalWheelValue * 100) : 0;
            const coreVal = ac.core_value;
            const proxyVal = ac.proxy_value + ac.csp_committed;
            const corePct = ac.total_value > 0 ? (coreVal / ac.total_value * 100) : 0;
            const proxyPct = ac.total_value > 0 ? (proxyVal / ac.total_value * 100) : 0;

            const splitLabel = `Core ${corePct.toFixed(0)}% / Proxy ${proxyPct.toFixed(0)}%`;

            html += `<div class="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/50 mb-2 overflow-hidden">
                <div class="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 flex items-center justify-between cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <div class="flex items-center gap-3">
                        <span class="font-semibold text-sm text-gray-900 dark:text-gray-100">${esc(ac.asset_class)}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-400">${splitLabel}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-medium text-gray-900 dark:text-gray-100">${fmtMoney(ac.total_value)}</span>
                        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                <div class="hidden">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="text-xs text-gray-500 dark:text-gray-400 uppercase border-b dark:border-gray-700">
                                <th class="px-4 py-1.5 text-left">Symbol</th>
                                <th class="px-4 py-1.5 text-left">Role</th>
                                <th class="px-4 py-1.5 text-right">Price</th>
                                <th class="px-4 py-1.5 text-right">Shares</th>
                                <th class="px-4 py-1.5 text-right">Value</th>
                                <th class="px-4 py-1.5 text-right">CSP Reserved</th>
                                <th class="px-4 py-1.5 text-right">%</th>
                                <th class="px-4 py-1.5 text-right">Cost Basis</th>
                                <th class="px-4 py-1.5 text-center">Wheel</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">`;

            for (const e of allEntries) {
                const roleBadge = e.role === "core"
                    ? `<span class="px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">core</span>`
                    : `<span class="px-1.5 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">proxy</span>`;

                const wheelIcon = e.role === "proxy"
                    ? (e.has_active_trades
                        ? `<span class="text-green-500" title="Active wheel trades">●</span>`
                        : `<span class="text-gray-300 dark:text-gray-600" title="No active trades">○</span>`)
                    : "";

                const csp = e.csp_committed || 0;
                const cspCell = e.role === "proxy" && csp > 0 ? fmtMoney(csp) : "—";
                const entryValue = e.market_value > 0 ? e.market_value : csp;
                const pctOfClass = ac.total_value > 0 ? (entryValue / ac.total_value * 100) : 0;

                html += `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td class="px-4 py-1.5 font-semibold text-indigo-600 dark:text-indigo-400">${esc(e.symbol)}</td>
                    <td class="px-4 py-1.5">${roleBadge}</td>
                    <td class="px-4 py-1.5 text-right">${e.price ? fmtMoney(e.price) : "—"}</td>
                    <td class="px-4 py-1.5 text-right">${e.shares > 0 ? e.shares : "—"}</td>
                    <td class="px-4 py-1.5 text-right">${e.market_value > 0 ? fmtMoney(e.market_value) : "—"}</td>
                    <td class="px-4 py-1.5 text-right">${cspCell}</td>
                    <td class="px-4 py-1.5 text-right text-gray-500 dark:text-gray-400">${entryValue > 0 ? pctOfClass.toFixed(1) + "%" : "—"}</td>
                    <td class="px-4 py-1.5 text-right">${e.cost_basis > 0 ? fmtMoney(e.cost_basis) : "—"}</td>
                    <td class="px-4 py-1.5 text-center">${wheelIcon}</td>
                </tr>`;
            }

            html += `</tbody>
                        <tfoot>
                            <tr class="border-t dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 font-medium text-xs">
                                <td class="px-4 py-1.5" colspan="4">Subtotal</td>
                                <td class="px-4 py-1.5 text-right">${fmtMoney(ac.core_value + ac.proxy_value)}</td>
                                <td class="px-4 py-1.5 text-right">${ac.csp_committed > 0 ? fmtMoney(ac.csp_committed) : "—"}</td>
                                <td class="px-4 py-1.5 text-right">100%</td>
                                <td class="px-4 py-1.5 text-right">${fmtMoney(ac.core.reduce((s, e) => s + e.cost_basis, 0) + ac.proxy.reduce((s, e) => s + (e.cost_basis || 0), 0))}</td></td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>`;
        }
        html += `</div>`;
    }

    groupsEl.innerHTML = html;
}

function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
}
