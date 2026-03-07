/* market_status.js — Date + market open/close status */

function renderMarketStatus(el) {
    function update() {
        const now = new Date();
        const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const day = eastern.getDay(); // 0=Sun, 6=Sat
        const h = eastern.getHours();
        const m = eastern.getMinutes();
        const mins = h * 60 + m;

        // Format date
        const dateStr = eastern.toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric",
            timeZone: "America/New_York"
        });

        const openMins = 9 * 60 + 30;   // 9:30 AM ET
        const closeMins = 16 * 60;       // 4:00 PM ET
        const preOpen = 4 * 60;          // 4:00 AM ET pre-market
        const afterClose = 20 * 60;      // 8:00 PM ET after-hours end

        let label, dotColor;

        if (day >= 1 && day <= 5 && mins >= openMins && mins < closeMins) {
            label = "MKT OPEN";
            dotColor = "bg-green-500";
        } else {
            label = "MKT CLOSED";
            dotColor = "bg-red-500";
        }

        // Format local date/time: e.g. "Sat, Mar 7, 2026 9:48:05 AM MST"
        const localStr = now.toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric", year: "numeric"
        }) + " " + now.toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short"
        });

        el.innerHTML = `
      <div class="flex items-center gap-2 text-xs font-mono tracking-wide">
        <span class="text-gray-400">${localStr}</span>
        <span class="w-2 h-2 rounded-full ${dotColor}"></span>
        <span class="font-semibold text-gray-400">${label}</span>
      </div>`;
    }

    update();
    setInterval(update, 1000); // refresh every second
}
