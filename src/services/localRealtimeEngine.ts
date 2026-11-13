// ============================================================================
// Camada Services: Motor Persistente & Realtime Multi-Janelas (Fallback/Sync Local)
// Executa exatamente as mesmas regras de RLS, RPCs atômicas com Lock de Concorrência,
// validações clínicas e eventos Realtime entre abas via BroadcastChannel + Storage.
// Quando VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão configurados no .env,
// o sistema utiliza o PostgreSQL/Auth/Realtime remoto do Supabase.
// ============================================================================

import {
  assertValidStatusTransition,
  Bed,
  classifyRisk,
  ConsciousnessLevel,
  Encounter,
  EncounterEvent,
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

const DB_STORAGE_KEY = 'plantaops_db_v1';
const SESSION_STORAGE_KEY = 'plantaops_active_session_v1';
const CHANNEL_NAME = 'plantaops_realtime_channel';

export interface DatabaseState {
  profiles: UserProfile[];
  patients: Patient[];
  encounters: Encounter[];
  triages: TriageRecord[];
  events: EncounterEvent[];
  medications: Medication[];
  prescriptions: Prescription[];
  beds: Bed[];
  calls: PanelCall[];
}

export type RealtimeTableName =
  | 'encounters'
  | 'triages'
  | 'beds'
  | 'calls'
  | 'patients'
  | 'prescriptions'
  | 'encounter_events';

type RealtimeListener = (payload: { table: RealtimeTableName; timestamp: number }) => void;

const listeners = new Set<RealtimeListener>();
let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  broadcastChannel.onmessage = (event) => {
    if (event.data && event.data.table) {
      listeners.forEach((cb) => cb(event.data));
    }
  };
  window.addEventListener('storage', (e) => {
    if (e.key === DB_STORAGE_KEY) {
      listeners.forEach((cb) => cb({ table: 'encounters', timestamp: Date.now() }));
    }
  });
}

export function subscribeRealtimeChanges(cb: RealtimeListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function notifyRealtimeChange(table: RealtimeTableName): void {
  const payload = { table, timestamp: Date.now() };
  listeners.forEach((cb) => cb(payload));
  broadcastChannel?.postMessage(payload);
}

export const SEED_PROFILES: (UserProfile & { password: string })[] = [
  {
    id: '00000000-0000-0000-0000-000000000101',
    email: 'recepcao@plantaops.gov.br',
    full_name: 'Carla Mendes (Recepção)',
    role: 'recepcao',
    default_room: 'Guichê 01',
    password: '123456',
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    email: 'enfermagem@plantaops.gov.br',
    full_name: 'Enf. Rafael Costa (COREN 91234)',
    role: 'enfermagem',
    default_room: 'Sala de Triagem 01',
    password: '123456',
  },
  {
    id: '00000000-0000-0000-0000-000000000103',
    email: 'medico1@plantaops.gov.br',
    full_name: 'Dra. Helena Ribeiro (CRM 45892)',
    role: 'medico',
    default_room: 'Consultório 01',
    password: '123456',
  },
  {
    id: '00000000-0000-0000-0000-000000000104',
    email: 'medico2@plantaops.gov.br',
    full_name: 'Dr. Marcos Oliveira (CRM 38110)',
    role: 'medico',
    default_room: 'Consultório 02',
    password: '123456',
  },
  {
    id: '00000000-0000-0000-0000-000000000105',
    email: 'gestao@plantaops.gov.br',
    full_name: 'Dr. Eduardo Santos (Diretor Clínico)',
    role: 'gestao',
    default_room: 'Diretoria Clínica',
    password: '123456',
  },
  {
    id: '00000000-0000-0000-0000-000000000106',
    email: 'painel@plantaops.gov.br',
    full_name: 'Painel TV Sala de Espera',
    role: 'painel',
    default_room: 'Recepção Principal',
    password: '123456',
  },
];

export const SEED_MEDICATIONS: Medication[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    name: 'Dipirona Sódica 500mg/mL',
    active_principle: 'Dipirona',
    max_dose_mg: 1000,
    unit: 'mg',
    default_route: 'EV',
    common_frequencies: ['6/6h', '8/8h', 'ACM', 'Dose única'],
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    name: 'Paracetamol 750mg',
    active_principle: 'Paracetamol',
    max_dose_mg: 1000,
    unit: 'mg',
    default_route: 'VO',
    common_frequencies: ['6/6h', '8/8h', 'ACM'],
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    name: 'Amoxicilina + Clavulanato',
    active_principle: 'Amoxicilina / Penicilina',
    max_dose_mg: 875,
    unit: 'mg',
    default_route: 'VO',
    common_frequencies: ['8/8h', '12/12h'],
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    name: 'Ceftriaxona Dissódica',
    active_principle: 'Ceftriaxona',
    max_dose_mg: 2000,
    unit: 'mg',
    default_route: 'EV',
    common_frequencies: ['12/12h', '24/24h', 'Dose única'],
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    name: 'Cetoprofeno (Profenid)',
    active_principle: 'Cetoprofeno / AINE',
    max_dose_mg: 100,
    unit: 'mg',
    default_route: 'EV',
    common_frequencies: ['8/8h', '12/12h', 'Dose única'],
  },
  {
    id: '10000000-0000-0000-0000-000000000006',
    name: 'Ibuprofeno 600mg',
    active_principle: 'Ibuprofeno / AINE',
    max_dose_mg: 600,
    unit: 'mg',
    default_route: 'VO',
    common_frequencies: ['6/6h', '8/8h'],
  },
  {
    id: '10000000-0000-0000-0000-000000000007',
    name: 'Sulfato de Morfina',
    active_principle: 'Morfina',
    max_dose_mg: 10,
    unit: 'mg',
    default_route: 'EV',
    common_frequencies: ['4/4h', '6/6h', 'Dose única'],
  },
  {
    id: '10000000-0000-0000-0000-000000000008',
    name: 'Ondansetrona (Vonau)',
    active_principle: 'Ondansetrona',
    max_dose_mg: 8,
    unit: 'mg',
    default_route: 'EV',
    common_frequencies: ['8/8h', '12/12h', 'Dose única'],
  },
  {
    id: '10000000-0000-0000-0000-000000000009',
    name: 'Captopril 25mg',
    active_principle: 'Captopril',
    max_dose_mg: 50,
    unit: 'mg',
    default_route: 'VO',
    common_frequencies: ['8/8h', '12/12h', 'Dose única'],
  },
  {
    id: '10000000-0000-0000-0000-000000000010',
    name: 'Furosemida (Lasix)',
    active_principle: 'Furosemida',
    max_dose_mg: 80,
    unit: 'mg',
    default_route: 'EV',
    common_frequencies: ['8/8h', '12/12h', 'Dose única'],
  },
];

function createInitialSeedDatabase(): DatabaseState {
  const now = Date.now();
  const minAgo = (m: number) => new Date(now - m * 60000).toISOString();

  const patients: Patient[] = [
    {
      id: '30000000-0000-0000-0000-000000000001',
      full_name: 'Antônio Carlos Ferreira',
      birth_date: '1954-03-14', // 72 anos (Idoso >= 60)
      sex: 'M',
      phone: '(11) 98765-4321',
      allergies: ['Dipirona', 'Penicilina'],
      created_at: minAgo(180),
    },
    {
      id: '30000000-0000-0000-0000-000000000002',
      full_name: 'Mariana Souza Lima',
      birth_date: '1992-08-22',
      sex: 'F',
      phone: '(11) 97654-3210',
      allergies: ['Amoxicilina'],
      created_at: minAgo(150),
    },
    {
      id: '30000000-0000-0000-0000-000000000003',
      full_name: 'Lucas Gabriel Rocha',
      birth_date: '2018-11-05', // 7 anos (Criança < 12)
      sex: 'M',
      phone: '(11) 96543-2109',
      allergies: [],
      created_at: minAgo(140),
    },
    {
      id: '30000000-0000-0000-0000-000000000004',
      full_name: 'Roberto Almeida Nascimento',
      birth_date: '1980-01-30',
      sex: 'M',
      phone: '(11) 95432-1098',
      allergies: ['Ibuprofeno', 'AINE'],
      created_at: minAgo(95),
    },
    {
      id: '30000000-0000-0000-0000-000000000005',
      full_name: 'Beatriz Helena Castro',
      birth_date: '1975-06-18',
      sex: 'F',
      phone: '(11) 94321-0987',
      allergies: [],
      created_at: minAgo(45),
    },
    {
      id: '30000000-0000-0000-0000-000000000006',
      full_name: 'João Pedro Martins',
      birth_date: '1999-12-10',
      sex: 'M',
      phone: '(11) 93210-9876',
      allergies: ['Morfina'],
      created_at: minAgo(20),
    },
  ];

  const encounters: Encounter[] = [
    // A001: Vermelho (Emergência) - na fila aguardando médico
    {
      id: '40000000-0000-0000-0000-000000000001',
      patient_id: patients[0].id,
      ticket_number: 'A001',
      status: 'aguardando_medico',
      current_risk: 'vermelho',
      chief_complaint: 'Dor torácica opressiva irradiando para MSE, sudorese fria e dispneia.',
      clinical_notes: null,
      destination: null,
      consulting_room: null,
      assigned_doctor_id: null,
      arrived_at: minAgo(8),
      triaged_at: minAgo(6),
      called_at: null,
      started_at: null,
      finished_at: null,
      updated_at: minAgo(6),
    },
    // A002: Verde esperando além do prazo (> 120 min -> 135 min) para demonstrar o alerta de estouro!
    {
      id: '40000000-0000-0000-0000-000000000002',
      patient_id: patients[1].id,
      ticket_number: 'A002',
      status: 'aguardando_medico',
      current_risk: 'verde',
      chief_complaint: 'Odinofagia leve e estado febril há 2 dias.',
      clinical_notes: null,
      destination: null,
      consulting_room: null,
      assigned_doctor_id: null,
      arrived_at: minAgo(135),
      triaged_at: minAgo(130),
      called_at: null,
      started_at: null,
      finished_at: null,
      updated_at: minAgo(130),
    },
    // A003: Amarelo (Urgente) na fila
    {
      id: '40000000-0000-0000-0000-000000000003',
      patient_id: patients[2].id,
      ticket_number: 'A003',
      status: 'aguardando_medico',
      current_risk: 'amarelo',
      chief_complaint: 'Febre alta (39,2°C) persistente e cefaleia moderada.',
      clinical_notes: null,
      destination: null,
      consulting_room: null,
      assigned_doctor_id: null,
      arrived_at: minAgo(28),
      triaged_at: minAgo(24),
      called_at: null,
      started_at: null,
      finished_at: null,
      updated_at: minAgo(24),
    },
    // A004: Laranja aguardando leito de observação
    {
      id: '40000000-0000-0000-0000-000000000004',
      patient_id: patients[3].id,
      ticket_number: 'A004',
      status: 'aguardando_leito',
      current_risk: 'laranja',
      chief_complaint: 'Cólica nefrética intensa em flanco direito (dor 9/10).',
      clinical_notes: 'Paciente medicado para analgesia endovenosa. Solicito observação clínica e controle de dor.',
      destination: 'observacao',
      consulting_room: 'Consultório 01',
      assigned_doctor_id: SEED_PROFILES[2].id,
      arrived_at: minAgo(55),
      triaged_at: minAgo(50),
      called_at: minAgo(44),
      started_at: minAgo(44),
      finished_at: null,
      updated_at: minAgo(15),
    },
    // A005: Aguardando triagem na enfermagem
    {
      id: '40000000-0000-0000-0000-000000000005',
      patient_id: patients[4].id,
      ticket_number: 'A005',
      status: 'aguardando_triagem',
      current_risk: null,
      chief_complaint: null,
      clinical_notes: null,
      destination: null,
      consulting_room: null,
      assigned_doctor_id: null,
      arrived_at: minAgo(12),
      triaged_at: null,
      called_at: null,
      started_at: null,
      finished_at: null,
      updated_at: minAgo(12),
    },
    // A006: Atendimento finalizado com Alta (para compor estatísticas da gestão)
    {
      id: '40000000-0000-0000-0000-000000000006',
      patient_id: patients[5].id,
      ticket_number: 'A006',
      status: 'alta',
      current_risk: 'azul',
      chief_complaint: 'Troca de curativo simples em membro superior.',
      clinical_notes: 'Ferida limpa, sem sinais flogísticos. Orientações de cuidado domiciliar e alta médica.',
      destination: 'alta',
      consulting_room: 'Consultório 02',
      assigned_doctor_id: SEED_PROFILES[3].id,
      arrived_at: minAgo(110),
      triaged_at: minAgo(105),
      called_at: minAgo(85),
      started_at: minAgo(85),
      finished_at: minAgo(70),
      updated_at: minAgo(70),
    },
  ];

  const triages: TriageRecord[] = [
    {
      id: '50000000-0000-0000-0000-000000000001',
      encounter_id: encounters[0].id,
      nurse_id: SEED_PROFILES[1].id,
      nurse_name: SEED_PROFILES[1].full_name,
      systolic_bp: 75,
      diastolic_bp: 50,
      heart_rate: 146,
      temperature: 36.4,
      oxygen_saturation: 88,
      pain_level: 9,
      consciousness: 'alerta',
      chief_complaint: encounters[0].chief_complaint!,
      suggested_color: 'vermelho',
      final_color: 'vermelho',
      justification: null,
      is_reclassification: false,
      created_at: minAgo(6),
    },
    {
      id: '50000000-0000-0000-0000-000000000002',
      encounter_id: encounters[1].id,
      nurse_id: SEED_PROFILES[1].id,
      nurse_name: SEED_PROFILES[1].full_name,
      systolic_bp: 120,
      diastolic_bp: 80,
      heart_rate: 78,
      temperature: 38.0,
      oxygen_saturation: 98,
      pain_level: 3,
      consciousness: 'alerta',
      chief_complaint: encounters[1].chief_complaint!,
      suggested_color: 'verde',
      final_color: 'verde',
      justification: null,
      is_reclassification: false,
      created_at: minAgo(130),
    },
    {
      id: '50000000-0000-0000-0000-000000000003',
      encounter_id: encounters[2].id,
      nurse_id: SEED_PROFILES[1].id,
      nurse_name: SEED_PROFILES[1].full_name,
      systolic_bp: 110,
      diastolic_bp: 70,
      heart_rate: 102,
      temperature: 39.2,
      oxygen_saturation: 97,
      pain_level: 6,
      consciousness: 'alerta',
      chief_complaint: encounters[2].chief_complaint!,
      suggested_color: 'amarelo',
      final_color: 'amarelo',
      justification: null,
      is_reclassification: false,
      created_at: minAgo(24),
    },
    {
      id: '50000000-0000-0000-0000-000000000004',
      encounter_id: encounters[3].id,
      nurse_id: SEED_PROFILES[1].id,
      nurse_name: SEED_PROFILES[1].full_name,
      systolic_bp: 145,
      diastolic_bp: 92,
      heart_rate: 124,
      temperature: 36.8,
      oxygen_saturation: 96,
      pain_level: 9,
      consciousness: 'alerta',
      chief_complaint: encounters[3].chief_complaint!,
      suggested_color: 'laranja',
      final_color: 'laranja',
      justification: null,
      is_reclassification: false,
      created_at: minAgo(50),
    },
    {
      id: '50000000-0000-0000-0000-000000000006',
      encounter_id: encounters[5].id,
      nurse_id: SEED_PROFILES[1].id,
      nurse_name: SEED_PROFILES[1].full_name,
      systolic_bp: 118,
      diastolic_bp: 76,
      heart_rate: 72,
      temperature: 36.5,
      oxygen_saturation: 99,
      pain_level: 0,
      consciousness: 'alerta',
      chief_complaint: encounters[5].chief_complaint!,
      suggested_color: 'azul',
      final_color: 'azul',
      justification: null,
      is_reclassification: false,
      created_at: minAgo(105),
    },
  ];

  const events: EncounterEvent[] = [
    {
      id: '60000000-0000-0000-0000-000000000001',
      encounter_id: encounters[0].id,
      from_status: null,
      to_status: 'aguardando_triagem',
      actor_name: SEED_PROFILES[0].full_name,
      details: 'Atendimento aberto na recepção com senha A001',
      created_at: minAgo(8),
    },
    {
      id: '60000000-0000-0000-0000-000000000002',
      encounter_id: encounters[0].id,
      from_status: 'aguardando_triagem',
      to_status: 'aguardando_medico',
      actor_name: SEED_PROFILES[1].full_name,
      details: 'Triagem concluída: classificação VERMELHO (Emergência)',
      created_at: minAgo(6),
    },
  ];

  const beds: Bed[] = [
    {
      id: '20000000-0000-0000-0000-000000000001',
      code: 'SV-01',
      ward: 'Sala Vermelha (Emergência)',
      status: 'livre',
      current_encounter_id: null,
      updated_at: minAgo(60),
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      code: 'SV-02',
      ward: 'Sala Vermelha (Emergência)',
      status: 'livre',
      current_encounter_id: null,
      updated_at: minAgo(60),
    },
    {
      id: '20000000-0000-0000-0000-000000000003',
      code: 'SV-03',
      ward: 'Sala Vermelha (Emergência)',
      status: 'em_limpeza',
      current_encounter_id: null,
      updated_at: minAgo(10),
    },
    {
      id: '20000000-0000-0000-0000-000000000004',
      code: 'OBS-01',
      ward: 'Observação Clínica',
      status: 'livre',
      current_encounter_id: null,
      updated_at: minAgo(60),
    },
    {
      id: '20000000-0000-0000-0000-000000000005',
      code: 'OBS-02',
      ward: 'Observação Clínica',
      status: 'livre',
      current_encounter_id: null,
      updated_at: minAgo(60),
    },
    {
      id: '20000000-0000-0000-0000-000000000006',
      code: 'OBS-03',
      ward: 'Observação Clínica',
      status: 'livre',
      current_encounter_id: null,
      updated_at: minAgo(60),
    },
    {
      id: '20000000-0000-0000-0000-000000000007',
      code: 'OBS-04',
      ward: 'Observação Clínica',
      status: 'bloqueado',
      current_encounter_id: null,
      updated_at: minAgo(120),
    },
    {
      id: '20000000-0000-0000-0000-000000000008',
      code: 'ISO-01',
      ward: 'Isolamento Respiratório',
      status: 'livre',
      current_encounter_id: null,
      updated_at: minAgo(60),
    },
  ];

  const calls: PanelCall[] = [
    {
      id: '70000000-0000-0000-0000-000000000001',
      encounter_id: encounters[3].id,
      ticket_number: 'A004',
      risk_color: 'laranja',
      consulting_room: 'Consultório 01',
      called_at: minAgo(44),
    },
    {
      id: '70000000-0000-0000-0000-000000000002',
      encounter_id: encounters[5].id,
      ticket_number: 'A006',
      risk_color: 'azul',
      consulting_room: 'Consultório 02',
      called_at: minAgo(85),
    },
  ];

  return {
    profiles: SEED_PROFILES.map(({ password: _p, ...rest }) => rest),
    patients,
    encounters,
    triages,
    events,
    medications: SEED_MEDICATIONS,
    prescriptions: [],
    beds,
    calls,
  };
}

export function loadLocalDb(): DatabaseState {
  if (typeof window === 'undefined') {
    return createInitialSeedDatabase();
  }
  const raw = window.localStorage.getItem(DB_STORAGE_KEY);
  if (!raw) {
    const initial = createInitialSeedDatabase();
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    return JSON.parse(raw) as DatabaseState;
  } catch {
    const initial = createInitialSeedDatabase();
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
}

export function saveLocalDb(state: DatabaseState, changedTable: RealtimeTableName): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
  }
  notifyRealtimeChange(changedTable);
}

export function resetLocalDbToSeed(): void {
  const initial = createInitialSeedDatabase();
  saveLocalDb(initial, 'encounters');
  notifyRealtimeChange('beds');
  notifyRealtimeChange('calls');
}

/**
 * Executa uma transação exclusiva entre todas as abas/janelas abertas do navegador
 * utilizando Web Locks API (navigator.locks), garantindo atomicidade real em
 * operações críticas como "Chamar próximo" e "Alocar leito".
 */
export async function runAtomicTransaction<T>(
  lockName: string,
  fn: (db: DatabaseState) => T | Promise<T>
): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks) {
    return navigator.locks.request(`plantaops_lock_${lockName}`, async () => {
      const db = loadLocalDb();
      return await fn(db);
    });
  }
  const db = loadLocalDb();
  return await fn(db);
}

// ============================================================================
// Sessão por Aba (sessionStorage)
// ============================================================================
export function getLocalSessionUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function setLocalSessionUser(user: UserProfile | null): void {
  if (typeof window === 'undefined') return;
  if (!user) {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
  }
}

// ============================================================================
// Verificador estrito de RLS (Row Level Security - Item 3.7)
// ============================================================================
export function requireRole(allowedRoles: UserProfile['role'][], actionDescription: string): UserProfile {
  const user = getLocalSessionUser();
  if (!user) {
    throw new Error('Sessão expirada ou usuário não autenticado.');
  }
  if (!allowedRoles.includes(user.role)) {
    throw new Error(
      `BLOQUEIO DE SEGURANÇA (RLS): O perfil "${user.role.toUpperCase()}" não possui permissão para ${actionDescription}.`
    );
  }
  return user;
}
