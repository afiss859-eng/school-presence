-- Keep one editable attendance session for a given class, teacher, date and period.
create unique index if not exists attendance_sessions_one_open_slot
  on public.attendance_sessions (
    school_id,
    class_id,
    teacher_id,
    session_date,
    (coalesce(period_label, ''))
  )
  where status <> 'closed';

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
  target_session_id uuid;
  period_value text;
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

  period_value := nullif(trim(coalesce(p_period_label, '')), '');

  select s.id
    into target_session_id
  from public.attendance_sessions s
  where s.school_id = p_school_id
    and s.class_id = p_class_id
    and s.teacher_id = auth.uid()
    and s.session_date = p_session_date
    and coalesce(s.period_label, '') = coalesce(period_value, '')
    and s.status = 'closed'
  limit 1;

  if target_session_id is not null then
    raise exception 'Cette séance est clôturée. Contactez la vie scolaire pour toute correction.';
  end if;

  select s.id
    into target_session_id
  from public.attendance_sessions s
  where s.school_id = p_school_id
    and s.class_id = p_class_id
    and s.teacher_id = auth.uid()
    and s.session_date = p_session_date
    and coalesce(s.period_label, '') = coalesce(period_value, '')
    and s.status <> 'closed'
  for update;

  if target_session_id is null then
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
      period_value,
      'submitted',
      now()
    )
    returning id into target_session_id;
  else
    update public.attendance_sessions
    set status = 'submitted',
        submitted_at = now()
    where id = target_session_id;
  end if;

  insert into public.attendance_records (
    school_id,
    session_id,
    student_id,
    status,
    recorded_by
  )
  select
    p_school_id,
    target_session_id,
    (item.value ->> 'student_id')::uuid,
    (item.value ->> 'status')::public.attendance_mark,
    auth.uid()
  from jsonb_array_elements(p_records) as item(value)
  on conflict (session_id, student_id)
  do update set
    status = excluded.status,
    recorded_by = auth.uid(),
    recorded_at = now();

  return target_session_id;
end;
$$;

revoke all on function public.submit_attendance(uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function public.submit_attendance(uuid, uuid, date, text, jsonb) to authenticated;

comment on function public.submit_attendance(uuid, uuid, date, text, jsonb) is
  'Enregistre atomiquement un appel ; une nouvelle sauvegarde met à jour la séance ouverte et une séance clôturée reste verrouillée.';