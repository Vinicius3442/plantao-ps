-- ============================================================================
-- PlantãoPS - Sistema de Gestão de Pronto-Socorro em Tempo Real
-- 01_schema.sql: Criação de tipos enumerados, tabelas, índices e restrições
-- ============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tipos Enumerados (Domínio estrito no banco)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('recepcao', 'enfermagem', 'medico', 'gestao', 'painel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE risk_color AS ENUM ('vermelho', 'laranja', 'amarelo', 'verde', 'azul');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE consciousness_level AS ENUM ('alerta', 'confuso', 'inconsciente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE encounter_status AS ENUM (
    'aguardando_triagem',
    'aguardando_medico',
    'em_atendimento',
    'aguardando_leito',
    'em_observacao',
    'alta',
    'transferido',
    'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bed_status AS ENUM ('livre', 'ocupado', 'em_limpeza', 'bloqueado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabela: profiles (Perfis dos profissionais vinculados ao Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  default_room TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabela: patients (Dados cadastrais dos pacientes)
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 3),
  birth_date DATE NOT NULL CHECK (birth_date <= CURRENT_DATE),
  sex TEXT NOT NULL CHECK (sex IN ('M', 'F', 'Outro')),
  phone TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients USING gin (to_tsvector('portuguese', full_name));
CREATE INDEX IF NOT EXISTS idx_patients_birth_date ON public.patients(birth_date);

-- 4. Tabela: patient_allergies (Alergias conhecidas de cada paciente)
CREATE TABLE IF NOT EXISTS public.patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  allergen TEXT NOT NULL CHECK (char_length(trim(allergen)) >= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, allergen)
);

CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient ON public.patient_allergies(patient_id);

-- 5. Tabela: encounters (Atendimentos do Pronto-Socorro)
CREATE TABLE IF NOT EXISTS public.encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  ticket_number TEXT NOT NULL,
  status encounter_status NOT NULL DEFAULT 'aguardando_triagem',
  current_risk risk_color,
  chief_complaint TEXT,
  clinical_notes TEXT,
  destination TEXT CHECK (destination IS NULL OR destination IN ('alta', 'observacao', 'internacao', 'transferencia')),
  consulting_room TEXT,
  assigned_doctor_id UUID REFERENCES public.profiles(id),
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triaged_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Restrição crítica de integridade (Item 2.2 e 3.7):
-- Um mesmo paciente NÃO pode ter dois atendimentos ativos ao mesmo tempo!
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_encounter_per_patient
  ON public.encounters(patient_id)
  WHERE status NOT IN ('alta', 'transferido', 'cancelado');

CREATE INDEX IF NOT EXISTS idx_encounters_status ON public.encounters(status);
CREATE INDEX IF NOT EXISTS idx_encounters_arrived_at ON public.encounters(arrived_at DESC);

-- 6. Tabela: triages (Sinais vitais, cor sugerida, cor final, justificativa e reclassificações)
CREATE TABLE IF NOT EXISTS public.triages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  nurse_id UUID REFERENCES public.profiles(id),
  nurse_name TEXT NOT NULL DEFAULT 'Enfermagem',
  systolic_bp INTEGER NOT NULL CHECK (systolic_bp BETWEEN 30 AND 300),
  diastolic_bp INTEGER NOT NULL CHECK (diastolic_bp BETWEEN 20 AND 200),
  heart_rate INTEGER NOT NULL CHECK (heart_rate BETWEEN 20 AND 250),
  temperature NUMERIC(4,1) NOT NULL CHECK (temperature BETWEEN 30.0 AND 45.0),
  oxygen_saturation INTEGER NOT NULL CHECK (oxygen_saturation BETWEEN 0 AND 100),
  pain_level INTEGER NOT NULL CHECK (pain_level BETWEEN 0 AND 10),
  consciousness consciousness_level NOT NULL,
  chief_complaint TEXT NOT NULL CHECK (char_length(trim(chief_complaint)) >= 3),
  suggested_color risk_color NOT NULL,
  final_color risk_color NOT NULL,
  justification TEXT,
  is_reclassification BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Se o enfermeiro alterar a cor sugerida, a justificativa é obrigatória (Item 2.3):
  CONSTRAINT chk_triage_override_justification CHECK (
    suggested_color = final_color
    OR (justification IS NOT NULL AND char_length(trim(justification)) >= 5)
  )
);

CREATE INDEX IF NOT EXISTS idx_triages_encounter ON public.triages(encounter_id, created_at DESC);

-- 7. Tabela: encounter_events (Histórico / Linha do tempo de todas as mudanças de situação)
CREATE TABLE IF NOT EXISTS public.encounter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  from_status encounter_status,
  to_status encounter_status NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  actor_name TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encounter_events_encounter ON public.encounter_events(encounter_id, created_at ASC);

-- 8. Tabela: medications (Catálogo de medicamentos com dose máxima)
CREATE TABLE IF NOT EXISTS public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active_principle TEXT NOT NULL,
  max_dose_mg NUMERIC(10,2) NOT NULL CHECK (max_dose_mg > 0),
  unit TEXT NOT NULL DEFAULT 'mg',
  default_route TEXT NOT NULL DEFAULT 'VO',
  common_frequencies TEXT[] NOT NULL DEFAULT ARRAY['6/6h', '8/8h', '12/12h', 'Dose única', 'ACM']
);

-- 9. Tabela: prescriptions (Itens prescritos em cada atendimento)
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE RESTRICT,
  medication_name TEXT NOT NULL,
  doctor_id UUID REFERENCES public.profiles(id),
  doctor_name TEXT NOT NULL DEFAULT 'Médico Plantonista',
  dose_mg NUMERIC(10,2) NOT NULL CHECK (dose_mg > 0),
  route TEXT NOT NULL,
  frequency TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter ON public.prescriptions(encounter_id);

-- 10. Tabela: beds (Leitos, ala e status)
CREATE TABLE IF NOT EXISTS public.beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  ward TEXT NOT NULL,
  status bed_status NOT NULL DEFAULT 'livre',
  current_encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Tabela: bed_assignments (Ocupações de leitos - entrada e saída)
CREATE TABLE IF NOT EXISTS public.bed_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bed_id UUID NOT NULL REFERENCES public.beds(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Restrição crítica de integridade (Item 2.6 e 3.7):
-- Impede duas ocupações ativas do mesmo leito ou o mesmo atendimento em dois leitos ativos!
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_bed_assignment
  ON public.bed_assignments(bed_id)
  WHERE ended_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_encounter_bed
  ON public.bed_assignments(encounter_id)
  WHERE ended_at IS NULL;

-- 12. Tabela: calls (Chamadas exibidas no painel da sala de espera - NUNCA contém nome do paciente!)
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  risk_color risk_color NOT NULL,
  consulting_room TEXT NOT NULL,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_called_at ON public.calls(called_at DESC);

-- Habilitar Realtime para as tabelas exigidas no item 3.5
ALTER PUBLICATION supabase_realtime ADD TABLE public.encounters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.triages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.beds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
