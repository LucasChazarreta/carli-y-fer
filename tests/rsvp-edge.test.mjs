import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

test("RSVP Edge endpoint enforces the complete private confirmation contract", async () => {
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only",
    WEDDING_RATE_SALT: "long-test-rate-limit-salt",
    WEDDING_RSVP_PROOF_SECRET: "a-test-proof-secret-that-is-longer-than-32-characters",
    WEDDING_ALLOWED_ORIGINS: "https://wedding.example",
  };
  let handler;
  globalThis.Deno = { env: { get: (key) => env[key] }, serve: (callback) => { handler = callback; } };
  const originalFetch = globalThis.fetch;
  const expectedHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("AB-CD"))), (n) => n.toString(16).padStart(2, "0")).join("");
  const calls = [];
  let guestStatus = "pending";
  let successfulUpdates = 0;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body ? JSON.parse(options.body) : null };
    calls.push(call);
    if (call.url.includes("/rpc/")) {
      const matches = call.body.p_credential_hash === expectedHash && call.body.p_name === "Familia Pérez";
      if (matches) {
        guestStatus = call.body.p_status;
        successfulUpdates++;
      }
      return new Response(JSON.stringify(matches ? "11111111-1111-4111-8111-111111111111" : null), { status: 200 });
    }
    const confirmed = guestStatus === "confirmed";
    return new Response(JSON.stringify(confirmed ? [{ id: "11111111-1111-4111-8111-111111111111" }] : []), { status: 200 });
  };
  try {
    const source = await fs.readFile(new URL("../supabase/functions/rsvp/index.ts", import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
    assert.equal(output.diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error).length, 0);
    await import("data:text/javascript;base64," + Buffer.from(output.outputText).toString("base64"));
    const request = (body, { method = "POST", origin = "https://wedding.example", headers = {} } = {}) => handler(new Request("https://test/functions/v1/rsvp", {
      method,
      headers: { origin, "content-type": "application/json", ...headers },
      body: method === "GET" ? undefined : JSON.stringify(body),
    }));
    const answer = (response, extra = {}) => request({ name: "  Familia   Pérez ", code: " ab-cd ", response, ...extra });

    assert.equal((await request({}, { origin: "https://evil.example" })).status, 403);
    assert.equal((await request({}, { method: "GET" })).status, 405);
    assert.equal((await request({}, { method: "OPTIONS" })).status, 204);
    assert.equal(calls.length, 0);
    for (const code of ["", "x".repeat(101)]) {
      const malformed = await request({ name: "Familia Pérez", code, response: "confirmed" });
      assert.equal(malformed.status, 400);
      assert.match((await malformed.json()).error, /Revisá los datos/u);
    }
    assert.equal((await request({ name: "x".repeat(121), code: "AB-CD", response: "confirmed" })).status, 400);
    assert.equal((await request({ name: "Familia Pérez", code: "AB-CD", response: "maybe" })).status, 400);
    assert.equal((await request({}, { headers: { "content-length": "2049" } })).status, 400);
    assert.equal(calls.length, 0);

    const wrongCode = await request({ name: "Familia Pérez", code: "WRONG", response: "confirmed" });
    const wrongName = await request({ name: "Otra familia", code: "AB-CD", response: "confirmed" });
    assert.equal(wrongCode.status, 400);
    assert.equal(wrongName.status, 400);
    assert.equal((await wrongCode.json()).error, (await wrongName.json()).error, "name and code failures must not enumerate guests");
    assert.equal(guestStatus, "pending");

    const confirmed = await answer("confirmed", { guest_id: "22222222-2222-4222-8222-222222222222" });
    assert.equal(confirmed.status, 200);
    const confirmation = await confirmed.json();
    assert.match(confirmation.proof, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    const rpc = calls.find((call) => call.url.includes("/rpc/") && call.body.p_credential_hash === expectedHash);
    assert.equal("guest_id" in rpc.body, false, "a client cannot choose the updated guest identifier");
    assert.equal(guestStatus, "confirmed");

    assert.equal((await answer("confirmed")).status, 200, "duplicate confirmation is idempotently accepted");
    assert.equal(guestStatus, "confirmed");
    const declined = await answer("declined");
    assert.equal(declined.status, 200);
    assert.equal((await declined.json()).proof, undefined);
    assert.equal(guestStatus, "declined");
    assert.equal((await answer("confirmed")).status, 200);
    assert.equal(guestStatus, "confirmed");
    assert.equal(successfulUpdates, 4);

    const validation = await request({ action: "validate", proof: confirmation.proof });
    assert.equal(validation.status, 200);
    assert.equal((await validation.json()).ok, true);
    const tampered = confirmation.proof.slice(0, -1) + (confirmation.proof.endsWith("a") ? "b" : "a");
    const rejected = await request({ action: "validate", proof: tampered });
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json()).error, "No se pudo verificar la confirmación.");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Deno;
  }
});
