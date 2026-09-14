import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Postgres schema enforces privacy, admin roles, publication conflicts, capacity and deadlines", async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated,anon;grant select,delete on storage.objects to authenticated,anon;
 grant usage on schema public to anon,authenticated,service_role;`);
  await db.exec(
    await fs.readFile(
      new URL("../supabase/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await fs.readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
  );
  const admin = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222";
  await db.exec(`insert into auth.users values('${admin}'),('${other}');insert into private.wedding_admins values('${admin}');
 insert into public.guests(name) values('Persona privada');
 insert into public.messages(kind,name,message,approved) values('message','Público','Aprobado',true),('message','Privado','Pendiente',false),('song','DJ','Canción',false);
 insert into storage.objects(bucket_id,name) values('wedding-memories','private.jpg');`);
  async function as(role, uid, query, params = []) {
    await db.exec("begin");
    try {
      await db.exec("set local role " + role);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        uid,
      ]);
      const r = await db.query(query, params);
      await db.exec("rollback");
      return r.rows;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  }
  assert.equal(
    (await as("anon", "", "select * from public.wedding_settings")).length,
    1,
  );
  assert.deepEqual(
    (await as("anon", "", "select name from public.messages")).map(
      (r) => r.name,
    ),
    ["Público"],
  );
  await assert.rejects(
    () => as("anon", "", "select * from public.guests"),
    /permission denied/,
  );
  await assert.rejects(
    () => as("anon", "", "update public.guests set status='confirmed'"),
    /permission denied/,
  );
  assert.equal(
    (await as("authenticated", other, "select * from public.guests")).length,
    0,
  );
  await assert.rejects(
    () =>
      as(
        "authenticated",
        other,
        "insert into public.guests(name) values('intruso')",
      ),
    /row-level security/,
  );
  assert.equal(
    (await as("authenticated", admin, "select * from public.guests")).length,
    1,
  );
  await db.exec(`update public.guests set credential_hash=encode(sha256(convert_to('INVITE-123','UTF8')),'hex') where name='Persona privada'`);
  const clientHash = "a".repeat(64);
  assert.equal(
    (await db.query("select public.submit_guest_rsvp(encode(sha256(convert_to('INVITE-123','UTF8')),'hex'),'Persona privada','confirmed',$1) as ok", [clientHash])).rows[0].ok,
    true,
  );
  // Repeating an answer is safe, and a later change updates only this credential.
  assert.equal(
    (await db.query("select public.submit_guest_rsvp(encode(sha256(convert_to('INVITE-123','UTF8')),'hex'),'Persona privada','confirmed',$1) as ok", [clientHash])).rows[0].ok,
    true,
  );
  assert.equal(
    (await db.query("select public.submit_guest_rsvp(encode(sha256(convert_to('INVITE-123','UTF8')),'hex'),'Persona privada','declined',$1) as ok", [clientHash])).rows[0].ok,
    true,
  );
  assert.equal(
    (await db.query("select public.submit_guest_rsvp(encode(sha256(convert_to('INVITE-123','UTF8')),'hex'),'Nombre incorrecto','confirmed',$1) as ok", [clientHash])).rows[0].ok,
    false,
  );
  const audited = (await as("authenticated", admin, "select status,response_first_at,response_updated_at,response_count,response_name from public.guests"))[0];
  assert.equal(audited.status, "declined");
  assert.equal(audited.response_count, 3);
  assert.ok(audited.response_first_at);
  assert.ok(audited.response_updated_at);
  assert.equal(audited.response_name, "Persona privada");
  assert.equal(
    (await as("authenticated", admin, "select * from public.messages")).length,
    3,
  );
  assert.equal(
    (await as("anon", "", "select * from storage.objects")).length,
    0,
  );
  assert.equal(
    (await as("authenticated", other, "select * from storage.objects")).length,
    0,
  );
  assert.equal(
    (await as("authenticated", admin, "select * from storage.objects")).length,
    1,
  );
  await assert.rejects(
    () => as("authenticated", other, "select public.publish_wedding(now())"),
    /Acceso denegado/,
  );
  await assert.rejects(
    () =>
      as("authenticated", admin, "select public.publish_wedding('2000-01-01')"),
    /borrador cambió/,
  );
  await assert.rejects(
    () =>
      as(
        "anon",
        "",
        "select public.reserve_wedding_submission(gen_random_uuid(),repeat('a',64),'upload',10)",
      ),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      as(
        "authenticated",
        admin,
        "update public.messages set approved=true where kind='song'",
      ),
    /songs_are_private/,
  );
  const data = (
    await db.query(
      "select data,updated_at::text as stamp from public.wedding_draft",
    )
  ).rows[0];
  const changed = { ...data.data, names: "Carli & Fer" };
  const result = await as(
    "authenticated",
    admin,
    "select public.save_wedding_draft($1::jsonb,$2::timestamptz) as stamp",
    [JSON.stringify(changed), data.stamp],
  );
  assert.ok(result[0].stamp);
  await assert.rejects(
    () =>
      as(
        "authenticated",
        admin,
        "select public.save_wedding_draft($1::jsonb,$2::timestamptz)",
        [JSON.stringify(changed), "2000-01-01"],
      ),
    /Otra persona/,
  );
  for (let i = 0; i < 32; i++)
    await db.query(
      "select public.reserve_wedding_submission(gen_random_uuid(),repeat('a',64),'upload',26214400)",
    );
  await assert.rejects(
    () =>
      db.query(
        "select public.reserve_wedding_submission(gen_random_uuid(),repeat('a',64),'upload',1)",
      ),
    /capacidad/,
  );
  await db.exec(
    "update private.album_policy set closes_at=now()-interval '1 day'",
  );
  await assert.rejects(
    () =>
      db.query(
        "select public.reserve_wedding_submission(gen_random_uuid(),repeat('a',64),'upload',1)",
      ),
    /no recibe archivos/,
  );
  assert.equal(
    (await as("authenticated", admin, "select * from storage.objects")).length,
    0,
  );
  await db.close();
});
