-- Evita que un profesional tenga dos reservas activas que se solapen en el tiempo.
--
-- Por qué: el backend valida la disponibilidad antes de insertar, pero entre la
-- validación y el INSERT otro cliente puede reservar la misma hora. Esta
-- restricción hace que Postgres rechace la segunda (error 23P01), que el
-- backend traduce a un 409 "El profesional ya tiene una reserva en ese horario".
--
-- Cómo aplicarlo: Supabase → SQL Editor → pegar y ejecutar (una sola vez por base).
-- Falla si ya existen reservas solapadas; para encontrarlas:
--
--   select a.id, b.id, a.scheduled_at
--   from appointments a join appointments b
--     on a.professional_id = b.professional_id and a.id < b.id
--    and a.status in ('pending','confirmed') and b.status in ('pending','confirmed')
--    and a.scheduled_at < b.ends_at and b.scheduled_at < a.ends_at;
--
-- y cancelar (status = 'cancelled') una de cada par.

create extension if not exists btree_gist with schema extensions;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(scheduled_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'));

-- Para revertir:
--   alter table public.appointments drop constraint appointments_no_overlap;
