drop policy if exists "schools_insert_creator" on public.schools;

comment on table public.schools is
  'Création via la fonction sécurisée create_school afin de créer aussi le premier administrateur.';
