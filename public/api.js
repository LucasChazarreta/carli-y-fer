import { config } from "./config.js";
export const configured = Boolean(
  config.supabaseUrl && config.supabasePublishableKey,
);
let session = null;
let refreshing = null;
try {
  session = JSON.parse(sessionStorage.getItem("cf-session") || "null");
} catch {
  /* no persisted session */
}
function saveSession(value) {
  session = value;
  if (value) sessionStorage.setItem("cf-session", JSON.stringify(value));
  else sessionStorage.removeItem("cf-session");
}
async function request(
  path,
  { method = "GET", body, token, headers = {}, raw = false } = {},
) {
  if (!configured)
    throw new Error(
      "Esta función todavía no está habilitada. Volvé a intentarlo más adelante.",
    );
  let response;
  try {
    response = await fetch(config.supabaseUrl.replace(/\/$/, "") + path, {
      method,
      headers: {
        apikey: config.supabasePublishableKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !raw ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? (raw ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(raw ? 120000 : 20000),
    });
  } catch {
    throw new Error(
      "No se pudo conectar. Revisá tu conexión e intentá de nuevo.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error_description ||
        data?.error ||
        data?.message ||
        "No se pudo completar la operación.",
    );
  return data;
}
async function token() {
  if (!session) throw new Error("Ingresá al panel para continuar.");
  if ((session.expires_at || 0) * 1000 < Date.now() + 60000) {
    if (!refreshing)
      refreshing = request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: session.refresh_token },
      })
        .then((s) =>
          saveSession({
            ...s,
            expires_at: Math.floor(Date.now() / 1000) + s.expires_in,
          }),
        )
        .catch((e) => {
          saveSession(null);
          throw e;
        })
        .finally(() => (refreshing = null));
    await refreshing;
  }
  return session.access_token;
}
export const api = {
  async wedding() {
    const rows = await request("/rest/v1/wedding_settings?id=eq.1&select=data");
    return rows?.[0]?.data;
  },
  async approvedMessages() {
    return request(
      "/rest/v1/messages?approved=eq.true&select=id,name,message&order=created_at.desc&limit=30",
    );
  },
  async signIn(email, password) {
    const s = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    saveSession({
      ...s,
      expires_at: Math.floor(Date.now() / 1000) + s.expires_in,
    });
    try {
      if (!(await api.isAdmin()))
        throw new Error("Este usuario no tiene acceso al panel.");
    } catch (e) {
      await api.signOut();
      throw e;
    }
    return s.user;
  },
  async signOut() {
    try {
      if (session)
        await request("/auth/v1/logout", {
          method: "POST",
          token: session.access_token,
        });
    } finally {
      saveSession(null);
    }
  },
  hasSession: () => Boolean(session),
  async isAdmin() {
    return request("/rest/v1/rpc/is_wedding_admin", {
      method: "POST",
      body: {},
      token: await token(),
    });
  },
  async privateRows(table, query = "") {
    return request(`/rest/v1/${table}?${query}`, { token: await token() });
  },
  async write(table, body, id = null) {
    return request(
      `/rest/v1/${table}${id !== null ? "?id=eq." + encodeURIComponent(id) : ""}`,
      {
        method: id !== null ? "PATCH" : "POST",
        body,
        token: await token(),
        headers: { Prefer: "return=representation" },
      },
    );
  },
  async rpc(name, body) {
    return request("/rest/v1/rpc/" + name, {
      method: "POST",
      body,
      token: await token(),
    });
  },
  async remove(table, id) {
    return request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: await token(),
    });
  },
  async privateFile(path) {
    const r = await request(
      "/storage/v1/object/sign/wedding-memories/" + path,
      { method: "POST", body: { expiresIn: 120 }, token: await token() },
    );
    return config.supabaseUrl + "/storage/v1" + r.signedURL;
  },
  async removeFile(path) {
    return request("/storage/v1/object/wedding-memories", {
      method: "DELETE",
      body: { prefixes: [path] },
      token: await token(),
    });
  },
  async submit(form) {
    return request("/functions/v1/guest-submit", {
      method: "POST",
      body: form,
      raw: true,
    });
  },
};
