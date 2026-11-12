import { initDebts, refreshDebts } from "./debts.js";
import { initializeCloud, queueCloudDiff, synchronize, signIn, signUp, signOut } from "./cloud.js?v=debts-1";
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

// All calendar dates use Latvia's local calendar, including DST.
const calendarZone = "Europe/Riga";
const $ = (selector) => document.querySelector(selector);
const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const localDateFormatter = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: calendarZone });
const dateKey = (year, month, day) => [year, String(month + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
const euro = (value) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const quantity = (value) => Number(value.toFixed(2)).toString();
const briefcaseSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2.5"></rect><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12h18"></path></svg>';
function rigaToday() {
  const pieces = localDateFormatter.formatToParts(new Date());
  const val = (type) => Number(pieces.find((piece) => piece.type === type).value);
  return { year: val("year"), month: val("month") - 1, day: val("day") };
}
function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function saveArray(key, entries) {
  try {
    const previous = readArray(key);
    localStorage.setItem(key, JSON.stringify(entries));
    queueCloudDiff(key, previous, entries);
    return true;
  } catch { alert("Could not save on this device. Please check browser storage."); return false; }
}
function newId() { return "entry-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }
const shiftStorageKey = "personal-hub:work-shifts:v1"; // Preserve shifts entered in the first release.
const paymentStorageKey = "personal-hub:salary-payments:v1";
let shifts = readArray(shiftStorageKey).filter((s) =>
  s && validDay(s.date) && ["main","taltap"].includes(s.type) && Number.isFinite(s.hours) && s.hours > 0 && s.hours <= 24
).map((s, index) => ({
  ...s, id: typeof s.id === "string" ? s.id : "legacy-" + index,
  payment: s.type === "taltap" && Number.isFinite(s.payment) && s.payment >= 0 ? s.payment : null
}));
// Upgrade old, non-unique legacy IDs before importing to cloud.
if (shifts.some((shift) => shift.id.startsWith("legacy-"))) {
  shifts = shifts.map((shift) => shift.id.startsWith("legacy-")
    ? { ...shift, id: newId() } : shift);
  localStorage.setItem(shiftStorageKey, JSON.stringify(shifts));
}
let payments = readArray(paymentStorageKey).filter((p) =>
  p && typeof p.id === "string" && validDay(p.date) &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(p.workMonth) && Number.isFinite(p.amount) && p.amount > 0
);
const initialDate = rigaToday();
let visibleYear = initialDate.year;
let visibleMonth = initialDate.month;
let selectedDate = dateKey(initialDate.year, initialDate.month, initialDate.day);
let editingShiftId = null;
const calendarDays = $("#calendar-days");
const shiftDialog = $("#shift-dialog");
const dayDialog = $("#day-dialog");
const paymentDialog = $("#payment-dialog");
const shiftForm = $("#shift-form");
const dateInput = $("#shift-date");
const typeInput = $("#shift-type");
const hoursInput = $("#shift-hours");
const receivedInput = $("#shift-payment");

function renderWorkStats() {
  const month = dateKey(visibleYear, visibleMonth, 1).slice(0, 7);
  const monthly = shifts.filter((s) => s.date.startsWith(month));
  const main = monthly.filter((s) => s.type === "main");
  const taltap = monthly.filter((s) => s.type === "taltap");
  const totalHours = (items) => items.reduce((total, item) => total + item.hours, 0);
  const hoursMain = totalHours(main);
  const hoursTalTap = totalHours(taltap);
  const salary = payments.filter((p) => p.workMonth === month).reduce((total, p) => total + p.amount, 0);
  const talPaid = taltap.reduce((total, s) => total + (s.payment ?? 0), 0);
  $("#main-hours").innerHTML = quantity(hoursMain) + " <small>h</small>";
  $("#taltap-hours").innerHTML = quantity(hoursTalTap) + " <small>h</small>";
  $("#main-pay").textContent = salary > 0 ? euro(salary) : "—";
  $("#taltap-pay").textContent = taltap.some((s) => s.payment !== null) ? euro(talPaid) : "—";
  $("#main-rate").textContent = salary > 0 && hoursMain > 0 ? euro(salary / hoursMain) + "/h" : "— €/h";
  // Older TalTap shifts without income should not make the average misleading.
  $("#taltap-rate").textContent = hoursTalTap > 0 && taltap.every((s) => s.payment !== null)
    ? euro(talPaid / hoursTalTap) + "/h" : "— €/h";
}

function renderCalendar() {
  const today = rigaToday();
  $("#calendar-month").textContent = monthFormatter.format(new Date(Date.UTC(visibleYear, visibleMonth, 1)));
  calendarDays.replaceChildren();
  const mondayOffset = (new Date(Date.UTC(visibleYear, visibleMonth, 1)).getUTCDay() + 6) % 7;
  const monthLength = new Date(Date.UTC(visibleYear, visibleMonth + 1, 0)).getUTCDate();
  const cells = Math.ceil((mondayOffset + monthLength) / 7) * 7;

  for (let i = 0; i < cells; i++) {
    const date = new Date(Date.UTC(visibleYear, visibleMonth, 1 + i - mondayOffset));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const key = dateKey(year, month, day);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", dayFormatter.format(date));
    if (month !== visibleMonth) cell.classList.add("is-outside");
    if (year === today.year && month === today.month && day === today.day) {
      cell.classList.add("is-today");
      cell.setAttribute("aria-current", "date");
    }
    cell.addEventListener("click", () => {
      selectedDate = key;
      if (visibleMonth !== month || visibleYear !== year) { visibleMonth = month; visibleYear = year; renderCalendar(); }
      openDayDialog(key);
    });
    const number = document.createElement("span");
    number.textContent = String(day);
    cell.append(number);
    const icons = document.createElement("span");
    icons.className = "calendar-shifts";
    for (const type of ["main", "taltap"]) {
      const matches = shifts.filter((s) => s.date === key && s.type === type);
      if (!matches.length) continue;
      const icon = document.createElement("span");
      icon.className = "shift-briefcase " + (type === "main" ? "primary" : "taltap");
      icon.innerHTML = briefcaseSVG;
      icon.title = (type === "main" ? "Main work" : "TalTap") + ": " + quantity(matches.reduce((sum, s) => sum + s.hours, 0)) + " h";
      icons.append(icon);
    }
    const paidToday = payments.filter((p) => p.date === key);
    if (paidToday.length) {
      const payoutIcon = document.createElement("span");
      payoutIcon.className = "calendar-payday";
      payoutIcon.textContent = "€";
      payoutIcon.title = "Salary received: " + euro(paidToday.reduce((sum, p) => sum + p.amount, 0));
      icons.append(payoutIcon);
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
  selectedDate = dateKey(visibleYear, visibleMonth, 1);
  renderCalendar();
}

function syncPaymentField() {
  const isTalTap = typeInput.value === "taltap";
  $("#shift-payment-field").hidden = !isTalTap;
  receivedInput.required = isTalTap;
}
function openShiftDialog(id = null) {
  editingShiftId = id;
  const shift = shifts.find((s) => s.id === id);
  dateInput.value = shift?.date || selectedDate;
  typeInput.value = shift?.type || "main";
  hoursInput.value = shift?.hours ?? "";
  receivedInput.value = shift?.payment ?? "";
  $("#shift-dialog-title").textContent = shift ? "Edit shift" : "Add shift";
  $("#save-shift").textContent = shift ? "Save changes" : "Save shift";
  $("#delete-shift").hidden = !shift;
  syncPaymentField();
  shiftDialog.showModal();
}
function closeDialogByBackdrop(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
function openDayDialog(dateKeyValue) {
  const d = new Date(dateKeyValue + "T00:00:00Z");
  $("#day-dialog-title").textContent = dayFormatter.format(d);
  const list = $("#day-entries");
  list.replaceChildren();
  const dayShifts = shifts.filter((s) => s.date === dateKeyValue);
  const dayPayments = payments.filter((p) => p.date === dateKeyValue);
  if (!dayShifts.length && !dayPayments.length) {
    const empty = document.createElement("p");
    empty.className = "day-empty";
    empty.textContent = "No entries for this day.";
    list.append(empty);
  }
  dayShifts.forEach((s) => {
    const row = document.createElement("div");
    row.className = "day-entry";
    const info = document.createElement("span");
    info.className = "day-entry-info";
    const label = document.createElement("span");
    label.textContent = s.type === "main" ? "Main work" : "TalTap";
    const detail = document.createElement("small");
    detail.textContent = quantity(s.hours) + " h" + (s.type === "taltap" && s.payment !== null ? " · " + euro(s.payment) : "");
    info.append(label, detail);
    const edit = document.createElement("button");
    edit.className = "day-edit";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => { dayDialog.close(); openShiftDialog(s.id); });
    row.append(info, edit);
    list.append(row);
  });
  dayPayments.forEach((p) => {
    const row = document.createElement("div");
    row.className = "day-entry";
    const info = document.createElement("span");
    info.className = "day-entry-info";
    const label = document.createElement("span");
    label.textContent = "Salary received";
    const detail = document.createElement("small");
    detail.textContent = euro(p.amount) + " · for " + p.workMonth;
    info.append(label, detail);
    const actions = document.createElement("div");
    actions.className = "day-entry-actions";
    const remove = document.createElement("button");
    remove.className = "day-edit";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      if (!confirm("Delete this salary payment?")) return;
      const next = payments.filter((payment) => payment.id !== p.id);
      if (!saveArray(paymentStorageKey, next)) return;
      payments = next;
      renderCalendar();
      openDayDialog(dateKeyValue);
    });
    actions.append(remove);
    row.append(info, actions);
    list.append(row);
  });
  dayDialog.showModal();
}

$("#calendar-prev").addEventListener("click", () => changeCalendarMonth(-1));
$("#calendar-next").addEventListener("click", () => changeCalendarMonth(1));
$("#add-shift").addEventListener("click", () => openShiftDialog());
$("#close-shift").addEventListener("click", () => shiftDialog.close());
$("#close-day").addEventListener("click", () => dayDialog.close());
$("#close-payment").addEventListener("click", () => paymentDialog.close());
$("#day-add-shift").addEventListener("click", () => { dayDialog.close(); openShiftDialog(); });
typeInput.addEventListener("change", syncPaymentField);
[shiftDialog, dayDialog, paymentDialog].forEach(closeDialogByBackdrop);

shiftForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const date = dateInput.value;
  const type = typeInput.value;
  const hours = Number(hoursInput.value);
  const received = receivedInput.value === "" ? null : Number(receivedInput.value);
  if (!validDay(date) || !["main","taltap"].includes(type) || !Number.isFinite(hours) ||
      hours < 0.25 || hours > 24 || !Number.isInteger(hours * 4) ||
      (type === "taltap" && (received === null || !Number.isFinite(received) || received < 0))) return;
  const entry = {
    id: editingShiftId || newId(), date, type, hours,
    payment: type === "taltap" ? Math.round(received * 100) / 100 : null
  };
  const next = editingShiftId
    ? shifts.map((s) => s.id === editingShiftId ? entry : s)
    : [...shifts, entry];
  if (!saveArray(shiftStorageKey, next)) return;
  shifts = next;
  selectedDate = date;
  visibleYear = Number(date.slice(0, 4));
  visibleMonth = Number(date.slice(5, 7)) - 1;
  shiftDialog.close();
  renderCalendar();
});
$("#delete-shift").addEventListener("click", () => {
  if (!editingShiftId || !confirm("Delete this shift?")) return;
  const next = shifts.filter((s) => s.id !== editingShiftId);
  if (!saveArray(shiftStorageKey, next)) return;
  shifts = next;
  shiftDialog.close();
  renderCalendar();
});

$("#add-payment").addEventListener("click", () => {
  const today = rigaToday();
  $("#payment-month").value = dateKey(visibleYear, visibleMonth, 1).slice(0, 7);
  $("#payment-date").value = dateKey(today.year, today.month, today.day);
  $("#payment-amount").value = "";
  paymentDialog.showModal();
});
$("#payment-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const workMonth = $("#payment-month").value;
  const date = $("#payment-date").value;
  const amount = Number($("#payment-amount").value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(workMonth) || !validDay(date) ||
      !Number.isFinite(amount) || amount <= 0) return;
  const next = [...payments, { id: newId(), workMonth, date, amount: Math.round(amount * 100) / 100 }];
  if (!saveArray(paymentStorageKey, next)) return;
  payments = next;
  paymentDialog.close();
  renderCalendar();
});

renderCalendar();
initDebts();

const cloudDialog = $("#cloud-dialog");
const cloudStatus = $("#cloud-status");
const cloudMessage = $("#cloud-message");
const cloudIndicator = $("#cloud-indicator");
function showCloudStatus(message) {
  cloudStatus.textContent = message;
  cloudIndicator.classList.toggle("connected", message === "Synced");
  cloudIndicator.classList.toggle("error", /error|unavailable|offline/i.test(message));
}
function cloudUserChanged(person) {
  $("#cloud-signed-out").hidden = !!person;
  $("#cloud-signed-in").hidden = !person;
  $("#cloud-current-email").textContent = person?.email || "";
}
function cloudRecordsChanged() {
  shifts = readArray(shiftStorageKey).filter((s) =>
    s && validDay(s.date) && ["main", "taltap"].includes(s.type) &&
    Number.isFinite(s.hours) && s.hours > 0 && s.hours <= 24);
  payments = readArray(paymentStorageKey).filter((p) =>
    p && validDay(p.date) && typeof p.workMonth === "string" &&
    Number.isFinite(p.amount) && p.amount > 0);
  renderCalendar();
  refreshDebts();
}
$("#cloud-access").addEventListener("click", () => cloudDialog.showModal());
$("#cloud-close").addEventListener("click", () => cloudDialog.close());
$("#cloud-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  cloudMessage.textContent = "Signing in…";
  try {
    await signIn($("#cloud-email").value.trim(), $("#cloud-password").value);
    cloudMessage.textContent = "Signed in. Your records are syncing.";
    $("#cloud-password").value = "";
  } catch (error) { cloudMessage.textContent = error.message; }
});
$("#cloud-register").addEventListener("click", async () => {
  const form = $("#cloud-form");
  if (!form.reportValidity()) return;
  cloudMessage.textContent = "Creating account…";
  try {
    cloudMessage.textContent = await signUp($("#cloud-email").value.trim(), $("#cloud-password").value);
    $("#cloud-password").value = "";
  } catch (error) { cloudMessage.textContent = error.message; }
});
$("#cloud-signout").addEventListener("click", async () => {
  try {
    await signOut();
    cloudMessage.textContent = "Signed out. Existing local records are still stored on this device.";
  } catch (error) { cloudMessage.textContent = error.message; }
});
$("#cloud-sync-now").addEventListener("click", () => void synchronize());
void initializeCloud({
  onChange: cloudRecordsChanged,
  onStatus: showCloudStatus,
  onUser: cloudUserChanged
});
