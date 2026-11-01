create or replace function public.submit_attendance(
  p_school_id uuid,
  p_class_id uuid,
  p_session_date date,
  p_period_label text,
  p_records jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_session_id uuid;
  submitted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.';
  end if;

  if p_school_id is null or p_class_id is null or p_session_date is null then
    raise exception 'Établissement, classe et date obligatoires.';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'La liste des présences doit être un tableau JSON.';
  end if;

  submitted_count := jsonb_array_length(p_records);
  if submitted_count < 1 or submitted_count > 500 then
    raise exception 'Un appel doit contenir entre 1 et 500 élèves.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records) as item(value)
    where nullif(item.value ->> 'student_id', '') is null
       or coalesce(item.value ->> 'status', '') not in ('present', 'absent', 'late')
  ) then
    raise exception 'Chaque élève doit avoir un identifiant et un statut valide.';
  end if;

  if (
    select count(distinct item.value ->> 'student_id')
    from jsonb_array_elements(p_records) as item(value)
  ) <> submitted_count then
    raise exception 'Un élève ne peut apparaître qu’une seule fois dans un appel.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records) as item(value)
    left join public.students s
      on s.id = (item.value ->> 'student_id')::uuid
     and s.school_id = p_school_id
     and s.current_class_id = p_class_id
     and s.is_active = true
    where s.id is null
  ) then
    raise exception 'Un ou plusieurs élèves ne correspondent pas à cette classe.';
  end if;

  insert into public.attendance_sessions (
    school_id,
    class_id,
    teacher_id,
    session_date,
    period_label,
    status,
    submitted_at
  )
  values (
    p_school_id,
    p_class_id,
    auth.uid(),
    p_session_date,
    nullif(trim(coalesce(p_period_label, '')), ''),
    'submitted',
    now()
  )
  returning id into new_session_id;

  insert into public.attendance_records (
    school_id,
    session_id,
    student_id,
    status,
    recorded_by
  )
  select
    p_school_id,
    new_session_id,
    (item.value ->> 'student_id')::uuid,
    (item.value ->> 'status')::public.attendance_mark,
    auth.uid()
  from jsonb_array_elements(p_records) as item(value);

  return new_session_id;
end;
$$;

revoke all on function public.submit_attendance(uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function public.submit_attendance(uuid, uuid, date, text, jsonb) to authenticated;

comment on function public.submit_attendance(uuid, uuid, date, text, jsonb) is
  'Enregistre atomiquement une séance et les statuts de présence des élèves de la classe, sous RLS.';