// ============================================================================
// Camada Services: API Unificada (Supabase PostgreSQL / RPC / Auth + Engine Local)
// Os componentes de tela NUNCA chamam o Supabase diretamente (Item 3.1).
// ============================================================================

import {
  assertValidStatusTransition,
  Bed,
  classifyRisk,
  ConsciousnessLevel,
  Encounter,
  EncounterStatus,
  MedicalDestination,
  Medication,
  PanelCall,
  Patient,
  Prescription,
  RiskColor,
  sortMedicalQueue,
  TriageRecord,
  UserProfile,
  validatePrescription,
} from '../domain';
import {
  getLocalSessionUser,
  loadLocalDb,
  RealtimeTableName,
  requireRole,
  resetLocalDbToSeed,
  runAtomicTransaction,
  saveLocalDb,
  SEED_PROFILES,
  setLocalSessionUser,
  subscribeRealtimeChanges,
} from './localRealtimeEngine';
import { isSupabaseConfigured, supabase } from './supabaseClient';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// 1. AUTENTICAÇÃO E PERFIL (Item 2.1 e 3.5)
// ============================================================================

export async function signInWithEmail(email: string, password: string): Promise<UserProfile> {
  const normalizedEmail = email.trim().toLowerCase();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error || !data.user) {
      throw new Error(error?.message || 'Credenciais inválidas no Supabase Auth.');
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileErr || !profile) {
      throw new Error('Perfil profissional não encontrado no banco para este usuário.');
    }

    const userProfile: UserProfile = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      default_room: profile.default_room ?? undefined,
    };
    setLocalSessionUser(userProfile);
    return userProfile;
  }

  // Fallback Local Engine com validação real de e-mail e senha
  const account = SEED_PROFILES.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!account || account.password !== password) {
    throw new Error('E-mail ou senha inválidos. Verifique suas credenciais.');
  }

  const { password: _pwd, ...profile } = account;
  setLocalSessionUser(profile);
  return profile;
}

export async function signOutUser(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
  setLocalSessionUser(null);
}

export async function getCurrentSessionProfile(): Promise<UserProfile | null> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .single();
      if (profile) {
        const userProfile: UserProfile = {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role,
          default_room: profile.default_room ?? undefined,
        };
        setLocalSessionUser(userProfile);
        return userProfile;
      }
    }
    return null;
  }
  return getLocalSessionUser();
}

// ============================================================================
// 2. PACIENTES (Item 2.2)
// ============================================================================

export async function fetchPatients(searchQuery?: string): Promise<Patient[]> {
  if (isSupabaseConfigured && supabase) {
    let query = supabase
      .from('patients')
      .select('*, patient_allergies(allergen)')
      .order('created_at', { ascending: false });

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      // Se parece data YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
        query = query.eq('birth_date', q);
      } else {
        query = query.ilike('full_name', `%${q}%`);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      full_name: String(row.full_name),
      birth_date: String(row.birth_date),
      sex: row.sex as 'M' | 'F' | 'Outro',
      phone: String(row.phone),
      allergies: Array.isArray(row.patient_allergies)
        ? row.patient_allergies.map((a: { allergen: string }) => a.allergen)
        : [],
      created_at: String(row.created_at),
    }));
  }

  // RLS: Painel nunca lê pacientes
  requireRole(['recepcao', 'enfermagem', 'medico', 'gestao'], 'consultar cadastro de pacientes');
  const db = loadLocalDb();
  let list = [...db.patients].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(
      (p) => p.full_name.toLowerCase().includes(q) || p.birth_date.includes(q)
    );
  }
  return list;
}

export async function fetchPatientById(patientId: string): Promise<{
  patient: Patient;
  encounters: Encounter[];
}> {
  const user = requireRole(
    ['recepcao', 'enfermagem', 'medico', 'gestao'],
    'visualizar prontuário do paciente'
  );

  if (isSupabaseConfigured && supabase) {
    const { data: pData, error: pErr } = await supabase
      .from('patients')
      .select('*, patient_allergies(allergen)')
      .eq('id', patientId)
      .single();
    if (pErr || !pData) throw new Error(pErr?.message || 'Paciente não encontrado.');

    const patient: Patient = {
      id: pData.id,
      full_name: pData.full_name,
      birth_date: pData.birth_date,
      sex: pData.sex,
      phone: pData.phone,
      allergies: (pData.patient_allergies ?? []).map((a: { allergen: string }) => a.allergen),
      created_at: pData.created_at,
    };

    const allEncounters = await fetchEncounters();
    const encounters = allEncounters.filter((e) => e.patient_id === patientId);
    return { patient, encounters };
  }

  const db = loadLocalDb();
  const patient = db.patients.find((p) => p.id === patientId);
  if (!patient) throw new Error('Paciente não encontrado.');

  const allEncounters = await fetchEncounters();
  const encounters = allEncounters
    .filter((e) => e.patient_id === patientId)
    .map((enc) => {
      // RLS: A recepção não pode ler triagens, evoluções nem prescrições (Item 3.7)
      if (user.role === 'recepcao') {
        return {
          ...enc,
          clinical_notes: null,
          triages: [],
          prescriptions: [],
        };
      }
      return enc;
    });

  return { patient, encounters };
}

export async function createPatient(input: {
  full_name: string;
  birth_date: string;
  sex: 'M' | 'F' | 'Outro';
  phone: string;
  allergies: string[];
}): Promise<Patient> {
  requireRole(['recepcao', 'enfermagem'], 'cadastrar novos pacientes');

  const cleanedAllergies = Array.from(
    new Set(
      input.allergies
        .map((a) => a.trim())
        .filter((a) => a.length >= 2)
    )
  );

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('patients')
      .insert({
        full_name: input.full_name.trim(),
        birth_date: input.birth_date,
        sex: input.sex,
        phone: input.phone.trim(),
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(error?.message || 'Erro ao cadastrar paciente.');

    if (cleanedAllergies.length > 0) {
      await supabase.from('patient_allergies').insert(
        cleanedAllergies.map((allergen) => ({
          patient_id: data.id,
          allergen,
        }))
      );
    }

    return {
      id: data.id,
      full_name: data.full_name,
      birth_date: data.birth_date,
      sex: data.sex,
      phone: data.phone,
      allergies: cleanedAllergies,
      created_at: data.created_at,
    };
  }

  return runAtomicTransaction('patients', (db) => {
    const newPatient: Patient = {
      id: uuid(),
      full_name: input.full_name.trim(),
      birth_date: input.birth_date,
      sex: input.sex,
      phone: input.phone.trim(),
      allergies: cleanedAllergies,
      created_at: new Date().toISOString(),
    };
    db.patients.unshift(newPatient);
    saveLocalDb(db, 'patients');
    return newPatient;
  });
}

// ============================================================================
// 3. ATENDIMENTOS E FILA EM TEMPO REAL (Itens 2.2, 2.3, 2.4, 2.5, 3.7)
// ============================================================================

export async function fetchEncounters(): Promise<Encounter[]> {
  const user = requireRole(
    ['recepcao', 'enfermagem', 'medico', 'gestao'],
    'listar atendimentos do Pronto-Socorro'
  );

  if (isSupabaseConfigured && supabase) {
    const { data: encRows, error } = await supabase
      .from('encounters')
      .select('*, patients(*, patient_allergies(allergen)), encounter_events(*)')
      .order('arrived_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Somente enfermagem, médico e gestão consultam triagens e prescrições (RLS Item 3.7)
    let triagesByEnc = new Map<string, TriageRecord[]>();
    let prescriptionsByEnc = new Map<string, Prescription[]>();

    if (user.role !== 'recepcao') {
      const [{ data: tRows }, { data: pRows }] = await Promise.all([
        supabase.from('triages').select('*').order('created_at', { ascending: false }),
        supabase.from('prescriptions').select('*').order('created_at', { ascending: false }),
      ]);

      (tRows ?? []).forEach((t: TriageRecord) => {
        const arr = triagesByEnc.get(t.encounter_id) ?? [];
        arr.push({ ...t, temperature: Number(t.temperature) });
        triagesByEnc.set(t.encounter_id, arr);
      });

      (pRows ?? []).forEach((p: Prescription) => {
        const arr = prescriptionsByEnc.get(p.encounter_id) ?? [];
        arr.push({ ...p, dose_mg: Number(p.dose_mg) });
        prescriptionsByEnc.set(p.encounter_id, arr);
      });
    }

    return (encRows ?? []).map((row: Record<string, any>) => {
      const rawPatient = row.patients;
      const patient: Patient | undefined = rawPatient
        ? {
            id: rawPatient.id,
            full_name: rawPatient.full_name,
            birth_date: rawPatient.birth_date,
            sex: rawPatient.sex,
            phone: rawPatient.phone,
            allergies: (rawPatient.patient_allergies ?? []).map(
              (a: { allergen: string }) => a.allergen
            ),
            created_at: rawPatient.created_at,
          }
        : undefined;

      return {
        id: row.id,
        patient_id: row.patient_id,
        patient,
        ticket_number: row.ticket_number,
        status: row.status,
        current_risk: row.current_risk,
        chief_complaint: user.role === 'recepcao' ? null : row.chief_complaint,
        clinical_notes: user.role === 'recepcao' ? null : row.clinical_notes,
        destination: row.destination,
        consulting_room: row.consulting_room,
        assigned_doctor_id: row.assigned_doctor_id,
        arrived_at: row.arrived_at,
        triaged_at: row.triaged_at,
        called_at: row.called_at,
        started_at: row.started_at,
        finished_at: row.finished_at,
        updated_at: row.updated_at,
        triages: user.role === 'recepcao' ? [] : triagesByEnc.get(row.id) ?? [],
        prescriptions: user.role === 'recepcao' ? [] : prescriptionsByEnc.get(row.id) ?? [],
        events: row.encounter_events ?? [],
      };
    });
  }

  const db = loadLocalDb();
  const patientMap = new Map(db.patients.map((p) => [p.id, p]));

  return db.encounters.map((enc) => {
    const patient = patientMap.get(enc.patient_id);
    const triages = db.triages
      .filter((t) => t.encounter_id === enc.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const prescriptions = db.prescriptions
      .filter((pr) => pr.encounter_id === enc.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const events = db.events
      .filter((ev) => ev.encounter_id === enc.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // RLS estrita (Item 3.7): A recepção NÃO pode ler triagens, evoluções nem prescrições!
    if (user.role === 'recepcao') {
      return {
        ...enc,
        patient,
        clinical_notes: null,
        triages: [],
        prescriptions: [],
        events,
      };
    }

    return {
      ...enc,
      patient,
      triages,
      prescriptions,
      events,
    };
  });
}

export async function fetchEncounterById(encounterId: string): Promise<Encounter> {
  const list = await fetchEncounters();
  const found = list.find((e) => e.id === encounterId);
  if (!found) {
    throw new Error('Atendimento não encontrado.');
  }
  return found;
}

/**
 * RPC: Abrir Atendimento na Recepção (Item 2.2)
 * - Gera senha sequencial do dia (ex: A007)
 * - Impede que um mesmo paciente tenha dois atendimentos ativos ao mesmo tempo!
 */
export async function rpcOpenEncounter(patientId: string): Promise<Encounter> {
  const user = requireRole(['recepcao', 'enfermagem'], 'abrir novos atendimentos');

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('rpc_open_encounter', {
      p_patient_id: patientId,
    });
    if (error) throw new Error(error.message);
    return data as Encounter;
  }

  return runAtomicTransaction('open_encounter', (db) => {
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) throw new Error('Paciente não encontrado.');

    const activeStatuses: EncounterStatus[] = [
      'aguardando_triagem',
      'aguardando_medico',
      'em_atendimento',
      'aguardando_leito',
      'em_observacao',
    ];

    const existingActive = db.encounters.find(
      (e) => e.patient_id === patientId && activeStatuses.includes(e.status)
    );
    if (existingActive) {
      throw new Error(
        `CONFLITO BLOQUEADO: O paciente ${patient.full_name} já possui um atendimento ativo (${existingActive.ticket_number} — ${existingActive.status}).`
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCount = db.encounters.filter((e) => e.arrived_at.slice(0, 10) === todayStr).length;
    const nextNumber = Math.max(db.encounters.length + 1, todayCount + 1);
    const ticket = `A${String(nextNumber).padStart(3, '0')}`;
    const nowIso = new Date().toISOString();

    const newEnc: Encounter = {
      id: uuid(),
      patient_id: patientId,
      patient,
      ticket_number: ticket,
      status: 'aguardando_triagem',
      current_risk: null,
      chief_complaint: null,
      clinical_notes: null,
      destination: null,
      consulting_room: null,
      assigned_doctor_id: null,
      arrived_at: nowIso,
      triaged_at: null,
      called_at: null,
      started_at: null,
      finished_at: null,
      updated_at: nowIso,
    };

    db.encounters.unshift(newEnc);
    db.events.push({
      id: uuid(),
      encounter_id: newEnc.id,
      from_status: null,
      to_status: 'aguardando_triagem',
      actor_name: user.full_name,
      details: `Atendimento aberto na recepção com senha ${ticket}`,
      created_at: nowIso,
    });

    saveLocalDb(db, 'encounters');
    return newEnc;
  });
}

/**
 * RPC: Registrar Triagem ou Reclassificação (Item 2.3 e 2.9)
 */
export async function rpcRecordTriage(params: {
  encounter_id: string;
  systolic_bp: number;
  diastolic_bp: number;
  heart_rate: number;
  temperature: number;
  oxygen_saturation: number;
  pain_level: number;
  consciousness: ConsciousnessLevel;
  chief_complaint: string;
  final_color: RiskColor;
  justification?: string;
}): Promise<Encounter> {
  const user = requireRole(['enfermagem'], 'registrar triagem ou reclassificação de risco');

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('rpc_record_triage', {
      p_encounter_id: params.encounter_id,
      p_systolic_bp: params.systolic_bp,
      p_diastolic_bp: params.diastolic_bp,
      p_heart_rate: params.heart_rate,
      p_temperature: params.temperature,
      p_oxygen_saturation: params.oxygen_saturation,
      p_pain_level: params.pain_level,
      p_consciousness: params.consciousness,
      p_chief_complaint: params.chief_complaint,
      p_final_color: params.final_color,
      p_justification: params.justification || null,
    });
    if (error) throw new Error(error.message);
    return data as Encounter;
  }

  return runAtomicTransaction('record_triage', (db) => {
    const enc = db.encounters.find((e) => e.id === params.encounter_id);
    if (!enc) throw new Error('Atendimento não encontrado.');

    assertValidStatusTransition(enc.status, 'aguardando_medico');
    const isReclassification = enc.status === 'aguardando_medico';

    const { suggestedColor } = classifyRisk({
      systolic_bp: params.systolic_bp,
      diastolic_bp: params.diastolic_bp,
      heart_rate: params.heart_rate,
      temperature: params.temperature,
      oxygen_saturation: params.oxygen_saturation,
      pain_level: params.pain_level,
      consciousness: params.consciousness,
    });

    if (
      suggestedColor !== params.final_color &&
      (!params.justification || params.justification.trim().length < 5)
    ) {
      throw new Error(
        'Justificativa clínica é obrigatória (mínimo 5 caracteres) ao alterar a cor sugerida pelo protocolo.'
      );
    }

    const nowIso = new Date().toISOString();
    const triageRecord: TriageRecord = {
      id: uuid(),
      encounter_id: enc.id,
      nurse_id: user.id,
      nurse_name: user.full_name,
      systolic_bp: params.systolic_bp,
      diastolic_bp: params.diastolic_bp,
      heart_rate: params.heart_rate,
      temperature: params.temperature,
      oxygen_saturation: params.oxygen_saturation,
      pain_level: params.pain_level,
      consciousness: params.consciousness,
      chief_complaint: params.chief_complaint.trim(),
      suggested_color: suggestedColor,
      final_color: params.final_color,
      justification: params.justification?.trim() || null,
      is_reclassification: isReclassification,
      created_at: nowIso,
    };

    db.triages.unshift(triageRecord);

    const prevStatus = enc.status;
    enc.status = 'aguardando_medico';
    enc.current_risk = params.final_color;
    enc.chief_complaint = params.chief_complaint.trim();
    if (!enc.triaged_at) {
      enc.triaged_at = nowIso;
    }
    enc.updated_at = nowIso;

    db.events.push({
      id: uuid(),
      encounter_id: enc.id,
      from_status: prevStatus,
      to_status: 'aguardando_medico',
      actor_name: user.full_name,
      details: isReclassification
        ? `Reclassificação de risco para ${params.final_color.toUpperCase()}${
            params.justification ? ` (Justificativa: ${params.justification})` : ''
          }`
        : `Triagem realizada: classificação ${params.final_color.toUpperCase()}`,
      created_at: nowIso,
    });

    saveLocalDb(db, 'encounters');
    return enc;
  });
}

/**
 * RPC ATÔMICA: Chamar Próximo Paciente da Fila (Item 2.5, 2.9b e 3.7)
 * Dois médicos que clicarem ao mesmo tempo recebem pacientes diferentes!
 */
export async function rpcCallNextPatient(consultingRoom: string): Promise<Encounter> {
  const user = requireRole(['medico'], 'chamar o próximo paciente da fila');

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('rpc_call_next_patient', {
      p_consulting_room: consultingRoom,
    });
    if (error) throw new Error(error.message);
    return data as Encounter;
  }

  return runAtomicTransaction('call_next_patient', (db) => {
    const patientMap = new Map(db.patients.map((p) => [p.id, p]));
    const waitingCandidates = db.encounters
      .filter((e) => e.status === 'aguardando_medico')
      .map((e) => ({ ...e, patient: patientMap.get(e.patient_id) }));

    if (waitingCandidates.length === 0) {
      throw new Error('Não há pacientes aguardando atendimento médico na fila neste momento.');
    }

    const sortedQueue = sortMedicalQueue(waitingCandidates, new Date());
    const nextTarget = sortedQueue[0];

    const enc = db.encounters.find((e) => e.id === nextTarget.id);
    if (!enc || enc.status !== 'aguardando_medico') {
      throw new Error('Conflito de concorrência resolvido: tente chamar o próximo novamente.');
    }

    assertValidStatusTransition(enc.status, 'em_atendimento');

    const nowIso = new Date().toISOString();
    enc.status = 'em_atendimento';
    enc.consulting_room = consultingRoom.trim() || user.default_room || 'Consultório 01';
    enc.assigned_doctor_id = user.id;
    enc.called_at = nowIso;
    enc.started_at = nowIso;
    enc.updated_at = nowIso;

    // Registrar chamada no painel da sala de espera (NUNCA exibe o nome do paciente - Item 2.7)
    const newCall: PanelCall = {
      id: uuid(),
      encounter_id: enc.id,
      ticket_number: enc.ticket_number,
      risk_color: enc.current_risk ?? 'azul',
      consulting_room: enc.consulting_room,
      called_at: nowIso,
    };
    db.calls.unshift(newCall);

    db.events.push({
      id: uuid(),
      encounter_id: enc.id,
      from_status: 'aguardando_medico',
      to_status: 'em_atendimento',
      actor_name: user.full_name,
      details: `Paciente chamado para ${enc.consulting_room} (${user.full_name})`,
      created_at: nowIso,
    });

    saveLocalDb(db, 'encounters');
    saveLocalDb(db, 'calls');
    return {
      ...enc,
      patient: patientMap.get(enc.patient_id),
    };
  });
}

/**
 * RPC / INSERT: Registrar Prescrição Médica com validação no banco (Item 2.5 e 3.7)
 */
export async function rpcCreatePrescription(params: {
  encounter_id: string;
  medication_id: string;
  dose_mg: number;
  route: string;
  frequency: string;
  notes?: string;
}): Promise<Prescription> {
  const user = requireRole(['medico'], 'registrar prescrição médica');

  if (isSupabaseConfigured && supabase) {
    // Buscar medicamento e paciente para validar e inserir (trigger no banco também valida!)
    const { data: med } = await supabase
      .from('medications')
      .select('*')
      .eq('id', params.medication_id)
      .single();
    if (!med) throw new Error('Medicamento não encontrado no catálogo.');

    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        encounter_id: params.encounter_id,
        medication_id: params.medication_id,
        medication_name: med.name,
        doctor_id: user.id,
        doctor_name: user.full_name,
        dose_mg: params.dose_mg,
        route: params.route,
        frequency: params.frequency,
        notes: params.notes || null,
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(error?.message || 'Prescrição bloqueada pelo banco.');
    return { ...data, dose_mg: Number(data.dose_mg) };
  }

  return runAtomicTransaction('create_prescription', (db) => {
    const enc = db.encounters.find((e) => e.id === params.encounter_id);
    if (!enc) throw new Error('Atendimento não encontrado.');

    const patient = db.patients.find((p) => p.id === enc.patient_id);
    if (!patient) throw new Error('Paciente não encontrado.');

    const medication = db.medications.find((m) => m.id === params.medication_id);
    if (!medication) throw new Error('Medicamento não encontrado no catálogo.');

    // Validação rigorosa de alergia e dose máxima no motor de persistência (Item 3.7)
    const validation = validatePrescription({
      medication,
      doseMg: params.dose_mg,
      patientAllergies: patient.allergies,
    });

    if (!validation.valid) {
      throw new Error(validation.errorMessage || 'Prescrição bloqueada pelas regras de segurança clínica.');
    }

    const nowIso = new Date().toISOString();
    const prescription: Prescription = {
      id: uuid(),
      encounter_id: enc.id,
      medication_id: medication.id,
      medication_name: medication.name,
      doctor_id: user.id,
      doctor_name: user.full_name,
      dose_mg: params.dose_mg,
      route: params.route,
      frequency: params.frequency,
      notes: params.notes?.trim() || undefined,
      created_at: nowIso,
    };

    db.prescriptions.unshift(prescription);
    saveLocalDb(db, 'prescriptions');
    return prescription;
  });
}

/**
 * RPC: Salvar Evolução Clínica (rascunho durante o atendimento)
 */
export async function saveClinicalNotesDraft(
  encounterId: string,
  clinicalNotes: string
): Promise<void> {
  requireRole(['medico'], 'registrar evolução clínica');

  if (isSupabaseConfigured && supabase) {
    // Em Supabase real, a evolução final é salva via rpc_finish_medical_consultation
    return;
  }

  await runAtomicTransaction('save_notes', (db) => {
    const enc = db.encounters.find((e) => e.id === encounterId);
    if (!enc) throw new Error('Atendimento não encontrado.');
    enc.clinical_notes = clinicalNotes;
    enc.updated_at = new Date().toISOString();
    saveLocalDb(db, 'encounters');
  });
}

/**
 * RPC: Finalizar Atendimento Médico / Definir Destino (Alta, Observação, Internação, Transferência)
 * Se o paciente estava em um leito e recebe Alta ou Transferência, o leito vai para "em_limpeza"!
 */
export async function rpcFinishMedicalConsultation(params: {
  encounter_id: string;
  clinical_notes: string;
  destination: MedicalDestination;
}): Promise<Encounter> {
  const user = requireRole(['medico'], 'definir o destino do paciente');

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('rpc_finish_medical_consultation', {
      p_encounter_id: params.encounter_id,
      p_clinical_notes: params.clinical_notes,
      p_destination: params.destination,
    });
    if (error) throw new Error(error.message);
    return data as Encounter;
  }

  return runAtomicTransaction('finish_consultation', (db) => {
    const enc = db.encounters.find((e) => e.id === params.encounter_id);
    if (!enc) throw new Error('Atendimento não encontrado.');

    const targetStatus: EncounterStatus =
      params.destination === 'alta'
        ? 'alta'
        : params.destination === 'transferencia'
        ? 'transferido'
        : 'aguardando_leito'; // 'observacao' ou 'internacao' encaminham para leito

    assertValidStatusTransition(enc.status, targetStatus);

    const prevStatus = enc.status;
    const nowIso = new Date().toISOString();

    enc.status = targetStatus;
    enc.clinical_notes = params.clinical_notes.trim();
    enc.destination = params.destination;
    if (targetStatus === 'alta' || targetStatus === 'transferido') {
      enc.finished_at = nowIso;
    }
    enc.updated_at = nowIso;

    // Regra obrigatória do Item 2.6:
    // "Quando o paciente recebe alta ou é transferido, o leito passa automaticamente para em limpeza"
    if (targetStatus === 'alta' || targetStatus === 'transferido') {
      const occupiedBed = db.beds.find((b) => b.current_encounter_id === enc.id);
      if (occupiedBed) {
        occupiedBed.status = 'em_limpeza';
        occupiedBed.current_encounter_id = null;
        occupiedBed.updated_at = nowIso;
      }
    }

    db.events.push({
      id: uuid(),
      encounter_id: enc.id,
      from_status: prevStatus,
      to_status: targetStatus,
      actor_name: user.full_name,
      details: `Desfecho médico definido: ${params.destination.toUpperCase()}`,
      created_at: nowIso,
    });

    saveLocalDb(db, 'encounters');
    saveLocalDb(db, 'beds');
    return enc;
  });
}

/**
 * RPC: Cancelar Atendimento por Desistência (Item 2.9c)
 */
export async function rpcCancelEncounter(
  encounterId: string,
  reason = 'Desistência do paciente na espera'
): Promise<Encounter> {
  const user = requireRole(['recepcao', 'enfermagem', 'medico'], 'cancelar atendimento');

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('rpc_cancel_encounter', {
      p_encounter_id: encounterId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return data as Encounter;
  }

  return runAtomicTransaction('cancel_encounter', (db) => {
    const enc = db.encounters.find((e) => e.id === encounterId);
    if (!enc) throw new Error('Atendimento não encontrado.');

    assertValidStatusTransition(enc.status, 'cancelado');

    const prevStatus = enc.status;
    const nowIso = new Date().toISOString();
    enc.status = 'cancelado';
    enc.finished_at = nowIso;
    enc.updated_at = nowIso;

    db.events.push({
      id: uuid(),
      encounter_id: enc.id,
      from_status: prevStatus,
      to_status: 'cancelado',
      actor_name: user.full_name,
      details: `Atendimento cancelado: ${reason}`,
      created_at: nowIso,
    });

    saveLocalDb(db, 'encounters');
    return enc;
  });
}

// ============================================================================
// 4. MAPA DE LEITOS E ALOCAÇÃO ATÔMICA (Item 2.6 e 3.7)
// ============================================================================

export async function fetchBeds(): Promise<Bed[]> {
  requireRole(['enfermagem', 'medico', 'gestao'], 'visualizar o mapa de leitos');

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('beds')
      .select('*')
      .order('code', { ascending: true });
    if (error) throw new Error(error.message);

    const encounters = await fetchEncounters();
    const encMap = new Map(encounters.map((e) => [e.id, e]));

    return (data ?? []).map((b: Bed) => ({
      ...b,
      current_encounter: b.current_encounter_id ? encMap.get(b.current_encounter_id) ?? null : null,
    }));
  }

  const db = loadLocalDb();
  const patientMap = new Map(db.patients.map((p) => [p.id, p]));
  const encMap = new Map(
    db.encounters.map((e) => [e.id, { ...e, patient: patientMap.get(e.patient_id) }])
  );

  return [...db.beds]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((bed) => ({
      ...bed,
      current_encounter: bed.current_encounter_id
        ? encMap.get(bed.current_encounter_id) ?? null
        : null,
    }));
}

/**
 * RPC ATÔMICA: Ocupar Leito Livre (Item 2.6 e 3.7)
 * Se dois usuários tentarem ocupar o mesmo leito ao mesmo tempo, apenas um consegue!
 */
export async function rpcAssignBed(encounterId: string, bedId: string): Promise<Bed> {
  const user = requireRole(['enfermagem', 'medico'], 'alocar paciente em leito');

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('rpc_assign_bed', {
      p_encounter_id: encounterId,
      p_bed_id: bedId,
    });
    if (error) throw new Error(error.message);
    return data as Bed;
  }

  return runAtomicTransaction(`assign_bed_${bedId}`, (db) => {
    const bed = db.beds.find((b) => b.id === bedId);
    if (!bed) throw new Error('Leito não encontrado.');

    if (bed.status !== 'livre' || bed.current_encounter_id !== null) {
      throw new Error(
        `CONFLITO DE LEITO BLOQUEADO: O leito ${bed.code} não está livre (status atual: ${bed.status.toUpperCase()}). Outro profissional já ocupou ou bloqueou este leito.`
      );
    }

    const alreadyInOtherBed = db.beds.find((b) => b.current_encounter_id === encounterId);
    if (alreadyInOtherBed) {
      throw new Error(
        `Este paciente já está alocado no leito ${alreadyInOtherBed.code}.`
      );
    }

    const enc = db.encounters.find((e) => e.id === encounterId);
    if (!enc) throw new Error('Atendimento não encontrado.');

    assertValidStatusTransition(enc.status, 'em_observacao');

    const nowIso = new Date().toISOString();
    const prevStatus = enc.status;

    bed.status = 'ocupado';
    bed.current_encounter_id = enc.id;
    bed.updated_at = nowIso;

    enc.status = 'em_observacao';
    enc.updated_at = nowIso;

    db.events.push({
      id: uuid(),
      encounter_id: enc.id,
      from_status: prevStatus,
      to_status: 'em_observacao',
      actor_name: user.full_name,
      details: `Alocado no leito ${bed.code} (${bed.ward}) por ${user.full_name}`,
      created_at: nowIso,
    });

    saveLocalDb(db, 'beds');
    saveLocalDb(db, 'encounters');
    return bed;
  });
}

/**
 * RPC: Liberar Leito Após Limpeza (Enfermagem - Item 2.6)
 */
export async function rpcReleaseBedCleaning(bedId: string): Promise<Bed> {
  requireRole(['enfermagem'], 'concluir limpeza e liberar leito');

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('rpc_release_bed_cleaning', {
      p_bed_id: bedId,
    });
    if (error) throw new Error(error.message);
    return data as Bed;
  }

  return runAtomicTransaction(`clean_bed_${bedId}`, (db) => {
    const bed = db.beds.find((b) => b.id === bedId);
    if (!bed) throw new Error('Leito não encontrado.');

    if (bed.status !== 'em_limpeza') {
      throw new Error(`O leito ${bed.code} não está em limpeza.`);
    }

    bed.status = 'livre';
    bed.current_encounter_id = null;
    bed.updated_at = new Date().toISOString();

    saveLocalDb(db, 'beds');
    return bed;
  });
}

// ============================================================================
// 5. CATÁLOGO DE MEDICAMENTOS & AUDITORIA DE SEGURANÇA RLS (Item 2.5 e 5.9)
// ============================================================================

export async function fetchMedications(): Promise<Medication[]> {
  requireRole(['enfermagem', 'medico', 'gestao'], 'consultar catálogo de medicamentos');

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('medications').select('*').order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map((m: Medication) => ({
      ...m,
      max_dose_mg: Number(m.max_dose_mg),
    }));
  }

  const db = loadLocalDb();
  return db.medications;
}

/**
 * Cenário de Validação Item 5.9:
 * "Logado como recepção, uma consulta direta à tabela de prescrições pela API
 * retorna vazio ou erro de permissão."
 */
export async function queryDirectPrescriptionsTable(): Promise<{
  allowed: boolean;
  rows: Prescription[];
  securityMessage: string;
}> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('prescriptions').select('*');
    if (error) {
      return {
        allowed: false,
        rows: [],
        securityMessage: `RLS Supabase bloqueou a consulta: ${error.message}`,
      };
    }
    const rows = (data ?? []) as Prescription[];
    const user = getLocalSessionUser();
    if (user?.role === 'recepcao' && rows.length === 0) {
      return {
        allowed: false,
        rows: [],
        securityMessage:
          'Policy RLS "prescriptions_select_clinical" ativa: 0 registros retornados para o perfil Recepção.',
      };
    }
    return {
      allowed: true,
      rows,
      securityMessage: `Consulta autorizada pelo RLS (${rows.length} prescrições).`,
    };
  }

  try {
    requireRole(['enfermagem', 'medico', 'gestao'], 'ler a tabela de prescrições médicas');
    const db = loadLocalDb();
    return {
      allowed: true,
      rows: db.prescriptions,
      securityMessage: `Consulta autorizada para perfil clínico (${db.prescriptions.length} prescrições).`,
    };
  } catch (err) {
    return {
      allowed: false,
      rows: [],
      securityMessage: err instanceof Error ? err.message : 'Permissão negada pelo RLS.',
    };
  }
}

// ============================================================================
// 6. PAINEL DE CHAMADAS DA SALA DE ESPERA (Item 2.7 - Sem nomes de pacientes!)
// ============================================================================

export interface WaitingRoomPanelData {
  currentCall: PanelCall | null;
  recentCalls: PanelCall[];
  averageWaitByColor: Record<RiskColor, number>;
  waitingCountByColor: Record<RiskColor, number>;
}

export async function fetchWaitingRoomPanelData(): Promise<WaitingRoomPanelData> {
  let calls: PanelCall[] = [];
  let waitingEncounters: Array<{ current_risk: RiskColor | null; arrived_at: string }> = [];

  if (isSupabaseConfigured && supabase) {
    const { data: callRows } = await supabase
      .from('calls')
      .select('id, encounter_id, ticket_number, risk_color, consulting_room, called_at')
      .order('called_at', { ascending: false })
      .limit(6);

    calls = (callRows ?? []) as PanelCall[];
  } else {
    const db = loadLocalDb();
    calls = [...db.calls]
      .sort((a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime())
      .slice(0, 6);
    waitingEncounters = db.encounters
      .filter((e) => e.status === 'aguardando_medico')
      .map((e) => ({ current_risk: e.current_risk, arrived_at: e.arrived_at }));
  }

  const colors: RiskColor[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul'];
  const averageWaitByColor: Record<RiskColor, number> = {
    vermelho: 0,
    laranja: 0,
    amarelo: 0,
    verde: 0,
    azul: 0,
  };
  const waitingCountByColor: Record<RiskColor, number> = {
    vermelho: 0,
    laranja: 0,
    amarelo: 0,
    verde: 0,
    azul: 0,
  };

  const nowMs = Date.now();
  for (const color of colors) {
    const inColor = waitingEncounters.filter((e) => e.current_risk === color);
    waitingCountByColor[color] = inColor.length;
    if (inColor.length > 0) {
      const totalMin = inColor.reduce((acc, item) => {
        const diffMin = Math.max(0, Math.floor((nowMs - new Date(item.arrived_at).getTime()) / 60000));
        return acc + diffMin;
      }, 0);
      averageWaitByColor[color] = Math.round(totalMin / inColor.length);
    }
  }

  return {
    currentCall: calls[0] ?? null,
    recentCalls: calls.slice(1, 6),
    averageWaitByColor,
    waitingCountByColor,
  };
}

// ============================================================================
// 7. DIFERENCIAL CRIATIVO (Item 4): Gerador de Pacientes Fictícios para Plantão Lotado
// ============================================================================

export async function simulateBusyShiftBatch(): Promise<{ createdCount: number }> {
  const user = requireRole(
    ['recepcao', 'enfermagem', 'medico', 'gestao'],
    'simular plantão movimentado'
  );

  const sampleCases = [
    {
      full_name: 'Helena Aparecida Gomes',
      birth_date: '1949-04-12', // 77 anos
      sex: 'F' as const,
      phone: '(11) 98811-2233',
      allergies: ['Dipirona'],
      vitals: {
        systolic_bp: 72,
        diastolic_bp: 48,
        heart_rate: 148,
        temperature: 36.2,
        oxygen_saturation: 86,
        pain_level: 8,
        consciousness: 'confuso' as ConsciousnessLevel,
        chief_complaint: 'Rebaixamento súbito, cianose de extremidades e dispneia intensa.',
      },
    },
    {
      full_name: 'Carlos Eduardo Ribeiro',
      birth_date: '1988-09-21',
      sex: 'M' as const,
      phone: '(11) 97722-3344',
      allergies: ['Penicilina'],
      vitals: {
        systolic_bp: 186,
        diastolic_bp: 112,
        heart_rate: 96,
        temperature: 38.9,
        oxygen_saturation: 96,
        pain_level: 7,
        consciousness: 'alerta' as ConsciousnessLevel,
        chief_complaint: 'Cefaleia occipital intensa associada a pico hipertensivo e febre.',
      },
    },
    {
      full_name: 'Sofia Mendes Albuquerque',
      birth_date: '2019-02-15', // 7 anos
      sex: 'F' as const,
      phone: '(11) 96633-4455',
      allergies: [],
      vitals: {
        systolic_bp: 105,
        diastolic_bp: 68,
        heart_rate: 110,
        temperature: 38.1,
        oxygen_saturation: 98,
        pain_level: 2,
        consciousness: 'alerta' as ConsciousnessLevel,
        chief_complaint: 'Coriza, tosse seca e febre baixa iniciada hoje.',
      },
    },
  ];

  return runAtomicTransaction('simulate_shift', (db) => {
    let createdCount = 0;
    const now = Date.now();

    for (let i = 0; i < sampleCases.length; i++) {
      const item = sampleCases[i];
      const arrivedAt = new Date(now - (15 - i * 4) * 60000).toISOString();
      const triagedAt = new Date(now - (12 - i * 4) * 60000).toISOString();

      const patient: Patient = {
        id: uuid(),
        full_name: `${item.full_name}`,
        birth_date: item.birth_date,
        sex: item.sex,
        phone: item.phone,
        allergies: item.allergies,
        created_at: arrivedAt,
      };
      db.patients.unshift(patient);

      const nextNum = db.encounters.length + 1;
      const ticket = `A${String(nextNum).padStart(3, '0')}`;
      const { suggestedColor } = classifyRisk(item.vitals);

      const enc: Encounter = {
        id: uuid(),
        patient_id: patient.id,
        patient,
        ticket_number: ticket,
        status: 'aguardando_medico',
        current_risk: suggestedColor,
        chief_complaint: item.vitals.chief_complaint,
        clinical_notes: null,
        destination: null,
        consulting_room: null,
        assigned_doctor_id: null,
        arrived_at: arrivedAt,
        triaged_at: triagedAt,
        called_at: null,
        started_at: null,
        finished_at: null,
        updated_at: triagedAt,
      };
      db.encounters.unshift(enc);

      db.triages.unshift({
        id: uuid(),
        encounter_id: enc.id,
        nurse_id: user.id,
        nurse_name: 'Enf. Rafael Costa (Simulação)',
        ...item.vitals,
        suggested_color: suggestedColor,
        final_color: suggestedColor,
        justification: null,
        is_reclassification: false,
        created_at: triagedAt,
      });

      db.events.push({
        id: uuid(),
        encounter_id: enc.id,
        from_status: 'aguardando_triagem',
        to_status: 'aguardando_medico',
        actor_name: user.full_name,
        details: `Paciente fictício gerado e triado como ${suggestedColor.toUpperCase()} (${ticket})`,
        created_at: triagedAt,
      });

      createdCount++;
    }

    saveLocalDb(db, 'encounters');
    return { createdCount };
  });
}

export { resetLocalDbToSeed, subscribeRealtimeChanges };
export type { RealtimeTableName };
