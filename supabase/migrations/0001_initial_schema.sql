create extension if not exists pgcrypto;

create type public.school_role as enum (
  'super_admin', 'school_admin', 'life_supervisor', 'teacher',
  'class_delegate', 'student', 'parent'
);
create type public.attendance_mark as enum ('present', 'absent', 'late');
create type public.attendance_session_status as enum ('draft', 'submitted', 'closed');
create type public.disciplinary_event_type as enum (
  'course_expulsion', 'temporary_exclusion', 'permanent_exclusion'
);
create type public.justification_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 180),
  school_type text not null check (school_type in ('primary', 'middle', 'high', 'university', 'other')),
  country_code text not null default 'BF' check (country_code = 'BF'),
  city text,
  timezone text not null default 'Africa/Ouagadougou',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, country_code)
);

create table public.school_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.school_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, user_id, role)
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, school_id),
  check (ends_on > starts_on)
);
create unique index academic_years_one_current_per_school
  on public.academic_years (school_id) where is_current = true;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid,
  name text not null,
  level text,
  class_mode text not null default 'secondary'
    check (class_mode in ('primary', 'secondary', 'university')),
  homeroom_teacher_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (academic_year_id, school_id)
    references public.academic_years(id, school_id) on delete restrict
);
create unique index classes_unique_name_per_year
  on public.classes (school_id, academic_year_id, lower(name));

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  current_class_id uuid,
  student_code text,
  first_name text not null,
  last_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  unique (school_id, student_code),
  foreign key (current_class_id, school_id)
    references public.classes(id, school_id) on delete restrict
);

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  relationship_label text,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (student_id, school_id)
    references public.students(id, school_id) on delete cascade,
  unique (school_id, student_id, guardian_user_id)
);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_id uuid not null,
  teacher_id uuid not null references auth.users(id),
  session_date date not null default current_date,
  starts_at timestamptz,
  period_label text,
  status public.attendance_session_status not null default 'draft',
  submitted_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (class_id, school_id)
    references public.classes(id, school_id) on delete restrict,
  check (closed_at is null or status = 'closed')
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status public.attendance_mark not null,
  note text,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  operation_id uuid not null default gen_random_uuid(),
  unique (id, school_id),
  unique (session_id, student_id),
  unique (operation_id),
  foreign key (session_id, school_id)
    references public.attendance_sessions(id, school_id) on delete cascade,
  foreign key (student_id, school_id)
    references public.students(id, school_id) on delete cascade
);

create table public.disciplinary_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  event_type public.disciplinary_event_type not null,
  reason text not null check (length(trim(reason)) >= 3),
  occurred_at timestamptz not null default now(),
  ends_at timestamptz,
  recorded_by uuid not null references auth.users(id),
  decision_authority uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (student_id, school_id)
    references public.students(id, school_id) on delete cascade,
  check (ends_at is null or ends_at > occurred_at),
  check (event_type = 'course_expulsion' or decision_authority is not null)
);

create table public.attendance_justifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  attendance_record_id uuid not null,
  created_by uuid not null references auth.users(id),
  reason text not null check (length(trim(reason)) >= 3),
  status public.justification_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  foreign key (attendance_record_id, school_id)
    references public.attendance_records(id, school_id) on delete cascade
);

create index school_members_user_active_idx on public.school_members(user_id, is_active);
create index classes_school_active_idx on public.classes(school_id, is_active);
create index students_school_class_idx on public.students(school_id, current_class_id, is_active);
create index student_guardians_user_idx on public.student_guardians(guardian_user_id, school_id);
create index attendance_sessions_school_date_idx on public.attendance_sessions(school_id, session_date desc);
create index attendance_records_student_idx on public.attendance_records(school_id, student_id, recorded_at desc);
create index disciplinary_events_student_idx on public.disciplinary_events(school_id, student_id, occurred_at desc);
create index attendance_justifications_status_idx on public.attendance_justifications(school_id, status, created_at desc);

create or replace function public.has_school_role(
  target_school_id uuid,
  allowed_roles public.school_role[]
)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.school_members m
    where m.school_id = target_school_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.is_school_staff(target_school_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.has_school_role(
    target_school_id,
    array['super_admin', 'school_admin', 'life_supervisor', 'teacher', 'class_delegate']::public.school_role[]
  );
$$;

create or replace function public.is_guardian_of(target_school_id uuid, target_student_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.student_guardians g
    where g.school_id = target_school_id
      and g.student_id = target_student_id
      and g.guardian_user_id = auth.uid()
      and g.verified_at is not null
  );
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger schools_set_updated_at before update on public.schools
  for each row execute function public.set_updated_at();
create trigger students_set_updated_at before update on public.students
  for each row execute function public.set_updated_at();
create trigger attendance_sessions_set_updated_at before update on public.attendance_sessions
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.school_members enable row level security;
alter table public.academic_years enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.student_guardians enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.disciplinary_events enable row level security;
alter table public.attendance_justifications enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "schools_select_members_or_guardians" on public.schools for select to authenticated
  using (
    public.is_school_staff(id)
    or exists (
      select 1 from public.student_guardians g
      where g.school_id = schools.id and g.guardian_user_id = auth.uid()
        and g.verified_at is not null
    )
  );
create policy "schools_insert_creator" on public.schools for insert to authenticated
  with check (created_by = auth.uid());
create policy "schools_update_admin" on public.schools for update to authenticated
  using (public.has_school_role(id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (public.has_school_role(id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "school_members_select_self_or_admin" on public.school_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[])
  );

create policy "academic_years_staff_read" on public.academic_years for select to authenticated
  using (public.is_school_staff(school_id));
create policy "academic_years_admin_write" on public.academic_years for all to authenticated
  using (public.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (public.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "classes_staff_read" on public.classes for select to authenticated
  using (public.is_school_staff(school_id));
create policy "classes_admin_write" on public.classes for all to authenticated
  using (public.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (public.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "students_staff_or_guardian_read" on public.students for select to authenticated
  using (public.is_school_staff(school_id) or public.is_guardian_of(school_id, id));
create policy "students_admin_write" on public.students for all to authenticated
  using (public.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (public.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "student_guardians_self_or_staff_read" on public.student_guardians for select to authenticated
  using (guardian_user_id = auth.uid() or public.is_school_staff(school_id));
create policy "student_guardians_admin_write" on public.student_guardians for all to authenticated
  using (public.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (public.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "attendance_sessions_staff_read" on public.attendance_sessions for select to authenticated
  using (public.is_school_staff(school_id));
create policy "attendance_sessions_staff_create" on public.attendance_sessions for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and public.has_school_role(school_id, array['teacher', 'life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
  );
create policy "attendance_sessions_teacher_or_supervisor_update" on public.attendance_sessions for update to authenticated
  using (
    (teacher_id = auth.uid() and public.has_school_role(school_id, array['teacher']::public.school_role[]))
    or public.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
  )
  with check (
    (teacher_id = auth.uid() and public.has_school_role(school_id, array['teacher']::public.school_role[]))
    or public.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
  );

create policy "attendance_records_staff_or_guardian_read" on public.attendance_records for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.is_guardian_of(school_id, student_id)
  );
create policy "attendance_records_teacher_or_supervisor_create" on public.attendance_records for insert to authenticated
  with check (
    recorded_by = auth.uid()
    and (
      public.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
      or (
        public.has_school_role(school_id, array['teacher']::public.school_role[])
        and exists (
          select 1 from public.attendance_sessions s
          where s.id = session_id and s.school_id = attendance_records.school_id
            and s.teacher_id = auth.uid() and s.status <> 'closed'
        )
      )
    )
  );
create policy "attendance_records_teacher_or_supervisor_update" on public.attendance_records for update to authenticated
  using (
    public.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
    or (
      public.has_school_role(school_id, array['teacher']::public.school_role[])
      and exists (
        select 1 from public.attendance_sessions s
        where s.id = session_id and s.school_id = attendance_records.school_id
          and s.teacher_id = auth.uid() and s.status <> 'closed'
      )
    )
  )
  with check (
    recorded_by = auth.uid()
    or public.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
  );

create policy "disciplinary_events_staff_or_guardian_read" on public.disciplinary_events for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.is_guardian_of(school_id, student_id)
  );
create policy "teachers_create_course_expulsions" on public.disciplinary_events for insert to authenticated
  with check (
    event_type = 'course_expulsion' and recorded_by = auth.uid()
    and public.has_school_role(school_id, array['teacher', 'life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
  );
create policy "administration_create_school_exclusions" on public.disciplinary_events for insert to authenticated
  with check (
    event_type in ('temporary_exclusion', 'permanent_exclusion')
    and recorded_by = auth.uid() and decision_authority = auth.uid()
    and public.has_school_role(school_id, array['school_admin', 'super_admin']::public.school_role[])
  );

create policy "justifications_parent_or_staff_read" on public.attendance_justifications for select to authenticated
  using (
    created_by = auth.uid()
    or public.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
  );
create policy "guardians_create_absence_or_late_justifications" on public.attendance_justifications for insert to authenticated
  with check (
    created_by = auth.uid() and status = 'pending'
    and exists (
      select 1 from public.attendance_records r
      where r.id = attendance_record_id and r.school_id = attendance_justifications.school_id
        and r.status in ('absent', 'late')
        and public.is_guardian_of(r.school_id, r.student_id)
    )
  );
create policy "life_school_reviews_justifications" on public.attendance_justifications for update to authenticated
  using (public.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[]))
  with check (
    public.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
    and reviewed_by = auth.uid()
  );