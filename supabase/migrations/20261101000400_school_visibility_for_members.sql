drop policy if exists "schools_select_members_or_guardians" on public.schools;

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

comment on policy "schools_select_members_or_guardians" on public.schools is
  'Autorise les membres actifs et les responsables légaux vérifiés à consulter leur établissement.';