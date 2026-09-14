import { api } from "../api.js";

const storageKey = "cf-rsvp-proof";
const validation = document.querySelector("#validation");
const content = document.querySelector("#confirmed-content");

// A proof must never remain in the address bar, referrer, or browser history.
history.replaceState(null, "", location.pathname);

function returnToRsvp() {
  sessionStorage.removeItem(storageKey);
  validation.innerHTML = "<h1>No pudimos verificar la confirmación</h1><p>Volvé a la invitación para continuar.</p>";
  window.setTimeout(() => window.location.replace("../#confirmar"), 900);
}

async function unlock() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
  } catch {
    returnToRsvp();
    return;
  }
  if (!saved?.proof || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) {
    returnToRsvp();
    return;
  }
  try {
    const result = await api.validateRsvpProof(saved.proof);
    if (!result?.ok) throw new Error("invalid");
    validation.hidden = true;
    content.hidden = false;
    content.focus?.();
  } catch {
    returnToRsvp();
  }
}

unlock();
