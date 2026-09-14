import { initialWedding } from "./data.js";
import { api, configured } from "./api.js";
import { albumState } from "./album.js";
import {
  escapeHTML,
  safeURL,
  formatDate,
  countdown,
  calendarFile,
  download,
  notify,
} from "./utils.js";
let wedding = { ...initialWedding };
const params = new URLSearchParams(location.search);
const isDraft = params.has("preview");
const fragment = new URLSearchParams(location.hash.slice(1));
let guestCode = fragment.get("codigo") || "";
if (guestCode) {
  history.replaceState(
    null,
    "",
    location.pathname + location.search + "#recuerdos",
  );
  document.querySelector("#album-dialog").showModal();
}
const invitationAction = location.hash === "#cancion"
  ? "song-dialog"
  : location.hash === "#recuerdos"
    ? "album-dialog"
    : "";
function render() {
  document
    .querySelectorAll("[data-text]")
    .forEach((el) => (el.textContent = wedding[el.dataset.text] || ""));
  const parts = wedding.names.split(/\s+y\s+/i);
  const title = document.querySelector("#couple-names");
  if (parts.length === 2)
    title.innerHTML = `${escapeHTML(parts[0])} <span>y</span> ${escapeHTML(parts[1])}`;
  else title.textContent = wedding.names;
  document.title = wedding.names + " · Nos casamos";
  document.querySelector("#wedding-date").textContent = formatDate(
    wedding.ceremonyAt,
    { day: "numeric", month: "long", year: "numeric" },
  );
  for (const key of ["ceremony", "party"]) {
    document.querySelector(`#${key}-time`).textContent =
      formatDate(wedding[key + "At"], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }) + " h";
    const link = document.querySelector(`#${key}-map`);
    const url = safeURL(wedding[key + "Map"]);
    link.hidden = !url;
    if (url) link.href = url;
  }
  const gifts = wedding.showGifts && Boolean(wedding.giftAlias.trim());
  document.querySelector("#regalos").hidden = !gifts;
  document.querySelector('[data-nav="gifts"]').hidden = !gifts;
  document.querySelector("#recuerdos").hidden = !wedding.showAlbum;
  document.querySelector('[data-nav="album"]').hidden = !wedding.showAlbum;
  document.querySelector("#mensajes").hidden = !wedding.showMessages;
  const sharedMap = document.querySelector("#shared-map");
  const sharedURL = safeURL(wedding.sharedMap);
  sharedMap.hidden = !sharedURL;
  if (sharedURL) sharedMap.href = sharedURL;
  renderAlbum();
  const dress = document.querySelector("#dress-code");
  dress.hidden = !wedding.dressCode;
  dress.textContent = "Vestimenta: " + wedding.dressCode;
  const contact = document.querySelector("#contact-block");
  const phone = wedding.contactPhone.replace(/\D/g, "");
  contact.hidden = !phone;
  if (phone) {
    document.querySelector("#contact-link").href = "https://wa.me/" + phone;
    document.querySelector("#contact-link").textContent =
      "Escribir a " + (wedding.contactName || "la pareja") + " por WhatsApp ↗";
    document.querySelector("#response-copy").textContent =
      "Avisanos si nos acompañás antes del " +
      formatDate(wedding.responseDeadline + "T12:00:00-03:00", {
        day: "numeric",
        month: "long",
      }) +
      ".";
  }
  updateCountdown();
}
function renderAlbum() {
  const state = albumState(wedding);
  const external = document.querySelector("#album-external");
  const internal = document.querySelector("#album-form");
  const description = document.querySelector("#album-instructions");
  const link = document.querySelector("#album-external-link");
  internal.hidden = state.kind !== "supabase";
  external.hidden = state.kind === "supabase";
  link.hidden = state.kind !== "google_forms";
  link.removeAttribute("href");
  if (state.kind === "google_forms") {
    description.textContent =
      "Compartí tus fotos y videos en nuestro formulario. Los archivos quedan en un espacio privado, sin acceso a los recuerdos de otros invitados.";
    document.querySelector("#album-external-note").textContent =
      "Para subir archivos necesitás iniciar sesión en Google. El formulario te indicará el tamaño y la cantidad permitidos.";
    link.href = state.url;
  } else if (state.kind === "pending") {
    description.textContent =
      "Estamos preparando el álbum para el día de la boda.";
    document.querySelector("#album-external-note").textContent =
      "Volvé a esta sección más adelante: acá vas a encontrar el enlace para compartir tus recuerdos.";
  } else if (state.kind === "closed") {
    description.textContent =
      "El plazo para compartir recuerdos finalizó. ¡Gracias por acompañarnos!";
    document.querySelector("#album-external-note").textContent =
      "Si te quedó algún recuerdo por compartir, contactá a la pareja.";
  } else {
    description.textContent =
      "Fotos hasta 8 MB; videos hasta 25 MB. Se envían de a uno. El espacio es compartido y limitado.";
  }
}
function updateCountdown() {
  const values = countdown(wedding.ceremonyAt);
  document
    .querySelectorAll("#countdown strong")
    .forEach((el, i) => (el.textContent = String(values[i]).padStart(2, "0")));
  if (new Date(wedding.ceremonyAt) <= new Date())
    document.querySelector("#countdown-title").textContent =
      "Llegó nuestro gran día";
}
render();
if (invitationAction) {
  if (invitationAction === "album-dialog") renderAlbum();
  document.getElementById(invitationAction).showModal();
}
setInterval(updateCountdown, 1000);
document.querySelector("#preview-banner").hidden = configured && !isDraft;
document.querySelectorAll("[data-open]").forEach((button) =>
  button.addEventListener("click", () => {
    if (button.dataset.open === "album-dialog") renderAlbum();
    document.getElementById(button.dataset.open).showModal();
  }),
);
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
document.querySelectorAll('input[name="code"]').forEach((input) => {
  input.value = guestCode;
  input.addEventListener("input", () => {
    guestCode = input.value;
    document.querySelectorAll('input[name="code"]').forEach((other) => {
      if (other !== input) other.value = guestCode;
    });
  });
});
document.querySelector("#calendar-download").addEventListener("click", () => {
  download(
    calendarFile(wedding),
    "Carli-y-Fer.ics",
    "text/calendar;charset=utf-8",
  );
  notify(
    "Abrí el archivo descargado y aceptá agregar los dos eventos en tu calendario.",
  );
});
document.querySelector("#copy-alias").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(wedding.giftAlias);
    notify("Alias copiado.");
  } catch {
    notify(
      "No se pudo copiar automáticamente. Seleccioná el alias para copiarlo.",
      true,
    );
  }
});
for (const id of ["album-form", "message-form", "song-form"]) {
  const form = document.getElementById(id);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const result = form.querySelector(".form-result");
    if (!configured || isDraft) {
      result.textContent =
        "Esta es una vista previa. Todavía no se reciben envíos.";
      return;
    }
    const data = new FormData(form);
    const file = data.get("file");
    if (file instanceof File) {
      const limit = file.type.startsWith("video/") ? 25 : 8;
      if (file.size > limit * 1024 * 1024) {
        result.textContent = `El archivo supera los ${limit} MB. Elegí uno más pequeño.`;
        return;
      }
      if (new Date() >= new Date(wedding.albumClosesAt)) {
        result.textContent = "El plazo para compartir recuerdos finalizó.";
        return;
      }
    }
    button.disabled = true;
    result.textContent = file
      ? "Enviando archivo… mantené abierta esta ventana."
      : "Enviando…";
    try {
      await api.submit(data);
      result.textContent = file
        ? "Recibimos tu recuerdo. ¡Gracias por compartirlo!"
        : id === "song-form"
          ? "¡Gracias! Ya sumamos tu sugerencia."
          : "¡Gracias! La pareja revisará tu mensaje antes de mostrarlo.";
      form.reset();
      form.elements.code.value = guestCode;
    } catch (error) {
      result.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

async function hydrate() {
  if (configured) {
    try {
      const live = await api.wedding();
      if (live) {
        wedding = { ...wedding, ...live };
        render();
      }
    } catch {
      notify(
        "No pudimos actualizar la información. Intentá recargar la página en unos minutos.",
        true,
      );
    }
  }
  if (isDraft) {
    try {
      if (!(await api.isAdmin())) throw new Error();
      const rows = await api.privateRows(
        "wedding_draft",
        "id=eq.1&select=data",
      );
      if (rows[0]) {
        wedding = { ...wedding, ...rows[0].data };
        render();
        document.querySelector("#preview-banner").textContent =
          "Vista previa del borrador · los cambios todavía no están publicados.";
      }
    } catch {
      notify("Ingresá al panel para ver el borrador.", true);
    }
  }
  if (configured && wedding.showMessages) {
    try {
      const rows = await api.approvedMessages();
      document.querySelector("#approved-messages").innerHTML = rows
        .filter((r) => r.message)
        .map(
          (r) =>
            `<blockquote><p>“${escapeHTML(r.message)}”</p><cite>${escapeHTML(r.name)}</cite></blockquote>`,
        )
        .join("");
    } catch {
      /* no invented public messages */
    }
  }
}
void hydrate();

const backgroundMusic = document.querySelector("#background-music");
const musicToggle = document.querySelector("#music-toggle");

function updateMusicButton() {
  const playing = !backgroundMusic.paused;

  musicToggle.classList.toggle("is-playing", playing);

  musicToggle.textContent = playing ? "❚❚" : "♫";

  musicToggle.setAttribute(
    "aria-label",
    playing ? "Pausar música" : "Reproducir música",
  );

  musicToggle.title = playing ? "Pausar música" : "Reproducir música";
}

async function playMusicSafely() {
  if (!backgroundMusic.paused) return;

  try {
    await backgroundMusic.play();
    updateMusicButton();
    return true;
  } catch {
    // Keep the manual control visible and usable if autoplay is rejected.
    musicToggle.hidden = false;
    updateMusicButton();
    return false;
  }
}

export function tryPlayMusic() {
  return playMusicSafely();
}

musicToggle.addEventListener("click", async (event) => {
  event.stopPropagation();

  if (backgroundMusic.paused) {
    await playMusicSafely();
  } else {
    backgroundMusic.pause();
    updateMusicButton();
  }
});

backgroundMusic.addEventListener("play", updateMusicButton);
backgroundMusic.addEventListener("pause", updateMusicButton);

updateMusicButton();
