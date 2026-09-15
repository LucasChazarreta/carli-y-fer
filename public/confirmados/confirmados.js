import { readSession, writeSession } from "../invitation-session.js";
import { api } from "../api.js";
import { publicMemoriesURL } from "../album.js";
import { config } from "../config.js";

const storageKey = "cf-rsvp-proof";
const validation = document.querySelector("#validation");
const content = document.querySelector("#confirmed-content");

function showMemoriesAccess() {
  const target = publicMemoriesURL(
    config.siteUrl || new URL("../", location.href),
  );
  const link = document.querySelector("#memories-link");
  link.href = target;
  try {
    const qr = window.qrcode(0, "M");
    qr.addData(target);
    qr.make();
    const output = document.querySelector("#memories-qr");
    output.innerHTML = qr.createSvgTag({
      cellSize: 5,
      margin: 4,
      scalable: true,
    });
    const svg = output.querySelector("svg");
    const title = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title",
    );
    title.id = "memories-qr-title";
    title.textContent = "Código QR para abrir los recuerdos de Carli y Fer";
    const description = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "desc",
    );
    description.id = "memories-qr-description";
    description.textContent =
      "Escanealo para abrir la sección pública de fotos y videos.";
    svg.prepend(description);
    svg.prepend(title);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-labelledby", `${title.id} ${description.id}`);
  } catch {
    document.querySelector("#memories-qr").textContent =
      "No pudimos generar el QR. Usá el enlace que aparece debajo.";
  }
}

// A proof must never remain in the address bar, referrer, or browser history.
history.replaceState(null, "", location.pathname);

function returnToRsvp() {
  writeSession(storageKey, null);
  validation.innerHTML =
    "<h1>No pudimos verificar la confirmación</h1><p>Volvé a la invitación para continuar.</p>";
  window.setTimeout(() => window.location.replace("../#confirmar"), 900);
}

async function unlock() {
  let saved;
  try {
    saved = JSON.parse(readSession(storageKey) || "null");
  } catch {
    returnToRsvp();
    return;
  }
  if (
    !saved?.proof ||
    !Number.isFinite(saved.expiresAt) ||
    saved.expiresAt <= Date.now()
  ) {
    returnToRsvp();
    return;
  }
  try {
    const result = await api.validateRsvpProof(saved.proof);
    if (!result?.ok) throw new Error("invalid");
    validation.hidden = true;
    content.hidden = false;
    content.focus?.();
    showMemoriesAccess();
  } catch {
    returnToRsvp();
  }
}

unlock();
