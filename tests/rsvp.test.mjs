import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

test("RSVP endpoint hashes both factors, uses only its RPC, and returns proof only to confirmations", async () => {
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only",
    WEDDING_RATE_SALT: "long-test-rate-limit-salt",
    WEDDING_ALLOWED_ORIGINS: "https://wedding.example",
  };
  let handler;
  globalThis.Deno = { env: { get: (key) => env[key] }, serve: (fn) => (handler = fn) };
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response("true", { status: 200, headers: { "Content-Type": "application/json" } });
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
    assert.match(yesBody.proof, /^[0-9a-f-]+\.[0-9a-f-]+$/);
    assert.equal(calls[0].url, "https://test.supabase.co/rest/v1/rpc/submit_guest_rsvp");
    assert.equal(calls[0].body.p_name, "Familia Pérez");
    assert.match(calls[0].body.p_credential_hash, /^[0-9a-f]{64}$/);
    assert.equal("guest_id" in calls[0].body, false);
    const no = await send("declined");
    assert.equal((await no.json()).proof, undefined);
    assert.equal((await send("pending")).status, 400);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Deno;
  }
});
