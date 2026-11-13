// ============================================================================
// Camada Domain: Tipos e Interfaces Puras (Sem dependência de React ou Supabase)
// ============================================================================

export type UserRole = 'recepcao' | 'enfermagem' | 'medico' | 'gestao' | 'painel';

export type RiskColor = 'vermelho' | 'laranja' | 'amarelo' | 'verde' | 'azul';

export type ConsciousnessLevel = 'alerta' | 'confuso' | 'inconsciente';

export type EncounterStatus =
  | 'aguardando_triagem'
  | 'aguardando_medico'
  | 'em_atendimento'
  | 'aguardando_leito'
  | 'em_observacao'
  | 'alta'
  | 'transferido'
  | 'cancelado';

export type BedStatus = 'livre' | 'ocupado' | 'em_limpeza' | 'bloqueado';

export type MedicalDestination = 'alta' | 'observacao' | 'internacao' | 'transferencia';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  default_room?: string;
}

export interface Patient {
  id: string;
  full_name: string;
  birth_date: string; // YYYY-MM-DD
  sex: 'M' | 'F' | 'Outro';
  phone: string;
  allergies: string[];
  created_at: string;
}

export interface VitalSignsInput {
  systolic_bp: number; // mmHg
  diastolic_bp: number; // mmHg
  heart_rate: number; // bpm
  temperature: number; // °C
  oxygen_saturation: number; // % (0-100)
  pain_level: number; // 0-10
  consciousness: ConsciousnessLevel;
}

export interface TriageRecord extends VitalSignsInput {
  id: string;
  encounter_id: string;
  nurse_id?: string;
  nurse_name: string;
  chief_complaint: string;
  suggested_color: RiskColor;
  final_color: RiskColor;
  justification?: string | null;
  is_reclassification: boolean;
  created_at: string;
}

export interface EncounterEvent {
  id: string;
  encounter_id: string;
  from_status: EncounterStatus | null;
  to_status: EncounterStatus;
  actor_name: string;
  details: string;
  created_at: string;
}

export interface Medication {
  id: string;
  name: string;
  active_principle: string;
  max_dose_mg: number;
  unit: string;
  default_route: string;
  common_frequencies: string[];
}

export interface Prescription {
  id: string;
  encounter_id: string;
  medication_id: string;
  medication_name: string;
  doctor_id?: string;
  doctor_name: string;
  dose_mg: number;
  route: string;
  frequency: string;
  notes?: string;
  created_at: string;
}

export interface Encounter {
  id: string;
  patient_id: string;
  patient?: Patient;
  ticket_number: string;
  status: EncounterStatus;
  current_risk: RiskColor | null;
  chief_complaint: string | null;
  clinical_notes: string | null;
  destination: MedicalDestination | null;
  consulting_room: string | null;
  assigned_doctor_id: string | null;
  arrived_at: string;
  triaged_at: string | null;
  called_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  triages?: TriageRecord[];
  prescriptions?: Prescription[];
  events?: EncounterEvent[];
}

export interface Bed {
  id: string;
  code: string;
  ward: string;
  status: BedStatus;
  current_encounter_id: string | null;
  current_encounter?: Encounter | null;
  updated_at: string;
}

export interface PanelCall {
  id: string;
  encounter_id: string;
  ticket_number: string;
  risk_color: RiskColor;
  consulting_room: string;
  called_at: string;
}
