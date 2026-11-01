create table public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.school_role not null check (role in ('teacher', 'class_delegate')),
  assigned_by uuid not null references auth.users(id),
  valid_from date not null default current_date,
  valid_until date,
  created_at timestamptz not null default now(),
  foreign key (class_id, school_id)
    references public.classes(id, school_id) on delete cascade,
  unique (school_id, class_id, user_id, role),
  check (valid_until is null or valid_until >= valid_from)
);

create index class_assignments_user_idx
  on public.class_assignments(user_id, school_id, class_id, role);

alter table public.class_assignments enable row level security;

create or replace function public.has_class_role(
  target_school_id uuid,
  target_class_id uuid,
  allowed_roles public.school_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_assignments a
    where a.school_id = target_school_id
      and a.class_id = target_class_id
      and a.user_id = auth.uid()
      and a.role = any(allowed_roles)
      and a.valid_from <= current_date
      and (a.valid_until is null or a.valid_until >= current_date)
  );
$$;

create or replace function public.has_class_access(
  target_school_id uuid,
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_class_role(
    target_school_id,
    target_class_id,
    array['teacher', 'class_delegate']::public.school_role[]
  );
$$;

create or replace function public.is_school_staff(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_school_role(
    target_school_id,
    array['super_admin', 'school_admin', 'life_supervisor']::public.school_role[]
  );
$$;

create policy "class_assignments_self_or_admin_read"
  on public.class_assignments for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_school_role(school_id, array['super_admin', 'school_admin', 'life_supervisor']::public.school_role[])
  );

create policy "class_assignments_admin_manage"
  on public.class_assignments for all to authenticated
  using (
    public.has_school_role(school_id, array['super_admin', 'school_admin', 'life_supervisor']::public.school_role[])
  )
  with check (
    public.has_school_role(school_id, array['super_admin', 'school_admin', 'life_supervisor']::public.school_role[])
  );

drop policy if exists "academic_years_staff_read" on public.academic_years;
create policy "academic_years_staff_read"
  on public.academic_years for select to authenticated
  using (
    public.is_school_staff(school_id)
    or exists (
      select 1 from public.classes c
      where c.school_id = academic_years.school_id
        and c.academic_year_id = academic_years.id
        and public.has_class_access(c.school_id, c.id)
    )
  );

drop policy if exists "classes_staff_read" on public.classes;
create policy "classes_staff_read"
  on public.classes for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.has_class_access(school_id, id)
  );

drop policy if exists "students_staff_or_guardian_read" on public.students;
create policy "students_staff_or_guardian_read"
  on public.students for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.has_class_access(school_id, current_class_id)
    or public.is_guardian_of(school_id, id)
  );

drop policy if exists "attendance_sessions_staff_read" on public.attendance_sessions;
create policy "attendance_sessions_staff_read"
  on public.attendance_sessions for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.has_class_access(school_id, class_id)
  );

drop policy if exists "attendance_sessions_staff_create" on public.attendance_sessions;
create policy "attendance_sessions_staff_create"
  on public.attendance_sessions for insert to authenticated
  with check (
    (
      teacher_id = auth.uid()
      and public.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
    )
    or public.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
  );

drop policy if exists "attendance_sessions_teacher_or_supervisor_update" on public.attendance_sessions;
create policy "attendance_sessions_teacher_or_supervisor_update"
  on public.attendance_sessions for update to authenticated
  using (
    (
      teacher_id = auth.uid()
      and public.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
      and status <> 'closed'
    )
    or public.is_school_staff(school_id)
  )
  with check (
    (
      teacher_id = auth.uid()
      and public.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
    )
    or public.is_school_staff(school_id)
  );

drop policy if exists "attendance_records_staff_or_guardian_read" on public.attendance_records;
create policy "attendance_records_staff_or_guardian_read"
  on public.attendance_records for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.is_guardian_of(school_id, student_id)
    or exists (
      select 1 from public.attendance_sessions s
      where s.id = attendance_records.session_id
        and s.school_id = attendance_records.school_id
        and public.has_class_access(s.school_id, s.class_id)
    )
  );

drop policy if exists "attendance_records_teacher_or_supervisor_create" on public.attendance_records;
create policy "attendance_records_teacher_or_supervisor_create"
  on public.attendance_records for insert to authenticated
  with check (
    recorded_by = auth.uid()
    and (
      public.is_school_staff(school_id)
      or exists (
        select 1 from public.attendance_sessions s
        where s.id = attendance_records.session_id
          and s.school_id = attendance_records.school_id
          and s.teacher_id = auth.uid()
          and s.status <> 'closed'
          and public.has_class_role(s.school_id, s.class_id, array['teacher']::public.school_role[])
      )
    )
  );

drop policy if exists "attendance_records_teacher_or_supervisor_update" on public.attendance_records;
create policy "attendance_records_teacher_or_supervisor_update"
  on public.attendance_records for update to authenticated
  using (
    public.is_school_staff(school_id)
    or exists (
      select 1 from public.attendance_sessions s
      where s.id = attendance_records.session_id
        and s.school_id = attendance_records.school_id
        and s.teacher_id = auth.uid()
        and s.status <> 'closed'
        and public.has_class_role(s.school_id, s.class_id, array['teacher']::public.school_role[])
    )
  )
  with check (
    recorded_by = auth.uid()
    or public.is_school_staff(school_id)
  );

alter table public.disciplinary_events
  add column class_id uuid;

alter table public.disciplinary_events
  add constraint disciplinary_events_class_fk
  foreign key (class_id, school_id)
  references public.classes(id, school_id) on delete restrict;

alter table public.disciplinary_events
  add constraint course_expulsion_requires_class
  check (event_type <> 'course_expulsion' or class_id is not null);

drop policy if exists "disciplinary_events_staff_or_guardian_read" on public.disciplinary_events;
create policy "disciplinary_events_staff_or_guardian_read"
  on public.disciplinary_events for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.is_guardian_of(school_id, student_id)
    or (
      class_id is not null
      and public.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
    )
  );

drop policy if exists "teachers_create_course_expulsions" on public.disciplinary_events;
create policy "teachers_create_course_expulsions"
  on public.disciplinary_events for insert to authenticated
  with check (
    event_type = 'course_expulsion'
    and recorded_by = auth.uid()
    and (
      public.is_school_staff(school_id)
      or public.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
    )
  );

comment on table public.class_assignments is
  'Affectations limitées à une classe : enseignants et chefs de classe.';
comment on column public.disciplinary_events.class_id is
  'Classe concernée par l’événement, obligatoire pour une expulsion de cours.';