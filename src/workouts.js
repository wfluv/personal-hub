const days = [...document.querySelectorAll(".workout-day")];
const storagePrefix = "personal-hub.workouts.";
const temporaryMarks = new Map();

function weekKey() {
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return [monday.getFullYear(), monday.getMonth() + 1, monday.getDate()].join("-");
}

function readMark(key) {
  if (temporaryMarks.has(key)) return temporaryMarks.get(key);
  try {
    return localStorage.getItem(key) === "done";
  } catch {
    return false;
  }
}

function renderWeek() {
  const week = weekKey();
  days.forEach((day, index) => {
    day.setAttribute("aria-pressed", String(readMark(storagePrefix + week + "." + index)));
  });
}

days.forEach((day, index) => {
  day.addEventListener("click", () => {
    const key = storagePrefix + weekKey() + "." + index;
    const completed = !readMark(key);
    try {
      if (completed) localStorage.setItem(key, "done");
      else localStorage.removeItem(key);
      temporaryMarks.delete(key);
    } catch {
      temporaryMarks.set(key, completed);
    }
    renderWeek();
  });
});

document.querySelector('[data-page="workouts"]').addEventListener("click", renderWeek);
window.addEventListener("pageshow", renderWeek);
window.addEventListener("storage", renderWeek);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderWeek();
});
renderWeek();
