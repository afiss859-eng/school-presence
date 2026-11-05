-- Staff invitations, verified profiles and class assignment.
-- Invitations are created only by the server-side Edge Function. The Auth trigger
-- attaches a newly invited account after Supabase creates its Auth user.

alter table public.profiles
  add column if not exists email text;

insert into public.profiles (id, full_name, email)
select
  u.id,
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  lower(u.email)
from auth.users u
on conflict (id) do update
set email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name);

alter table public.school_members
  add constraint school_members_profile_fk
  foreign key (user_id) references public.profiles(id) on delete cascade;

create table public.school_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  role public.school_role not null check (role in ('teacher', 'life_supervisor', 'class_delegate')),
  class_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_by uuid not null references auth.users(id),
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  foreign key (class_id, school_id)
    references public.classes(id, school_id) on delete cascade,
  check (
    (role = 'life_supervisor' and class_id is null)
    or (role in ('teacher', 'class_delegate') and class_id is not null)
  ),
  check (expires_at > created_at)
);

create index school_invitations_school_status_idx
  on public.school_invitations(school_id, status, created_at desc);

create unique index school_invitations_unique_pending_target
  on public.school_invitations(
    school_id,
    email,
    role,
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'pending';

alter table public.school_invitations enable row level security;

create policy "school_invitations_admin_read"
  on public.school_invitations for select
  to authenticated
  using (
    app_private.has_school_role(
      school_id,
      array['super_admin', 'school_admin']::public.school_role[]
    )
  );

grant select on public.school_invitations to authenticated;

create policy "profiles_select_school_directory"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.school_members m
      where m.user_id = profiles.id
        and m.is_active = true
        and app_private.has_school_role(
          m.school_id,
          array['super_admin', 'school_admin']::public.school_role[]
        )
    )
  );

-- Only the school direction can create, change or remove class assignments.
drop policy if exists "class_assignments_admin_manage" on public.class_assignments;
create policy "class_assignments_admin_manage"
  on public.class_assignments for all
  to authenticated
  using (
    app_private.has_school_role(
      school_id,
      array['super_admin', 'school_admin']::public.school_role[]
    )
  )
  with check (
    app_private.has_school_role(
      school_id,
      array['super_admin', 'school_admin']::public.school_role[]
    )
  );

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invitation record;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    lower(new.email)
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  for invitation in
    select i.*
    from public.school_invitations i
    where i.email = lower(new.email)
      and i.status = 'pending'
      and i.expires_at > now()
    order by i.created_at
    for update
  loop
    insert into public.school_members (school_id, user_id, role, is_active)
    values (invitation.school_id, new.id, invitation.role, true)
    on conflict (school_id, user_id, role) do update
      set is_active = true;

    if invitation.class_id is not null then
      insert into public.class_assignments (
        school_id,
        class_id,
        user_id,
        role,
        assigned_by
      )
      values (
        invitation.school_id,
        invitation.class_id,
        new.id,
        invitation.role,
        invitation.created_by
      )
      on conflict (school_id, class_id, user_id, role) do nothing;
    end if;

    update public.school_invitations
    set status = 'accepted',
        accepted_user_id = new.id,
        accepted_at = now()
    where id = invitation.id;
  end loop;

  return new;
end;
$$;

revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;

comment on table public.school_invitations is
  'Invitations de personnel envoyées par une fonction serveur ; aucune clé privilégiée dans le navigateur.';
comment on column public.profiles.email is
  'Adresse e-mail synchronisée depuis Supabase Auth pour l’annuaire interne de l’établissement.';