const root = document.querySelector("#app");

if (!root) {
  throw new Error("Personal Hub app root was not found.");
}

const navigationButtons = [...document.querySelectorAll("[data-page]")];
const pages = [...document.querySelectorAll("[data-view]")];
const allocationTrigger = document.querySelector(".allocation-trigger");
const allocationPopover = document.querySelector("#allocation-popover");

function showPage(pageName) {
  pages.forEach((page) => {
    page.hidden = page.dataset.view !== pageName;
  });

  navigationButtons.forEach((button) => {
    const isActive = button.dataset.page === pageName;
    button.classList.toggle("is-active", isActive);

    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  closeAllocation();
}

function openAllocation() {
  allocationPopover.hidden = false;
  allocationTrigger.setAttribute("aria-expanded", "true");
}

function closeAllocation() {
  allocationPopover.hidden = true;
  allocationTrigger.setAttribute("aria-expanded", "false");
}

navigationButtons.forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

allocationTrigger.addEventListener("click", () => {
  const isOpen = allocationTrigger.getAttribute("aria-expanded") === "true";
  if (isOpen) closeAllocation();
  else openAllocation();
});

allocationTrigger.addEventListener("mouseenter", openAllocation);
allocationTrigger.addEventListener("focus", openAllocation);

document.addEventListener("click", (event) => {
  if (!event.target.closest(".balance-wrap")) closeAllocation();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAllocation();
});

// Calendar uses the Latvian civil date, including Riga daylight-saving changes.
const calendarZone = "Europe/Riga";
const calendarMonth = document.querySelector("#calendar-month");
const calendarDays = document.querySelector("#calendar-days");
const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long", year: "numeric", timeZone: "UTC"
});
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: calendarZone
});
function rigaToday() {
  const parts = dateFormatter.formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}
const initialDate = rigaToday();
let visibleYear = initialDate.year;
let visibleMonth = initialDate.month;
const dateKey = (year, month, day) => [year, String(month + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
let selectedDate = dateKey(initialDate.year, initialDate.month, initialDate.day);
const shiftStorageKey = "personal-hub:work-shifts:v1";
function loadShifts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(shiftStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter(s => s && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && ["main", "taltap"].includes(s.type) && Number.isFinite(s.hours) && s.hours > 0 && s.hours <= 24) : [];
  } catch { return []; }
}
let shifts = loadShifts();
const shiftDialog = document.querySelector("#shift-dialog");
const shiftForm = document.querySelector("#shift-form");
const dateInput = document.querySelector("#shift-date");
const hoursInput = document.querySelector("#shift-hours");
const briefcaseSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2.5"></rect><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12h18"></path></svg>';
function renderWorkStats() {
  const monthPrefix = dateKey(visibleYear, visibleMonth, 1).slice(0, 7);
  const totals = { main: 0, taltap: 0 };
  shifts.forEach(s => { if (s.date.startsWith(monthPrefix)) totals[s.type] += s.hours; });
  const format = value => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  document.querySelector("#main-hours").innerHTML = format(totals.main) + " <small>h</small>";
  document.querySelector("#taltap-hours").innerHTML = format(totals.taltap) + " <small>h</small>";
}
function openShiftDialog() {
  dateInput.value = selectedDate;
  hoursInput.value = "";
  shiftDialog.showModal();
}
document.querySelector("#add-shift").addEventListener("click", openShiftDialog);
document.querySelector("#close-shift").addEventListener("click", () => shiftDialog.close());
shiftDialog.addEventListener("click", (event) => {
  if (event.target === shiftDialog) shiftDialog.close();
});
shiftForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const date = dateInput.value;
  const type = document.querySelector("#shift-type").value;
  const hours = Number(hoursInput.value);
  const parsedDate = new Date(date + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== date || !["main","taltap"].includes(type) || !Number.isFinite(hours) || hours <= 0 || hours > 24) return;
  const next = [...shifts, { date, type, hours }];
  try { localStorage.setItem(shiftStorageKey, JSON.stringify(next)); } catch { alert("Unable to save this shift on this device."); return; }
  shifts = next;
  selectedDate = date;
  visibleYear = parsedDate.getUTCFullYear();
  visibleMonth = parsedDate.getUTCMonth();
  renderCalendar();
  shiftDialog.close();
});


function renderCalendar() {
  const today = rigaToday();
  calendarMonth.textContent = monthFormatter.format(new Date(Date.UTC(visibleYear, visibleMonth, 1)));
  calendarDays.replaceChildren();

  // UTC arithmetic avoids timezone and DST offsets while calculating the grid.
  const firstDay = new Date(Date.UTC(visibleYear, visibleMonth, 1));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const monthLength = new Date(Date.UTC(visibleYear, visibleMonth + 1, 0)).getUTCDate();
  const numberOfCells = Math.ceil((mondayOffset + monthLength) / 7) * 7;

  for (let i = 0; i < numberOfCells; i++) {
    const date = new Date(Date.UTC(visibleYear, visibleMonth, i - mondayOffset + 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    cell.setAttribute("role", "gridcell");
    const key = dateKey(year, month, day);
    if (key === selectedDate) cell.classList.add("is-selected");
    cell.addEventListener("click", () => {
      selectedDate = key;
      if (month !== visibleMonth || year !== visibleYear) { visibleYear = year; visibleMonth = month; }
      renderCalendar();
    });
    cell.setAttribute("aria-label", new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
    }).format(date));
    if (month !== visibleMonth) cell.classList.add("is-outside");
    if (year === today.year && month === today.month && day === today.day) {
      cell.classList.add("is-today");
      cell.setAttribute("aria-current", "date");
    }
    const number = document.createElement("span");
    number.textContent = String(day);
    cell.append(number);
    const icons = document.createElement("span");
    icons.className = "calendar-shifts";
    for (const type of ["main", "taltap"]) {
      const dayShifts = shifts.filter(s => s.date === key && s.type === type);
      if (dayShifts.length) {
        const icon = document.createElement("span");
        icon.className = "shift-briefcase " + (type === "main" ? "primary" : "taltap");
        icon.innerHTML = briefcaseSVG;
        icon.title = (type === "main" ? "Main work" : "TalTap") + ": " + Number(dayShifts.reduce((sum,s) => sum+s.hours,0).toFixed(2)) + " h";
        icons.append(icon);
      }
    }
    cell.append(icons);
    calendarDays.append(cell);
  }
  renderWorkStats();
}

function changeCalendarMonth(delta) {
  const target = new Date(Date.UTC(visibleYear, visibleMonth + delta, 1));
  visibleYear = target.getUTCFullYear();
  visibleMonth = target.getUTCMonth();
  renderCalendar();
}
document.querySelector("#calendar-prev").addEventListener("click", () => changeCalendarMonth(-1));
document.querySelector("#calendar-next").addEventListener("click", () => changeCalendarMonth(1));
renderCalendar();
