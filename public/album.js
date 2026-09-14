// Public respondent links only; never a Drive folder shared with edit access.
export function googleFormURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return "";
    const short =
      url.hostname === "forms.gle" &&
      /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
    const full =
      url.hostname === "docs.google.com" &&
      /^\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform\/?$/.test(url.pathname);
    if (!short && !full) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}
export function albumState(wedding, now = Date.now()) {
  const provider = wedding.albumProvider || "supabase";
  if (!["supabase", "google_forms"].includes(provider))
    return { kind: "pending", url: "" };
  if (!wedding.showAlbum || now >= new Date(wedding.albumClosesAt).getTime())
    return { kind: "closed", url: "" };
  if (provider === "supabase") return { kind: "supabase", url: "" };
  const url = googleFormURL(wedding.albumUploadUrl);
  return { kind: url ? "google_forms" : "pending", url };
}
export function albumQrURL(siteUrl, provider, code = "") {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Usá una dirección pública HTTPS.");
  url.searchParams.delete("preview");
  if (provider === "supabase") {
    if (!code.trim()) throw new Error("Completá el código de invitados.");
    url.hash = new URLSearchParams({ codigo: code.trim() }).toString();
  } else if (provider === "google_forms") {
    // The QR stays on our site, so its destination can change without reprinting.
    url.hash = "recuerdos";
  } else throw new Error("Seleccioná un servicio de álbum válido.");
  return url.href;
}
