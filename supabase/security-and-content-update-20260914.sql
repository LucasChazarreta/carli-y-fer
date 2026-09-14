-- Applied to project wrfyceerrcnrvsuzeuzh on 2026-09-14.
-- Keeps admin RPCs callable only by signed-in users and removes duplicate SELECT policies.
begin;

revoke execute on function public.is_wedding_admin() from anon;
revoke execute on function public.save_wedding_draft(jsonb,timestamptz) from anon;
revoke execute on function public.publish_wedding(timestamptz) from anon;
revoke execute on function public.can_read_wedding_album() from anon;
revoke all on function public.release_wedding_memory() from public,anon,authenticated;

drop policy if exists messages_public on public.messages;
drop policy if exists messages_admin on public.messages;
create policy messages_public on public.messages
  for select to anon using(approved and kind='message');
create policy messages_admin_select on public.messages
  for select to authenticated using(public.is_wedding_admin());
create policy messages_admin_update on public.messages
  for update to authenticated using(public.is_wedding_admin())
  with check(public.is_wedding_admin());
create policy messages_admin_delete on public.messages
  for delete to authenticated using(public.is_wedding_admin());

update public.wedding_settings
set data = data || jsonb_build_object(
  'partyMap','https://goo.su/6zn23',
  'sharedMap','',
  'albumProvider','google_forms',
  'albumUploadUrl','https://docs.google.com/forms/d/e/1FAIpQLSd4Al6Fbh9MXyNxOn4Ol_gE5fA5GNHzJFIj8UKWSqmdNOx06A/viewform?pli=1'
), updated_at = clock_timestamp()
where id=1;

update public.wedding_draft
set data = data || jsonb_build_object(
  'partyMap','https://goo.su/6zn23',
  'sharedMap','',
  'albumProvider','google_forms',
  'albumUploadUrl','https://docs.google.com/forms/d/e/1FAIpQLSd4Al6Fbh9MXyNxOn4Ol_gE5fA5GNHzJFIj8UKWSqmdNOx06A/viewform?pli=1'
), updated_at = clock_timestamp()
where id=1;

commit;
