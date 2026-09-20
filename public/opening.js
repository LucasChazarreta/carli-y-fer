import { tryPlayMusic } from "./app.js";

const STORAGE_KEY = "cf-invitation-opened";
const root = document.documentElement;
const opening = document.querySelector("#opening");
const openButton = document.querySelector("#opening-button");
const focusTarget = document.querySelector("#couple-names");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let isOpening = false;

function wasOpened() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function rememberOpening() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

function finishOpening({ moveFocus = true } = {}) {
  opening.hidden = true;
  root.classList.remove("opening-pending", "opening-active");
  root.classList.add("invitation-open");
  if (moveFocus) focusTarget.focus({ preventScroll: true });
}

function waitForOpeningAnimation() {
  const duration = reducedMotion ? 250 : 2200;

  return new Promise((resolve) => {
    let timer;
    const finish = () => {
      clearTimeout(timer);
      opening.removeEventListener("animationend", onAnimationEnd);
      resolve();
    };
    const onAnimationEnd = (event) => {
      if (event.target === opening && event.animationName === "opening-dismiss") {
        finish();
      }
    };

    opening.addEventListener("animationend", onAnimationEnd);
    timer = setTimeout(finish, duration);
  });
}

async function openInvitation() {
  if (isOpening) return;
  isOpening = true;
  openButton.disabled = true;
  rememberOpening();

  // This remains inside the trusted click/keyboard activation call stack.
  void tryPlayMusic();
  root.classList.add("opening-active");
  opening.classList.add("is-opening");

  await waitForOpeningAnimation();
  finishOpening();
}

if (wasOpened()) {
  finishOpening({ moveFocus: false });
} else {
  openButton.addEventListener("click", openInvitation, { once: true });
}
