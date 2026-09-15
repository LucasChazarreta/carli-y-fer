import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { database } from "./helpers.mjs";
test("incremental migration preserves existing people, settings, messages and administrator", async (t) => {
  const db = await database("tests/fixtures/pre-v2-schema.sql");
  t.after(() => db.close());
  await db.exec(
    "insert into public.guests(name,group_name,status,notes) values('Ana','Familia','confirmed','Conservar'),('Juan','Familia','declined','Privado');insert into public.messages(kind,name,message) values('message','Ana','Conservar mensaje')",
  );
  const before = (await db.query("select * from public.guests order by name"))
    .rows;
  await db.exec(
    await fs.readFile(
      "supabase/migrations/20260915032157_invitations_v2.sql",
      "utf8",
    ),
  );
  const after = (await db.query("select * from public.guests order by name"))
    .rows;
  for (let n = 0; n < before.length; n++)
    for (const key of Object.keys(before[n]).filter((k) => k !== "updated_at"))
      assert.deepEqual(after[n][key], before[n][key]);
  assert.equal(
    (
      await db.query(
        "select * from public.invitations where revoked_at is not null",
      )
    ).rows.length,
    2,
  );
  assert.equal(
    (await db.query("select * from public.messages")).rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from private.wedding_admins")).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select data->>'ceremonyMap' map from public.wedding_settings",
      )
    ).rows[0].map,
    "https://goo.su/dLQSOD",
  );
});
