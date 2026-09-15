export const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
export const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const salt = Deno.env.get("WEDDING_RATE_SALT") || "";
const master = Deno.env.get("WEDDING_INVITATION_SECRET") || serviceKey;
const origins = (Deno.env.get("WEDDING_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const enc = new TextEncoder();
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
export function unb64(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new HttpError(401, "No pudimos verificar tu acceso.");
  return Uint8Array.from(
    atob(
      value.replaceAll("-", "+").replaceAll("_", "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
async function key(kind: "AES-GCM" | "HMAC") {
  const raw = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(`carli-fer-v2:${kind}:${master}:${salt}`),
  );
  return crypto.subtle.importKey(
    "raw",
    raw,
    kind === "HMAC" ? { name: kind, hash: "SHA-256" } : kind,
    false,
    kind === "HMAC" ? ["sign", "verify"] : ["encrypt", "decrypt"],
  );
}
export function ensureReady() {
  if (!base || !serviceKey || salt.length < 16)
    throw new HttpError(
      503,
      "Estamos preparando las invitaciones. Intentá más tarde.",
    );
}
export function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origins.includes(origin))
    throw new HttpError(403, "Origen no autorizado.");
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "apikey,authorization,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
}
export function response(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function readJson(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Usá un envío JSON.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Envío vacío.");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw new HttpError(413, "El envío es demasiado grande.");
    }
    chunks.push(new Uint8Array(value));
  }
  try {
    const data = JSON.parse(await new Blob(chunks).text());
    if (!data || Array.isArray(data) || typeof data !== "object")
      throw new Error();
    return data;
  } catch {
    throw new HttpError(400, "Revisá los datos enviados.");
  }
}
export async function rpc(name: string, body: unknown, jwt = serviceKey) {
  const r = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok)
    throw new HttpError(
      r.status === 401 || r.status === 403 ? 403 : 503,
      "No se pudo completar la operación. Actualizá e intentá nuevamente.",
    );
  return data;
}
export async function rate(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "shared";
  const client = await hash(salt + ":" + ip);
  if (!(await rpc("consume_invitation_rate", { p_hash: client })))
    throw new HttpError(
      429,
      "Hay muchos intentos desde esta conexión. Esperá unos minutos.",
    );
  return client;
}
export async function tokenHash(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(
      401,
      "No pudimos verificar esta invitación. Pedí tu enlace a la pareja.",
    );
  return hash(token);
}
export async function newCredential() {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key("AES-GCM"),
    enc.encode(token),
  );
  return {
    token,
    hash: await hash(token),
    cipher: b64(iv) + "." + b64(new Uint8Array(encrypted)),
  };
}
export async function decryptCredential(cipher: string) {
  const [iv, data] = cipher.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) },
      await key("AES-GCM"),
      unb64(data),
    ),
  );
}
export async function issueProof(token_hash: string) {
  const payload = b64(
    enc.encode(
      JSON.stringify({
        hash: token_hash,
        aud: "cf-confirmed-v2",
        exp: Math.floor(Date.now() / 1000) + 1800,
      }),
    ),
  );
  return (
    payload +
    "." +
    b64(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          await key("HMAC"),
          enc.encode(payload),
        ),
      ),
    )
  );
}
export async function validateProof(proof: unknown) {
  try {
    if (typeof proof !== "string" || proof.length > 1024) throw new Error();
    const [payload, sig, extra] = proof.split(".");
    if (extra || !payload || !sig) throw new Error();
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await key("HMAC"),
        unb64(sig),
        enc.encode(payload),
      ))
    )
      throw new Error();
    const claims = JSON.parse(new TextDecoder().decode(unb64(payload)));
    if (
      claims.aud !== "cf-confirmed-v2" ||
      !/^[a-f0-9]{64}$/.test(claims.hash) ||
      !Number.isInteger(claims.exp) ||
      claims.exp <= Date.now() / 1000
    )
      throw new Error();
    const invite = await rpc("resolve_invitation", { p_hash: claims.hash });
    if (
      !invite ||
      !invite.guests.some((g: { status: string }) => g.status === "confirmed")
    )
      throw new Error();
    return { invite, claims };
  } catch (error) {
    if (error instanceof HttpError && error.status === 503) throw error;
    throw new HttpError(
      401,
      "Tu acceso venció o cambió. Volvé a abrir tu invitación.",
    );
  }
}
export async function publicSnapshot(invite: any, hash: string) {
  const confirmed = invite.guests.some(
    (g: { status: string }) => g.status === "confirmed",
  );
  return {
    ok: true,
    displayName: invite.displayName,
    revision: invite.revision,
    deadline: invite.deadline,
    guests: invite.guests,
    confirmed,
    ...(confirmed ? { proof: await issueProof(hash), expiresIn: 1800 } : {}),
  };
}
