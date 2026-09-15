import {
  HttpError,
  cors,
  response,
  ensureReady,
  readJson,
  rate,
  tokenHash,
  rpc,
  validateProof,
  publicSnapshot,
} from "../_shared/security.ts";
Deno.serve(async (req: Request) => {
  let headers = {};
  try {
    headers = cors(req);
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST") throw new HttpError(405, "Método no permitido.");
    ensureReady();
    const client = await rate(req);
    const body = await readJson(req);
    if (body.action === "validate") {
      const { claims } = await validateProof(body.proof);
      return response({ ok: true, expiresAt: claims.exp * 1000 }, 200, headers);
    }
    if (!["resolve", "submit"].includes(body.action))
      throw new HttpError(400, "Solicitud inválida.");
    const hash = await tokenHash(body.token);
    let invite;
    if (body.action === "resolve")
      invite = await rpc("resolve_invitation", { p_hash: hash });
    else {
      if (
        !Number.isSafeInteger(body.revision) ||
        !/^[0-9a-f-]{36}$/.test(body.requestId || "") ||
        !Array.isArray(body.answers) ||
        body.answers.some(
          (a: any) =>
            !a || Object.keys(a).some((k) => !["key", "status"].includes(k)),
        )
      )
        throw new HttpError(400, "Revisá tus respuestas.");
      invite = await rpc("submit_invitation_rsvp", {
        p_hash: hash,
        p_expected: body.revision,
        p_request: body.requestId,
        p_answers: body.answers,
        p_client: client,
      });
      if (invite?.error) {
        const messages: Record<string, string> = {
          conflict:
            "Las respuestas cambiaron. Actualizá la invitación antes de guardar.",
          closed: "El plazo para responder finalizó. Contactá a la pareja.",
          payload: "Revisá tus respuestas.",
          invalid:
            "No pudimos verificar esta invitación. Pedí tu enlace a la pareja.",
        };
        throw new HttpError(
          invite.status,
          messages[invite.error] || messages.invalid,
        );
      }
    }
    if (!invite)
      throw new HttpError(
        401,
        "No pudimos verificar esta invitación. Pedí tu enlace a la pareja.",
      );
    return response(await publicSnapshot(invite, hash), 200, headers);
  } catch (error) {
    return response(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "No se pudo conectar. Intentá nuevamente.",
      },
      error instanceof HttpError ? error.status : 503,
      headers,
    );
  }
});
