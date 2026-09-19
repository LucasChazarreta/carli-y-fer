const cache = new Map();
export function readSession(key) {
  try {
    return sessionStorage.getItem(key) ?? cache.get(key) ?? null;
  } catch {
    return cache.get(key) ?? null;
  }
}
export function writeSession(key, value) {
  if (value === null) cache.delete(key);
  else cache.set(key, value);
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* memory fallback keeps a successful response successful */
  }
}
export function invitationToken() {
  const url = new URL(location.href),
    incoming = url.searchParams.get("i");
  if (incoming) {
    if (incoming !== readSession("cf-invitation-token"))
      writeSession("cf-rsvp-proof", null);
    writeSession("cf-invitation-token", incoming);
    url.searchParams.delete("i");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  return incoming || readSession("cf-invitation-token") || "";
}
export function saveProof(result) {
  writeSession(
    "cf-rsvp-proof",
    result.proof
      ? JSON.stringify({
          proof: result.proof,
          expiresAt: Date.now() + result.expiresIn * 1000,
        })
      : null,
  );
}
export function currentProof() {
  try {
    const saved = JSON.parse(readSession("cf-rsvp-proof") || "null");
    return saved?.expiresAt > Date.now() ? saved.proof : "";
  } catch {
    return "";
  }
}
