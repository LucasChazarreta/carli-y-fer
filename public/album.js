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
  // Hiding the album is an editorial choice, not an expired upload period.
  if (!wedding.showAlbum) return { kind: "disabled", url: "" };
  const closesAt = Date.parse(wedding.albumClosesAt);
  if (!Number.isFinite(closesAt)) return { kind: "pending", url: "" };
  if (now >= closesAt) return { kind: "closed", url: "" };
  const provider = wedding.albumProvider || "supabase";
  if (!["supabase", "google_forms"].includes(provider))
    return { kind: "pending", url: "" };
  if (provider === "supabase") return { kind: "supabase", url: "" };
  const url = googleFormURL(wedding.albumUploadUrl);
  return { kind: url ? "google_forms" : "pending", url };
}
// The public memories address is deliberately independent from the upload
// provider. Never carry state from an admin/preview URL into a guest link.
export function publicMemoriesURL(siteUrl) {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Usá una dirección pública HTTPS.");
  url.search = "";
  url.hash = "recuerdos";
  return url.href;
}
