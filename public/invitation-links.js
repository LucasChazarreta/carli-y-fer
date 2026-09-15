export function invitationURL(base, token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Enlace inválido.");
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("La invitación necesita una dirección HTTPS.");
  url.search = "";
  url.hash = "";
  url.searchParams.set("i", token);
  return url.href;
}
export async function shareInvitation(url, nav = navigator) {
  if (typeof nav.share === "function") {
    try {
      await nav.share({
        title: "Carli y Fer · Nuestra invitación",
        text: "Queremos compartir con vos un día muy especial.",
        url,
      });
      return "shared";
    } catch (error) {
      if (error.name === "AbortError") return "cancelled";
    }
  }
  await nav.clipboard.writeText(url);
  return "copied";
}
