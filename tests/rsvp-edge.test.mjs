import test from "node:test";
import assert from "node:assert/strict";
import { database, as, admin, loadEdge, edgeEnv } from "./helpers.mjs";
test("V2 Edge integration: create, recover encrypted link, RSVP and confirmed guest submissions", async (t) => {
  const originalFetch = globalThis.fetch,
    db = await database();
  t.after(async () => {
    globalThis.fetch = originalFetch;
    delete globalThis.Deno;
    await db.close();
  });
  let forbidden = false,
    rateAllowed = true;
  const fetcher = async (url, options = {}) => {
    if (String(url).endsWith("/auth/v1/user"))
      return new Response("{}", { status: forbidden ? 401 : 200 });
    const name = String(url).split("/rpc/")[1],
      body = options.body ? JSON.parse(options.body) : {};
    if (name === "consume_invitation_rate" && !rateAllowed)
      return new Response("false");
    if (name) {
      try {
        const keys = Object.keys(body),
          values = keys.map((k) =>
            typeof body[k] === "object" && body[k] !== null
              ? JSON.stringify(body[k])
              : body[k],
          );
        const sql = `select public.${name}(${keys.map((k, n) => `${k}=>$${n + 1}`).join(",")}) result`;
        const rows = await as(
          db,
          options.headers.Authorization === "Bearer admin-jwt"
            ? "authenticated"
            : "service_role",
          admin,
          sql,
          values,
        );
        return new Response(JSON.stringify(rows[0].result));
      } catch (e) {
        return new Response(JSON.stringify({ message: e.message }), {
          status: 400,
        });
      }
    }
    return new Response("{}");
  };
  const adminHandler = await loadEdge(
    "supabase/functions/invitation-admin/index.ts",
    edgeEnv,
    fetcher,
  );
  const rsvp = await loadEdge(
    "supabase/functions/rsvp/index.ts",
    edgeEnv,
    fetcher,
  );
  const guest = await loadEdge(
    "supabase/functions/guest-submit/index.ts",
    edgeEnv,
    fetcher,
  );
  const send = (handler, body, extra = {}) =>
    handler(
      new Request("https://test/functions", {
        method: extra.method || "POST",
        headers: {
          origin: extra.origin || "https://wedding.example",
          "content-type": "application/json",
          ...(handler === adminHandler
            ? { authorization: "Bearer admin-jwt" }
            : {}),
          ...extra.headers,
        },
        body: extra.method === "GET" ? undefined : JSON.stringify(body),
      }),
    );
  let token, id, state, proof;
  await t.test(
    "admin-only creation generates random tokens and recoverable ciphertext",
    async () => {
      forbidden = true;
      assert.equal(
        (
          await send(adminHandler, {
            action: "save",
            name: "Familia",
            guests: [{ name: "Ana" }],
          })
        ).status,
        403,
      );
      forbidden = false;
      const result = await send(adminHandler, {
        action: "save",
        name: "Familia",
        guests: [{ name: "Ana" }, { name: "Juan" }],
      });
      assert.equal(result.status, 200);
      ({ token, id } = await result.json());
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      const stored = (
        await db.query("select * from private.invitation_credentials")
      ).rows[0];
      assert.ok(!JSON.stringify(stored).includes(token));
      assert.equal(
        (await (await send(adminHandler, { action: "link", id })).json()).token,
        token,
      );
    },
  );
  await t.test(
    "invalid, unrecognized and revoked tokens are indistinguishable; CORS and size limits work",
    async () => {
      const bad = await send(rsvp, { action: "resolve", token: "wrong" }),
        unknown = await send(rsvp, {
          action: "resolve",
          token: "Z".repeat(43),
        });
      assert.equal(bad.status, 401);
      assert.deepEqual(await bad.json(), await unknown.json());
      assert.equal(
        (await send(rsvp, {}, { origin: "https://evil.example" })).status,
        403,
      );
      assert.equal((await send(rsvp, {}, { method: "GET" })).status, 405);
      assert.equal((await send(rsvp, {}, { method: "OPTIONS" })).status, 204);
      assert.equal(
        (await send(rsvp, { padding: "x".repeat(66000) })).status,
        413,
      );
      rateAllowed = false;
      assert.equal(
        (await send(rsvp, { action: "resolve", token })).status,
        429,
      );
      rateAllowed = true;
    },
  );
  await t.test(
    "resolve exposes only this invitation and never internal guest IDs or notes",
    async () => {
      state = await (await send(rsvp, { action: "resolve", token })).json();
      assert.equal(state.guests.length, 2);
      assert.equal(state.displayName, "Familia");
      assert.equal(state.id, undefined);
      assert.equal(state.guests[0].id, undefined);
      assert.equal(state.guests[0].notes, undefined);
      assert.equal(state.proof, undefined);
    },
  );
  await t.test(
    "partial RSVP issues a proof; raw guest IDs and foreign selectors are rejected",
    async () => {
      const body = {
        action: "submit",
        token,
        revision: state.revision,
        requestId: crypto.randomUUID(),
        answers: [{ key: state.guests[0].key, status: "confirmed" }],
      };
      assert.equal(
        (
          await send(rsvp, {
            ...body,
            answers: [{ guest_id: "other", status: "confirmed" }],
          })
        ).status,
        400,
      );
      const result = await send(rsvp, body);
      assert.equal(result.status, 200);
      state = await result.json();
      proof = state.proof;
      assert.equal(
        state.guests.filter((g) => g.status === "confirmed").length,
        1,
      );
      assert.ok(proof);
      assert.equal((await send(rsvp, body)).status, 200);
      assert.equal(
        (await send(rsvp, { action: "validate", proof })).status,
        200,
      );
    },
  );
  await t.test(
    "tampered and expired proofs cannot authorize access",
    async () => {
      const [payload, signature] = proof.split(".");
      const bad =
        payload + "." + (signature[0] === "A" ? "B" : "A") + signature.slice(1);
      assert.equal(
        (await send(rsvp, { action: "validate", proof: bad })).status,
        401,
      );
      const now = Date.now;
      Date.now = () => now() + 1900000;
      try {
        assert.equal(
          (await send(rsvp, { action: "validate", proof })).status,
          401,
        );
      } finally {
        Date.now = now;
      }
    },
  );
  await t.test(
    "songs and messages accept proof without global code; missing proof is rejected",
    async () => {
      const form = new FormData();
      form.set("name", "Ana");
      form.set("action", "song");
      form.set("message", "Nuestra canción");
      const req = () =>
        new Request("https://test/functions/guest-submit", {
          method: "POST",
          headers: { origin: "https://wedding.example" },
          body: form,
        });
      assert.equal((await guest(req())).status, 401);
      form.set("proof", proof);
      assert.equal((await guest(req())).status, 201);
    },
  );
  await t.test(
    "all declined invalidate confirmation access immediately",
    async () => {
      state = await (
        await send(rsvp, {
          action: "submit",
          token,
          revision: state.revision,
          requestId: crypto.randomUUID(),
          answers: state.guests.map((g) => ({
            key: g.key,
            status: "declined",
          })),
        })
      ).json();
      assert.equal(state.proof, undefined);
      assert.equal(
        (await send(rsvp, { action: "validate", proof })).status,
        401,
      );
    },
  );
  await t.test(
    "rotation changes link only on explicit request and revocation blocks it",
    async () => {
      const rotated = await (
        await send(adminHandler, {
          action: "rotate",
          id,
          revision: state.revision,
        })
      ).json();
      assert.notEqual(rotated.token, token);
      assert.equal(
        (await send(rsvp, { action: "resolve", token })).status,
        401,
      );
      token = rotated.token;
      state = await (await send(rsvp, { action: "resolve", token })).json();
      assert.equal(state.guests.length, 2);
      assert.equal(
        (
          await send(adminHandler, {
            action: "revoke",
            id,
            revision: state.revision,
          })
        ).status,
        200,
      );
      assert.equal(
        (await send(rsvp, { action: "resolve", token })).status,
        401,
      );
    },
  );
});
