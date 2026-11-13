-- ============================================================================
-- PlantãoPS - Sistema de Gestão de Pronto-Socorro em Tempo Real
-- 02_rls_policies.sql: Row Level Security (RLS) e Controle de Acesso por Perfil
-- ============================================================================

-- Função auxiliar segura (SECURITY DEFINER) para obter o perfil do usuário autenticado
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Habilitar RLS em TODAS as tabelas (Item 3.7)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bed_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. Policies: profiles
-- O perfil fica salvo no banco e NÃO pode ser alterado pelo próprio usuário (Item 2.1)
-- ============================================================================
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Nenhum UPDATE ou INSERT direto liberado para usuários comuns em profiles.

-- ============================================================================
-- 2. Policies: patients
-- Painel NUNCA enxerga dados pessoais dos pacientes (Item 2.7 e 3.7)
-- Recepção e Enfermagem podem cadastrar/atualizar pacientes
-- ============================================================================
DROP POLICY IF EXISTS "patients_select_staff" ON public.patients;
CREATE POLICY "patients_select_staff"
  ON public.patients FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('recepcao', 'enfermagem', 'medico', 'gestao'));

DROP POLICY IF EXISTS "patients_insert_recepcao" ON public.patients;
CREATE POLICY "patients_insert_recepcao"
  ON public.patients FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('recepcao', 'enfermagem'));

DROP POLICY IF EXISTS "patients_update_recepcao" ON public.patients;
CREATE POLICY "patients_update_recepcao"
  ON public.patients FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('recepcao', 'enfermagem'));

-- ============================================================================
-- 3. Policies: patient_allergies
-- ============================================================================
DROP POLICY IF EXISTS "allergies_select_staff" ON public.patient_allergies;
CREATE POLICY "allergies_select_staff"
  ON public.patient_allergies FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('recepcao', 'enfermagem', 'medico', 'gestao'));

DROP POLICY IF EXISTS "allergies_insert_staff" ON public.patient_allergies;
CREATE POLICY "allergies_insert_staff"
  ON public.patient_allergies FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('recepcao', 'enfermagem', 'medico'));

-- ============================================================================
-- 4. Policies: encounters
-- Nota de segurança (Item 3.7):
-- - O painel NÃO tem acesso direto a encounters com dados clínicos (usa view/calls).
-- - A situação do atendimento SÓ muda via funções RPC (não há policy de UPDATE direto).
-- ============================================================================
DROP POLICY IF EXISTS "encounters_select_staff" ON public.encounters;
CREATE POLICY "encounters_select_staff"
  ON public.encounters FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('recepcao', 'enfermagem', 'medico', 'gestao'));

-- Trigger de proteção na tabela encounters para impedir que alguém (exceto RPCs)
-- altere status diretamente ou que não-médicos editem evolução clínica
CREATE OR REPLACE FUNCTION public.trg_protect_encounters()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Somente funções RPC autorizadas definem a flag local 'app.rpc_authorized' = 'true'
  IF current_setting('app.rpc_authorized', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Operação bloqueada: alterações em atendimentos só são permitidas via funções RPC validadas.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_encounters_mutation ON public.encounters;
CREATE TRIGGER protect_encounters_mutation
  BEFORE INSERT OR UPDATE ON public.encounters
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protect_encounters();

-- ============================================================================
-- 5. Policies: triages
-- Item 3.7: "A recepção não pode ler triagens, evoluções nem prescrições."
-- "O perfil do painel só enxerga as chamadas"
-- ============================================================================
DROP POLICY IF EXISTS "triages_select_clinical_and_gestao" ON public.triages;
CREATE POLICY "triages_select_clinical_and_gestao"
  ON public.triages FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('enfermagem', 'medico', 'gestao'));

DROP POLICY IF EXISTS "triages_insert_enfermagem" ON public.triages;
CREATE POLICY "triages_insert_enfermagem"
  ON public.triages FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'enfermagem');

-- ============================================================================
-- 6. Policies: prescriptions & medications
-- Item 3.7:
-- - "A recepção não pode ler triagens, evoluções nem prescrições."
-- - "Somente usuários com perfil de médico podem registrar prescrições e evoluções."
-- - "A validação de alergia e de dose máxima deve existir também no banco"
-- ============================================================================
DROP POLICY IF EXISTS "medications_select_clinical" ON public.medications;
CREATE POLICY "medications_select_clinical"
  ON public.medications FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('enfermagem', 'medico', 'gestao'));

DROP POLICY IF EXISTS "prescriptions_select_clinical" ON public.prescriptions;
CREATE POLICY "prescriptions_select_clinical"
  ON public.prescriptions FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('enfermagem', 'medico', 'gestao'));

DROP POLICY IF EXISTS "prescriptions_insert_medico_only" ON public.prescriptions;
CREATE POLICY "prescriptions_insert_medico_only"
  ON public.prescriptions FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'medico');

-- Trigger no banco para validar alergia e dose máxima mesmo em INSERT direto (Item 3.7)
CREATE OR REPLACE FUNCTION public.trg_validate_prescription_safety()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
  v_med RECORD;
  v_allergy_match TEXT;
BEGIN
  -- Verificar perfil de médico
  IF public.get_my_role() IS DISTINCT FROM 'medico' AND current_setting('app.seed_mode', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Acesso negado: somente médicos podem registrar prescrições.';
  END IF;

  -- Obter medicamento
  SELECT * INTO v_med FROM public.medications WHERE id = NEW.medication_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Medicamento não encontrado no catálogo.';
  END IF;

  -- 1. Validar dose máxima cadastrada
  IF NEW.dose_mg > v_med.max_dose_mg THEN
    RAISE EXCEPTION 'PRESCRIÇÃO BLOQUEADA: Dose informada (% mg) excede a dose máxima permitida para % (% mg).',
      NEW.dose_mg, v_med.name, v_med.max_dose_mg;
  END IF;

  -- 2. Validar alergias do paciente
  SELECT patient_id INTO v_patient_id FROM public.encounters WHERE id = NEW.encounter_id;
  SELECT allergen INTO v_allergy_match
  FROM public.patient_allergies
  WHERE patient_id = v_patient_id
    AND (
      lower(v_med.name) LIKE '%' || lower(trim(allergen)) || '%'
      OR lower(v_med.active_principle) LIKE '%' || lower(trim(allergen)) || '%'
      OR lower(trim(allergen)) LIKE '%' || lower(v_med.active_principle) || '%'
    )
  LIMIT 1;

  IF v_allergy_match IS NOT NULL THEN
    RAISE EXCEPTION 'PRESCRIÇÃO BLOQUEADA POR ALERGIA: Paciente possui alergia registrada a "%" (medicamento: % / princípio ativo: %).',
      v_allergy_match, v_med.name, v_med.active_principle;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_prescription_before_insert ON public.prescriptions;
CREATE TRIGGER validate_prescription_before_insert
  BEFORE INSERT ON public.prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_prescription_safety();

-- ============================================================================
-- 7. Policies: encounter_events
-- ============================================================================
DROP POLICY IF EXISTS "events_select_staff" ON public.encounter_events;
CREATE POLICY "events_select_staff"
  ON public.encounter_events FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('recepcao', 'enfermagem', 'medico', 'gestao'));

-- ============================================================================
-- 8. Policies: beds & bed_assignments
-- ============================================================================
DROP POLICY IF EXISTS "beds_select_staff" ON public.beds;
CREATE POLICY "beds_select_staff"
  ON public.beds FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('enfermagem', 'medico', 'gestao'));

DROP POLICY IF EXISTS "bed_assignments_select_staff" ON public.bed_assignments;
CREATE POLICY "bed_assignments_select_staff"
  ON public.bed_assignments FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('enfermagem', 'medico', 'gestao'));

-- ============================================================================
-- 9. Policies: calls (Painel de chamadas - acessível a todos os perfis autenticados,
-- inclusive 'painel', pois só armazena senha, cor de risco, consultório e horário)
-- ============================================================================
DROP POLICY IF EXISTS "calls_select_all_authenticated" ON public.calls;
CREATE POLICY "calls_select_all_authenticated"
  ON public.calls FOR SELECT
  TO authenticated
  USING (true);
