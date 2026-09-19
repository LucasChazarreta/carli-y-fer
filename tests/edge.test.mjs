import { loadEdge } from "./helpers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
test("guest endpoint validates access and real file headers, then reserves and stores in order", async () => {
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-test-only",
    WEDDING_ALLOW_LEGACY_CODE: "true",
    WEDDING_GUEST_CODE: "guest-code-test-12345",
    WEDDING_RATE_SALT: "test-random-salt-not-production",
    WEDDING_ALLOWED_ORIGINS: "https://wedding.example",
  };
  let handler;
  globalThis.Deno = {
    env: { get: (key) => env[key] },
    serve: (fn) => (handler = fn),
  };
  const originalFetch = globalThis.fetch;
  let calls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("consume_invitation_rate"))
      return new Response("true");
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    handler = await loadEdge(
      "supabase/functions/guest-submit/index.ts",
      env,
      globalThis.fetch,
    );
    const submit = async ({
      code = env.WEDDING_GUEST_CODE,
      action = "message",
      file,
      origin = "https://wedding.example",
    } = {}) => {
      const form = new FormData();
      form.set("name", "Invitado");
      form.set("code", code);
      form.set("action", action);
      form.set("message", "Felicidades");
      form.set("consent", "on");
      if (file) form.set("file", file);
      return handler(
        new Request("https://test.supabase.co/functions/v1/guest-submit", {
          method: "POST",
          headers: { origin },
          body: form,
        }),
      );
    };
    assert.equal(
      (await submit({ origin: "https://unknown.example" })).status,
      403,
    );
    assert.equal(calls.length, 0);
    assert.equal((await submit({ code: "wrong-code" })).status, 401);
    assert.equal(calls.length, 0);
    const fake = new File(["<html>not a JPEG</html>"], "photo.jpg", {
      type: "image/jpeg",
    });
    assert.equal((await submit({ action: "upload", file: fake })).status, 400);
    assert.equal(calls.length, 0);
    const ok = await submit();
    assert.equal(ok.status, 201);
    assert.deepEqual(
      calls.map((c) => c.url.split("/rest/v1/")[1]),
      [
        "rpc/reserve_wedding_submission",
        "messages",
        "rpc/finish_wedding_submission",
      ],
    );
    const saved = JSON.parse(calls[1].options.body);
    assert.equal(saved.approved, false);
    assert.equal(saved.kind, "message");
    calls = [];
    const jpeg = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])],
      "test.jpg",
      { type: "image/jpeg" },
    );
    const uploaded = await submit({ action: "upload", file: jpeg });
    assert.equal(uploaded.status, 201);
    assert.ok(calls[1].url.includes("/storage/v1/object/wedding-memories/"));
    assert.equal(JSON.parse(calls[0].options.body).p_size, 8);
    assert.equal(JSON.parse(calls[2].options.body).mime, "image/jpeg");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Deno;
  }
});
