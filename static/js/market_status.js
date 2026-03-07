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

    let status, statusColor, detail;

    if (day === 0 || day === 6) {
      // Weekend
      status = "Closed";
      statusColor = "text-gray-400";
      detail = "Weekend";
    } else if (mins >= openMins && mins < closeMins) {
      // Market open
      status = "Market Open";
      statusColor = "text-green-600";
      const left = closeMins - mins;
      const hrsLeft = Math.floor(left / 60);
      const minsLeft = left % 60;
      detail = hrsLeft > 0 ? `${hrsLeft}h ${minsLeft}m to close` : `${minsLeft}m to close`;
    } else if (mins >= closeMins && mins < afterClose) {
      // After hours
      status = "After Hours";
      statusColor = "text-amber-600";
      detail = "Closes 8:00 PM ET";
    } else if (mins >= preOpen && mins < openMins) {
      // Pre-market
      status = "Pre-Market";
      statusColor = "text-blue-500";
      const left = openMins - mins;
      const hrsLeft = Math.floor(left / 60);
      const minsLeft = left % 60;
      detail = hrsLeft > 0 ? `${hrsLeft}h ${minsLeft}m to open` : `${minsLeft}m to open`;
    } else {
      // Overnight
      status = "Closed";
      statusColor = "text-gray-400";
      detail = "Pre-market at 4:00 AM ET";
    }

    el.innerHTML = `
      <div class="flex items-center gap-2 text-xs">
        <span class="text-gray-500 font-medium">${dateStr}</span>
        <span class="text-gray-300">·</span>
        <span class="font-semibold ${statusColor}">${status}</span>
        <span class="text-gray-400">${detail}</span>
      </div>`;
  }

  update();
  setInterval(update, 30000); // refresh every 30s
}
