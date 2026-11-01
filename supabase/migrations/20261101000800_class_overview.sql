create or replace function public.get_school_class_overview(target_school_id uuid)
returns table (
  id uuid,
  name text,
  level text,
  class_mode text,
  student_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.level,
    c.class_mode,
    count(s.id)::bigint as student_count
  from public.classes c
  left join public.students s
    on s.school_id = c.school_id
   and s.current_class_id = c.id
   and s.is_active = true
  where c.school_id = target_school_id
    and c.is_active = true
  group by c.id, c.name, c.level, c.class_mode
  order by c.name;
$$;

revoke all on function public.get_school_class_overview(uuid) from public, anon;
grant execute on function public.get_school_class_overview(uuid) to authenticated;

comment on function public.get_school_class_overview(uuid) is
  'Retourne les classes accessibles à l’utilisateur et le nombre d’élèves visibles, avec application des politiques RLS.';