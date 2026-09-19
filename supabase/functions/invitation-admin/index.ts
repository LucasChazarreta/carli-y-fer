import {
  base,
  serviceKey,
  HttpError,
  cors,
  response,
  ensureReady,
  readJson,
  rpc,
  newCredential,
  decryptCredential,
  hash,
} from "../_shared/security.ts";
Deno.serve(async (req: Request) => {
  let headers = {};
  try {
    headers = cors(req);
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST") throw new HttpError(405, "Método no permitido.");
    ensureReady();
    const jwt = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!jwt) throw new HttpError(401, "Ingresá al panel.");
    const user = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!user.ok || !(await rpc("is_wedding_admin", {}, jwt)))
      throw new HttpError(403, "Acceso denegado.");
    const body = await readJson(req);
    if (body.action === "link") {
      const saved = await rpc(
        "admin_invitation_credential",
        { p_id: body.id },
        jwt,
      );
      if (!saved)
        throw new HttpError(410, "El enlace está revocado. Generá uno nuevo.");
      const token = await decryptCredential(saved.cipher);
      if ((await hash(token)) !== saved.hash)
        throw new HttpError(503, "No se pudo recuperar el enlace.");
      return response({ token }, 200, headers);
    }
    if (body.action === "save") {
      const credential = body.id ? null : await newCredential();
      const id = await rpc(
        "admin_save_invitation",
        {
          p_id: body.id || null,
          p_expected: body.revision ?? null,
          p_name: body.name,
          p_guests: body.guests,
          p_hash: credential?.hash || null,
          p_cipher: credential?.cipher || null,
        },
        jwt,
      );
      return response(
        { id, ...(credential ? { token: credential.token } : {}) },
        200,
        headers,
      );
    }
    if (body.action === "rotate" || body.action === "revoke") {
      const credential =
        body.action === "rotate" ? await newCredential() : null;
      await rpc(
        "admin_rotate_invitation",
        {
          p_id: body.id,
          p_expected: body.revision,
          p_hash: credential?.hash || null,
          p_cipher: credential?.cipher || null,
          p_revoke: body.action === "revoke",
        },
        jwt,
      );
      return response(
        { ok: true, ...(credential ? { token: credential.token } : {}) },
        200,
        headers,
      );
    }
    throw new HttpError(400, "Solicitud inválida.");
  } catch (error) {
    return response(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "No se pudo completar la operación.",
      },
      error instanceof HttpError ? error.status : 503,
      headers,
    );
  }
});
