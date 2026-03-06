const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmt = (v, decimals = 2) => v != null ? Number(v).toFixed(decimals) : "—";
const fmtMoney = (v) => v != null ? "$" + Number(v).toFixed(2) : "—";

function openModal() { $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); }
