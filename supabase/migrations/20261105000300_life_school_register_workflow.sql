-- Live school-life register: official closure, justification review and audit trail.
create table public.school_audit_events (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 event_type text not null check (event_type in ('attendance_submitted','attendance_closed','justification_submitted','justification_approved','justification_rejected','disciplinary_event_created')),
 entity_type text not null check (entity_type in ('attendance_session','attendance_justification','disciplinary_event')),
 entity_id uuid not null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index school_audit_events_school_created_idx on public.school_audit_events(school_id,created_at desc);
create index school_audit_events_entity_idx on public.school_audit_events(entity_type,entity_id,created_at desc);
alter table public.school_audit_events enable row level security;
create policy "school_audit_events_life_school_read" on public.school_audit_events for select to authenticated
 using (app_private.has_school_role(school_id,array['super_admin','school_admin','life_supervisor']::public.school_role[]));
revoke all on public.school_audit_events from anon;
grant select on public.school_audit_events to authenticated;

create or replace function app_private.record_school_audit_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 n jsonb:=to_jsonb(new); o jsonb; sid uuid; eid uuid; actor uuid;
 etype text; evtype text; meta jsonb:='{}'::jsonb;
begin
 if tg_op='UPDATE' then o:=to_jsonb(old); end if;
 sid:=(n->>'school_id')::uuid; eid:=(n->>'id')::uuid; actor:=auth.uid();
 if tg_table_name='attendance_sessions' then
  etype:='attendance_session';
  if tg_op='INSERT' and n->>'status'='submitted' then
   evtype:='attendance_submitted'; actor:=coalesce(actor,(n->>'teacher_id')::uuid);
  elsif tg_op='UPDATE' and o->>'status' is distinct from n->>'status' and n->>'status'='closed' then
   evtype:='attendance_closed'; actor:=coalesce(actor,(n->>'closed_by')::uuid);
  end if;
  meta:=jsonb_strip_nulls(jsonb_build_object('class_id',n->>'class_id','session_date',n->>'session_date','period_label',n->>'period_label'));
 elsif tg_table_name='attendance_justifications' then
  etype:='attendance_justification';
  if tg_op='INSERT' then
   evtype:='justification_submitted'; actor:=coalesce(actor,(n->>'created_by')::uuid);
  elsif tg_op='UPDATE' and o->>'status' is distinct from n->>'status' and n->>'status' in ('approved','rejected') then
   evtype:=case n->>'status' when 'approved' then 'justification_approved' else 'justification_rejected' end;
   actor:=coalesce(actor,(n->>'reviewed_by')::uuid);
  end if;
  meta:=jsonb_strip_nulls(jsonb_build_object('attendance_record_id',n->>'attendance_record_id','status',n->>'status'));
 elsif tg_table_name='disciplinary_events' and tg_op='INSERT' then
  etype:='disciplinary_event'; evtype:='disciplinary_event_created';
  actor:=coalesce(actor,(n->>'recorded_by')::uuid);
  meta:=jsonb_strip_nulls(jsonb_build_object('student_id',n->>'student_id','event_type',n->>'event_type'));
 end if;
 if evtype is not null then
  insert into public.school_audit_events(school_id,actor_id,event_type,entity_type,entity_id,metadata)
  values(sid,actor,evtype,etype,eid,meta);
 end if;
 return new;
end; $$;
revoke all on function app_private.record_school_audit_event() from public,anon,authenticated;
drop trigger if exists attendance_sessions_audit on public.attendance_sessions;
create trigger attendance_sessions_audit after insert or update of status on public.attendance_sessions
 for each row execute function app_private.record_school_audit_event();
drop trigger if exists attendance_justifications_audit on public.attendance_justifications;
create trigger attendance_justifications_audit after insert or update of status on public.attendance_justifications
 for each row execute function app_private.record_school_audit_event();
drop trigger if exists disciplinary_events_audit on public.disciplinary_events;
create trigger disciplinary_events_audit after insert on public.disciplinary_events
 for each row execute function app_private.record_school_audit_event();

create or replace function app_private.guard_justification_review()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,app_private as $$
begin
 if auth.uid() is null or not app_private.has_school_role(old.school_id,array['super_admin','school_admin','life_supervisor']::public.school_role[]) then
  raise exception 'Seule la vie scolaire ou la direction peut traiter une justification.';
 end if;
 if old.status<>'pending' then raise exception 'Cette justification a déjà été traitée.'; end if;
 if new.id is distinct from old.id or new.school_id is distinct from old.school_id
  or new.attendance_record_id is distinct from old.attendance_record_id
  or new.created_by is distinct from old.created_by or new.reason is distinct from old.reason
  or new.created_at is distinct from old.created_at then
  raise exception 'Les informations originales de la justification sont immuables.';
 end if;
 if new.status not in ('approved','rejected') or new.reviewed_by is distinct from auth.uid() or new.reviewed_at is null then
  raise exception 'Décision de validation invalide.';
 end if;
 if new.review_note is not null and length(new.review_note)>500 then raise exception 'La note de décision ne peut dépasser 500 caractères.'; end if;
 return new;
end; $$;
drop trigger if exists attendance_justifications_guard_review on public.attendance_justifications;
create trigger attendance_justifications_guard_review before update on public.attendance_justifications
 for each row execute function app_private.guard_justification_review();

create or replace function app_private.close_attendance_session_internal(p_session_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare sid uuid; current_status public.attendance_session_status;
begin
 if auth.uid() is null then raise exception 'Authentification requise.'; end if;
 select s.school_id,s.status into sid,current_status from public.attendance_sessions s where s.id=p_session_id for update;
 if not found then raise exception 'Séance introuvable.'; end if;
 if not app_private.has_school_role(sid,array['super_admin','school_admin','life_supervisor']::public.school_role[]) then
  raise exception 'Droits insuffisants pour clôturer ce registre.';
 end if;
 if current_status='closed' then return; end if;
 if current_status<>'submitted' then raise exception 'Seul un registre transmis peut être clôturé.'; end if;
 update public.attendance_sessions set status='closed',closed_at=now(),closed_by=auth.uid() where id=p_session_id;
end; $$;
revoke all on function app_private.close_attendance_session_internal(uuid) from public,anon;
grant execute on function app_private.close_attendance_session_internal(uuid) to authenticated;
create or replace function public.close_attendance_session(p_session_id uuid)
returns void language plpgsql security invoker set search_path=pg_catalog,app_private as $$
begin perform app_private.close_attendance_session_internal(p_session_id); end; $$;
revoke all on function public.close_attendance_session(uuid) from public,anon;
grant execute on function public.close_attendance_session(uuid) to authenticated;

create or replace function app_private.review_attendance_justification_internal(
 p_justification_id uuid,p_status public.justification_status,p_review_note text default null
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare sid uuid; current_status public.justification_status;
begin
 if auth.uid() is null then raise exception 'Authentification requise.'; end if;
 if p_status not in ('approved','rejected') then raise exception 'La décision doit être approuvée ou rejetée.'; end if;
 select j.school_id,j.status into sid,current_status from public.attendance_justifications j where j.id=p_justification_id for update;
 if not found then raise exception 'Justification introuvable.'; end if;
 if not app_private.has_school_role(sid,array['super_admin','school_admin','life_supervisor']::public.school_role[]) then
  raise exception 'Droits insuffisants pour traiter cette justification.';
 end if;
 if current_status<>'pending' then raise exception 'Cette justification a déjà été traitée.'; end if;
 update public.attendance_justifications set status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),
  review_note=nullif(trim(coalesce(p_review_note,'')),'') where id=p_justification_id;
end; $$;
revoke all on function app_private.review_attendance_justification_internal(uuid,public.justification_status,text) from public,anon;
grant execute on function app_private.review_attendance_justification_internal(uuid,public.justification_status,text) to authenticated;
create or replace function public.review_attendance_justification(
 p_justification_id uuid,p_status public.justification_status,p_review_note text default null
) returns void language plpgsql security invoker set search_path=pg_catalog,app_private as $$
begin perform app_private.review_attendance_justification_internal(p_justification_id,p_status,p_review_note); end; $$;
revoke all on function public.review_attendance_justification(uuid,public.justification_status,text) from public,anon;
grant execute on function public.review_attendance_justification(uuid,public.justification_status,text) to authenticated;

comment on table public.school_audit_events is 'Journal immuable des appels transmis/clôturés, justifications traitées et événements disciplinaires.';
comment on function public.close_attendance_session(uuid) is 'Clôture un registre transmis ; opération réservée à la vie scolaire et à la direction.';
comment on function public.review_attendance_justification(uuid,public.justification_status,text) is 'Traite une justification en conservant ses données originales.';
