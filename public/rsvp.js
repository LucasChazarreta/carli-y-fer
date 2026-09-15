import { api, configured } from "./api.js";
import { escapeHTML as h } from "./utils.js";
import { invitationToken, saveProof } from "./invitation-session.js";
const form = document.querySelector("#rsvp-form"),
  status = document.querySelector("#rsvp-status"),
  people = document.querySelector("#rsvp-people");
const token = invitationToken();
let snapshot = null,
  busy = false,
  attempt = null;
async function load() {
  if (!configured || !token) {
    status.textContent =
      "Para responder, abrí el enlace personal que te compartió la pareja.";
    return;
  }
  status.textContent = "Buscando tu invitación…";
  try {
    snapshot = await api.resolveInvitation(token);
    saveProof(snapshot);
    document.querySelector("#invitation-name").textContent =
      snapshot.displayName;
    document.querySelector("#personal-welcome").hidden = false;
    people.innerHTML = snapshot.guests
      .map(
        (g) =>
          `<fieldset class="rsvp-person"><legend>${h(g.name)}</legend><div class="answer-options"><label><input type="radio" name="${h(g.key)}" value="confirmed" ${g.status === "confirmed" ? "checked" : ""}> Sí, asistiré</label><label><input type="radio" name="${h(g.key)}" value="declined" ${g.status === "declined" ? "checked" : ""}> No podré asistir</label></div></fieldset>`,
      )
      .join("");
    form.hidden = false;
    status.textContent = `Podés responder por cada persona y modificarlo hasta el ${snapshot.deadline.split("-").reverse().join("/")}.`;
    const until = new Date(snapshot.deadline + "T23:59:59-03:00");
    form.querySelector('button[type="submit"]').disabled =
      Date.now() > until.getTime();
    if (Date.now() > until.getTime())
      status.textContent =
        "El plazo para responder finalizó. Si necesitás un cambio, contactá a la pareja.";
    document.querySelector("#confirmed-access").hidden = !snapshot.confirmed;
  } catch (error) {
    status.textContent = error.message;
    form.hidden = true;
    saveProof({});
  }
}
document.querySelector("#refresh-rsvp").onclick = () => {
  attempt = null;
  void load();
};
form.addEventListener("input", () => {
  attempt = null;
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !snapshot) return;
  const answers = [...new FormData(form)].map(([key, status]) => ({
    key,
    status,
  }));
  if (!answers.length) {
    status.textContent = "Elegí la respuesta de al menos una persona.";
    return;
  }
  attempt ||= {
    requestId: crypto.randomUUID(),
    revision: snapshot.revision,
    answers,
  };
  busy = true;
  [...form.elements].forEach((c) => (c.disabled = true));
  status.textContent = "Guardando sus respuestas…";
  try {
    const result = await api.rsvp(token, attempt);
    snapshot = result;
    attempt = null;
    saveProof(result);
    if (result.confirmed) {
      status.textContent = "¡Respuestas guardadas!";
      try {
        if (sessionStorage.getItem("cf-rsvp-proof")) {
          location.assign(new URL("confirmados/", location.href).href);
          return;
        }
      } catch {
        /* stay on this page when session storage is unavailable */
      }
      status.textContent =
        "¡Respuestas guardadas! Ya pueden dejar mensajes y compartir recuerdos desde esta página.";
      return;
    }
    status.textContent = result.guests.every((g) => g.status === "declined")
      ? "Gracias por avisarnos. Vamos a extrañarlos. Pueden cambiar su respuesta desde este mismo enlace hasta la fecha límite."
      : "Respuestas guardadas. Las personas sin respuesta siguen pendientes.";
    document.querySelector("#confirmed-access").hidden = true;
  } catch (error) {
    status.textContent = error.message;
    if (error.status === 409) attempt = null;
  } finally {
    busy = false;
    [...form.elements].forEach((c) => (c.disabled = false));
  }
});
void load();
