export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function safeURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
export function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    ...options,
  }).format(new Date(value));
}
export function countdown(value, now = Date.now()) {
  const seconds = Math.max(
    0,
    Math.floor((new Date(value).getTime() - now) / 1000),
  );
  return [
    Math.floor(seconds / 86400),
    Math.floor(seconds / 3600) % 24,
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ];
}
const icsEscape = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const utc = (value) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z/, "Z");
function foldLine(line) {
  const lines = [];
  let current = "";
  let bytes = 0;
  for (const c of line) {
    const size = new TextEncoder().encode(c).length;
    if (bytes + size > 75) {
      lines.push(current);
      current = " ";
      bytes = 1;
    }
    current += c;
    bytes += size;
  }
  lines.push(current);
  return lines.join("\r\n");
}
export function calendarFile(wedding, now = new Date()) {
  // No invented end time: the source only specifies starting times.
  const event = (kind, at, place) => [
    "BEGIN:VEVENT",
    `UID:carli-fer-${kind}-20261017@invitacion`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(at)}`,
    `SUMMARY:${icsEscape(wedding.names + " · " + (kind === "ceremonia" ? "Ceremonia" : "Fiesta"))}`,
    `LOCATION:${icsEscape(place)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
  ];
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Carli y Fer//Invitacion//ES",
      "CALSCALE:GREGORIAN",
      ...event(
        "ceremonia",
        wedding.ceremonyAt,
        [wedding.ceremonyName, wedding.ceremonyAddress, wedding.city]
          .filter(Boolean)
          .join(", "),
      ),
      ...event(
        "fiesta",
        wedding.partyAt,
        [wedding.partyName, wedding.partyAddress, wedding.city]
          .filter(Boolean)
          .join(", "),
      ),
      "END:VCALENDAR",
    ]
      .map(foldLine)
      .join("\r\n") + "\r\n"
  );
}
export function csvText(rows) {
  const quote = (value) => {
    let s = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return "\ufeff" + rows.map((row) => row.map(quote).join(";")).join("\r\n");
}
export function download(content, name, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function notify(message, error = false) {
  const status = document.querySelector("#status");
  status.textContent = message;
  status.classList.toggle("error", error);
  status.hidden = false;
}
