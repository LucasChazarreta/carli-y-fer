-- Incremental V2. Applies to the deployed pre-RSVP schema without resetting data.
begin;
create table public.invitations (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check(length(trim(display_name)) between 1 and 120),
 revision bigint not null default 1,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table private.invitation_credentials (
 invitation_id uuid primary key references public.invitations(id) on delete cascade,
 token_hash text unique not null check(token_hash ~ '^[0-9a-f]{64}$'),
 token_ciphertext text not null check(length(token_ciphertext) between 40 and 1024)
);
alter table public.guests add column invitation_id uuid references public.invitations(id) on delete restrict,
 add column member_ref text not null default encode(sha256(uuid_send(gen_random_uuid())),'hex') unique,
 add column response_first_at timestamptz,
 add column response_updated_at timestamptz,
 add column response_count integer not null default 0 check(response_count>=0),
 add column response_client_hash text;
-- Preserve legacy people individually; do not guess that matching surnames are a family.
do $$ declare g record; i uuid; begin
 for g in select * from public.guests loop
  insert into public.invitations(display_name,revoked_at) values(coalesce(nullif(g.group_name,''),g.name),now()) returning id into i;
  update public.guests set invitation_id=i where id=g.id;
 end loop;
end $$;
alter table public.guests alter column invitation_id set not null;
create index guests_invitation_id_idx on public.guests(invitation_id);
create table private.invitation_requests (
 invitation_id uuid not null references public.invitations(id) on delete cascade,
 request_id uuid not null, payload jsonb not null, created_at timestamptz not null default now(),
 primary key(invitation_id,request_id)
);
create table private.invitation_rates (
 client_hash text not null check(client_hash ~ '^[0-9a-f]{64}$'),
 bucket timestamptz not null, hits integer not null, primary key(client_hash,bucket)
);
create index invitation_rates_cleanup_idx on private.invitation_rates(bucket);
alter table public.invitations enable row level security;
alter table private.invitation_credentials enable row level security;
alter table private.invitation_requests enable row level security;
alter table private.invitation_rates enable row level security;
revoke all on public.invitations from public,anon,authenticated;
grant select on public.invitations to authenticated;
grant all on public.invitations to service_role;
create policy invitations_admin on public.invitations for select to authenticated using((select public.is_wedding_admin()));
-- All edits go through transactional RPCs; read remains protected by existing RLS.
revoke insert,update,delete on public.guests from authenticated;
revoke all on private.invitation_credentials,private.invitation_requests,private.invitation_rates from public,anon,authenticated;

create function public.consume_invitation_rate(p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer; b timestamptz=to_timestamp(floor(extract(epoch from clock_timestamp())/900)*900);
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return false;end if;
 delete from private.invitation_rates where bucket < b-interval '1 day';
 insert into private.invitation_rates values(p_hash,b,1)
 on conflict(client_hash,bucket) do update set hits=least(private.invitation_rates.hits+1,241) returning hits into n;
 return n<=240;
end $$;

-- This snapshot is server-only. UUIDs and administrative notes never reach guests.
create function public.resolve_invitation(p_hash text) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'displayName',i.display_name,'revision',i.revision,
 'deadline',s.data->>'responseDeadline',
 'guests',coalesce((select jsonb_agg(jsonb_build_object('key',g.member_ref,'name',g.name,'status',g.status) order by g.name,g.id) from public.guests g where g.invitation_id=i.id),'[]'::jsonb))
 from public.invitations i join private.invitation_credentials c on c.invitation_id=i.id
 cross join public.wedding_settings s
 where c.token_hash=p_hash and i.revoked_at is null and s.id=1;
$$;
create function public.confirmed_invitation(p_id uuid,p_hash text) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from public.invitations i join private.invitation_credentials c on c.invitation_id=i.id
 where i.id=p_id and c.token_hash=p_hash and i.revoked_at is null
 and exists(select 1 from public.guests g where g.invitation_id=i.id and g.status='confirmed'));
$$;

create function public.submit_invitation_rsvp(p_hash text,p_expected bigint,p_request uuid,p_answers jsonb,p_client text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.invitations; a jsonb; previous jsonb; close_date date; g public.guests; changed boolean=false;
begin
 select v.* into i from public.invitations v join private.invitation_credentials c on c.invitation_id=v.id
 where c.token_hash=p_hash and v.revoked_at is null for update of v;
 if i.id is null then return jsonb_build_object('error','invalid','status',401);end if;
 if p_request is null or p_client is null or p_client !~ '^[0-9a-f]{64}$' or p_expected is null
 or jsonb_typeof(p_answers) is distinct from 'array' then return jsonb_build_object('error','payload','status',400);end if;
 if jsonb_array_length(p_answers) not between 1 and 100 then return jsonb_build_object('error','payload','status',400);end if;
 select payload into previous from private.invitation_requests where invitation_id=i.id and request_id=p_request;
 if previous is not null then
  if previous<>p_answers then return jsonb_build_object('error','conflict','status',409);end if;
  return public.resolve_invitation(p_hash);
 end if;
 if i.revision<>p_expected then return jsonb_build_object('error','conflict','status',409);end if;
 select (data->>'responseDeadline')::date into close_date from public.wedding_settings where id=1;
 if close_date is null or (clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date>close_date then
  return jsonb_build_object('error','closed','status',410);
 end if;
 if (select count(distinct v->>'key') from jsonb_array_elements(p_answers) v)<>jsonb_array_length(p_answers) then
  return jsonb_build_object('error','payload','status',400);
 end if;
 -- Validate every member before any write: all-or-nothing partial family updates.
 for a in select * from jsonb_array_elements(p_answers) loop
  if (a->>'status') is null or a->>'status' not in ('confirmed','declined') or a->>'key' is null
   or not exists(select 1 from public.guests where invitation_id=i.id and member_ref=a->>'key') then
   return jsonb_build_object('error','payload','status',400);
  end if;
 end loop;
 for a in select * from jsonb_array_elements(p_answers) loop
  update public.guests set status=a->>'status',response_first_at=coalesce(response_first_at,clock_timestamp()),
   response_updated_at=clock_timestamp(),response_count=response_count+1,response_client_hash=p_client
   where invitation_id=i.id and member_ref=a->>'key' and status is distinct from a->>'status';
  changed=changed or found;
 end loop;
 if changed then update public.invitations set revision=revision+1,updated_at=clock_timestamp() where id=i.id;end if;
 insert into private.invitation_requests(invitation_id,request_id,payload) values(i.id,p_request,p_answers);
 return public.resolve_invitation(p_hash);
end $$;

create function public.admin_save_invitation(p_id uuid,p_expected bigint,p_name text,p_guests jsonb,p_hash text default null,p_cipher text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.invitations; a jsonb; keep uuid[]='{}'; gid uuid;
begin
 if not public.is_wedding_admin() then raise exception 'Acceso denegado';end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120 or jsonb_typeof(p_guests) is distinct from 'array' then raise exception 'Revisá los datos de la invitación';end if;
 if jsonb_array_length(p_guests) not between 1 and 100 then raise exception 'Agregá entre 1 y 100 personas';end if;
 if p_id is null then
  if p_hash is null or p_cipher is null then raise exception 'Falta el enlace seguro';end if;
  insert into public.invitations(display_name) values(trim(p_name)) returning * into i;
  insert into private.invitation_credentials values(i.id,p_hash,p_cipher);
 else
  select * into i from public.invitations where id=p_id for update;
  if i.id is null or i.revision is distinct from p_expected then raise exception 'La invitación cambió. Actualizá antes de guardar.';end if;
 end if;
 for a in select * from jsonb_array_elements(p_guests) loop
  if length(trim(coalesce(a->>'name',''))) not between 1 and 120 or coalesce(a->>'status','pending') not in ('pending','confirmed','declined') then raise exception 'Revisá los datos de cada persona';end if;
  gid=nullif(a->>'id','')::uuid;
  if gid is null then
   insert into public.guests(invitation_id,name,group_name,status,dietary,notes)
   values(i.id,trim(a->>'name'),left(trim(p_name),80),coalesce(a->>'status','pending'),coalesce(a->>'dietary',''),coalesce(a->>'notes','')) returning id into gid;
  else
   if gid=any(keep) then raise exception 'Persona repetida';end if;
   update public.guests set name=trim(a->>'name'),group_name=left(trim(p_name),80),
    dietary=coalesce(a->>'dietary',''),notes=coalesce(a->>'notes',''),
    response_first_at=case when status is distinct from a->>'status' and a->>'status'<>'pending' then coalesce(response_first_at,clock_timestamp()) else response_first_at end,
    response_updated_at=case when status is distinct from a->>'status' then clock_timestamp() else response_updated_at end,
    response_count=response_count+case when status is distinct from a->>'status' then 1 else 0 end,
    response_client_hash=case when status is distinct from a->>'status' then null else response_client_hash end,
    status=coalesce(a->>'status','pending') where id=gid and invitation_id=i.id;
   if not found then raise exception 'Persona ajena a esta invitación';end if;
  end if;
  keep=array_append(keep,gid);
 end loop;
 delete from public.guests where invitation_id=i.id and not(id=any(keep));
 update public.invitations set display_name=trim(p_name),revision=revision+1,updated_at=clock_timestamp() where id=i.id;
 return i.id;
end $$;

create function public.admin_invitation_credential(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_wedding_admin() then raise exception 'Acceso denegado';end if;
 return (select jsonb_build_object('cipher',c.token_ciphertext,'hash',c.token_hash) from private.invitation_credentials c
 join public.invitations i on i.id=c.invitation_id where i.id=p_id and i.revoked_at is null);
end $$;
create function public.admin_rotate_invitation(p_id uuid,p_expected bigint,p_hash text,p_cipher text,p_revoke boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare i public.invitations;
begin
 if not public.is_wedding_admin() then raise exception 'Acceso denegado';end if;
 select * into i from public.invitations where id=p_id for update;
 if i.id is null or i.revision is distinct from p_expected then raise exception 'La invitación cambió. Actualizá antes de continuar.';end if;
 if not p_revoke then
  if p_hash is null or p_cipher is null then raise exception 'Falta el enlace seguro';end if;
  insert into private.invitation_credentials values(i.id,p_hash,p_cipher)
   on conflict(invitation_id) do update set token_hash=excluded.token_hash,token_ciphertext=excluded.token_ciphertext;
 end if;
 update public.invitations set revoked_at=case when p_revoke then clock_timestamp() else null end,
 revision=revision+1,updated_at=clock_timestamp() where id=i.id;
end $$;
revoke all on function public.consume_invitation_rate(text),public.resolve_invitation(text),public.confirmed_invitation(uuid,text),public.submit_invitation_rsvp(text,bigint,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.consume_invitation_rate(text),public.resolve_invitation(text),public.confirmed_invitation(uuid,text),public.submit_invitation_rsvp(text,bigint,uuid,jsonb,text) to service_role;
revoke all on function public.admin_save_invitation(uuid,bigint,text,jsonb,text,text),public.admin_invitation_credential(uuid),public.admin_rotate_invitation(uuid,bigint,text,text,boolean) from public,anon;
grant execute on function public.admin_save_invitation(uuid,bigint,text,jsonb,text,text),public.admin_invitation_credential(uuid),public.admin_rotate_invitation(uuid,bigint,text,text,boolean) to authenticated;
-- Replace only the ceremony map; preserve all other live settings and draft edits.
update public.wedding_settings set data=jsonb_set(data,'{ceremonyMap}','"https://goo.su/dLQSOD"'),updated_at=clock_timestamp() where id=1;
update public.wedding_draft set data=jsonb_set(data,'{ceremonyMap}','"https://goo.su/dLQSOD"'),updated_at=clock_timestamp() where id=1;
notify pgrst,'reload schema';
commit;
