-- Per-guest RSVP credentials and audit metadata. The invitation code is never persisted.
begin;

alter table public.guests
  add column credential_hash text,
  add column response_first_at timestamptz,
  add column response_updated_at timestamptz,
  add column response_count integer not null default 0,
  add column response_name text,
  add column response_client_hash text;
update public.guests set credential_hash=encode(sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())),'hex');
alter table public.guests
  alter column credential_hash set not null,
  alter column credential_hash set default encode(sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())),'hex'),
  add constraint guests_credential_hash_key unique(credential_hash),
  add constraint guests_credential_hash_format check(credential_hash ~ '^[0-9a-f]{64}$'),
  add constraint guests_response_count_check check(response_count >= 0),
  add constraint guests_response_client_hash_check check(response_client_hash is null or response_client_hash ~ '^[0-9a-f]{64}$');

create table private.rsvp_attempts (
  id bigint generated always as identity primary key,
  client_hash text not null check(client_hash ~ '^[0-9a-f]{64}$'),
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);

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


-- Preserve the existing admin-only table policy and privileges. In particular,
-- anon receives neither table UPDATE nor RPC execution.
revoke all on public.guests from anon;
grant select,insert,update,delete on public.guests to authenticated;
grant all on public.guests to service_role;

commit;
