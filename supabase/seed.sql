-- =============================================================================
-- Seed de datos para desarrollo local
-- =============================================================================
-- Idempotente: usa ON CONFLICT para poder ejecutarse varias veces.
-- Carga: 2 equipos, 3 miembros y 1 ausencia de ejemplo.
--
-- NO incluye usuarios ni user_roles (los crea el flujo de Auth). Tras
-- registrarte en http://localhost:8080, promueve tu usuario a admin con:
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES ('<tu-uuid>', 'admin');
-- =============================================================================

BEGIN;

-- Equipos ---------------------------------------------------------------------
INSERT INTO public.teams (id, name, icon)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'RODAT',      'Users'),
  ('22222222-2222-2222-2222-222222222222', 'Processing', 'Cpu')
ON CONFLICT (id) DO NOTHING;

-- Miembros --------------------------------------------------------------------
INSERT INTO public.members (id, team_id, name, role, email)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '11111111-1111-1111-1111-111111111111',
   'Ada Lovelace',    'Senior Developer', 'ada@example.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   '11111111-1111-1111-1111-111111111111',
   'Alan Turing',     'Developer',        'alan@example.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
   '22222222-2222-2222-2222-222222222222',
   'Grace Hopper',    'Tech Lead',        'grace@example.local')
ON CONFLICT (id) DO NOTHING;

-- Ausencia de ejemplo ---------------------------------------------------------
INSERT INTO public.absences (id, member_id, type, start_date, end_date, notes)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'vacation',
   (CURRENT_DATE + INTERVAL '14 days')::date,
   (CURRENT_DATE + INTERVAL '21 days')::date,
   'Vacaciones planificadas (seed)')
ON CONFLICT (id) DO NOTHING;

COMMIT;
