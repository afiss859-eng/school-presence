-- Permit an authenticated user to create a school only in their own name.
-- The private trigger added in migration 0006 then grants school_admin to that creator.
create policy "schools_insert_creator"
  on public.schools for insert
  to authenticated
  with check (created_by = auth.uid());

comment on policy "schools_insert_creator" on public.schools is
  'Un utilisateur authentifié ne peut créer un établissement qu’en se déclarant lui-même créateur.';