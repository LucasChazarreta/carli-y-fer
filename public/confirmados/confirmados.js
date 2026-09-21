import { readSession, writeSession } from "../invitation-session.js";
import { api } from "../api.js";
import { albumState, publicMemoriesURL } from "../album.js";
import { config } from "../config.js";

const storageKey = "cf-rsvp-proof";
const validation = document.querySelector("#validation");
const content = document.querySelector("#confirmed-content");
let confirmedProof = "";

function publicMemoriesTarget() {
  return publicMemoriesURL(
    config.siteUrl || new URL("../", location.href),
  );
}

function renderMemoriesQr(target) {
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

async function showMemoriesAccess() {
  const publicTarget = publicMemoriesTarget();
  const link = document.querySelector("#memories-link");
  const status = document.querySelector("#memories-status");
  renderMemoriesQr(publicTarget);

  link.hidden = true;
  link.removeAttribute("href");
  link.removeAttribute("target");
  status.textContent = "Estamos cargando el acceso a los recuerdos…";

  try {
    const wedding = await api.wedding();
    if (!wedding) throw new Error("missing settings");
    const state = albumState(wedding);

    if (state.kind === "google_forms") {
      link.href = state.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir formulario de recuerdos ↗";
      link.hidden = false;
      status.textContent =
        "Podés subir fotos y videos hasta el 1 de noviembre, inclusive.";
      return;
    }

    if (state.kind === "supabase") {
      link.href = publicTarget;
      link.textContent = "Abrir recuerdos";
      link.hidden = false;
      status.textContent =
        "Podés compartir tus fotos y videos desde la sección de recuerdos.";
      return;
    }

    if (state.kind === "closed") {
      status.textContent =
        "El plazo para compartir recuerdos finalizó. ¡Gracias por acompañarnos!";
      return;
    }

    if (state.kind === "disabled") {
      status.textContent = "El álbum está desactivado temporalmente.";
      return;
    }

    status.textContent =
      "Estamos preparando el álbum. Volvé a intentarlo más adelante.";
  } catch {
    link.href = publicTarget;
    link.textContent = "Abrir recuerdos";
    link.hidden = false;
    status.textContent =
      "No pudimos cargar el acceso directo. Abrí la sección de recuerdos para volver a intentarlo.";
  }
}

function openDialog(id) {
  if (!confirmedProof) return;
  document.querySelector(id)?.showModal();
}

document
  .querySelector("#open-confirmed-message")
  ?.addEventListener("click", () => openDialog("#confirmed-message-dialog"));
document
  .querySelector("#open-confirmed-song")
  ?.addEventListener("click", () => openDialog("#confirmed-song-dialog"));
document
  .querySelector("#close-confirmed-message")
  ?.addEventListener("click", () =>
    document.querySelector("#confirmed-message-dialog")?.close(),
  );
document
  .querySelector("#close-confirmed-song")
  ?.addEventListener("click", () =>
    document.querySelector("#confirmed-song-dialog")?.close(),
  );

function setupSubmission(formId, successMessage) {
  const form = document.querySelector(formId);
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = form.querySelector(".form-result");
    const button = form.querySelector('button[type="submit"]');

    if (!confirmedProof) {
      result.textContent =
        "Tu confirmación venció. Volvé a ingresar desde tu invitación.";
      return;
    }

    const data = new FormData(form);
    data.set("proof", confirmedProof);
    button.disabled = true;
    result.textContent = "Enviando…";

    try {
      await api.submit(data);
      result.textContent = successMessage;
      form.reset();
    } catch (error) {
      result.textContent =
        error instanceof Error
          ? error.message
          : "No se pudo completar el envío.";
    } finally {
      button.disabled = false;
    }
  });
}

setupSubmission(
  "#confirmed-message-form",
  "¡Gracias! La pareja revisará tu mensaje antes de mostrarlo.",
);
setupSubmission(
  "#confirmed-song-form",
  "¡Gracias! Ya sumamos tu sugerencia.",
);

// A proof must never remain in the address bar, referrer, or browser history.
history.replaceState(null, "", location.pathname);

function returnToRsvp() {
  confirmedProof = "";
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
    confirmedProof = saved.proof;
    validation.hidden = true;
    content.hidden = false;
    content.focus?.();
    void showMemoriesAccess();
  } catch {
    returnToRsvp();
  }
}

unlock();
