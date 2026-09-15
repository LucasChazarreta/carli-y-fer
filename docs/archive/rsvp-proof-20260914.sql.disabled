-- Apply before deploying the RSVP proof-enabled Edge Function.
begin;

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

commit;
