// ---- Calendar tab ----

const EVENT_TYPE_COLORS = {
    earnings: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Earnings" },
    ex_dividend: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Ex-Div" },
    opex: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "OpEx" },
    triple_witching: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "Triple Witch" },
    fomc: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "FOMC" },
    cpi: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", label: "CPI" },
    jobs: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-700 dark:text-teal-400", label: "Jobs" },
    gdp: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-400", label: "GDP" },
    pce: { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400", label: "PCE" },
    ppi: { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-400", label: "PPI" },
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
                const isPast = ev.event_date < today;
                const opacity = isPast ? "opacity-50" : "";

                html += `<div class="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 ${opacity}">`;
                html += `  <span class="w-28 text-sm text-gray-500 dark:text-gray-400 shrink-0">${dayStr}</span>`;
                html += `  <span class="text-xs font-medium px-2 py-0.5 rounded ${type.bg} ${type.text} w-24 text-center shrink-0">${type.label}</span>`;
                html += `  <span class="text-sm text-gray-900 dark:text-gray-100 flex-1">${ev.title}</span>`;
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
