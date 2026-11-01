-- Security hardening and self-service onboarding.
-- This migration keeps privilege-elevating trigger functions outside the exposed public schema.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_school_presence on auth.users;
create trigger on_auth_user_created_school_presence
  after insert on auth.users
  for each row execute function app_private.handle_new_auth_user();

create or replace function app_private.add_school_creator_as_admin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.school_members (school_id, user_id, role, is_active)
  values (new.id, new.created_by, 'school_admin', true)
  on conflict (school_id, user_id, role) do nothing;
  return new;
end;
$$;

revoke all on function app_private.add_school_creator_as_admin() from public, anon, authenticated;

drop trigger if exists on_school_created_add_creator on public.schools;
create trigger on_school_created_add_creator
  after insert on public.schools
  for each row execute function app_private.add_school_creator_as_admin();

-- The old public SECURITY DEFINER RPC is no longer needed: school creation now
-- uses the creator-only INSERT policy and the private trigger above.
drop function if exists public.create_school(text, text, text);

-- Authorization helpers must only be callable by authenticated app users.
revoke all on function public.has_school_role(uuid, public.school_role[]) from public, anon;
revoke all on function public.is_school_staff(uuid) from public, anon;
revoke all on function public.is_guardian_of(uuid, uuid) from public, anon;
revoke all on function public.has_class_role(uuid, uuid, public.school_role[]) from public, anon;
revoke all on function public.has_class_access(uuid, uuid) from public, anon;

grant execute on function public.has_school_role(uuid, public.school_role[]) to authenticated;
grant execute on function public.is_school_staff(uuid) to authenticated;
grant execute on function public.is_guardian_of(uuid, uuid) to authenticated;
grant execute on function public.has_class_role(uuid, uuid, public.school_role[]) to authenticated;
grant execute on function public.has_class_access(uuid, uuid) to authenticated;

-- Supabase changed new-project Data API exposure defaults in 2026.
-- Explicit table grants are required; RLS remains the row-level authorization boundary.
grant usage on schema public to authenticated;

grant usage on type public.school_role to authenticated;
grant usage on type public.attendance_mark to authenticated;
grant usage on type public.attendance_session_status to authenticated;
grant usage on type public.disciplinary_event_type to authenticated;
grant usage on type public.justification_status to authenticated;

revoke all on
  public.profiles,
  public.schools,
  public.school_members,
  public.academic_years,
  public.classes,
  public.students,
  public.student_guardians,
  public.class_assignments,
  public.attendance_sessions,
  public.attendance_records,
  public.disciplinary_events,
  public.attendance_justifications
from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.schools to authenticated;
grant select on public.school_members to authenticated;
grant select, insert, update, delete on public.academic_years to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.student_guardians to authenticated;
grant select, insert, update, delete on public.class_assignments to authenticated;
grant select, insert, update on public.attendance_sessions to authenticated;
grant select, insert, update on public.attendance_records to authenticated;
grant select, insert on public.disciplinary_events to authenticated;
grant select, insert, update on public.attendance_justifications to authenticated;

comment on schema app_private is
  'Fonctions de déclencheur internes, non exposées par la Data API.';