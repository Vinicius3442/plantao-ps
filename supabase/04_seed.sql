-- ============================================================================
-- PlantãoPS - Sistema de Gestão de Pronto-Socorro em Tempo Real
-- 04_seed.sql: Usuários de exemplo por perfil, catálogo de medicamentos, leitos e pacientes fictícios
-- ============================================================================

-- 1. Catálogo de Medicamentos com Dose Máxima (Item 2.5 e 3.6)
INSERT INTO public.medications (id, name, active_principle, max_dose_mg, unit, default_route, common_frequencies)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'Dipirona Sódica 500mg/mL', 'Dipirona', 1000, 'mg', 'EV', ARRAY['6/6h', '8/8h', 'ACM', 'Dose única']),
  ('10000000-0000-0000-0000-000000000002', 'Paracetamol 750mg', 'Paracetamol', 1000, 'mg', 'VO', ARRAY['6/6h', '8/8h', 'ACM']),
  ('10000000-0000-0000-0000-000000000003', 'Amoxicilina + Clavulanato', 'Amoxicilina / Penicilina', 875, 'mg', 'VO', ARRAY['8/8h', '12/12h']),
  ('10000000-0000-0000-0000-000000000004', 'Ceftriaxona Dissódica', 'Ceftriaxona', 2000, 'mg', 'EV', ARRAY['12/12h', '24/24h', 'Dose única']),
  ('10000000-0000-0000-0000-000000000005', 'Cetoprofeno (Profenid)', 'Cetoprofeno / AINE', 100, 'mg', 'EV', ARRAY['8/8h', '12/12h', 'Dose única']),
  ('10000000-0000-0000-0000-000000000006', 'Ibuprofeno Gotas/Comp', 'Ibuprofeno / AINE', 600, 'mg', 'VO', ARRAY['6/6h', '8/8h']),
  ('10000000-0000-0000-0000-000000000007', 'Sulfato de Morfina', 'Morfina', 10, 'mg', 'EV', ARRAY['4/4h', '6/6h', 'Dose única']),
  ('10000000-0000-0000-0000-000000000008', 'Ondansetrona (Vonau)', 'Ondansetrona', 8, 'mg', 'EV', ARRAY['8/8h', '12/12h', 'Dose única']),
  ('10000000-0000-0000-0000-000000000009', 'Captopril', 'Captopril', 50, 'mg', 'VO', ARRAY['8/8h', '12/12h', 'Dose única']),
  ('10000000-0000-0000-0000-000000000010', 'Furosemida (Lasix)', 'Furosemida', 80, 'mg', 'EV', ARRAY['8/8h', '12/12h', 'Dose única'])
ON CONFLICT (name) DO NOTHING;

-- 2. Mapa de Leitos Inicial (Sala Vermelha, Observação Adulto e Observação Pediátrica)
INSERT INTO public.beds (id, code, ward, status)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'SV-01', 'Sala Vermelha (Emergência)', 'livre'),
  ('20000000-0000-0000-0000-000000000002', 'SV-02', 'Sala Vermelha (Emergência)', 'livre'),
  ('20000000-0000-0000-0000-000000000003', 'SV-03', 'Sala Vermelha (Emergência)', 'em_limpeza'),
  ('20000000-0000-0000-0000-000000000004', 'OBS-01', 'Observação Clínica', 'livre'),
  ('20000000-0000-0000-0000-000000000005', 'OBS-02', 'Observação Clínica', 'livre'),
  ('20000000-0000-0000-0000-000000000006', 'OBS-03', 'Observação Clínica', 'livre'),
  ('20000000-0000-0000-0000-000000000007', 'OBS-04', 'Observação Clínica', 'bloqueado'),
  ('20000000-0000-0000-0000-000000000008', 'ISO-01', 'Isolamento Respiratório', 'livre')
ON CONFLICT (code) DO NOTHING;

-- 3. Criação automática das 5 contas de exemplo no Supabase Auth + public.profiles (Item 2.1 e 6)
-- Senha padrão de todos os usuários de teste: 123456
DO $$
DECLARE
  v_users JSONB := '[
    {"id": "00000000-0000-0000-0000-000000000101", "email": "recepcao@plantaops.gov.br",   "name": "Carla Mendes (Recepção)",       "role": "recepcao",   "room": "Guichê 01"},
    {"id": "00000000-0000-0000-0000-000000000102", "email": "enfermagem@plantaops.gov.br", "name": "Enf. Rafael Costa (Triagem)",    "role": "enfermagem", "room": "Sala de Triagem 01"},
    {"id": "00000000-0000-0000-0000-000000000103", "email": "medico1@plantaops.gov.br",    "name": "Dra. Helena Ribeiro (CRM 45892)","role": "medico",     "room": "Consultório 01"},
    {"id": "00000000-0000-0000-0000-000000000104", "email": "medico2@plantaops.gov.br",    "name": "Dr. Marcos Oliveira (CRM 38110)","role": "medico",     "room": "Consultório 02"},
    {"id": "00000000-0000-0000-0000-000000000105", "email": "gestao@plantaops.gov.br",     "name": "Dr. Eduardo Santos (Diretor)",   "role": "gestao",     "room": "Diretoria Clínica"},
    {"id": "00000000-0000-0000-0000-000000000106", "email": "painel@plantaops.gov.br",     "name": "TV Sala de Espera (Quiosque)",   "role": "painel",     "room": "Recepção Principal"}
  ]'::JSONB;
  u JSONB;
  v_uid UUID;
BEGIN
  FOR u IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    v_uid := (u->>'id')::UUID;

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      u->>'email',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::JSONB,
      jsonb_build_object('full_name', u->>'name', 'role', u->>'role'),
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, full_name, role, default_room)
    VALUES (
      v_uid,
      u->>'email',
      u->>'name',
      (u->>'role')::user_role,
      u->>'room'
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
