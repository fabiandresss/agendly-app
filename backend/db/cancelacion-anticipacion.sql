-- Anticipación mínima (en horas) con la que un CLIENTE puede cancelar o reagendar
-- su reserva usando el link. 0 = sin restricción.
-- El dueño siempre puede cancelar/reagendar desde el panel, sin esta regla.
--
-- Cómo aplicarlo: Supabase → SQL Editor → pegar y ejecutar (una sola vez por base).

alter table public.businesses
  add column if not exists cancellation_min_hours integer not null default 2
  check (cancellation_min_hours between 0 and 168);

-- Para revertir:
--   alter table public.businesses drop column cancellation_min_hours;
