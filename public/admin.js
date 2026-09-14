import { api, configured } from "./api.js";
import { initialWedding } from "./data.js";
import { config } from "./config.js";
import { googleFormURL, publicMemoriesURL } from "./album.js";
import {
  escapeHTML as h,
  csvText,
  download,
  notify,
  safeURL,
  formatDate,
} from "./utils.js";
let guests = [],
  inbox = [],
  memories = [],
  draft = { ...initialWedding },
  draftVersion = null,
  currentView = "guests";
let qrSVG = "";
const labels = {
  pending: "Pendiente",
  confirmed: "Asiste",
  declined: "No asiste",
};
const $ = (s) => document.querySelector(s);
async function action(fn) {
  try {
    await fn();
  } catch (e) {
    notify(e.message, true);
  }
}
function confirmAction(message) {
  const dialog = $("#confirm-dialog");
  $("#confirm-text").textContent = message;
  return new Promise((resolve) => {
    const done = (value) => {
      dialog.close();
      $("#confirm-yes").onclick = null;
      $("#confirm-no").onclick = null;
      dialog.oncancel = null;
      resolve(value);
    };
    $("#confirm-yes").onclick = () => done(true);
    $("#confirm-no").onclick = () => done(false);
    dialog.oncancel = (e) => {
      e.preventDefault();
      done(false);
    };
    dialog.showModal();
  });
}
$("#setup-note").hidden = configured;
$("#login-form button").disabled = !configured;
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const b = form.querySelector("button");
  b.disabled = true;
  try {
    await api.signIn(form.email.value.trim(), form.password.value);
    form.reset();
    await enter();
  } catch (err) {
    form.querySelector(".form-result").textContent = err.message;
  } finally {
    b.disabled = !configured;
  }
});
async function enter() {
  if (!(await api.isAdmin()))
    throw new Error("Tu cuenta no tiene acceso a esta boda.");
  $("#login").hidden = true;
  $("#dashboard").hidden = false;
  await loadGuests();
}
$("#logout").onclick = async () => {
  try {
    await api.signOut();
  } catch {
    /* local session is still cleared */
  }
  location.reload();
};
if (configured && api.hasSession()) action(enter);
async function loadGuests() {
  guests = await api.privateRows("guests", "select=*&order=name.asc");
  renderGuests();
}
function filteredGuests() {
  const q = $("#guest-search").value.toLocaleLowerCase();
  const status = $("#guest-filter").value;
  const menu = $("#menu-filter").value.toLocaleLowerCase();
  return guests.filter(
    (g) =>
      (g.name + " " + g.group_name).toLocaleLowerCase().includes(q) &&
      (!status || g.status === status) &&
      g.dietary.toLocaleLowerCase().includes(menu),
  );
}
function renderGuests() {
  $("#guest-stats").innerHTML = [
    ["Personas cargadas", guests.length],
    ["Asisten", guests.filter((g) => g.status === "confirmed").length],
    ["Pendientes", guests.filter((g) => g.status === "pending").length],
    ["No asisten", guests.filter((g) => g.status === "declined").length],
  ]
    .map(
      ([label, n]) =>
        `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`,
    )
    .join("");
  const rows = filteredGuests();
  $("#guest-empty").hidden = rows.length > 0;
  $("#guest-empty").textContent = guests.length
    ? "No hay personas con esos filtros."
    : "Todavía no cargaron invitados.";
  $("#guest-list").innerHTML = rows
    .map(
      (g) =>
        `<tr><td>${h(g.name)}</td><td>${h(g.group_name) || "—"}</td><td><span class="tag ${h(g.status)}">${labels[g.status]}</span></td><td>${h(g.dietary) || "—"}</td><td>${h(formatDate(g.updated_at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}</td><td><button class="table-action" data-edit="${g.id}">Editar</button><button class="table-action danger" data-delete="${g.id}">Eliminar</button></td></tr>`,
    )
    .join("");
}
for (const id of ["guest-search", "guest-filter", "menu-filter"])
  $("#" + id).addEventListener("input", renderGuests);
function guestDialog(g = {}) {
  const form = $("#guest-form");
  form.reset();
  for (const key of ["id", "name", "group_name", "dietary", "notes"])
    form.elements[key].value = g[key] || "";
  form.elements.status.value = g.status || "pending";
  form.querySelector(".form-result").textContent = "";
  $("#guest-dialog-title").textContent = g.id
    ? "Editar persona"
    : "Agregar persona";
  $("#guest-dialog").showModal();
}
$("#new-guest").onclick = () => guestDialog();
$("#refresh-guests").onclick = () => action(loadGuests);
$("#guest-list").onclick = (e) =>
  action(async () => {
    const edit = e.target.closest("[data-edit]");
    if (edit) guestDialog(guests.find((g) => g.id === edit.dataset.edit));
    const del = e.target.closest("[data-delete]");
    if (del && (await confirmAction("¿Eliminar a esta persona del listado?"))) {
      await api.remove("guests", del.dataset.delete);
      await loadGuests();
    }
  });
$("#guest-form").onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  const b = form.querySelector("button");
  b.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    const id = data.id;
    delete data.id;
    data.name = data.name.trim();
    if (!data.name) throw new Error("Escribí el nombre de la persona.");
    await api.write("guests", data, id || null);
    $("#guest-dialog").close();
    await loadGuests();
    notify("Persona guardada.");
  } catch (err) {
    form.querySelector(".form-result").textContent = err.message;
  } finally {
    b.disabled = false;
  }
};
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
$("#export-guests").onclick = () => {
  const rows = filteredGuests();
  download(
    csvText([
      [
        "Nombre",
        "Grupo",
        "Respuesta",
        "Alimentación",
        "Observaciones",
        "Actualizado",
      ],
      ...rows.map((g) => [
        g.name,
        g.group_name,
        labels[g.status],
        g.dietary,
        g.notes,
        g.updated_at,
      ]),
    ]),
    "Carli-y-Fer-invitados.csv",
    "text/csv;charset=utf-8",
  );
  notify("Se exportaron las personas que coinciden con los filtros.");
};
const editorFields = [
  ["Datos principales"],
  ["names", "Nombres", "text"],
  ["city", "Ciudad", "text"],
  ["welcome", "Mensaje de bienvenida", "textarea"],
  ["Ceremonia y fiesta"],
  ["ceremonyName", "Lugar de ceremonia", "text"],
  ["ceremonyAt", "Fecha y hora de ceremonia", "datetime-local"],
  ["ceremonyAddress", "Dirección de ceremonia", "text"],
  ["ceremonyMap", "Enlace de mapa de ceremonia", "url"],
  ["partyName", "Lugar de fiesta", "text"],
  ["partyAt", "Fecha y hora de fiesta", "datetime-local"],
  ["partyAddress", "Dirección de fiesta", "text"],
  ["partyMap", "Enlace de mapa de fiesta", "url"],
  [
    "sharedMap",
    "Ubicación compartida (si todavía no está asignada a un lugar)",
    "url",
  ],
  ["Información práctica"],
  ["dressCode", "Vestimenta", "text"],
  ["responseDeadline", "Fecha límite para avisar", "date"],
  ["contactName", "Nombre del contacto", "text"],
  ["contactPhone", "WhatsApp con país, sin signos", "tel"],
  ["Regalos"],
  ["giftMessage", "Mensaje para regalos", "textarea"],
  ["giftAlias", "Alias para regalos", "text"],
  ["giftHolder", "Titular", "text"],
  ["Fotos y videos"],
  ["albumProvider", "Dónde se reciben los recuerdos", "select"],
  ["albumUploadUrl", "Enlace para responder el formulario de Google", "url"],
  ["Secciones"],
  ["showGifts", "Mostrar regalos cuando haya alias", "checkbox"],
  ["showAlbum", "Mostrar álbum", "checkbox"],
  ["showMessages", "Mostrar mensajes y canciones", "checkbox"],
];
function renderEditor() {
  const required = new Set([
    "names",
    "city",
    "ceremonyName",
    "ceremonyAt",
    "partyName",
    "partyAt",
    "welcome",
  ]);
  $("#editor-form").innerHTML = editorFields
    .map(([key, label, type]) => {
      if (!label) return `<h3 class="full">${key}</h3>`;
      let value = draft[key] ?? "";
      if (type === "datetime-local") {
        const date = new Date(value);
        value = new Date(date.getTime() - 3 * 3600000)
          .toISOString()
          .slice(0, 16);
      }
      if (type === "checkbox")
        return `<label class="check"><input name="${key}" type="checkbox" ${value ? "checked" : ""}>${label}</label>`;
      if (type === "select")
        return `<label>${label}<select name="${key}"><option value="google_forms" ${value === "google_forms" ? "selected" : ""}>Google Forms + Drive · archivos grandes</option><option value="supabase" ${value === "supabase" ? "selected" : ""}>Álbum interno · archivos pequeños</option></select><small>Google Forms requiere iniciar sesión en Google. Pegá el enlace de respuesta, nunca el de una carpeta compartida ni el de edición.</small></label>`;
      return `<label class="${type === "textarea" ? "full" : ""}">${label}${type === "textarea" ? `<textarea name="${key}" maxlength="1000" rows="3" ${required.has(key) ? "required" : ""}>${h(value)}</textarea>` : `<input name="${key}" type="${type}" value="${h(value)}" ${required.has(key) ? "required" : ""} maxlength="500">`}</label>`;
    })
    .join("");
}
async function loadDraft() {
  const rows = await api.privateRows("wedding_draft", "id=eq.1&select=*");
  draft = { ...initialWedding, ...rows[0]?.data };
  draftVersion = rows[0]?.updated_at;
  renderEditor();
}
async function saveDraft() {
  const form = $("#editor-form");
  if (!form.reportValidity())
    throw new Error("Revisá los campos de la invitación.");
  const data = { ...draft };
  for (const [key, , type] of editorFields) {
    if (!type) continue;
    const input = form.elements[key];
    data[key] = type === "checkbox" ? input.checked : input.value.trim();
    if (type === "datetime-local") data[key] += ":00-03:00";
    if (type === "url" && data[key] && !safeURL(data[key]))
      throw new Error("Los enlaces deben empezar con https://");
  }
  if (new Date(data.partyAt) < new Date(data.ceremonyAt))
    throw new Error("La fiesta debe comenzar después de la ceremonia.");
  if (!["supabase", "google_forms"].includes(data.albumProvider))
    throw new Error("Seleccioná un servicio para los recuerdos.");
  if (data.albumUploadUrl && !googleFormURL(data.albumUploadUrl))
    throw new Error(
      "Pegá el enlace de respuesta de Google Forms: forms.gle/... o docs.google.com/forms/.../viewform.",
    );
  const updated = await api.rpc("save_wedding_draft", {
    p_data: data,
    p_expected: draftVersion,
  });
  draft = data;
  draftVersion = updated;
}
$("#save-draft").onclick = () =>
  action(async () => {
    await saveDraft();
    notify("Borrador guardado. Revisalo antes de publicar.");
  });
$("#publish").onclick = () =>
  action(async () => {
    await saveDraft();
    if (
      !(await confirmAction(
        "¿Publicar este borrador en la invitación que ven los invitados?",
      ))
    )
      return;
    await api.rpc("publish_wedding", { p_expected: draftVersion });
    notify("Los cambios ya están publicados.");
  });
async function loadInbox() {
  inbox = await api.privateRows("messages", "select=*&order=created_at.desc");
  $("#inbox-list").innerHTML = inbox.length
    ? inbox
        .map(
          (m) =>
            `<article class="inbox-card"><span class="tag">${m.kind === "song" ? "Canción" : m.approved ? "Mensaje aprobado" : "Mensaje pendiente"}</span><h3>${h(m.name)}</h3><p>${h(m.message)}</p><span class="small">${h(formatDate(m.created_at, { day: "numeric", month: "long" }))}</span>${m.kind === "message" ? `<button class="button outline" data-moderate="${m.id}">${m.approved ? "Ocultar mensaje" : "Aprobar mensaje"}</button>` : ""}<button class="table-action danger" data-remove-message="${m.id}">Eliminar</button></article>`,
        )
        .join("")
    : '<p class="empty">Todavía no recibieron mensajes ni canciones.</p>';
}
$("#refresh-inbox").onclick = () => action(loadInbox);
$("#inbox-list").onclick = (e) =>
  action(async () => {
    const mod = e.target.closest("[data-moderate]");
    if (mod) {
      const m = inbox.find((m) => m.id === mod.dataset.moderate);
      await api.write("messages", { approved: !m.approved }, m.id);
      await loadInbox();
    }
    const del = e.target.closest("[data-remove-message]");
    if (del && (await confirmAction("¿Eliminar este envío?"))) {
      await api.remove("messages", del.dataset.removeMessage);
      await loadInbox();
    }
  });
$("#export-songs").onclick = () =>
  download(
    csvText([
      ["Persona", "Canción y artista"],
      ...inbox.filter((m) => m.kind === "song").map((m) => [m.name, m.message]),
    ]),
    "Carli-y-Fer-canciones.csv",
    "text/csv;charset=utf-8",
  );
async function loadAlbum() {
  const event = await api.wedding();
  const external = event?.albumProvider === "google_forms";
  $("#external-album-admin").hidden = !external;
  memories = await api.privateRows(
    "memories",
    "select=*&order=created_at.desc",
  );
  const total = memories.reduce((n, f) => n + f.size_bytes, 0);
  $("#storage-usage").textContent = external
    ? "Los archivos nuevos se guardan en Google Drive. Consultá el espacio disponible en esa cuenta; no se descuentan del álbum interno de 800 MB."
    : `${memories.length} archivos · ${(total / 1024 / 1024).toFixed(1)} MB recibidos. Capacidad máxima del álbum interno: 800 MB. Las reservas pendientes también ocupan capacidad.`;
  $("#album-list").hidden = external && !memories.length;
  $("#album-list").innerHTML = memories.length
    ? memories
        .map(
          (m) =>
            `<article class="album-card"><span class="tag">${m.mime.startsWith("video/") ? "Video" : "Foto"}</span><h3>${h(m.name)}</h3><span class="small">${h(m.original_name)}</span><span class="small">${(m.size_bytes / 1024 / 1024).toFixed(1)} MB · ${h(formatDate(m.created_at, { day: "2-digit", month: "2-digit" }))}</span><button class="text-link" data-download="${m.id}">Descargar</button><button class="table-action danger" data-remove-file="${m.id}">Eliminar</button></article>`,
        )
        .join("")
    : '<p class="empty">Los recuerdos aparecerán acá cuando los invitados los envíen.</p>';
  $("#qr-url").value =
    config.siteUrl || new URL("index.html", location.href).href;
}
$("#refresh-album").onclick = () => action(loadAlbum);
$("#album-list").onclick = (e) =>
  action(async () => {
    const btn = e.target.closest("[data-download]");
    if (btn) {
      btn.disabled = true;
      try {
        const m = memories.find((m) => m.id === btn.dataset.download);
        const url = await api.privateFile(m.path);
        const response = await fetch(url);
        if (!response.ok)
          throw new Error(
            "No se pudo descargar. Es posible que haya finalizado el plazo.",
          );
        download(await response.blob(), m.original_name);
      } finally {
        btn.disabled = false;
      }
    }
    const del = e.target.closest("[data-remove-file]");
    if (
      del &&
      (await confirmAction(
        "¿Eliminar este recuerdo definitivamente? Descargalo antes si querés conservarlo.",
      ))
    ) {
      const m = memories.find((m) => m.id === del.dataset.removeFile);
      await api.removeFile(m.path);
      await api.remove("memories", m.id);
      await loadAlbum();
    }
  });
$("#make-qr").onclick = () =>
  action(async () => {
    const url = safeURL($("#qr-url").value);
    if (!url) throw new Error("Completá la dirección HTTPS de la invitación.");
    const target = publicMemoriesURL(url);
    const qr = window.qrcode(0, "M");
    qr.addData(target);
    qr.make();
    qrSVG = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
    $("#qr-output").innerHTML = qrSVG;
    const svg = $("#qr-output svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Código QR para abrir los recuerdos de Carli y Fer");
    qrSVG = svg.outerHTML;
    $("#download-qr").hidden = false;
  });
$("#download-qr").onclick = () =>
  download(qrSVG, "Carli-y-Fer-QR-recuerdos.svg", "image/svg+xml");
document.querySelectorAll("[data-view]").forEach(
  (button) =>
    (button.onclick = () =>
      action(async () => {
        const next = button.dataset.view;
        if (
          currentView === "editor" &&
          next !== "editor" &&
          !(await confirmAction(
            "¿Salir del editor? Los cambios que no guardaste se perderán.",
          ))
        )
          return;
        currentView = next;
        document
          .querySelectorAll("[data-view]")
          .forEach((b) => b.classList.toggle("active", b === button));
        for (const id of ["guests", "editor", "inbox", "album"])
          $("#view-" + id).hidden = id !== next;
        await {
          guests: loadGuests,
          editor: loadDraft,
          inbox: loadInbox,
          album: loadAlbum,
        }[next]();
      })),
);
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  try {
    void Promise.resolve(
      document.modelContext.registerTool(
        {
          name: "filter_wedding_guests",
          title: "Filtrar invitados",
          description:
            "Filtra el listado visible del panel por nombre y respuesta. Requiere una sesión administradora.",
          inputSchema: {
            type: "object",
            properties: {
              search: { type: "string" },
              status: {
                type: "string",
                enum: ["", "pending", "confirmed", "declined"],
              },
            },
            required: ["search", "status"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          async execute(input) {
            if (
              typeof input?.search !== "string" ||
              !["", "pending", "confirmed", "declined"].includes(input.status)
            )
              throw new Error("Filtro inválido");
            if (currentView !== "guests")
              throw new Error("Abrí la sección Invitados primero.");
            if (!(await api.isAdmin())) throw new Error("Acceso denegado");
            $("#guest-search").value = input.search;
            $("#guest-filter").value = input.status;
            await loadGuests();
            return { count: filteredGuests().length };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {
    /* unsupported browsers keep the same UI */
  }
}
