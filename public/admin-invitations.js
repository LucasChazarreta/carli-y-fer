import { api } from "./api.js";
import { config } from "./config.js";
import { escapeHTML as h, csvText, download, notify } from "./utils.js";
import { invitationURL, shareInvitation } from "./invitation-links.js";
const labels = {
  pending: "Pendiente",
  confirmed: "Asiste",
  declined: "No asiste",
};
const $ = (s) => document.querySelector(s);
export function initInvitations(confirmAction) {
  let invitations = [],
    editing = null,
    linkURL = "",
    qrSVG = "",
    loading = false;
  const form = $("#invitation-form"),
    dialog = $("#invitation-dialog");
  function filteredGuests() {
    const q = $("#guest-search").value.toLocaleLowerCase(),
      status = $("#guest-filter").value,
      menu = $("#menu-filter").value.toLocaleLowerCase();
    return invitations
      .flatMap((i) =>
        i.guests.map((g) => ({ ...g, group_name: i.display_name })),
      )
      .filter(
        (g) =>
          (g.name + " " + g.group_name).toLocaleLowerCase().includes(q) &&
          (!status || g.status === status) &&
          g.dietary.toLocaleLowerCase().includes(menu),
      );
  }
  function render() {
    const all = invitations.flatMap((i) => i.guests),
      visible = new Set(filteredGuests().map((g) => g.id));
    $("#guest-stats").innerHTML = [
      ["Invitaciones", invitations.length],
      ["Personas", all.length],
      ["Asisten", all.filter((g) => g.status === "confirmed").length],
      ["Pendientes", all.filter((g) => g.status === "pending").length],
    ]
      .map(
        ([label, n]) =>
          `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`,
      )
      .join("");
    $("#invitation-list").innerHTML = invitations
      .filter((i) => i.guests.some((g) => visible.has(g.id)))
      .map((i) => {
        const yes = i.guests.filter((g) => g.status === "confirmed").length,
          pending = i.guests.filter((g) => g.status === "pending").length;
        return `<article class="invitation-card"><div class="invitation-card-heading"><div><h3>${h(i.display_name)}</h3><p>${i.guests.length} ${i.guests.length === 1 ? "persona" : "personas"} · ${yes} de ${i.guests.length} confirmados</p></div><span class="tag ${yes ? "confirmed" : "pending"}">${i.revoked_at ? "Enlace revocado" : pending ? "Con pendientes" : yes === i.guests.length ? "Todos confirmados" : yes ? "Confirmación parcial" : "No asistirán"}</span></div><ul class="invitation-members">${i.guests.map((g) => `<li><span>${h(g.name)}</span><span class="tag ${g.status}">${labels[g.status]}</span></li>`).join("")}</ul><div class="button-row left">${["Compartir", "Copiar enlace", "QR", "Vista previa", "Editar", "Regenerar", "Revocar"].map((label, n) => `<button class="${n === 0 ? "button" : "table-action"}" data-invitation="${i.id}" data-command="${["share", "copy", "qr", "preview", "edit", "rotate", "revoke"][n]}" ${i.revoked_at && n < 4 ? "disabled" : ""}>${label}</button>`).join("")}</div></article>`;
      })
      .join("");
    $("#guest-empty").hidden = !!$("#invitation-list").children.length;
    $("#guest-empty").textContent = invitations.length
      ? "No hay invitaciones con esos filtros."
      : "Empiecen creando una invitación y agregando las personas incluidas.";
  }
  async function load() {
    if (loading) return;
    loading = true;
    try {
      invitations = await api.privateRows(
        "invitations",
        "select=id,display_name,revision,revoked_at,guests(id,name,status,dietary,notes,updated_at)&order=created_at.desc",
      );
      render();
    } finally {
      loading = false;
    }
  }
  function personRow(g = {}) {
    const row = document.createElement("fieldset");
    row.className = "person-editor";
    row.dataset.id = g.id || "";
    row.innerHTML = `<legend>Persona invitada</legend><label>Nombre y apellido<input data-field="name" value="${h(g.name || "")}" maxlength="120" required></label><label>Respuesta<select data-field="status">${Object.entries(
      labels,
    )
      .map(
        ([v, label]) =>
          `<option value="${v}" ${g.status === v ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><details><summary>Alimentación y observaciones privadas</summary><label>Alimentación<input data-field="dietary" maxlength="160" value="${h(g.dietary || "")}"></label><label>Observaciones<textarea data-field="notes" maxlength="500">${h(g.notes || "")}</textarea></label></details><button type="button" class="table-action danger" data-remove-person>Quitar persona</button>`;
    $("#invitation-people").append(row);
  }
  function edit(i = null) {
    editing = i;
    form.reset();
    form.elements.display_name.value = i?.display_name || "";
    $("#invitation-people").replaceChildren();
    (i?.guests || [{}]).forEach(personRow);
    $("#invitation-dialog-title").textContent = i
      ? "Editar invitación"
      : "Nueva invitación";
    $("#save-invitation").textContent = i
      ? "Guardar cambios"
      : "Crear invitación";
    form.querySelector(".form-result").textContent = "";
    dialog.showModal();
  }
  async function showLink(i, token, command = "link") {
    linkURL = invitationURL(config.siteUrl, token);
    $("#invitation-link").value = linkURL;
    $("#link-title").textContent = i.display_name;
    $("#invitation-preview").href = linkURL;
    const qr = window.qrcode(0, "M");
    qr.addData(linkURL);
    qr.make();
    $("#invitation-qr").innerHTML = qr.createSvgTag({
      cellSize: 5,
      margin: 4,
      scalable: true,
    });
    const svg = $("#invitation-qr svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR personal de " + i.display_name);
    qrSVG = svg.outerHTML;
    $("#link-dialog").showModal();
    if (command === "copy") await copy();
    if (command === "share") await share();
    if (command === "preview") $("#invitation-preview").focus();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(linkURL);
      notify("Enlace copiado.");
    } catch {
      $("#invitation-link").select();
      notify("Seleccioná y copiá el enlace que aparece en pantalla.");
    }
  }
  async function share() {
    try {
      const result = await shareInvitation(linkURL);
      if (result === "copied") notify("Enlace copiado para compartir.");
    } catch {
      await copy();
    }
  }
  $("#copy-invitation-link").onclick = copy;
  $("#share-invitation-link").onclick = share;
  $("#download-invitation-qr").onclick = () =>
    download(qrSVG, "Carli-y-Fer-invitacion-QR.svg", "image/svg+xml");
  $("#new-invitation").onclick = () => edit();
  $("#add-invitation-person").onclick = () => personRow();
  $("#invitation-people").onclick = (e) => {
    if (e.target.closest("[data-remove-person]")) {
      if ($("#invitation-people").children.length <= 1) {
        notify("Cada invitación debe incluir al menos una persona.", true);
        return;
      }
      e.target.closest("fieldset").remove();
    }
  };
  for (const id of ["guest-search", "guest-filter", "menu-filter"])
    $("#" + id).addEventListener("input", render);
  $("#refresh-guests").onclick = () =>
    load().catch((e) => notify(e.message, true));
  $("#invitation-list").onclick = async (e) => {
    const b = e.target.closest("[data-command]");
    if (!b) return;
    const i = invitations.find((i) => i.id === b.dataset.invitation),
      command = b.dataset.command;
    if (command === "edit") {
      edit(i);
      return;
    }
    b.disabled = true;
    try {
      if (command === "revoke" || command === "rotate") {
        if (
          !(await confirmAction(
            command === "revoke"
              ? "¿Revocar el enlace? Dejará de permitir respuestas y acceso, sin borrar personas ni confirmaciones."
              : "¿Generar un enlace nuevo? El anterior dejará de funcionar y tendrán que compartir el nuevo.",
          ))
        )
          return;
        const result = await api.invitationAdmin({
          action: command,
          id: i.id,
          revision: i.revision,
        });
        await load();
        if (result.token) await showLink(i, result.token);
        else notify("Enlace revocado.");
      } else {
        const { token } = await api.invitationAdmin({
          action: "link",
          id: i.id,
        });
        await showLink(i, token, command);
      }
    } catch (error) {
      notify(error.message, true);
    } finally {
      b.disabled = false;
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = $("#save-invitation");
    if (b.disabled) return;
    b.disabled = true;
    try {
      const guests = [...$("#invitation-people").children].map((row) => ({
        id: row.dataset.id || null,
        ...Object.fromEntries(
          [...row.querySelectorAll("[data-field]")].map((input) => [
            input.dataset.field,
            input.value.trim(),
          ]),
        ),
      }));
      const result = await api.invitationAdmin({
        action: "save",
        id: editing?.id,
        revision: editing?.revision,
        name: form.elements.display_name.value.trim(),
        guests,
      });
      dialog.close();
      await load();
      notify("Invitación guardada.");
      if (result.token)
        await showLink(
          invitations.find((i) => i.id === result.id),
          result.token,
        );
    } catch (error) {
      form.querySelector(".form-result").textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  $("#export-guests").onclick = () =>
    download(
      csvText([
        [
          "Invitación",
          "Persona",
          "Respuesta",
          "Alimentación",
          "Observaciones",
          "Actualizado",
        ],
        ...filteredGuests().map((g) => [
          g.group_name,
          g.name,
          labels[g.status],
          g.dietary,
          g.notes,
          g.updated_at,
        ]),
      ]),
      "Carli-y-Fer-invitados.csv",
      "text/csv;charset=utf-8",
    );
  setInterval(() => {
    if (
      !document.hidden &&
      !$("#dashboard").hidden &&
      !$("#view-guests").hidden &&
      !dialog.open
    )
      void load().catch(() => {});
  }, 30000);
  return { load, filteredGuests };
}
