// Deploy with verify_jwt=false. No guest identifier is accepted: the minimal
// SECURITY DEFINER RPC resolves the credential and name atomically.
const base = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const rateSalt = Deno.env.get("WEDDING_RATE_SALT") || "";
const origins = (Deno.env.get("WEDDING_ALLOWED_ORIGINS") || "")
  .split(",").map((value) => value.trim()).filter(Boolean);

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
}
function normalizeText(value: unknown, max: number) {
  const normalized = String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > max) throw new Error("Revisá los datos ingresados.");
  return normalized;
}
function normalizeCode(value: unknown) {
  return normalizeText(value, 100).toLocaleUpperCase("es-AR");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (!origins.includes(origin)) return reply({ error: "No se pudo verificar la invitación." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Método no permitido." }, 405);
  if (!base || !serviceKey || rateSalt.length < 16)
    return reply({ error: "Las confirmaciones todavía no están habilitadas." }, 503);
  try {
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > 2048) return reply({ error: "Revisá los datos ingresados." }, 400);
    const body = await req.json();
    const name = normalizeText(body?.name, 120);
    const code = normalizeCode(body?.code);
    const status = body?.response;
    if (status !== "confirmed" && status !== "declined")
      throw new Error("Elegí confirmar o rechazar la invitación.");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "shared";
    const rpc = await fetch(base.replace(/\/$/, "") + "/rest/v1/rpc/submit_guest_rsvp", {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_credential_hash: await sha256(code),
        p_name: name,
        p_status: status,
        p_client_hash: await sha256(rateSalt + ":" + ip),
      }),
    });
    const matched = await rpc.json().catch(() => false);
    if (!rpc.ok) throw new Error("No se pudo registrar la respuesta. Intentá más tarde.");
    // One indistinguishable response covers a wrong name, wrong code, or both.
    if (matched !== true) return reply({ error: "No se pudo verificar la invitación. Revisá los datos." }, 400);
    if (status === "declined") return reply({ ok: true, response: status });
    const proof = crypto.randomUUID() + "." + crypto.randomUUID();
    return reply({ ok: true, response: status, proof, expiresIn: 1800 });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "No se pudo registrar la respuesta." }, 400);
  }
});
