import { api, configured } from "./api.js";

const form = document.querySelector("#rsvp-form");
const panel = document.querySelector("#rsvp-panel");
const status = document.querySelector("#rsvp-status");

if (form) {
  let submitting = false;
  for (const control of form.elements) control.disabled = !configured;
  if (!configured)
    status.textContent = "Las confirmaciones todavía no están habilitadas.";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const submitter = event.submitter;
    const response = submitter?.value;
    if (response !== "confirmed" && response !== "declined") return;
    submitting = true;
    const controls = [...form.elements];
    controls.forEach((control) => (control.disabled = true));
    status.textContent = "Registrando tu respuesta…";
    try {
      const result = await api.rsvp(form.name.value, form.code.value, response);
      if (response === "confirmed") {
        sessionStorage.setItem("cf-rsvp-proof", JSON.stringify({
          proof: result.proof,
          expiresAt: Date.now() + result.expiresIn * 1000,
        }));
        status.textContent = "¡Asistencia confirmada! Te llevamos al siguiente paso.";
        window.location.assign("/confirmados/");
        return;
      }
      panel.innerHTML = `<div class="rsvp-thanks" role="status"><p class="eyebrow">Respuesta registrada</p><h3>Gracias por avisarnos.</h3><p>Vamos a extrañarte, y agradecemos que hayas respondido.</p></div>`;
    } catch (error) {
      status.textContent = error.message;
      controls.forEach((control) => (control.disabled = false));
      submitting = false;
    }
  });
}
