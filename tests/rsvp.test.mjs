import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

test("RSVP endpoint hashes both factors, uses only its RPC, and returns proof only to confirmations", async () => {
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only",
    WEDDING_RATE_SALT: "long-test-rate-limit-salt",
    WEDDING_RSVP_PROOF_SECRET: "a-test-proof-secret-that-is-longer-than-32-characters",
    WEDDING_ALLOWED_ORIGINS: "https://wedding.example",
  };
  let handler;
  globalThis.Deno = { env: { get: (key) => env[key] }, serve: (fn) => (handler = fn) };
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    if (String(url).includes("/guests?"))
      return new Response('[{"id":"guest-id"}]', { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response('"11111111-1111-4111-8111-111111111111"', { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const source = await fs.readFile(new URL("../supabase/functions/rsvp/index.ts", import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
    assert.equal(output.diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
    await import("data:text/javascript;base64," + Buffer.from(output.outputText).toString("base64"));
    const send = (response, body = {}) => handler(new Request("https://test/functions/v1/rsvp", {
      method: "POST", headers: { origin: "https://wedding.example", "content-type": "application/json" },
      body: JSON.stringify({ name: "  Familia   Pérez ", code: " ab-cd ", response, ...body }),
    }));
    const yes = await send("confirmed");
    assert.equal(yes.status, 200);
    const yesBody = await yes.json();
    assert.match(yesBody.proof, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(calls[0].url, "https://test.supabase.co/rest/v1/rpc/submit_guest_rsvp_with_proof");
    assert.equal(calls[0].body.p_name, "Familia Pérez");
    assert.match(calls[0].body.p_credential_hash, /^[0-9a-f]{64}$/);
    assert.equal("guest_id" in calls[0].body, false);
    const valid = await handler(new Request("https://test/functions/v1/rsvp", {
      method: "POST", headers: { origin: "https://wedding.example", "content-type": "application/json" },
      body: JSON.stringify({ action: "validate", proof: yesBody.proof }),
    }));
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).ok, true);
    const tampered = yesBody.proof.slice(0, -1) + (yesBody.proof.endsWith("a") ? "b" : "a");
    const invalid = await handler(new Request("https://test/functions/v1/rsvp", {
      method: "POST", headers: { origin: "https://wedding.example", "content-type": "application/json" },
      body: JSON.stringify({ action: "validate", proof: tampered }),
    }));
    assert.equal(invalid.status, 401);
    const no = await send("declined");
    assert.equal((await no.json()).proof, undefined);
    assert.equal((await send("pending")).status, 400);
    assert.equal(calls.filter((call) => call.url.includes("/rpc/")).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Deno;
  }
});
