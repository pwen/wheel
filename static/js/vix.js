/* vix.js — VIX market regime indicator & trading guidance */

const REGIMES = {
    bull: {
        label: "Bull Market",
        range: "VIX 12–18",
        color: "bg-green-100 text-green-800 border-green-300",
        dotColor: "bg-green-500",
        strategy: "Income Focus. Don't miss the rally, avoid assignment.",
        csp: { delta: "-0.15 to -0.20", distance: "7–10% OTM", dte: "30–45 Days", goal: "Small, fast income." },
        cc: { delta: "+0.25 to +0.35", distance: "5–8% OTM", dte: "45–60 Days", goal: "Give stock room to run." },
        sizing: "Deploy ~50% of cash. Keep 50% in reserve — premiums are too low to lock up all your capital.",
    },
    sideways: {
        label: "Sideways / Choppy",
        range: "VIX 16–25",
        color: "bg-yellow-100 text-yellow-800 border-yellow-300",
        dotColor: "bg-yellow-500",
        strategy: 'The "Sweet Spot". Weave in and out for max profit.',
        csp: { delta: "-0.25 to -0.35", distance: "4–7% OTM", dte: "30–60 Days", goal: "Standard wheel mechanics." },
        cc: { delta: "+0.25 to +0.35", distance: "4–7% OTM", dte: "30–60 Days", goal: "Happy to take profit." },
        sizing: "Deploy 80–100% of cash. This is where the wheel generates the highest returns.",
    },
    bear: {
        label: "Bear Market",
        range: "VIX 25–40",
        color: "bg-orange-100 text-orange-800 border-orange-300",
        dotColor: "bg-orange-500",
        strategy: "Hedge & Defend. Don't catch falling knives.",
        csp: { delta: "-0.15 to -0.20", distance: "10–15% OTM", dte: "60–120 Days", goal: "Lock in high IV for a long time." },
        cc: { delta: "+0.35 to +0.50", distance: "0–3% OTM (ATM)", dte: "30–45 Days", goal: "Harvest massive IV to cushion the drop." },
        sizing: "Deploy 30–40% of cash. Resist the urge to over-deploy just because premiums are fat. Stagger entries.",
    },
    crisis: {
        label: "Crisis Market",
        range: "VIX 40+",
        color: "bg-red-100 text-red-800 border-red-300",
        dotColor: "bg-red-500",
        strategy: "Generational Entries. Survive and set up for the bounce.",
        csp: { delta: "-0.15 or lower", distance: "15%+ OTM", dte: "90–150 Days (LEAPS)", goal: "Extreme safety." },
        cc: { delta: "+0.45 to +0.50", distance: "0–2% OTM", dte: "30 Days", goal: "Aggressively exit positions on any bounce." },
        sizing: "Deploy 20–30% of cash. Preserve capital to buy the ultimate bottom.",
    },
};

let _vixCache = null;

async function fetchVix() {
    if (_vixCache) return _vixCache;
    try {
        const res = await fetch("/api/vix");
        if (!res.ok) return null;
        _vixCache = await res.json();
        return _vixCache;
    } catch { return null; }
}

function renderVixBanner(el, prefetchedData) {
    const p = prefetchedData ? Promise.resolve(prefetchedData) : fetchVix();
    p.then(data => {
        if (!data || data.vix == null) {
            el.innerHTML = `<span class="text-gray-400 text-xs">VIX unavailable</span>`;
            return;
        }
        const r = REGIMES[data.regime] || REGIMES.sideways;
        const trendArrow = data.trend === "rising" ? "↑" : data.trend === "falling" ? "↓" : "→";
        const trendColor = data.trend === "rising" ? "text-red-600" : data.trend === "falling" ? "text-green-600" : "text-gray-500";
        const avg5d = data.avg5d != null ? data.avg5d.toFixed(2) : "—";
        el.innerHTML = `
          <div class="relative group cursor-help">
            <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg border ${r.color}">
              <span class="w-2 h-2 rounded-full ${r.dotColor} animate-pulse"></span>
              <span class="font-semibold">VIX ${data.vix.toFixed(2)}</span>
              <span class="font-bold ${trendColor}">${trendArrow}</span>
              <span class="text-xs opacity-75">5d avg: ${avg5d}</span>
              <span class="hidden sm:inline">· ${r.label}</span>
            </div>
            <!-- Dropdown guidance panel -->
            <div class="hidden group-hover:block absolute right-0 top-full mt-1 w-96 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-xl z-50 p-4 text-left text-gray-700 dark:text-gray-200">
              <div class="flex items-center justify-between mb-2">
                <span class="font-bold text-base">${r.label}</span>
                <span class="text-xs text-gray-400">${r.range}</span>
              </div>
              <p class="text-sm mb-2 italic text-gray-600 dark:text-gray-400">${r.strategy}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Regime based on 5-day avg (${avg5d}) — VIX is ${data.trend === "rising" ? "rising ↑ (getting fearful)" : data.trend === "falling" ? "falling ↓ (calming down)" : "stable →"}.</p>
              <div class="grid grid-cols-2 gap-3 text-xs">
                <div class="bg-purple-50 dark:bg-purple-900/30 rounded p-2">
                  <div class="font-semibold text-purple-700 dark:text-purple-400 mb-1">CSP Rules</div>
                  <div>Delta: ${r.csp.delta}</div>
                  <div>Distance: ${r.csp.distance}</div>
                  <div>DTE: ${r.csp.dte}</div>
                  <div class="mt-1 text-gray-500 dark:text-gray-400">${r.csp.goal}</div>
                </div>
                <div class="bg-sky-50 dark:bg-sky-900/30 rounded p-2">
                  <div class="font-semibold text-sky-700 dark:text-sky-400 mb-1">CC Rules</div>
                  <div>Delta: ${r.cc.delta}</div>
                  <div>Distance: ${r.cc.distance}</div>
                  <div>DTE: ${r.cc.dte}</div>
                  <div class="mt-1 text-gray-500 dark:text-gray-400">${r.cc.goal}</div>
                </div>
              </div>
              <div class="mt-3 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 rounded p-2">
                <span class="font-semibold">Sizing:</span> ${r.sizing}
              </div>
            </div>
          </div>`;
    });
}
