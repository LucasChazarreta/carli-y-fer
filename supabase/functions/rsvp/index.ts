// Deploy with verify_jwt=false. Guest credentials are accepted only by the
// confirmation action; the short-lived proof is signed and kept out of URLs.
const base = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const rateSalt = Deno.env.get("WEDDING_RATE_SALT") || "";
const proofSecret = Deno.env.get("WEDDING_RSVP_PROOF_SECRET") || "";
const origins = (Deno.env.get("WEDDING_ALLOWED_ORIGINS") || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
const encoder = new TextEncoder();

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
}
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function decode64url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("invalid proof");
  const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4));
  return new Uint8Array([...raw].map((character) => character.charCodeAt(0)));
}
async function proofKey() {
  return crypto.subtle.importKey("raw", encoder.encode(proofSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function issueProof(guest: string) {
  const payload = base64url(encoder.encode(JSON.stringify({ guest, exp: Math.floor(Date.now() / 1000) + 1800 })));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await proofKey(), encoder.encode(payload)));
  return payload + "." + base64url(signature);
}
async function readProof(value: unknown) {
  if (typeof value !== "string" || value.length > 1000) throw new Error("invalid proof");
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw new Error("invalid proof");
  const valid = await crypto.subtle.verify("HMAC", await proofKey(), decode64url(signature), encoder.encode(payload));
  if (!valid) throw new Error("invalid proof");
  const claims = JSON.parse(new TextDecoder().decode(decode64url(payload)));
  if (!claims?.guest || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("expired proof");
  return claims as { guest: string; exp: number };
}
function normalizeText(value: unknown, max: number) {
  const normalized = String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > max) throw new Error("Revisá los datos ingresados.");
  return normalized;
}
const normalizeCode = (value: unknown) => normalizeText(value, 100).toLocaleUpperCase("es-AR");

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (!origins.includes(origin)) return reply({ error: "No se pudo verificar la invitación." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Método no permitido." }, 405);
  if (!base || !serviceKey || rateSalt.length < 16 || proofSecret.length < 32)
    return reply({ error: "Las confirmaciones todavía no están habilitadas." }, 503);
  try {
    if (Number(req.headers.get("content-length") || 0) > 2048) throw new Error("Revisá los datos ingresados.");
    const body = await req.json();
    if (body?.action === "validate") {
      const claims = await readProof(body.proof);
      const check = await fetch(`${base.replace(/\/$/u, "")}/rest/v1/guests?id=eq.${encodeURIComponent(claims.guest)}&status=eq.confirmed&select=id&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      });
      const guests = await check.json().catch(() => []);
      if (!check.ok) throw new Error("validation unavailable");
      return Array.isArray(guests) && guests.length === 1
        ? reply({ ok: true, expiresAt: claims.exp * 1000 })
        : reply({ error: "No se pudo verificar la confirmación." }, 401);
    }
    const name = normalizeText(body?.name, 120);
    const code = normalizeCode(body?.code);
    const status = body?.response;
    if (status !== "confirmed" && status !== "declined") throw new Error("Elegí confirmar o rechazar la invitación.");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "shared";
    const rpc = await fetch(base.replace(/\/$/u, "") + "/rest/v1/rpc/submit_guest_rsvp_with_proof", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_credential_hash: await sha256(code), p_name: name, p_status: status, p_client_hash: await sha256(rateSalt + ":" + ip) }),
    });
    const guest = await rpc.json().catch(() => null);
    if (!rpc.ok) throw new Error("No se pudo registrar la respuesta. Intentá más tarde.");
    if (typeof guest !== "string") return reply({ error: "No se pudo verificar la invitación. Revisá los datos." }, 400);
    if (status === "declined") return reply({ ok: true, response: status });
    return reply({ ok: true, response: status, proof: await issueProof(guest), expiresIn: 1800 });
  } catch (error) {
    const validation = error instanceof Error && /proof|validation/u.test(error.message);
    return reply({ error: validation ? "No se pudo verificar la confirmación." : error instanceof Error ? error.message : "No se pudo registrar la respuesta." }, validation ? 401 : 400);
  }
});
