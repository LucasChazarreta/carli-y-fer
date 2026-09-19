import { validateProof, rate, ensureReady } from "../_shared/security.ts";
// Deploy as guest-submit with verify_jwt=false. Shared guest code, validation,
// server-side quota reservations and RLS protect the guest write surface.
const base = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const secret = Deno.env.get("WEDDING_GUEST_CODE") || "";
const salt = Deno.env.get("WEDDING_RATE_SALT") || "";
const origins = (Deno.env.get("WEDDING_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
async function db(path: string, body: unknown, method = "POST") {
  const r = await fetch(base + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await r.json().catch(() => null);
  if (!r.ok) throw new Error(result?.message || "No se pudo guardar el envío.");
  return result;
}
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
async function matches(a: string, b: string) {
  const x = await hash(a),
    y = await hash(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
function sniff(b: Uint8Array) {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...b.slice(start, end));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { mime: "image/jpeg", ext: "jpg", limit: 8 };
  if (
    b[0] === 0x89 &&
    ascii(1, 4) === "PNG" &&
    b[4] === 13 &&
    b[5] === 10 &&
    b[6] === 26 &&
    b[7] === 10
  )
    return { mime: "image/png", ext: "png", limit: 8 };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { mime: "image/webp", ext: "webp", limit: 8 };
  if (ascii(4, 8) === "ftyp") {
    const brands = ascii(8, Math.min(b.length, 64));
    if (/heic|heix|hevc|hevx|mif1|msf1|avif|avis/.test(brands)) return null;
    if (brands.startsWith("qt"))
      return { mime: "video/quicktime", ext: "mov", limit: 25 };
    if (/isom|iso2|mp41|mp42|avc1|M4V/.test(brands))
      return { mime: "video/mp4", ext: "mp4", limit: 25 };
  }
  if (
    b[0] === 0x1a &&
    b[1] === 0x45 &&
    b[2] === 0xdf &&
    b[3] === 0xa3 &&
    ascii(0, Math.min(256, b.length)).includes("webm")
  )
    return { mime: "video/webm", ext: "webm", limit: 25 };
  return null;
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  if (!origins.includes(origin))
    return reply({ error: "Origen no autorizado." }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")
    return reply({ error: "Método no permitido." }, 405);
  if (!salt || salt.length < 16 || !base || !serviceKey)
    return reply({ error: "Los envíos todavía no están habilitados." }, 503);
  let id: string | null = null;
  let storedPath: string | null = null;
  let metadataSaved = false;
  try {
    ensureReady();
    await rate(req);
    const declared = Number(req.headers.get("content-length"));
    if (declared > 27 * 1024 * 1024)
      return reply({ error: "Archivo demasiado grande." }, 413);
    // Bound the body even when Content-Length is absent or inaccurate.
    const reader = req.body?.getReader();
    if (!reader) throw new Error("Envío vacío.");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 27 * 1024 * 1024) {
        await reader.cancel();
        return reply({ error: "Archivo demasiado grande." }, 413);
      }
      chunks.push(new Uint8Array(value));
    }
    const form = await new Response(new Blob(chunks), {
      headers: { "Content-Type": req.headers.get("content-type") || "" },
    }).formData();
    const code = String(form.get("code") || "").trim();
    const proof = form.get("proof");
    if (proof) await validateProof(proof);
    else if (
      Deno.env.get("WEDDING_ALLOW_LEGACY_CODE") !== "true" ||
      !secret ||
      !(await matches(code, secret))
    )
      return reply(
        { error: "Abrí tu invitación y confirmá asistencia para continuar." },
        401,
      );
    const kind = String(form.get("action") || "");
    const name = String(form.get("name") || "").trim();
    if (
      !["upload", "message", "song"].includes(kind) ||
      name.length < 1 ||
      name.length > 80
    )
      throw new Error("Revisá tu nombre y el tipo de envío.");
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "shared";
    const clientHash = await hash(salt + ":" + ip);
    const file = form.get("file");
    let format: ReturnType<typeof sniff> = null;
    const message = String(form.get("message") || "").trim();
    if (kind === "upload") {
      if (form.get("consent") !== "on")
        throw new Error(
          "Necesitamos tu autorización para compartir el archivo.",
        );
      if (!(file instanceof File) || file.size === 0)
        throw new Error("Elegí una foto o un video.");
      format = sniff(new Uint8Array(await file.slice(0, 256).arrayBuffer()));
      if (!format)
        throw new Error(
          "Usá una foto JPG, PNG o WebP, o un video MP4, MOV o WebM. Convertí HEIC/HEIF antes de subir.",
        );
      if (file.size > format.limit * 1024 * 1024)
        throw new Error(`El archivo supera los ${format.limit} MB.`);
    } else {
      if (!message || message.length > (kind === "song" ? 200 : 600))
        throw new Error("Revisá el largo del mensaje.");
      if (kind === "message" && form.get("consent") !== "on")
        throw new Error("Necesitamos tu autorización para mostrar el mensaje.");
    }
    id = crypto.randomUUID();
    await db("rpc/reserve_wedding_submission", {
      p_id: id,
      p_hash: clientHash,
      p_kind: kind,
      p_size: kind === "upload" ? (file as File).size : 0,
    });
    if (kind === "upload") {
      const f = file as File;
      const path = id + "." + format!.ext;
      const r = await fetch(
        base + "/storage/v1/object/wedding-memories/" + path,
        {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: "Bearer " + serviceKey,
            "Content-Type": format!.mime,
            "x-upsert": "false",
          },
          body: f,
        },
      );
      if (!r.ok)
        throw new Error("No se pudo guardar el archivo. Intentá de nuevo.");
      storedPath = path;
      const original =
        f.name.replace(/[\/\\\x00-\x1f\x7f]/g, "_").slice(0, 180) ||
        "recuerdo." + format!.ext;
      await db("memories", {
        id,
        name,
        original_name: original,
        path,
        mime: format!.mime,
        size_bytes: f.size,
      });
      metadataSaved = true;
    } else {
      await db("messages", { id, kind, name, message, approved: false });
      metadataSaved = true;
    }
    // If final bookkeeping fails, keep the reservation charged; the saved submission is still a success.
    await db("rpc/finish_wedding_submission", {
      p_id: id,
      p_success: true,
    }).catch(() => {});
    return reply({ ok: true, id }, 201);
  } catch (error) {
    let removed = !storedPath;
    if (storedPath && !metadataSaved) {
      const r = await fetch(base + "/storage/v1/object/wedding-memories", {
        method: "DELETE",
        headers: {
          apikey: serviceKey,
          Authorization: "Bearer " + serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: [storedPath] }),
      }).catch(() => null);
      removed = Boolean(r?.ok);
    }
    if (id && !metadataSaved && removed)
      await db("rpc/finish_wedding_submission", {
        p_id: id,
        p_success: false,
      }).catch(() => {});
    return reply(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo completar el envío.",
      },
      error && typeof error === "object" && "status" in error
        ? Number(error.status)
        : 400,
    );
  }
});
