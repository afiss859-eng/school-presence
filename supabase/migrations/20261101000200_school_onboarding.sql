create or replace function public.create_school(
  p_name text,
  p_school_type text,
  p_city text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_school_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.';
  end if;

  if p_school_type not in ('primary', 'middle', 'high', 'university', 'other') then
    raise exception 'Type d’établissement non reconnu.';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Le nom de l’établissement doit contenir au moins 2 caractères.';
  end if;

  insert into public.profiles (id)
  values (auth.uid())
  on conflict (id) do nothing;

  insert into public.schools (name, school_type, city, created_by)
  values (trim(p_name), p_school_type, nullif(trim(p_city), ''), auth.uid())
  returning id into new_school_id;

  insert into public.school_members (school_id, user_id, role, is_active)
  values (new_school_id, auth.uid(), 'school_admin', true);

  return new_school_id;
end;
$$;

revoke all on function public.create_school(text, text, text) from public;
grant execute on function public.create_school(text, text, text) to authenticated;

comment on function public.create_school(text, text, text) is
  'Crée un établissement et attribue le rôle administrateur à son créateur.';