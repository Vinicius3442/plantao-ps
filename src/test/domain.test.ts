// ============================================================================
// Testes Automatizados Obrigatórios da Camada Domain (Item 3.9)
// Utilizando Vitest para testar:
// 1. Classificação de risco, cobrindo todas as cores e os valores-limite de cada critério;
// 2. Ordenação da fila, incluindo os critérios de desempate (idosos >= 60 e crianças < 12);
// 3. Transições de situação permitidas e proibidas;
// 4. Bloqueio da prescrição por alergia e por dose máxima.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  assertValidStatusTransition,
  canTransitionStatus,
  classifyRisk,
  Encounter,
  Medication,
  sortMedicalQueue,
  validatePrescription,
  VitalSignsInput,
} from '../domain';

const baseVitals: VitalSignsInput = {
  systolic_bp: 120,
  diastolic_bp: 80,
  heart_rate: 75,
  temperature: 36.5,
  oxygen_saturation: 98,
  pain_level: 0,
  consciousness: 'alerta',
};

describe('1. Classificação de Risco (Item 2.9a e 3.9)', () => {
  it('classifica como AZUL quando nenhum critério de gravidade está presente', () => {
    const res = classifyRisk(baseVitals);
    expect(res.suggestedColor).toBe('azul');
  });

  describe('Critérios VERDE (Pouco urgente - 120 min) e valores-limite', () => {
    it('classifica como VERDE no limite inferior e superior de temperatura (37,8 °C a 38,4 °C)', () => {
      expect(classifyRisk({ ...baseVitals, temperature: 37.7 }).suggestedColor).toBe('azul');
      expect(classifyRisk({ ...baseVitals, temperature: 37.8 }).suggestedColor).toBe('verde');
      expect(classifyRisk({ ...baseVitals, temperature: 38.4 }).suggestedColor).toBe('verde');
    });

    it('classifica como VERDE no limite inferior e superior de dor leve (1 a 4)', () => {
      expect(classifyRisk({ ...baseVitals, pain_level: 0 }).suggestedColor).toBe('azul');
      expect(classifyRisk({ ...baseVitals, pain_level: 1 }).suggestedColor).toBe('verde');
      expect(classifyRisk({ ...baseVitals, pain_level: 4 }).suggestedColor).toBe('verde');
    });
  });

  describe('Critérios AMARELO (Urgente - 60 min) e valores-limite', () => {
    it('classifica como AMARELO para temperatura de 38,5 °C a 39,9 °C', () => {
      expect(classifyRisk({ ...baseVitals, temperature: 38.5 }).suggestedColor).toBe('amarelo');
      expect(classifyRisk({ ...baseVitals, temperature: 39.9 }).suggestedColor).toBe('amarelo');
    });

    it('classifica como AMARELO para dor de 5 a 7', () => {
      expect(classifyRisk({ ...baseVitals, pain_level: 5 }).suggestedColor).toBe('amarelo');
      expect(classifyRisk({ ...baseVitals, pain_level: 7 }).suggestedColor).toBe('amarelo');
    });

    it('classifica como AMARELO para pressão sistólica >= 180 mmHg', () => {
      expect(classifyRisk({ ...baseVitals, systolic_bp: 179 }).suggestedColor).toBe('azul');
      expect(classifyRisk({ ...baseVitals, systolic_bp: 180 }).suggestedColor).toBe('amarelo');
      expect(classifyRisk({ ...baseVitals, systolic_bp: 210 }).suggestedColor).toBe('amarelo');
    });
  });

  describe('Critérios LARANJA (Muito urgente - 10 min) e valores-limite', () => {
    it('classifica como LARANJA para saturação de 90% a 93%', () => {
      expect(classifyRisk({ ...baseVitals, oxygen_saturation: 94 }).suggestedColor).toBe('azul');
      expect(classifyRisk({ ...baseVitals, oxygen_saturation: 93 }).suggestedColor).toBe('laranja');
      expect(classifyRisk({ ...baseVitals, oxygen_saturation: 90 }).suggestedColor).toBe('laranja');
    });

    it('classifica como LARANJA para temperatura >= 40 °C ou <= 35 °C', () => {
      expect(classifyRisk({ ...baseVitals, temperature: 40.0 }).suggestedColor).toBe('laranja');
      expect(classifyRisk({ ...baseVitals, temperature: 35.0 }).suggestedColor).toBe('laranja');
      expect(classifyRisk({ ...baseVitals, temperature: 35.1 }).suggestedColor).toBe('azul');
    });

    it('classifica como LARANJA para dor de 8 a 10', () => {
      expect(classifyRisk({ ...baseVitals, pain_level: 8 }).suggestedColor).toBe('laranja');
      expect(classifyRisk({ ...baseVitals, pain_level: 10 }).suggestedColor).toBe('laranja');
    });

    it('classifica como LARANJA para frequência cardíaca de 121 a 140 bpm', () => {
      expect(classifyRisk({ ...baseVitals, heart_rate: 120 }).suggestedColor).toBe('azul');
      expect(classifyRisk({ ...baseVitals, heart_rate: 121 }).suggestedColor).toBe('laranja');
      expect(classifyRisk({ ...baseVitals, heart_rate: 140 }).suggestedColor).toBe('laranja');
    });

    it('classifica como LARANJA para paciente confuso', () => {
      expect(classifyRisk({ ...baseVitals, consciousness: 'confuso' }).suggestedColor).toBe(
        'laranja'
      );
    });
  });

  describe('Critérios VERMELHO (Emergência - Imediato) e valores-limite', () => {
    it('classifica como VERMELHO para saturação < 90% (limite 89%)', () => {
      expect(classifyRisk({ ...baseVitals, oxygen_saturation: 89 }).suggestedColor).toBe(
        'vermelho'
      );
    });

    it('classifica como VERMELHO para pressão sistólica < 80 mmHg (limite 79)', () => {
      expect(classifyRisk({ ...baseVitals, systolic_bp: 80 }).suggestedColor).toBe('azul');
      expect(classifyRisk({ ...baseVitals, systolic_bp: 79 }).suggestedColor).toBe('vermelho');
    });

    it('classifica como VERMELHO para frequência cardíaca < 40 (limite 39) ou > 140 bpm (limite 141)', () => {
      expect(classifyRisk({ ...baseVitals, heart_rate: 40 }).suggestedColor).toBe('azul');
      expect(classifyRisk({ ...baseVitals, heart_rate: 39 }).suggestedColor).toBe('vermelho');
      expect(classifyRisk({ ...baseVitals, heart_rate: 141 }).suggestedColor).toBe('vermelho');
    });

    it('classifica como VERMELHO para paciente inconsciente, prevalecendo sobre critérios menores', () => {
      expect(
        classifyRisk({
          ...baseVitals,
          temperature: 38.0, // Verde
          pain_level: 6, // Amarelo
          consciousness: 'inconsciente', // Vermelho
        }).suggestedColor
      ).toBe('vermelho');
    });
  });
});

describe('2. Ordenação da Fila e Critérios de Desempate (Item 2.9b e 3.9)', () => {
  const referenceNow = new Date('2026-11-13T12:00:00Z');

  function makeEncounter(params: {
    id: string;
    ticket: string;
    color: Encounter['current_risk'];
    arrivedMinutesAgo: number;
    birthDate: string;
  }): Encounter {
    const arrivedIso = new Date(
      referenceNow.getTime() - params.arrivedMinutesAgo * 60000
    ).toISOString();
    return {
      id: params.id,
      patient_id: `p_${params.id}`,
      patient: {
        id: `p_${params.id}`,
        full_name: `Paciente ${params.ticket}`,
        birth_date: params.birthDate,
        sex: 'M',
        phone: '11999999999',
        allergies: [],
        created_at: arrivedIso,
      },
      ticket_number: params.ticket,
      status: 'aguardando_medico',
      current_risk: params.color,
      chief_complaint: 'Queixa teste',
      clinical_notes: null,
      destination: null,
      consulting_room: null,
      assigned_doctor_id: null,
      arrived_at: arrivedIso,
      triaged_at: arrivedIso,
      called_at: null,
      started_at: null,
      finished_at: null,
      updated_at: arrivedIso,
    };
  }

  it('ordena primeiro pela cor de risco (vermelho > laranja > amarelo > verde > azul)', () => {
    const azul = makeEncounter({
      id: '1',
      ticket: 'A001',
      color: 'azul',
      arrivedMinutesAgo: 120,
      birthDate: '1990-01-01',
    });
    const verde = makeEncounter({
      id: '2',
      ticket: 'A002',
      color: 'verde',
      arrivedMinutesAgo: 60,
      birthDate: '1990-01-01',
    });
    const vermelho = makeEncounter({
      id: '3',
      ticket: 'A003',
      color: 'vermelho',
      arrivedMinutesAgo: 2,
      birthDate: '1990-01-01',
    });
    const amarelo = makeEncounter({
      id: '4',
      ticket: 'A004',
      color: 'amarelo',
      arrivedMinutesAgo: 20,
      birthDate: '1990-01-01',
    });
    const laranja = makeEncounter({
      id: '5',
      ticket: 'A005',
      color: 'laranja',
      arrivedMinutesAgo: 5,
      birthDate: '1990-01-01',
    });

    const sorted = sortMedicalQueue([azul, verde, vermelho, amarelo, laranja], referenceNow);
    expect(sorted.map((e) => e.current_risk)).toEqual([
      'vermelho',
      'laranja',
      'amarelo',
      'verde',
      'azul',
    ]);
  });

  it('dentro da mesma cor, ordena pelo maior tempo de espera', () => {
    const recente = makeEncounter({
      id: '1',
      ticket: 'A001',
      color: 'amarelo',
      arrivedMinutesAgo: 15,
      birthDate: '1990-01-01',
    });
    const antigo = makeEncounter({
      id: '2',
      ticket: 'A002',
      color: 'amarelo',
      arrivedMinutesAgo: 45,
      birthDate: '1990-01-01',
    });

    const sorted = sortMedicalQueue([recente, antigo], referenceNow);
    expect(sorted.map((e) => e.ticket_number)).toEqual(['A002', 'A001']);
  });

  it('em caso de empate na cor e no tempo de espera, idosos (>= 60 anos) e crianças (< 12 anos) vêm primeiro', () => {
    const adulto30Anos = makeEncounter({
      id: '1',
      ticket: 'A001-Adulto',
      color: 'amarelo',
      arrivedMinutesAgo: 30,
      birthDate: '1996-05-10', // 30 anos
    });
    const idoso65Anos = makeEncounter({
      id: '2',
      ticket: 'A002-Idoso',
      color: 'amarelo',
      arrivedMinutesAgo: 30,
      birthDate: '1961-01-10', // 65 anos (>= 60)
    });
    const crianca8Anos = makeEncounter({
      id: '3',
      ticket: 'A003-Crianca',
      color: 'amarelo',
      arrivedMinutesAgo: 30,
      birthDate: '2018-06-15', // 8 anos (< 12)
    });

    const sorted1 = sortMedicalQueue([adulto30Anos, idoso65Anos], referenceNow);
    expect(sorted1[0].ticket_number).toBe('A002-Idoso');

    const sorted2 = sortMedicalQueue([adulto30Anos, crianca8Anos], referenceNow);
    expect(sorted2[0].ticket_number).toBe('A003-Crianca');
  });
});

describe('3. Transições de Situação Permitidas e Proibidas (Item 2.9c e 3.9)', () => {
  it('permite todas as transições válidas previstas na tabela do Item 2.9c', () => {
    expect(canTransitionStatus('aguardando_triagem', 'aguardando_medico')).toBe(true);
    expect(canTransitionStatus('aguardando_triagem', 'cancelado')).toBe(true);

    expect(canTransitionStatus('aguardando_medico', 'em_atendimento')).toBe(true);
    expect(canTransitionStatus('aguardando_medico', 'aguardando_medico')).toBe(true);
    expect(canTransitionStatus('aguardando_medico', 'cancelado')).toBe(true);

    expect(canTransitionStatus('em_atendimento', 'alta')).toBe(true);
    expect(canTransitionStatus('em_atendimento', 'aguardando_leito')).toBe(true);
    expect(canTransitionStatus('em_atendimento', 'transferido')).toBe(true);

    expect(canTransitionStatus('aguardando_leito', 'em_observacao')).toBe(true);

    expect(canTransitionStatus('em_observacao', 'alta')).toBe(true);
    expect(canTransitionStatus('em_observacao', 'transferido')).toBe(true);
  });

  it('recusa todas as transições proibidas (ex: pular triagem, reabrir alta, etc.)', () => {
    expect(canTransitionStatus('aguardando_triagem', 'em_atendimento')).toBe(false);
    expect(canTransitionStatus('aguardando_triagem', 'alta')).toBe(false);
    expect(canTransitionStatus('aguardando_medico', 'alta')).toBe(false);
    expect(canTransitionStatus('em_atendimento', 'cancelado')).toBe(false);
    expect(canTransitionStatus('alta', 'em_atendimento')).toBe(false);
    expect(canTransitionStatus('transferido', 'aguardando_medico')).toBe(false);
    expect(canTransitionStatus('cancelado', 'aguardando_triagem')).toBe(false);

    expect(() =>
      assertValidStatusTransition('aguardando_triagem', 'em_atendimento')
    ).toThrow(/Transição de situação não permitida/);
  });
});

describe('4. Bloqueio de Prescrição por Alergia e Dose Máxima (Item 2.5 e 3.9)', () => {
  const dipirona: Medication = {
    id: 'med-1',
    name: 'Dipirona Sódica 500mg/mL',
    active_principle: 'Dipirona',
    max_dose_mg: 1000,
    unit: 'mg',
    default_route: 'EV',
    common_frequencies: ['6/6h'],
  };

  it('bloqueia a prescrição quando o paciente é alérgico ao medicamento ou princípio ativo', () => {
    const res = validatePrescription({
      medication: dipirona,
      doseMg: 500,
      patientAllergies: ['Penicilina', 'Dipirona'],
    });
    expect(res.valid).toBe(false);
    expect(res.blockedByAllergy).toBe(true);
    expect(res.errorMessage).toMatch(/PRESCRIÇÃO BLOQUEADA POR ALERGIA/i);
  });

  it('bloqueia a prescrição quando a dose ultrapassa a dose máxima cadastrada', () => {
    const res = validatePrescription({
      medication: dipirona,
      doseMg: 1500, // Acima de 1000mg
      patientAllergies: [],
    });
    expect(res.valid).toBe(false);
    expect(res.blockedByMaxDose).toBe(true);
    expect(res.errorMessage).toMatch(/PRESCRIÇÃO BLOQUEADA POR DOSE EXCEDIDA/i);
  });

  it('aprova a prescrição quando o paciente não é alérgico e a dose está dentro do limite', () => {
    const res = validatePrescription({
      medication: dipirona,
      doseMg: 1000, // Exatamente no limite máximo permitido
      patientAllergies: ['Ibuprofeno'],
    });
    expect(res.valid).toBe(true);
    expect(res.blockedByAllergy).toBe(false);
    expect(res.blockedByMaxDose).toBe(false);
  });
});
