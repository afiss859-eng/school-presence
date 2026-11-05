-- Explicit backend privileges for the service-role Edge Function.
grant usage on schema public to service_role;
grant select, insert, update, delete
  on public.school_invitations, public.school_members, public.class_assignments
  to service_role;

comment on table public.school_invitations is
  'La gestion serveur utilise service_role ; les utilisateurs normaux disposent uniquement de la lecture RLS réservée à la direction.';