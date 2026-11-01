-- Move SECURITY DEFINER authorization helpers out of the exposed public schema.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create or replace function app_private.has_school_role(
  target_school_id uuid,
  allowed_roles public.school_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.school_members m
    where m.school_id = target_school_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role = any(allowed_roles)
  );
$$;

create or replace function app_private.is_school_staff(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app_private.has_school_role(
    target_school_id,
    array['super_admin', 'school_admin', 'life_supervisor']::public.school_role[]
  );
$$;

create or replace function app_private.is_guardian_of(
  target_school_id uuid,
  target_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.student_guardians g
    where g.school_id = target_school_id
      and g.student_id = target_student_id
      and g.guardian_user_id = auth.uid()
      and g.verified_at is not null
  );
$$;

create or replace function app_private.has_class_role(
  target_school_id uuid,
  target_class_id uuid,
  allowed_roles public.school_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
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

create or replace function app_private.has_class_access(
  target_school_id uuid,
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app_private.has_class_role(
    target_school_id,
    target_class_id,
    array['teacher', 'class_delegate']::public.school_role[]
  );
$$;

revoke all on function app_private.has_school_role(uuid, public.school_role[]) from public, anon;
revoke all on function app_private.is_school_staff(uuid) from public, anon;
revoke all on function app_private.is_guardian_of(uuid, uuid) from public, anon;
revoke all on function app_private.has_class_role(uuid, uuid, public.school_role[]) from public, anon;
revoke all on function app_private.has_class_access(uuid, uuid) from public, anon;

grant execute on function app_private.has_school_role(uuid, public.school_role[]) to authenticated;
grant execute on function app_private.is_school_staff(uuid) to authenticated;
grant execute on function app_private.is_guardian_of(uuid, uuid) to authenticated;
grant execute on function app_private.has_class_role(uuid, uuid, public.school_role[]) to authenticated;
grant execute on function app_private.has_class_access(uuid, uuid) to authenticated;

-- Replace all policies that reference the old public functions.
drop policy if exists "schools_select_members_or_guardians" on public.schools;
drop policy if exists "schools_update_admin" on public.schools;
drop policy if exists "school_members_select_self_or_admin" on public.school_members;
drop policy if exists "academic_years_staff_read" on public.academic_years;
drop policy if exists "academic_years_admin_write" on public.academic_years;
drop policy if exists "classes_staff_read" on public.classes;
drop policy if exists "classes_admin_write" on public.classes;
drop policy if exists "students_staff_or_guardian_read" on public.students;
drop policy if exists "students_admin_write" on public.students;
drop policy if exists "student_guardians_self_or_staff_read" on public.student_guardians;
drop policy if exists "student_guardians_admin_write" on public.student_guardians;
drop policy if exists "class_assignments_self_or_admin_read" on public.class_assignments;
drop policy if exists "class_assignments_admin_manage" on public.class_assignments;
drop policy if exists "attendance_sessions_staff_read" on public.attendance_sessions;
drop policy if exists "attendance_sessions_staff_create" on public.attendance_sessions;
drop policy if exists "attendance_sessions_teacher_or_supervisor_update" on public.attendance_sessions;
drop policy if exists "attendance_records_staff_or_guardian_read" on public.attendance_records;
drop policy if exists "attendance_records_teacher_or_supervisor_create" on public.attendance_records;
drop policy if exists "attendance_records_teacher_or_supervisor_update" on public.attendance_records;
drop policy if exists "disciplinary_events_staff_or_guardian_read" on public.disciplinary_events;
drop policy if exists "teachers_create_course_expulsions" on public.disciplinary_events;
drop policy if exists "administration_create_school_exclusions" on public.disciplinary_events;
drop policy if exists "justifications_parent_or_staff_read" on public.attendance_justifications;
drop policy if exists "guardians_create_absence_or_late_justifications" on public.attendance_justifications;
drop policy if exists "life_school_reviews_justifications" on public.attendance_justifications;

create policy "schools_select_members_or_guardians"
  on public.schools for select to authenticated
  using (
    exists (
      select 1 from public.school_members m
      where m.school_id = schools.id
        and m.user_id = auth.uid()
        and m.is_active = true
    )
    or exists (
      select 1 from public.student_guardians g
      where g.school_id = schools.id
        and g.guardian_user_id = auth.uid()
        and g.verified_at is not null
    )
  );

create policy "schools_update_admin"
  on public.schools for update to authenticated
  using (app_private.has_school_role(id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (app_private.has_school_role(id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "school_members_select_self_or_admin"
  on public.school_members for select to authenticated
  using (
    user_id = auth.uid()
    or app_private.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[])
  );

create policy "academic_years_staff_read"
  on public.academic_years for select to authenticated
  using (
    app_private.is_school_staff(school_id)
    or exists (
      select 1 from public.classes c
      where c.school_id = academic_years.school_id
        and c.academic_year_id = academic_years.id
        and app_private.has_class_access(c.school_id, c.id)
    )
  );

create policy "academic_years_admin_write"
  on public.academic_years for all to authenticated
  using (app_private.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (app_private.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "classes_staff_read"
  on public.classes for select to authenticated
  using (
    app_private.is_school_staff(school_id)
    or app_private.has_class_access(school_id, id)
  );

create policy "classes_admin_write"
  on public.classes for all to authenticated
  using (app_private.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (app_private.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "students_staff_or_guardian_read"
  on public.students for select to authenticated
  using (
    app_private.is_school_staff(school_id)
    or app_private.has_class_access(school_id, current_class_id)
    or app_private.is_guardian_of(school_id, id)
  );

create policy "students_admin_write"
  on public.students for all to authenticated
  using (app_private.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (app_private.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "student_guardians_self_or_staff_read"
  on public.student_guardians for select to authenticated
  using (
    guardian_user_id = auth.uid()
    or app_private.is_school_staff(school_id)
  );

create policy "student_guardians_admin_write"
  on public.student_guardians for all to authenticated
  using (app_private.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]))
  with check (app_private.has_school_role(school_id, array['super_admin', 'school_admin']::public.school_role[]));

create policy "class_assignments_self_or_admin_read"
  on public.class_assignments for select to authenticated
  using (
    user_id = auth.uid()
    or app_private.has_school_role(school_id, array['super_admin', 'school_admin', 'life_supervisor']::public.school_role[])
  );

create policy "class_assignments_admin_manage"
  on public.class_assignments for all to authenticated
  using (app_private.has_school_role(school_id, array['super_admin', 'school_admin', 'life_supervisor']::public.school_role[]))
  with check (app_private.has_school_role(school_id, array['super_admin', 'school_admin', 'life_supervisor']::public.school_role[]));

create policy "attendance_sessions_staff_read"
  on public.attendance_sessions for select to authenticated
  using (
    app_private.is_school_staff(school_id)
    or app_private.has_class_access(school_id, class_id)
  );

create policy "attendance_sessions_staff_create"
  on public.attendance_sessions for insert to authenticated
  with check (
    (
      teacher_id = auth.uid()
      and app_private.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
    )
    or app_private.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
  );

create policy "attendance_sessions_teacher_or_supervisor_update"
  on public.attendance_sessions for update to authenticated
  using (
    (
      teacher_id = auth.uid()
      and app_private.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
      and status <> 'closed'
    )
    or app_private.is_school_staff(school_id)
  )
  with check (
    (
      teacher_id = auth.uid()
      and app_private.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
    )
    or app_private.is_school_staff(school_id)
  );

create policy "attendance_records_staff_or_guardian_read"
  on public.attendance_records for select to authenticated
  using (
    app_private.is_school_staff(school_id)
    or app_private.is_guardian_of(school_id, student_id)
    or exists (
      select 1 from public.attendance_sessions s
      where s.id = attendance_records.session_id
        and s.school_id = attendance_records.school_id
        and app_private.has_class_access(s.school_id, s.class_id)
    )
  );

create policy "attendance_records_teacher_or_supervisor_create"
  on public.attendance_records for insert to authenticated
  with check (
    recorded_by = auth.uid()
    and (
      app_private.is_school_staff(school_id)
      or exists (
        select 1
        from public.attendance_sessions s
        join public.students st
          on st.id = attendance_records.student_id
         and st.school_id = attendance_records.school_id
         and st.current_class_id = s.class_id
        where s.id = attendance_records.session_id
          and s.school_id = attendance_records.school_id
          and s.teacher_id = auth.uid()
          and s.status <> 'closed'
          and app_private.has_class_role(s.school_id, s.class_id, array['teacher']::public.school_role[])
      )
    )
  );

create policy "attendance_records_teacher_or_supervisor_update"
  on public.attendance_records for update to authenticated
  using (
    app_private.is_school_staff(school_id)
    or exists (
      select 1 from public.attendance_sessions s
      where s.id = attendance_records.session_id
        and s.school_id = attendance_records.school_id
        and s.teacher_id = auth.uid()
        and s.status <> 'closed'
        and app_private.has_class_role(s.school_id, s.class_id, array['teacher']::public.school_role[])
    )
  )
  with check (
    recorded_by = auth.uid()
    and (
      app_private.is_school_staff(school_id)
      or exists (
        select 1
        from public.attendance_sessions s
        join public.students st
          on st.id = attendance_records.student_id
         and st.school_id = attendance_records.school_id
         and st.current_class_id = s.class_id
        where s.id = attendance_records.session_id
          and s.school_id = attendance_records.school_id
          and s.teacher_id = auth.uid()
          and s.status <> 'closed'
          and app_private.has_class_role(s.school_id, s.class_id, array['teacher']::public.school_role[])
      )
    )
  );

create policy "disciplinary_events_staff_or_guardian_read"
  on public.disciplinary_events for select to authenticated
  using (
    app_private.is_school_staff(school_id)
    or app_private.is_guardian_of(school_id, student_id)
    or (
      class_id is not null
      and app_private.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
    )
  );

create policy "teachers_create_course_expulsions"
  on public.disciplinary_events for insert to authenticated
  with check (
    event_type = 'course_expulsion'
    and recorded_by = auth.uid()
    and exists (
      select 1 from public.students st
      where st.id = disciplinary_events.student_id
        and st.school_id = disciplinary_events.school_id
        and st.current_class_id = disciplinary_events.class_id
    )
    and (
      app_private.is_school_staff(school_id)
      or app_private.has_class_role(school_id, class_id, array['teacher']::public.school_role[])
    )
  );

create policy "administration_create_school_exclusions"
  on public.disciplinary_events for insert to authenticated
  with check (
    event_type in ('temporary_exclusion', 'permanent_exclusion')
    and recorded_by = auth.uid()
    and decision_authority = auth.uid()
    and app_private.has_school_role(school_id, array['school_admin', 'super_admin']::public.school_role[])
  );

create policy "justifications_parent_or_staff_read"
  on public.attendance_justifications for select to authenticated
  using (
    created_by = auth.uid()
    or app_private.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
  );

create policy "guardians_create_absence_or_late_justifications"
  on public.attendance_justifications for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.attendance_records r
      where r.id = attendance_record_id
        and r.school_id = attendance_justifications.school_id
        and r.status in ('absent', 'late')
        and app_private.is_guardian_of(r.school_id, r.student_id)
    )
  );

create policy "life_school_reviews_justifications"
  on public.attendance_justifications for update to authenticated
  using (app_private.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[]))
  with check (
    app_private.has_school_role(school_id, array['life_supervisor', 'school_admin', 'super_admin']::public.school_role[])
    and reviewed_by = auth.uid()
  );

drop function if exists public.has_school_role(uuid, public.school_role[]);
drop function if exists public.is_school_staff(uuid);
drop function if exists public.is_guardian_of(uuid, uuid);
drop function if exists public.has_class_role(uuid, uuid, public.school_role[]);
drop function if exists public.has_class_access(uuid, uuid);

comment on schema app_private is
  'Schéma interne non exposé à la Data API ; contient les fonctions de contrôle RLS.';