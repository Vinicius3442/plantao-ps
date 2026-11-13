-- ============================================================================
-- PlantãoPS - Sistema de Gestão de Pronto-Socorro em Tempo Real
-- 03_rpc_functions.sql: Funções RPC (PL/pgSQL) atômicas e regras de negócio
-- ============================================================================

-- ============================================================================
-- 1. Função pura no banco: Cálculo da Classificação de Risco (Item 2.9a)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_calculate_risk_color(
  p_systolic_bp INTEGER,
  p_heart_rate INTEGER,
  p_temperature NUMERIC,
  p_oxygen_saturation INTEGER,
  p_pain_level INTEGER,
  p_consciousness consciousness_level
)
RETURNS risk_color
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- VERMELHO (Emergência - Imediato):
  -- Saturação < 90%; pressão sistólica < 80 mmHg; FC < 40 ou > 140 bpm; paciente inconsciente.
  IF p_oxygen_saturation < 90
     OR p_systolic_bp < 80
     OR p_heart_rate < 40
     OR p_heart_rate > 140
     OR p_consciousness = 'inconsciente' THEN
    RETURN 'vermelho';
  END IF;

  -- LARANJA (Muito urgente - 10 min):
  -- Saturação de 90% a 93%; temperatura >= 40 °C ou <= 35 °C; dor de 8 a 10; FC de 121 a 140 bpm; paciente confuso.
  IF (p_oxygen_saturation BETWEEN 90 AND 93)
     OR p_temperature >= 40.0
     OR p_temperature <= 35.0
     OR (p_pain_level BETWEEN 8 AND 10)
     OR (p_heart_rate BETWEEN 121 AND 140)
     OR p_consciousness = 'confuso' THEN
    RETURN 'laranja';
  END IF;

  -- AMARELO (Urgente - 60 min):
  -- Temperatura de 38,5 °C a 39,9 °C; dor de 5 a 7; pressão sistólica >= 180 mmHg.
  IF (p_temperature BETWEEN 38.5 AND 39.9)
     OR (p_pain_level BETWEEN 5 AND 7)
     OR p_systolic_bp >= 180 THEN
    RETURN 'amarelo';
  END IF;

  -- VERDE (Pouco urgente - 120 min):
  -- Temperatura de 37,8 °C a 38,4 °C; dor de 1 a 4.
  IF (p_temperature BETWEEN 37.8 AND 38.4)
     OR (p_pain_level BETWEEN 1 AND 4) THEN
    RETURN 'verde';
  END IF;

  -- AZUL (Não urgente - 240 min): Nenhum dos critérios acima.
  RETURN 'azul';
END;
$$;

-- ============================================================================
-- 2. Função pura no banco: Validação de Transição de Situação (Item 2.9c)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_is_valid_status_transition(
  p_from encounter_status,
  p_to encounter_status
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_from
    WHEN 'aguardando_triagem' THEN p_to IN ('aguardando_medico', 'cancelado')
    WHEN 'aguardando_medico'  THEN p_to IN ('em_atendimento', 'aguardando_medico', 'cancelado')
    WHEN 'em_atendimento'     THEN p_to IN ('alta', 'aguardando_leito', 'transferido')
    WHEN 'aguardando_leito'   THEN p_to IN ('em_observacao')
    WHEN 'em_observacao'      THEN p_to IN ('alta', 'transferido')
    WHEN 'alta'               THEN FALSE
    WHEN 'transferido'        THEN FALSE
    WHEN 'cancelado'          THEN FALSE
    ELSE FALSE
  END;
END;
$$;

-- ============================================================================
-- 3. RPC: Abrir Atendimento na Recepção (Item 2.2)
-- Gera senha sequencial do dia (ex: A001, A002...) e impede dois atendimentos ativos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_open_encounter(p_patient_id UUID)
RETURNS public.encounters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_active_count INTEGER;
  v_today_count INTEGER;
  v_ticket TEXT;
  v_encounter public.encounters;
BEGIN
  v_role := public.get_my_role();
  IF v_role NOT IN ('recepcao', 'enfermagem') THEN
    RAISE EXCEPTION 'Permissão negada: apenas a recepção ou enfermagem podem abrir atendimentos.';
  END IF;

  -- Verificar se já possui atendimento ativo
  SELECT COUNT(*) INTO v_active_count
  FROM public.encounters
  WHERE patient_id = p_patient_id
    AND status NOT IN ('alta', 'transferido', 'cancelado');

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'Este paciente já possui um atendimento ativo em andamento no Pronto-Socorro.';
  END IF;

  -- Gerar senha sequencial do dia (A001, A002...)
  SELECT COUNT(*) + 1 INTO v_today_count
  FROM public.encounters
  WHERE arrived_at::DATE = CURRENT_DATE;

  v_ticket := 'A' || LPAD(v_today_count::TEXT, 3, '0');

  PERFORM set_config('app.rpc_authorized', 'true', true);

  INSERT INTO public.encounters (patient_id, ticket_number, status, arrived_at)
  VALUES (p_patient_id, v_ticket, 'aguardando_triagem', NOW())
  RETURNING * INTO v_encounter;

  INSERT INTO public.encounter_events (encounter_id, from_status, to_status, actor_id, details)
  VALUES (v_encounter.id, NULL, 'aguardando_triagem', auth.uid(), 'Atendimento aberto na recepção com senha ' || v_ticket);

  RETURN v_encounter;
END;
$$;

-- ============================================================================
-- 4. RPC: Registrar Triagem ou Reclassificação (Item 2.3 e 2.9)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_record_triage(
  p_encounter_id UUID,
  p_systolic_bp INTEGER,
  p_diastolic_bp INTEGER,
  p_heart_rate INTEGER,
  p_temperature NUMERIC,
  p_oxygen_saturation INTEGER,
  p_pain_level INTEGER,
  p_consciousness consciousness_level,
  p_chief_complaint TEXT,
  p_final_color risk_color,
  p_justification TEXT DEFAULT NULL
)
RETURNS public.encounters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_enc public.encounters;
  v_suggested risk_color;
  v_is_reclass BOOLEAN;
  v_nurse_name TEXT;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'enfermagem' THEN
    RAISE EXCEPTION 'Permissão negada: somente o perfil de enfermagem pode realizar triagem ou reclassificação.';
  END IF;

  SELECT * INTO v_enc FROM public.encounters WHERE id = p_encounter_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento não encontrado.';
  END IF;

  -- Validar transição (aguardando_triagem -> aguardando_medico OU aguardando_medico -> aguardando_medico)
  IF NOT public.fn_is_valid_status_transition(v_enc.status, 'aguardando_medico') THEN
    RAISE EXCEPTION 'Transição inválida: não é permitido triar paciente na situação "%".', v_enc.status;
  END IF;

  v_is_reclass := (v_enc.status = 'aguardando_medico');
  v_suggested := public.fn_calculate_risk_color(
    p_systolic_bp, p_heart_rate, p_temperature, p_oxygen_saturation, p_pain_level, p_consciousness
  );

  IF v_suggested != p_final_color AND (p_justification IS NULL OR char_length(trim(p_justification)) < 5) THEN
    RAISE EXCEPTION 'Justificativa obrigatória (mínimo 5 caracteres) ao alterar a cor sugerida pelo protocolo.';
  END IF;

  SELECT full_name INTO v_nurse_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.triages (
    encounter_id, nurse_id, nurse_name,
    systolic_bp, diastolic_bp, heart_rate, temperature, oxygen_saturation, pain_level,
    consciousness, chief_complaint, suggested_color, final_color, justification, is_reclassification
  ) VALUES (
    p_encounter_id, auth.uid(), COALESCE(v_nurse_name, 'Enfermagem'),
    p_systolic_bp, p_diastolic_bp, p_heart_rate, p_temperature, p_oxygen_saturation, p_pain_level,
    p_consciousness, p_chief_complaint, v_suggested, p_final_color, p_justification, v_is_reclass
  );

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.encounters
  SET status = 'aguardando_medico',
      current_risk = p_final_color,
      chief_complaint = p_chief_complaint,
      triaged_at = COALESCE(triaged_at, NOW()),
      updated_at = NOW()
  WHERE id = p_encounter_id
  RETURNING * INTO v_enc;

  INSERT INTO public.encounter_events (encounter_id, from_status, to_status, actor_id, actor_name, details)
  VALUES (
    p_encounter_id,
    CASE WHEN v_is_reclass THEN 'aguardando_medico'::encounter_status ELSE 'aguardando_triagem'::encounter_status END,
    'aguardando_medico',
    auth.uid(),
    COALESCE(v_nurse_name, 'Enfermagem'),
    CASE WHEN v_is_reclass
      THEN 'Reclassificação de risco para ' || upper(p_final_color::TEXT)
      ELSE 'Triagem concluída: classificação ' || upper(p_final_color::TEXT)
    END
  );

  RETURN v_enc;
END;
$$;

-- ============================================================================
-- 5. RPC ATÔMICA: Chamar Próximo Paciente da Fila (Item 2.5, 2.9b e 3.7)
-- Usa FOR UPDATE SKIP LOCKED para garantir que dois médicos clicando ao mesmo
-- tempo NUNCA recebam o mesmo paciente!
-- Ordenação:
-- 1º Cor de risco (vermelho > laranja > amarelo > verde > azul)
-- 2º Maior tempo de espera (arrived_at ASC)
-- 3º Desempate: Idosos (>= 60 anos) ou Crianças (< 12 anos) primeiro
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_call_next_patient(p_consulting_room TEXT)
RETURNS public.encounters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_target_id UUID;
  v_enc public.encounters;
  v_doc_name TEXT;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'medico' THEN
    RAISE EXCEPTION 'Permissão negada: somente médicos podem chamar o próximo paciente.';
  END IF;

  -- Seleção atômica com bloqueio de linha (SKIP LOCKED evita colisão concorrente)
  SELECT e.id INTO v_target_id
  FROM public.encounters e
  JOIN public.patients p ON p.id = e.patient_id
  WHERE e.status = 'aguardando_medico'
  ORDER BY
    CASE e.current_risk
      WHEN 'vermelho' THEN 1
      WHEN 'laranja'  THEN 2
      WHEN 'amarelo'  THEN 3
      WHEN 'verde'    THEN 4
      WHEN 'azul'     THEN 5
      ELSE 6
    END ASC,
    date_trunc('minute', e.arrived_at) ASC,
    CASE
      WHEN EXTRACT(YEAR FROM age(CURRENT_DATE, p.birth_date)) >= 60
        OR EXTRACT(YEAR FROM age(CURRENT_DATE, p.birth_date)) < 12
      THEN 0
      ELSE 1
    END ASC,
    e.arrived_at ASC
  LIMIT 1
  FOR UPDATE OF e SKIP LOCKED;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Não há pacientes aguardando atendimento médico na fila neste momento.';
  END IF;

  SELECT full_name INTO v_doc_name FROM public.profiles WHERE id = auth.uid();

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.encounters
  SET status = 'em_atendimento',
      consulting_room = p_consulting_room,
      assigned_doctor_id = auth.uid(),
      called_at = NOW(),
      started_at = NOW(),
      updated_at = NOW()
  WHERE id = v_target_id
  RETURNING * INTO v_enc;

  -- Registrar chamada no painel da sala de espera (sem nome do paciente!)
  INSERT INTO public.calls (encounter_id, ticket_number, risk_color, consulting_room, called_at)
  VALUES (v_enc.id, v_enc.ticket_number, COALESCE(v_enc.current_risk, 'azul'), p_consulting_room, NOW());

  -- Registrar evento na linha do tempo
  INSERT INTO public.encounter_events (encounter_id, from_status, to_status, actor_id, actor_name, details)
  VALUES (
    v_enc.id,
    'aguardando_medico',
    'em_atendimento',
    auth.uid(),
    COALESCE(v_doc_name, 'Médico'),
    'Paciente chamado para ' || p_consulting_room
  );

  RETURN v_enc;
END;
$$;

-- ============================================================================
-- 6. RPC: Salvar Evolução Clínica e Definir Destino / Desfecho Médico (Item 2.5)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_finish_medical_consultation(
  p_encounter_id UUID,
  p_clinical_notes TEXT,
  p_destination TEXT -- 'alta', 'observacao', 'internacao', 'transferencia'
)
RETURNS public.encounters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_enc public.encounters;
  v_target_status encounter_status;
  v_doc_name TEXT;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'medico' THEN
    RAISE EXCEPTION 'Permissão negada: somente médicos podem registrar evolução e definir o destino do paciente.';
  END IF;

  SELECT * INTO v_enc FROM public.encounters WHERE id = p_encounter_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento não encontrado.';
  END IF;

  v_target_status := CASE p_destination
    WHEN 'alta'          THEN 'alta'::encounter_status
    WHEN 'observacao'    THEN 'aguardando_leito'::encounter_status
    WHEN 'internacao'    THEN 'aguardando_leito'::encounter_status
    WHEN 'transferencia' THEN 'transferido'::encounter_status
    ELSE NULL
  END;

  IF v_target_status IS NULL THEN
    RAISE EXCEPTION 'Destino inválido: %. Use alta, observacao, internacao ou transferencia.', p_destination;
  END IF;

  IF NOT public.fn_is_valid_status_transition(v_enc.status, v_target_status) THEN
    RAISE EXCEPTION 'Transição de situação inválida: "%" -> "%".', v_enc.status, v_target_status;
  END IF;

  SELECT full_name INTO v_doc_name FROM public.profiles WHERE id = auth.uid();

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.encounters
  SET status = v_target_status,
      clinical_notes = p_clinical_notes,
      destination = p_destination,
      finished_at = CASE WHEN v_target_status IN ('alta', 'transferido') THEN NOW() ELSE finished_at END,
      updated_at = NOW()
  WHERE id = p_encounter_id
  RETURNING * INTO v_enc;

  -- Se o paciente estava em um leito (em_observacao) e recebeu alta ou transferência,
  -- o leito passa automaticamente para 'em_limpeza' (Item 2.6)!
  IF v_target_status IN ('alta', 'transferido') THEN
    UPDATE public.bed_assignments
    SET ended_at = NOW()
    WHERE encounter_id = p_encounter_id AND ended_at IS NULL;

    UPDATE public.beds
    SET status = 'em_limpeza',
        current_encounter_id = NULL,
        updated_at = NOW()
    WHERE current_encounter_id = p_encounter_id;
  END IF;

  INSERT INTO public.encounter_events (encounter_id, from_status, to_status, actor_id, actor_name, details)
  VALUES (
    p_encounter_id,
    v_enc.status,
    v_target_status,
    auth.uid(),
    COALESCE(v_doc_name, 'Médico'),
    'Conduta médica definida: ' || upper(p_destination)
  );

  RETURN v_enc;
END;
$$;

-- ============================================================================
-- 7. RPC ATÔMICA: Alocar Paciente em Leito Livre (Item 2.6 e 3.7)
-- Impede que dois usuários ocupem o mesmo leito simultaneamente!
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_assign_bed(
  p_encounter_id UUID,
  p_bed_id UUID
)
RETURNS public.beds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_bed public.beds;
  v_enc public.encounters;
BEGIN
  v_role := public.get_my_role();
  IF v_role NOT IN ('enfermagem', 'medico') THEN
    RAISE EXCEPTION 'Permissão negada: somente enfermagem ou médicos podem alocar pacientes em leitos.';
  END IF;

  -- Bloquear linha do leito para evitar condição de corrida
  SELECT * INTO v_bed FROM public.beds WHERE id = p_bed_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leito não encontrado.';
  END IF;

  IF v_bed.status != 'livre' THEN
    RAISE EXCEPTION 'CONFLITO DE LEITO: O leito % não está livre (status atual: %). Outro usuário pode tê-lo ocupado.', v_bed.code, v_bed.status;
  END IF;

  SELECT * INTO v_enc FROM public.encounters WHERE id = p_encounter_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento não encontrado.';
  END IF;

  IF NOT public.fn_is_valid_status_transition(v_enc.status, 'em_observacao') THEN
    RAISE EXCEPTION 'Transição inválida: paciente na situação "%" não pode ocupar leito (deve estar Aguardando Leito).', v_enc.status;
  END IF;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.beds
  SET status = 'ocupado',
      current_encounter_id = p_encounter_id,
      updated_at = NOW()
  WHERE id = p_bed_id
  RETURNING * INTO v_bed;

  INSERT INTO public.bed_assignments (bed_id, encounter_id, assigned_by, started_at)
  VALUES (p_bed_id, p_encounter_id, auth.uid(), NOW());

  UPDATE public.encounters
  SET status = 'em_observacao',
      updated_at = NOW()
  WHERE id = p_encounter_id;

  INSERT INTO public.encounter_events (encounter_id, from_status, to_status, actor_id, details)
  VALUES (p_encounter_id, v_enc.status, 'em_observacao', auth.uid(), 'Paciente alocado no leito ' || v_bed.code || ' (' || v_bed.ward || ')');

  RETURN v_bed;
END;
$$;

-- ============================================================================
-- 8. RPC: Liberar Leito Após Limpeza (Enfermagem) (Item 2.6)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_release_bed_cleaning(p_bed_id UUID)
RETURNS public.beds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_bed public.beds;
BEGIN
  v_role := public.get_my_role();
  IF v_role != 'enfermagem' THEN
    RAISE EXCEPTION 'Permissão negada: somente a enfermagem pode concluir a limpeza e liberar o leito.';
  END IF;

  SELECT * INTO v_bed FROM public.beds WHERE id = p_bed_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leito não encontrado.';
  END IF;

  IF v_bed.status != 'em_limpeza' THEN
    RAISE EXCEPTION 'Apenas leitos com status "em_limpeza" podem ser liberados após higienização.';
  END IF;

  UPDATE public.beds
  SET status = 'livre',
      current_encounter_id = NULL,
      updated_at = NOW()
  WHERE id = p_bed_id
  RETURNING * INTO v_bed;

  RETURN v_bed;
END;
$$;

-- ============================================================================
-- 9. RPC: Cancelar Atendimento por Desistência / Evasão (Item 2.9c)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_cancel_encounter(
  p_encounter_id UUID,
  p_reason TEXT DEFAULT 'Desistência do paciente'
)
RETURNS public.encounters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_enc public.encounters;
BEGIN
  v_role := public.get_my_role();
  IF v_role NOT IN ('recepcao', 'enfermagem', 'medico') THEN
    RAISE EXCEPTION 'Permissão negada para cancelar atendimento.';
  END IF;

  SELECT * INTO v_enc FROM public.encounters WHERE id = p_encounter_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento não encontrado.';
  END IF;

  IF NOT public.fn_is_valid_status_transition(v_enc.status, 'cancelado') THEN
    RAISE EXCEPTION 'Transição inválida: não é permitido cancelar um atendimento na situação "%".', v_enc.status;
  END IF;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.encounters
  SET status = 'cancelado',
      finished_at = NOW(),
      updated_at = NOW()
  WHERE id = p_encounter_id
  RETURNING * INTO v_enc;

  INSERT INTO public.encounter_events (encounter_id, from_status, to_status, actor_id, details)
  VALUES (p_encounter_id, v_enc.status, 'cancelado', auth.uid(), 'Cancelado: ' || p_reason);

  RETURN v_enc;
END;
$$;
