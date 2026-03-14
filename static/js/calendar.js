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
let _selectedDate = null;     // "YYYY-MM-DD"
let _viewMonth = null;        // Date object (1st of displayed month)
let _monthEvents = {};        // { "YYYY-MM-DD": [event, …] }

function initCalendar() {
    if (_calendarLoaded) return;
    _calendarLoaded = true;

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
            const total = Object.entries(data).filter(([k]) => k !== "deleted" && k !== "warning").reduce((s, [, v]) => s + v, 0);
            status.textContent = `✓ ${total} events seeded (${data.deleted || 0} replaced)`;
            status.className = "text-sm text-green-600 dark:text-green-400";
            renderAll();
        } catch (e) {
            status.textContent = "Failed: " + e.message;
            status.className = "text-sm text-red-600 dark:text-red-400";
        } finally {
            btn.disabled = false;
            btn.textContent = "Seed / Reset";
        }
    });

    // Month nav
    $("#cal-prev-month").addEventListener("click", () => {
        _viewMonth.setMonth(_viewMonth.getMonth() - 1);
        loadMonthAndRender();
    });
    $("#cal-next-month").addEventListener("click", () => {
        _viewMonth.setMonth(_viewMonth.getMonth() + 1);
        loadMonthAndRender();
    });

    // Init to today
    const now = new Date();
    _selectedDate = fmtDate(now);
    _viewMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    renderWeekBar();
    loadMonthAndRender();
}

// ---- helpers ----
function fmtDate(d) {
    return d.toISOString().split("T")[0];
}
function parseDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
}

// ---- Week bar ----
function renderWeekBar() {
    const container = $("#cal-week-bar");
    const now = new Date();
    const day = now.getDay();
    const mondayOff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOff);

    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let html = "";
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const ds = fmtDate(d);
        const isToday = ds === fmtDate(now);
        const isSelected = ds === _selectedDate;
        const base = "flex flex-col items-center py-2 rounded-lg cursor-pointer transition-colors text-center";
        const colors = isSelected
            ? "bg-indigo-600 text-white"
            : isToday
                ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700";
        const border = isToday && !isSelected ? "border border-indigo-400" : "border border-gray-200 dark:border-gray-700";
        html += `<div class="${base} ${colors} ${border}" data-date="${ds}" onclick="selectCalendarDay('${ds}')">`;
        html += `  <span class="text-[10px] uppercase font-semibold">${dayNames[i]}</span>`;
        html += `  <span class="text-lg font-bold">${d.toLocaleDateString("en-US", { month: "short", day: "2-digit" })}</span>`;
        html += `</div>`;
    }
    container.innerHTML = html;
}

// ---- Month grid ----
async function loadMonthAndRender() {
    const y = _viewMonth.getFullYear();
    const m = _viewMonth.getMonth();
    const start = fmtDate(new Date(y, m, 1));
    const end = fmtDate(new Date(y, m + 1, 0));

    try {
        const r = await fetch(`/api/events?start=${start}&end=${end}`);
        const events = await r.json();
        _monthEvents = {};
        for (const ev of events) {
            if (!_monthEvents[ev.event_date]) _monthEvents[ev.event_date] = [];
            _monthEvents[ev.event_date].push(ev);
        }
    } catch {
        _monthEvents = {};
    }

    renderMonthGrid();
    renderDayEvents();
}

function renderMonthGrid() {
    const y = _viewMonth.getFullYear();
    const m = _viewMonth.getMonth();
    const title = new Date(y, m, 1).toLocaleDateString("en-US", { year: "numeric", month: "long" });
    $("#cal-month-title").textContent = title;

    const firstDay = new Date(y, m, 1).getDay(); // 0=Sun
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = fmtDate(new Date());

    const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let html = dayHeaders.map(d =>
        `<div class="bg-gray-50 dark:bg-gray-700/50 text-center text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase py-1.5">${d}</div>`
    ).join("");

    // Prev month filler
    const prevMonthDays = new Date(y, m, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
        const day = prevMonthDays - i;
        html += `<div class="bg-gray-50 dark:bg-gray-900/30 py-2 px-1 text-center text-xs text-gray-300 dark:text-gray-600">${day}</div>`;
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const evts = _monthEvents[ds] || [];
        const hasEvents = evts.length > 0;
        const isToday = ds === todayStr;
        const isSelected = ds === _selectedDate;

        let bg = "bg-white dark:bg-gray-800";
        if (isSelected) bg = "bg-indigo-600/20 dark:bg-indigo-500/20";
        else if (hasEvents) bg = "bg-indigo-50 dark:bg-indigo-900/20";

        let border = "border border-transparent";
        if (isSelected) border = "border-2 border-indigo-500";
        else if (isToday) border = "border border-indigo-400";
        else if (hasEvents) border = "border border-indigo-300 dark:border-indigo-700";

        const textColor = isToday ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-gray-700 dark:text-gray-300";

        html += `<div class="${bg} ${border} py-2 px-1 text-center cursor-pointer rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors" onclick="selectCalendarDay('${ds}')">`;
        html += `  <span class="text-sm ${textColor}">${d}</span>`;
        if (hasEvents) {
            const maxDots = Math.min(evts.length, 4);
            html += `<div class="flex justify-center gap-0.5 mt-0.5">`;
            for (let i = 0; i < maxDots; i++) {
                const type = EVENT_TYPE_COLORS[evts[i].event_type];
                const dotColor = type ? type.text.split(" ")[0] : "text-indigo-500";
                html += `<span class="w-1 h-1 rounded-full ${dotColor.replace("text-", "bg-")}"></span>`;
            }
            if (evts.length > 4) html += `<span class="text-[8px] text-gray-400">+${evts.length - 4}</span>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    // Next month filler
    const totalCells = startOffset + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
        html += `<div class="bg-gray-50 dark:bg-gray-900/30 py-2 px-1 text-center text-xs text-gray-300 dark:text-gray-600">${d}</div>`;
    }

    $("#cal-grid").innerHTML = html;
}

// ---- Day events ----
function selectCalendarDay(dateStr) {
    _selectedDate = dateStr;
    // If selected day is in a different month, navigate there
    const d = parseDate(dateStr);
    if (d.getFullYear() !== _viewMonth.getFullYear() || d.getMonth() !== _viewMonth.getMonth()) {
        _viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
        loadMonthAndRender();
    } else {
        renderMonthGrid();
        renderDayEvents();
    }
    renderWeekBar();
}

function renderDayEvents() {
    const container = $("#cal-day-events");
    const titleEl = $("#cal-day-title");
    const d = parseDate(_selectedDate);
    titleEl.textContent = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    const evts = _monthEvents[_selectedDate] || [];
    if (!evts.length) {
        container.innerHTML = '<p class="text-gray-400 dark:text-gray-500 text-sm p-4">No events on this day</p>';
        return;
    }

    const REGION_FLAGS = {
        US: "\u{1F1FA}\u{1F1F8}", CN: "\u{1F1E8}\u{1F1F3}", EU: "\u{1F1EA}\u{1F1FA}", DE: "\u{1F1E9}\u{1F1EA}",
        JP: "\u{1F1EF}\u{1F1F5}", IN: "\u{1F1EE}\u{1F1F3}", BR: "\u{1F1E7}\u{1F1F7}", MX: "\u{1F1F2}\u{1F1FD}",
    };
    const IMPACT_LABELS = { 1: "Low", 2: "Medium", 3: "High" };
    const IMPACT_COLORS = {
        1: "text-gray-400 dark:text-gray-500",
        2: "text-yellow-500 dark:text-yellow-400",
        3: "text-red-500 dark:text-red-400",
    };

    let html = `<table class="w-full text-sm">`;
    html += `<thead><tr class="text-xs text-gray-500 dark:text-gray-400 uppercase border-b dark:border-gray-700">`;
    html += `<th class="text-left px-4 py-2 font-semibold">Event</th>`;
    html += `<th class="text-left px-3 py-2 font-semibold">Country</th>`;
    html += `<th class="text-left px-3 py-2 font-semibold">Impact</th>`;
    html += `</tr></thead><tbody>`;

    for (const ev of evts) {
        const type = EVENT_TYPE_COLORS[ev.event_type] || { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: ev.event_type };
        const flag = REGION_FLAGS[ev.region] || "";
        const impact = ev.impact || 2;
        const impactLabel = IMPACT_LABELS[impact] || "Medium";
        const impactColor = IMPACT_COLORS[impact] || IMPACT_COLORS[2];

        const linkIcon = ev.url ? ` <a href="${ev.url}" target="_blank" rel="noopener" class="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 inline-block align-middle ml-1" title="Source"><svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>` : "";

        html += `<tr class="border-b dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">`;
        html += `<td class="px-4 py-2.5"><span class="text-gray-900 dark:text-gray-100">${ev.title}</span>${linkIcon}</td>`;
        html += `<td class="px-3 py-2.5 whitespace-nowrap"><span class="mr-1">${flag}</span><span class="text-gray-600 dark:text-gray-400 text-xs">${ev.region}</span></td>`;
        html += `<td class="px-3 py-2.5"><span class="${impactColor} text-xs font-medium">${impactLabel}</span></td>`;
        html += `</tr>`;
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
}

// Render everything fresh
async function renderAll() {
    renderWeekBar();
    await loadMonthAndRender();
}
