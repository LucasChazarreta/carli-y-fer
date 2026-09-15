import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
export const admin = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
export async function database(file = "supabase/schema.sql") {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated,anon;grant select,delete on storage.objects to authenticated,anon;grant usage on schema public to anon,authenticated,service_role;`);
  await db.exec(await fs.readFile(file, "utf8"));
  await db.exec(await fs.readFile("supabase/seed.sql", "utf8"));
  await db.exec(
    `insert into auth.users values('${admin}'),('${other}');insert into private.wedding_admins values('${admin}');`,
  );
  return db;
}
export async function as(db, role, uid, sql, args = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role " + role);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
    const r = await db.query(sql, args);
    await db.exec("commit");
    return r.rows;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
export async function loadEdge(file, env, fetcher) {
  let handler;
  globalThis.Deno = {
    env: { get: (k) => env[k] },
    serve: (fn) => {
      handler = fn;
    },
  };
  globalThis.fetch = fetcher;
  const shared = ts.transpileModule(
    await fs.readFile("supabase/functions/_shared/security.ts", "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  const sharedURL =
    "data:text/javascript;base64," +
    Buffer.from(shared + "\n//" + Math.random()).toString("base64");
  const raw = (await fs.readFile(file, "utf8")).replace(
    '"../_shared/security.ts"',
    JSON.stringify(sharedURL),
  );
  const out = ts.transpileModule(raw, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });
  await import(
    "data:text/javascript;base64," +
      Buffer.from(out.outputText + "\n//" + Math.random()).toString("base64")
  );
  return handler;
}
export const edgeEnv = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test-secret-key",
  WEDDING_RATE_SALT: "long-test-rate-limit-salt",
  WEDDING_ALLOWED_ORIGINS: "https://wedding.example",
};
