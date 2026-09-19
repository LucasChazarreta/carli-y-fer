import test from "node:test";
import assert from "node:assert/strict";
import { database, as, admin, other } from "./helpers.mjs";
const digest = "a".repeat(64),
  client = "b".repeat(64),
  cipher = "encrypted.".repeat(10);
const saveSql = "select public.admin_save_invitation($1,$2,$3,$4,$5,$6) id";
test("V2 PostgreSQL: family responses, strict authorization, revocation, retries and concurrent revisions", async (t) => {
  const db = await database();
  t.after(() => db.close());
  let id, snapshot;
  async function resolve(h = digest) {
    return (await db.query("select public.resolve_invitation($1) result", [h]))
      .rows[0].result;
  }
  async function submit(
    answers,
    revision = snapshot.revision,
    request = crypto.randomUUID(),
    h = digest,
  ) {
    return (
      await db.query(
        "select public.submit_invitation_rsvp($1,$2,$3,$4,$5) result",
        [h, revision, request, answers, client],
      )
    ).rows[0].result;
  }
  await t.test(
    "admin creates a family; non-admin and anon cannot create or enumerate",
    async () => {
      for (const role of ["anon", "authenticated"])
        await assert.rejects(() =>
          as(db, role, other, saveSql, [
            null,
            null,
            "Familia",
            JSON.stringify([{ name: "Ana" }]),
            digest,
            cipher,
          ]),
        );
      id = (
        await as(db, "authenticated", admin, saveSql, [
          null,
          null,
          "Familia Gómez",
          JSON.stringify([
            { name: "Juan" },
            { name: "Ana" },
            { name: "Sofía" },
          ]),
          digest,
          cipher,
        ])
      )[0].id;
      snapshot = await resolve();
      assert.equal(snapshot.guests.length, 3);
      assert.equal(snapshot.displayName, "Familia Gómez");
      for (const table of ["invitations", "guests"]) {
        await assert.rejects(
          () => as(db, "anon", "", `select * from public.${table}`),
          /permission denied/,
        );
        assert.equal(
          (
            await as(
              db,
              "authenticated",
              other,
              `select * from public.${table}`,
            )
          ).length,
          0,
        );
      }
      for (const fn of [
        "resolve_invitation(text)",
        "consume_invitation_rate(text)",
        "submit_invitation_rsvp(text,bigint,uuid,jsonb,text)",
        "confirmed_invitation(uuid,text)",
      ]) {
        const r = (
          await db.query(
            "select has_function_privilege('anon',$1,'execute') a,has_function_privilege('authenticated',$1,'execute') b,has_function_privilege('service_role',$1,'execute') c",
            ["public." + fn],
          )
        ).rows[0];
        assert.deepEqual(r, { a: false, b: false, c: true });
      }
      assert.equal(await resolve("f".repeat(64)), null);
    },
  );
  await t.test(
    "partial family confirmation and double submit are idempotent",
    async () => {
      const request = crypto.randomUUID(),
        revision = snapshot.revision,
        answers = [{ key: snapshot.guests[0].key, status: "confirmed" }];
      snapshot = await submit(answers, revision, request);
      assert.equal(
        snapshot.guests.filter((g) => g.status === "confirmed").length,
        1,
      );
      assert.equal(
        snapshot.guests.filter((g) => g.status === "pending").length,
        2,
      );
      assert.deepEqual(await submit(answers, revision, request), snapshot);
      const rows = (
        await db.query("select sum(response_count)::int n from public.guests")
      ).rows;
      assert.equal(rows[0].n, 1);
      assert.equal(
        (
          await submit(
            [{ ...answers[0], status: "declined" }],
            revision,
            request,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "foreign member, duplicates and null fields cannot update any person",
    async () => {
      for (const answers of [
        [{ key: "f".repeat(64), status: "confirmed" }],
        [{ key: snapshot.guests[0].key, status: null }],
        [
          { key: snapshot.guests[0].key, status: "confirmed" },
          { key: snapshot.guests[0].key, status: "declined" },
        ],
      ])
        assert.equal((await submit(answers)).status, 400);
      assert.deepEqual(await resolve(), snapshot);
    },
  );
  await t.test(
    "all confirmed then all declined; old proof authorization is rejected",
    async () => {
      snapshot = await submit(
        snapshot.guests.map((g) => ({ key: g.key, status: "confirmed" })),
      );
      assert.ok(snapshot.guests.every((g) => g.status === "confirmed"));
      assert.equal(
        (
          await db.query("select public.confirmed_invitation($1,$2) ok", [
            id,
            digest,
          ])
        ).rows[0].ok,
        true,
      );
      snapshot = await submit(
        snapshot.guests.map((g) => ({ key: g.key, status: "declined" })),
      );
      assert.ok(snapshot.guests.every((g) => g.status === "declined"));
      assert.equal(
        (
          await db.query("select public.confirmed_invitation($1,$2) ok", [
            id,
            digest,
          ])
        ).rows[0].ok,
        false,
      );
    },
  );
  await t.test(
    "concurrent submissions from the same revision admit one writer",
    async () => {
      const rev = snapshot.revision,
        key = snapshot.guests[0].key;
      const results = await Promise.all([
        submit([{ key, status: "confirmed" }], rev),
        submit([{ key, status: "declined" }], rev),
      ]);
      assert.equal(results.filter((r) => r.status === 409).length, 1);
      snapshot = await resolve();
    },
  );
  await t.test(
    "revoked and regenerated tokens cannot resolve or authorize an old link",
    async () => {
      await as(
        db,
        "authenticated",
        admin,
        "select public.admin_rotate_invitation($1,$2,null,null,true)",
        [id, snapshot.revision],
      );
      assert.equal(await resolve(), null);
      assert.equal(
        (await submit([{ key: snapshot.guests[0].key, status: "confirmed" }]))
          .status,
        401,
      );
      await as(
        db,
        "authenticated",
        admin,
        "select public.admin_rotate_invitation($1,$2,$3,$4,false)",
        [id, snapshot.revision + 1, "c".repeat(64), cipher],
      );
      assert.equal(await resolve(), null);
      assert.equal((await resolve("c".repeat(64))).guests.length, 3);
    },
  );
  await t.test(
    "server deadline blocks late edits; resolve still works",
    async () => {
      await db.exec(
        `update public.wedding_settings set data=jsonb_set(data,'{responseDeadline}','"2000-01-01"')`,
      );
      const s = await resolve("c".repeat(64));
      assert.equal(
        (
          await submit(
            [{ key: s.guests[0].key, status: "confirmed" }],
            s.revision,
            crypto.randomUUID(),
            "c".repeat(64),
          )
        ).status,
        410,
      );
    },
  );
  await t.test(
    "rate limit is atomic and keeps rejected attempts counted",
    async () => {
      for (let n = 0; n < 240; n++)
        assert.equal(
          (
            await db.query("select public.consume_invitation_rate($1) ok", [
              client,
            ])
          ).rows[0].ok,
          true,
        );
      assert.equal(
        (
          await db.query("select public.consume_invitation_rate($1) ok", [
            client,
          ])
        ).rows[0].ok,
        false,
      );
    },
  );
  await t.test(
    "individual invitation, admin edits and ownership validation",
    async () => {
      const iid = (
        await as(db, "authenticated", admin, saveSql, [
          null,
          null,
          "Lucía",
          JSON.stringify([{ name: "Lucía" }]),
          "d".repeat(64),
          cipher,
        ])
      )[0].id;
      assert.equal((await resolve("d".repeat(64))).guests.length, 1);
      const foreign = (
        await db.query("select id from public.guests where invitation_id=$1", [
          id,
        ])
      ).rows[0].id;
      await assert.rejects(
        () =>
          as(db, "authenticated", admin, saveSql, [
            iid,
            2,
            "Lucía",
            JSON.stringify([{ id: foreign, name: "Otro" }]),
            null,
            null,
          ]),
        /ajena/,
      );
    },
  );
});
