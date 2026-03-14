// ---- Calendar tab ----

const EVENT_TYPE_COLORS = {
    // US — per-symbol
    us_earnings: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "US Earnings" },
    us_ex_dividend: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "US Ex-Div" },
    // US — macro
    us_opex: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "US OpEx" },
    us_triple_witching: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "US Triple Witch" },
    us_fomc: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "FOMC" },
    us_cpi: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", label: "US CPI" },
    us_jobs: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-700 dark:text-teal-400", label: "US Jobs" },
    us_gdp: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-400", label: "US GDP" },
    us_pce: { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400", label: "US PCE" },
    us_ppi: { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-400", label: "US PPI" },
    // China
    cn_lpr: { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-400", label: "LPR" },
    cn_gdp: { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-400", label: "CN GDP" },
    cn_cpi: { bg: "bg-fuchsia-100 dark:bg-fuchsia-900/30", text: "text-fuchsia-700 dark:text-fuchsia-400", label: "CN CPI" },
    cn_ppi: { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-400", label: "CN PPI" },
    cn_pmi: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", label: "NBS PMI" },
    caixin_pmi: { bg: "bg-lime-100 dark:bg-lime-900/30", text: "text-lime-700 dark:text-lime-400", label: "Caixin PMI" },
    two_sessions: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", label: "Two Sessions" },
    cn_trade: { bg: "bg-slate-100 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-400", label: "CN Trade" },
    cewc: { bg: "bg-zinc-100 dark:bg-zinc-900/30", text: "text-zinc-700 dark:text-zinc-400", label: "CEWC" },
    // EU
    eu_ecb: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-300", label: "ECB" },
    eu_cpi: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-300", label: "EU CPI" },
    eu_gdp: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-800 dark:text-indigo-300", label: "EU GDP" },
    eu_pmi: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-800 dark:text-emerald-300", label: "EU PMI" },
    eu_ecb_minutes: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-300", label: "ECB Min" },
    eu_trade: { bg: "bg-slate-100 dark:bg-slate-900/30", text: "text-slate-800 dark:text-slate-300", label: "EU Trade" },
    // Germany
    de_ifo: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-300", label: "Ifo" },
    // Japan
    jp_boj: { bg: "bg-red-200 dark:bg-red-900/40", text: "text-red-800 dark:text-red-300", label: "BOJ" },
    jp_cpi: { bg: "bg-orange-200 dark:bg-orange-900/40", text: "text-orange-800 dark:text-orange-300", label: "JP CPI" },
    jp_tankan: { bg: "bg-pink-200 dark:bg-pink-900/40", text: "text-pink-800 dark:text-pink-300", label: "Tankan" },
    // India
    in_rbi: { bg: "bg-teal-200 dark:bg-teal-900/40", text: "text-teal-800 dark:text-teal-300", label: "RBI" },
    in_cpi: { bg: "bg-cyan-200 dark:bg-cyan-900/40", text: "text-cyan-800 dark:text-cyan-300", label: "IN CPI" },
    in_gdp: { bg: "bg-sky-200 dark:bg-sky-900/40", text: "text-sky-800 dark:text-sky-300", label: "IN GDP" },
    // Brazil
    br_copom: { bg: "bg-green-200 dark:bg-green-900/40", text: "text-green-800 dark:text-green-300", label: "Copom" },
    br_cpi: { bg: "bg-lime-200 dark:bg-lime-900/40", text: "text-lime-800 dark:text-lime-300", label: "BR CPI" },
    // Mexico
    mx_banxico: { bg: "bg-violet-200 dark:bg-violet-900/40", text: "text-violet-800 dark:text-violet-300", label: "Banxico" },
    mx_cpi: { bg: "bg-fuchsia-200 dark:bg-fuchsia-900/40", text: "text-fuchsia-800 dark:text-fuchsia-300", label: "MX CPI" },
};

let _calendarLoaded = false;

function initCalendar() {
    if (_calendarLoaded) return;
    _calendarLoaded = true;

    // Default year to current
    const yearInput = $("#cal-seed-year");
    yearInput.value = new Date().getFullYear();

    // Seed button
    $("#cal-seed-btn").addEventListener("click", async () => {
        const year = parseInt(yearInput.value);
        if (!year || year < 2025 || year > 2100) return;
        const btn = $("#cal-seed-btn");
        const status = $("#cal-seed-status");
        btn.disabled = true;
        btn.textContent = "Seeding…";
        status.textContent = "";
        try {
            const r = await fetch(`/api/events/seed-macro?year=${year}`, { method: "POST" });
            const data = await r.json();
            const total = (data.opex || 0) + (data.triple_witching || 0) + (data.jobs || 0)
                + (data.fomc || 0) + (data.cpi || 0) + (data.gdp || 0);
            status.textContent = `✓ ${total} events seeded (${data.deleted || 0} replaced)`;
            status.className = "text-sm text-green-600 dark:text-green-400";
            loadCalendarEvents();
        } catch (e) {
            status.textContent = "Failed: " + e.message;
            status.className = "text-sm text-red-600 dark:text-red-400";
        } finally {
            btn.disabled = false;
            btn.textContent = "Seed / Reset Macro Events";
        }
    });

    loadCalendarEvents();
}

async function loadCalendarEvents() {
    const container = $("#cal-events-list");
    container.innerHTML = '<p class="text-gray-400 dark:text-gray-500 text-sm p-4">Loading…</p>';

    try {
        // Fetch events from today onward, up to 12 months
        const today = new Date().toISOString().split("T")[0];
        const endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 1);
        const end = endDate.toISOString().split("T")[0];

        const r = await fetch(`/api/events?start=${today}&end=${end}`);
        const events = await r.json();

        if (!events.length) {
            container.innerHTML = '<p class="text-gray-400 dark:text-gray-500 text-sm p-4">No upcoming events. Use the button above to seed macro events.</p>';
            return;
        }

        // Group by month
        const grouped = {};
        for (const ev of events) {
            const d = new Date(ev.event_date + "T00:00:00");
            const key = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(ev);
        }

        let html = "";
        for (const [month, evts] of Object.entries(grouped)) {
            html += `<div class="border-b dark:border-gray-700 last:border-b-0">`;
            html += `<div class="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">${month}</div>`;
            for (const ev of evts) {
                const d = new Date(ev.event_date + "T00:00:00");
                const dayStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                const type = EVENT_TYPE_COLORS[ev.event_type] || { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: ev.event_type };
                const regionBadge = ev.region && ev.region !== "US"
                    ? `<span class="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">${ev.region}</span>`
                    : "";
                const symbolBadge = ev.symbol
                    ? `<span class="text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200">${ev.symbol}</span>`
                    : "";
                const impactDots = "●".repeat(ev.impact || 2);
                const impactColor = (ev.impact || 2) >= 3 ? "text-red-500" : (ev.impact || 2) >= 2 ? "text-yellow-500" : "text-gray-400";
                const isPast = ev.event_date < today;
                const opacity = isPast ? "opacity-50" : "";

                html += `<div class="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 ${opacity}">`;
                html += `  <span class="w-28 text-sm text-gray-500 dark:text-gray-400 shrink-0">${dayStr}</span>`;
                html += `  <span class="text-xs font-medium px-2 py-0.5 rounded ${type.bg} ${type.text} w-24 text-center shrink-0">${type.label}</span>`;
                html += `  <span class="text-sm text-gray-900 dark:text-gray-100 flex-1">${ev.title}</span>`;
                html += `  <span class="text-xs ${impactColor}" title="Impact: ${ev.impact || 2}/3">${impactDots}</span>`;
                if (ev.url) html += `  <a href="${ev.url}" target="_blank" rel="noopener" class="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400" title="Source"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>`;
                html += `  <span class="flex items-center gap-1.5">${symbolBadge}${regionBadge}</span>`;
                html += `</div>`;
            }
            html += `</div>`;
        }
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p class="text-red-500 text-sm p-4">Failed to load events: ${e.message}</p>`;
    }
}
