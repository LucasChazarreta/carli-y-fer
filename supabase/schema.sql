-- Carli y Fer — fresh dedicated Supabase project; run once in SQL Editor.
-- No passwords, guest lists or private account emails are stored in this file.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.wedding_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create function public.is_wedding_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.wedding_admins where user_id = auth.uid());
$$;
revoke all on function public.is_wedding_admin() from public,anon;
grant execute on function public.is_wedding_admin() to authenticated;

create table public.wedding_settings (
  id integer primary key check(id=1), data jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.wedding_draft (
  id integer primary key check(id=1), data jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  -- The printable credential is generated and delivered outside the database.
  -- Only its SHA-256 verifier is ever persisted here.
  credential_hash text not null unique default encode(sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())),'hex')
    check(credential_hash ~ '^[0-9a-f]{64}$'),
  name text not null check(length(trim(name)) between 1 and 120),
  group_name text not null default '' check(length(group_name)<=80),
  status text not null default 'pending' check(status in ('pending','confirmed','declined')),
  dietary text not null default '' check(length(dietary)<=160),
  notes text not null default '' check(length(notes)<=500),
  response_first_at timestamptz,
  response_updated_at timestamptz,
  response_count integer not null default 0 check(response_count >= 0),
  response_name text,
  response_client_hash text check(response_client_hash is null or response_client_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('message','song')),
  name text not null check(length(trim(name)) between 1 and 80),
  message text not null check(length(trim(message)) between 1 and 600),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint songs_are_private check(not approved or kind='message')
);
create table public.memories (
  id uuid primary key,
  name text not null check(length(name) between 1 and 80),
  original_name text not null check(length(original_name)<=180),
  path text not null unique,
  mime text not null check(mime in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm')),
  size_bytes bigint not null check(size_bytes between 1 and 26214400),
  created_at timestamptz not null default now()
);
create table private.submission_tickets (
  id uuid primary key, client_hash text not null,
  kind text not null check(kind in ('upload','message','song')),
  size_bytes bigint not null default 0,
  state text not null default 'reserved' check(state in ('reserved','complete','failed')),
  created_at timestamptz not null default now()
);
create table private.rsvp_attempts (
  id bigint generated always as identity primary key,
  client_hash text not null check(client_hash ~ '^[0-9a-f]{64}$'),
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);
create table private.album_policy (
  id integer primary key check(id=1), max_bytes bigint not null,
  closes_at timestamptz not null
);
insert into private.album_policy values(1,838860800,'2026-11-02T00:00:00-03:00');

create function public.wedding_touch_updated() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at=clock_timestamp();return new;end; $$;
create trigger guests_updated before update on public.guests for each row execute function public.wedding_touch_updated();

alter table public.wedding_settings enable row level security;
alter table public.wedding_draft enable row level security;
alter table public.guests enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
create policy wedding_public_read on public.wedding_settings for select to anon,authenticated using(true);
create policy draft_admin on public.wedding_draft for select to authenticated using(public.is_wedding_admin());
create policy guests_admin on public.guests for all to authenticated using(public.is_wedding_admin()) with check(public.is_wedding_admin());
create policy messages_public on public.messages for select to anon using(approved and kind='message');
create policy messages_admin_select on public.messages for select to authenticated using(public.is_wedding_admin());
create policy messages_admin_update on public.messages for update to authenticated using(public.is_wedding_admin()) with check(public.is_wedding_admin());
create policy messages_admin_delete on public.messages for delete to authenticated using(public.is_wedding_admin());
create policy memories_admin on public.memories for select to authenticated using(public.is_wedding_admin());
create policy memories_admin_delete on public.memories for delete to authenticated using(public.is_wedding_admin());
revoke all on public.wedding_settings,public.wedding_draft,public.guests,public.messages,public.memories from anon,authenticated;
grant select on public.wedding_settings,public.messages to anon,authenticated;
grant select on public.wedding_draft to authenticated;
grant select,insert,update,delete on public.guests to authenticated;
grant update(approved),delete on public.messages to authenticated;
grant select,delete on public.memories to authenticated;
grant all on public.wedding_settings,public.wedding_draft,public.guests,public.messages,public.memories to service_role;

-- The Edge Function is the sole caller. It resolves both factors and owns the
-- only non-admin RSVP update path; callers can never select a guest id.
create function public.submit_guest_rsvp(
  p_credential_hash text,p_name text,p_status text,p_client_hash text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare resolved_id uuid; attempt_id bigint; clean_name text;
begin
  if p_credential_hash !~ '^[0-9a-f]{64}$' or p_client_hash !~ '^[0-9a-f]{64}$'
    or p_status not in ('confirmed','declined') or length(p_name) not between 1 and 120 then
    raise exception 'Solicitud inválida';
  end if;
  if (select count(*) from private.rsvp_attempts
      where client_hash=p_client_hash and created_at>clock_timestamp()-interval '1 hour') >= 20 then
    raise exception 'Hay muchos intentos. Esperá un momento antes de volver a probar.';
  end if;
  insert into private.rsvp_attempts(client_hash) values(p_client_hash) returning id into attempt_id;
  clean_name=lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g'));
  select id into resolved_id from public.guests
   where credential_hash=p_credential_hash
     and clean_name in (
       lower(regexp_replace(trim(name),'[[:space:]]+',' ','g')),
       nullif(lower(regexp_replace(trim(group_name),'[[:space:]]+',' ','g')),'')
     )
   for update;
  if resolved_id is null then return false; end if;
  update public.guests set
    status=p_status,
    response_first_at=coalesce(response_first_at,clock_timestamp()),
    response_updated_at=clock_timestamp(),
    response_count=response_count+1,
    response_name=p_name,
    response_client_hash=p_client_hash
  where id=resolved_id;
  update private.rsvp_attempts set succeeded=true where id=attempt_id;
  return true;
end;$$;
revoke all on function public.submit_guest_rsvp(text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_guest_rsvp(text,text,text,text) to service_role;

-- The Edge Function needs the resolved guest only to bind a signed proof. This
-- identifier never crosses the function boundary except inside that proof.
create function public.submit_guest_rsvp_with_proof(
  p_credential_hash text,p_name text,p_status text,p_client_hash text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare resolved_id uuid; attempt_id bigint; clean_name text;
begin
  if p_credential_hash !~ '^[0-9a-f]{64}$' or p_client_hash !~ '^[0-9a-f]{64}$'
    or p_status not in ('confirmed','declined') or length(p_name) not between 1 and 120 then
    raise exception 'Solicitud inválida';
  end if;
  if (select count(*) from private.rsvp_attempts where client_hash=p_client_hash
      and created_at>clock_timestamp()-interval '1 hour') >= 20 then
    raise exception 'Hay muchos intentos. Esperá un momento antes de volver a probar.';
  end if;
  insert into private.rsvp_attempts(client_hash) values(p_client_hash) returning id into attempt_id;
  clean_name=lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g'));
  select id into resolved_id from public.guests
   where credential_hash=p_credential_hash and clean_name in (
     lower(regexp_replace(trim(name),'[[:space:]]+',' ','g')),
     nullif(lower(regexp_replace(trim(group_name),'[[:space:]]+',' ','g')),'')
   ) for update;
  if resolved_id is null then return null; end if;
  update public.guests set status=p_status,
    response_first_at=coalesce(response_first_at,clock_timestamp()),
    response_updated_at=clock_timestamp(),response_count=response_count+1,
    response_name=p_name,response_client_hash=p_client_hash where id=resolved_id;
  update private.rsvp_attempts set succeeded=true where id=attempt_id;
  return resolved_id;
end;$$;
revoke all on function public.submit_guest_rsvp_with_proof(text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_guest_rsvp_with_proof(text,text,text,text) to service_role;

create function public.save_wedding_draft(p_data jsonb, p_expected timestamptz) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare current_stamp timestamptz;new_stamp timestamptz;
begin
  if not public.is_wedding_admin() then raise exception 'Acceso denegado';end if;
  select updated_at into current_stamp from public.wedding_draft where id=1 for update;
  if current_stamp is distinct from p_expected then raise exception 'Otra persona cambió el borrador. Recargá antes de guardar.';end if;
  if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Contenido inválido';end if;
  if length(trim(coalesce(p_data->>'names','')))=0 or length(trim(coalesce(p_data->>'ceremonyName','')))=0 or length(trim(coalesce(p_data->>'partyName','')))=0 then raise exception 'Faltan datos esenciales';end if;
  if (p_data->>'ceremonyAt')::timestamptz is null or (p_data->>'partyAt')::timestamptz is null then raise exception 'Faltan horarios';end if;
  if (p_data->>'partyAt')::timestamptz<(p_data->>'ceremonyAt')::timestamptz then raise exception 'Revisá los horarios';end if;
  -- Retention is a server decision, independent of editable public content.
  p_data=jsonb_set(p_data,'{albumClosesAt}',to_jsonb((select closes_at from private.album_policy where id=1)));
  new_stamp=clock_timestamp();
  update public.wedding_draft set data=p_data,updated_at=new_stamp where id=1;
  return new_stamp;
end;$$;
create function public.publish_wedding(p_expected timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.wedding_draft;
begin
  if not public.is_wedding_admin() then raise exception 'Acceso denegado';end if;
  select * into d from public.wedding_draft where id=1 for update;
  if d.updated_at is distinct from p_expected then raise exception 'El borrador cambió. Revisalo otra vez.';end if;
  update public.wedding_settings set data=d.data,updated_at=clock_timestamp() where id=1;
end;$$;
revoke all on function public.save_wedding_draft(jsonb,timestamptz),public.publish_wedding(timestamptz) from public,anon;
grant execute on function public.save_wedding_draft(jsonb,timestamptz),public.publish_wedding(timestamptz) to authenticated;

-- Called by the Edge Function only. One locked policy row serializes capacity reservations.
create function public.reserve_wedding_submission(p_id uuid,p_hash text,p_kind text,p_size bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare policy private.album_policy;used_bytes bigint;event_data jsonb;
begin
  select * into policy from private.album_policy where id=1 for update;
  if p_kind not in ('upload','message','song') or p_size<0 or p_size>26214400 or length(p_hash)<>64 then raise exception 'Solicitud inválida';end if;
  select data into event_data from public.wedding_settings where id=1;
  if p_kind='upload' then
    if now()>=policy.closes_at or not coalesce((event_data->>'showAlbum')::boolean,false) then raise exception 'El álbum no recibe archivos';end if;
    if p_size<1 then raise exception 'Archivo vacío';end if;
    select coalesce(sum(size_bytes),0) into used_bytes from private.submission_tickets where kind='upload' and state in ('reserved','complete');
    if used_bytes+p_size>policy.max_bytes then raise exception 'El álbum llegó a su capacidad. Contactá a la pareja.';end if;
  else
    if now()>=policy.closes_at or not coalesce((event_data->>'showMessages')::boolean,false) then raise exception 'Los envíos están cerrados';end if;
    if p_size<>0 then raise exception 'Solicitud inválida';end if;
  end if;
  if (select count(*) from private.submission_tickets where client_hash=p_hash and created_at>now()-interval '1 hour')>=100 then raise exception 'Hay muchos envíos desde esta conexión. Intentá más tarde.';end if;
  if (select count(*) from private.submission_tickets where kind<>'upload' and created_at>now()-interval '1 day')>=500 then raise exception 'Se alcanzó el límite diario. Intentá mañana.';end if;
  insert into private.submission_tickets(id,client_hash,kind,size_bytes) values(p_id,p_hash,p_kind,p_size);
end;$$;
create function public.finish_wedding_submission(p_id uuid,p_success boolean) returns void
language sql security definer set search_path = '' as $$
  update private.submission_tickets set state=case when p_success then 'complete' else 'failed' end where id=p_id;
$$;
revoke all on function public.reserve_wedding_submission(uuid,text,text,bigint),public.finish_wedding_submission(uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_wedding_submission(uuid,text,text,bigint),public.finish_wedding_submission(uuid,boolean) to service_role;
create function public.release_wedding_memory() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Deletion through the panel removes the actual object first. Never free quota for orphaned objects.
  if exists(select 1 from storage.objects where bucket_id='wedding-memories' and name=old.path) then raise exception 'Eliminá primero el archivo del almacenamiento';end if;
  update private.submission_tickets set state='failed' where id=old.id;return old;
end;$$;
revoke all on function public.release_wedding_memory() from public,anon,authenticated;
create trigger memory_deleted before delete on public.memories for each row execute function public.release_wedding_memory();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wedding-memories','wedding-memories',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']);
create function public.can_read_wedding_album() returns boolean language sql stable security definer set search_path='' as $$
  select public.is_wedding_admin() and now()<(select closes_at from private.album_policy where id=1);
$$;
revoke all on function public.can_read_wedding_album() from public,anon;
grant execute on function public.can_read_wedding_album() to authenticated;
create policy wedding_storage_admin_read on storage.objects for select to authenticated using(bucket_id='wedding-memories' and public.can_read_wedding_album());
create policy wedding_storage_admin_delete on storage.objects for delete to authenticated using(bucket_id='wedding-memories' and public.is_wedding_admin());
-- No anonymous upload/select policy. Guest uploads pass through the Edge Function.
commit;
