// Personal Hub — Debts & Credits.
// Every debt, including its payment history, is a single cloud-synced record.
import { queueCloudDiff } from "./cloud.js?v=debts-1";

const KEY = "personal-hub:debts:v1";
const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(amount);
const cents = (amount) => Math.round((amount + Number.EPSILON) * 100);
const uid = () => "debt-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const validDate = (str) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const date = new Date(str + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === str;
};
function rigaTodayString() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Riga", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return [get("year"), get("month"), get("day")].join("-");
}
const formatDate = (str) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(str + "T00:00:00Z"));
function getStoredDebts() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(rows)) return [];
    return rows.filter((d) =>
      d && typeof d.id === "string" && typeof d.name === "string" &&
      ["debt","credit"].includes(d.type) && Number.isSafeInteger(d.totalCents) && d.totalCents > 0 &&
      Number.isSafeInteger(d.initialPaidCents) && d.initialPaidCents >= 0 &&
      Number.isSafeInteger(d.monthlyCents) && d.monthlyCents >= 0 &&
      Array.isArray(d.payments)
    );
  } catch { return []; }
}
let debts = getStoredDebts();
let currentId = null;
let editingId = null;
let ready = false;
const sumPayments = (debt) => debt.payments.reduce((sum, p) => sum + (Number.isSafeInteger(p.amountCents) ? p.amountCents : 0), 0);
const paidCents = (debt) => Math.max(0, debt.initialPaidCents + sumPayments(debt));
const remaining = (debt) => Math.max(0, debt.totalCents - paidCents(debt));
function persist(next) {
  const previous = debts;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    debts = next;
    queueCloudDiff(KEY, previous, next);
    renderDebts();
    return true;
  } catch {
    alert("Couldn't save debt data on this device.");
    return false;
  }
}
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function fieldSummary(label, value) {
  const row = node("div", "debt-detail-info");
  row.append(node("span", "", label), node("strong", "", value));
  return row;
}
export function renderDebts() {
  if (!ready) return;
  const list = $("#debts-list");
  list.replaceChildren();
  const outstanding = debts.reduce((sum, debt) => sum + remaining(debt), 0);
  const monthly = debts.reduce((sum, debt) => sum + (remaining(debt) > 0 ? debt.monthlyCents : 0), 0);
  $("#debts-remaining").textContent = money(outstanding / 100);
  $("#debts-monthly").textContent = money(monthly / 100);
  $("#debts-empty").hidden = debts.length > 0;
  for (const debt of debts) {
    const balance = remaining(debt);
    const total = debt.totalCents;
    const repaid = Math.min(total, paidCents(debt));
    const progress = Math.min(100, Math.round((repaid / total) * 10000) / 100);
    const card = node("button", "debt-card");
    card.type = "button";
    card.setAttribute("aria-label", debt.name + ", " + money(balance / 100) + " remaining. View details.");
    const top = node("div", "debt-card-top");
    const title = node("div", "debt-card-title", debt.name);
    const type = node("span", "debt-type-label", debt.type === "credit" ? "Credit" : "Debt");
    const right = node("span", "debt-progress-values", money(repaid / 100) + " / " + money(total / 100));
    const nameGroup = node("div", "debt-name-group");
    nameGroup.append(title, type);
    top.append(nameGroup, right);
    const bar = node("div", "debt-progress-track");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(progress));
    bar.setAttribute("aria-label", "Repaid percent");
    const fill = node("div", "debt-progress-fill");
    fill.style.width = progress + "%";
    bar.append(fill);
    const foot = node("div", "debt-card-bottom");
    foot.append(node("span", "", money(balance / 100) + " remaining"),
      node("span", "", money(debt.monthlyCents / 100) + " / month"));
    card.append(top, bar, foot);
    card.addEventListener("click", () => openDetails(debt.id));
    list.append(card);
  }
}
function close(id) { const dialog = $("#" + id); if (dialog.open) dialog.close(); }
function show(id) { const dialog = $("#" + id); if (!dialog.open) dialog.showModal(); }
function clearErrors() {
  $("#debt-error").textContent = "";
  $("#debt-payment-error").textContent = "";
}
function openEditor(id = null) {
  editingId = id;
  const debt = debts.find((d) => d.id === id);
  $("#debt-editor-title").textContent = debt ? "Edit debt" : "Add debt";
  $("#debt-name").value = debt?.name || "";
  $("#debt-type").value = debt?.type || "credit";
  $("#debt-total").value = debt ? (debt.totalCents / 100).toFixed(2) : "";
  $("#debt-already-paid").value = debt ? (debt.initialPaidCents / 100).toFixed(2) : "0";
  $("#debt-monthly-payment").value = debt ? (debt.monthlyCents / 100).toFixed(2) : "0";
  $("#debt-delete").hidden = !debt;
  clearErrors();
  show("debt-editor");
}
function openDetails(id) {
  currentId = id;
  const debt = debts.find((d) => d.id === id);
  if (!debt) return;
  $("#debt-details-title").textContent = debt.name;
  const body = $("#debt-details-body");
  body.replaceChildren();
  body.append(fieldSummary("Remaining", money(remaining(debt) / 100)));
  body.append(fieldSummary("Originally", money(debt.totalCents / 100)));
  body.append(fieldSummary("Already paid before tracking", money(debt.initialPaidCents / 100)));
  body.append(fieldSummary("Monthly payment", money(debt.monthlyCents / 100)));
  const historyTitle = node("h3", "debt-history-title", "Payment history");
  body.append(historyTitle);
  if (!debt.payments.length) body.append(node("p", "debt-history-empty", "No payments recorded yet."));
  [...debt.payments].sort((a,b) => b.date.localeCompare(a.date)).forEach((payment) => {
    const row = node("div", "debt-history-row");
    const left = node("div", "debt-history-info");
    left.append(node("strong", "", money(payment.amountCents / 100)), node("small", "", formatDate(payment.date)));
    const remove = node("button", "debt-history-remove", "×");
    remove.type = "button";
    remove.title = "Delete payment";
    remove.setAttribute("aria-label", "Delete payment from " + formatDate(payment.date));
    remove.addEventListener("click", () => {
      if (!confirm("Delete this payment?")) return;
      const next = debts.map((d) => d.id === debt.id ? { ...d, payments: d.payments.filter(p => p.id !== payment.id) } : d);
      if (persist(next)) openDetails(id);
    });
    row.append(left, remove);
    body.append(row);
  });
  show("debt-details");
}
function openPayment() {
  const debt = debts.find((d) => d.id === currentId);
  if (!debt) return;
  $("#debt-payment-title").textContent = "Pay " + debt.name;
  $("#debt-payment-date").value = rigaTodayString();
  $("#debt-payment-amount").value = "";
  clearErrors();
  close("debt-details");
  show("debt-payment-dialog");
}
export function initDebts() {
  if (ready) return;
  ready = true;
  $("#debt-add").addEventListener("click", () => openEditor());
  document.querySelectorAll("[data-close-debt]").forEach((button) =>
    button.addEventListener("click", () => close(button.dataset.closeDebt)));
  $("#debt-edit-action").addEventListener("click", () => { close("debt-details"); openEditor(currentId); });
  $("#debt-pay-action").addEventListener("click", openPayment);
  $("#debt-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#debt-name").value.trim();
    const totalCents = cents(Number($("#debt-total").value));
    const initialPaidCents = cents(Number($("#debt-already-paid").value));
    const monthlyCents = cents(Number($("#debt-monthly-payment").value));
    const current = debts.find((d) => d.id === editingId);
    const existingPayments = current ? sumPayments(current) : 0;
    if (!name || !Number.isSafeInteger(totalCents) || totalCents < 1 ||
        !Number.isSafeInteger(initialPaidCents) || initialPaidCents < 0 ||
        !Number.isSafeInteger(monthlyCents) || monthlyCents < 0 ||
        initialPaidCents + existingPayments > totalCents) {
      $("#debt-error").textContent = "Check the amounts: total must cover all payments.";
      return;
    }
    const entry = {
      id: current?.id || uid(), name, type: $("#debt-type").value,
      totalCents, initialPaidCents, monthlyCents,
      payments: current?.payments || []
    };
    if (persist(current ? debts.map((d) => d.id === current.id ? entry : d) : [...debts, entry]))
      close("debt-editor");
  });
  $("#debt-delete").addEventListener("click", () => {
    if (!editingId || !confirm("Delete this debt and its payment history?")) return;
    if (persist(debts.filter((d) => d.id !== editingId))) close("debt-editor");
  });
  $("#debt-payment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const debt = debts.find((d) => d.id === currentId);
    if (!debt) return;
    const date = $("#debt-payment-date").value;
    const amountCents = cents(Number($("#debt-payment-amount").value));
    if (!validDate(date) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > remaining(debt)) {
      $("#debt-payment-error").textContent = "Enter a valid payment no larger than the remaining balance.";
      return;
    }
    const entry = { id: uid(), date, amountCents };
    const next = debts.map((d) => d.id === debt.id ? { ...d, payments: [...d.payments, entry] } : d);
    if (persist(next)) { close("debt-payment-dialog"); openDetails(debt.id); }
  });
  ["debt-editor","debt-details","debt-payment-dialog"].forEach((id) => {
    const dialog = $("#" + id);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(id); });
  });
  renderDebts();
}
export function refreshDebts() {
  debts = getStoredDebts();
  renderDebts();
}
