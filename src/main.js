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
