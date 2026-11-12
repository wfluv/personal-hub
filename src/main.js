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
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.setAttribute("role", "gridcell");
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
    calendarDays.append(cell);
  }
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
