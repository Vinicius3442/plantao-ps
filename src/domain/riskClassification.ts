// ============================================================================
// Camada Domain: Classificação de Risco (Item 2.9a) - Funções Puras
// ============================================================================

import { RiskColor, VitalSignsInput } from './types';

export interface RiskMetadata {
  color: RiskColor;
  label: string;
  priorityLevel: string;
  numericPriority: number; // 1 (mais grave) a 5 (menos grave)
  maxWaitMinutes: number; // 0, 10, 60, 120, 240
  maxWaitLabel: string;
  description: string;
}

export const RISK_METADATA: Record<RiskColor, RiskMetadata> = {
  vermelho: {
    color: 'vermelho',
    label: 'Vermelho',
    priorityLevel: 'Emergência',
    numericPriority: 1,
    maxWaitMinutes: 0,
    maxWaitLabel: 'Imediato (0 min)',
    description: 'Saturação < 90%, PA sistólica < 80 mmHg, FC < 40 ou > 140 bpm, ou inconsciente.',
  },
  laranja: {
    color: 'laranja',
    label: 'Laranja',
    priorityLevel: 'Muito Urgente',
    numericPriority: 2,
    maxWaitMinutes: 10,
    maxWaitLabel: '10 min',
    description: 'Saturação 90-93%, Temp ≥ 40°C ou ≤ 35°C, Dor 8-10, FC 121-140 bpm, ou confuso.',
  },
  amarelo: {
    color: 'amarelo',
    label: 'Amarelo',
    priorityLevel: 'Urgente',
    numericPriority: 3,
    maxWaitMinutes: 60,
    maxWaitLabel: '60 min',
    description: 'Temperatura 38,5°C a 39,9°C, Dor 5-7, ou PA sistólica ≥ 180 mmHg.',
  },
  verde: {
    color: 'verde',
    label: 'Verde',
    priorityLevel: 'Pouco Urgente',
    numericPriority: 4,
    maxWaitMinutes: 120,
    maxWaitLabel: '120 min',
    description: 'Temperatura 37,8°C a 38,4°C, ou Dor 1-4.',
  },
  azul: {
    color: 'azul',
    label: 'Azul',
    priorityLevel: 'Não Urgente',
    numericPriority: 5,
    maxWaitMinutes: 240,
    maxWaitLabel: '240 min',
    description: 'Sinais vitais estáveis sem critérios de gravidade.',
  },
};

/**
 * Sugere automaticamente a cor da classificação de risco pelo critério mais grave
 * encontrado nos sinais vitais (Item 2.9a).
 */
export function classifyRisk(vitals: VitalSignsInput): {
  suggestedColor: RiskColor;
  triggeredReasons: string[];
} {
  const redReasons: string[] = [];
  const orangeReasons: string[] = [];
  const yellowReasons: string[] = [];
  const greenReasons: string[] = [];

  // 1. Critérios VERMELHO (Emergência - Imediato):
  // Saturação < 90%; pressão sistólica < 80 mmHg; frequência cardíaca < 40 ou > 140 bpm; paciente inconsciente.
  if (vitals.oxygen_saturation < 90) {
    redReasons.push(`Saturação crítica (${vitals.oxygen_saturation}% < 90%)`);
  }
  if (vitals.systolic_bp < 80) {
    redReasons.push(`Hipotensão grave (PAS ${vitals.systolic_bp} < 80 mmHg)`);
  }
  if (vitals.heart_rate < 40) {
    redReasons.push(`Bradicardia extrema (FC ${vitals.heart_rate} < 40 bpm)`);
  }
  if (vitals.heart_rate > 140) {
    redReasons.push(`Taquicardia extrema (FC ${vitals.heart_rate} > 140 bpm)`);
  }
  if (vitals.consciousness === 'inconsciente') {
    redReasons.push('Paciente inconsciente');
  }

  if (redReasons.length > 0) {
    return { suggestedColor: 'vermelho', triggeredReasons: redReasons };
  }

  // 2. Critérios LARANJA (Muito urgente - 10 min):
  // Saturação de 90% a 93%; temperatura ≥ 40 °C ou ≤ 35 °C; dor de 8 a 10; FC de 121 a 140 bpm; paciente confuso.
  if (vitals.oxygen_saturation >= 90 && vitals.oxygen_saturation <= 93) {
    orangeReasons.push(`Saturação reduzida (${vitals.oxygen_saturation}% entre 90% e 93%)`);
  }
  if (vitals.temperature >= 40) {
    orangeReasons.push(`Hipertermia severa (${vitals.temperature}°C ≥ 40°C)`);
  }
  if (vitals.temperature <= 35) {
    orangeReasons.push(`Hipotermia (${vitals.temperature}°C ≤ 35°C)`);
  }
  if (vitals.pain_level >= 8 && vitals.pain_level <= 10) {
    orangeReasons.push(`Dor intensa (${vitals.pain_level}/10)`);
  }
  if (vitals.heart_rate >= 121 && vitals.heart_rate <= 140) {
    orangeReasons.push(`Taquicardia importante (FC ${vitals.heart_rate} bpm)`);
  }
  if (vitals.consciousness === 'confuso') {
    orangeReasons.push('Paciente confuso / desorientado');
  }

  if (orangeReasons.length > 0) {
    return { suggestedColor: 'laranja', triggeredReasons: orangeReasons };
  }

  // 3. Critérios AMARELO (Urgente - 60 min):
  // Temperatura de 38,5 °C a 39,9 °C; dor de 5 a 7; pressão sistólica ≥ 180 mmHg.
  if (vitals.temperature >= 38.5 && vitals.temperature <= 39.9) {
    yellowReasons.push(`Febre alta (${vitals.temperature}°C entre 38,5°C e 39,9°C)`);
  }
  if (vitals.pain_level >= 5 && vitals.pain_level <= 7) {
    yellowReasons.push(`Dor moderada (${vitals.pain_level}/10)`);
  }
  if (vitals.systolic_bp >= 180) {
    yellowReasons.push(`Crise hipertensiva (PAS ${vitals.systolic_bp} ≥ 180 mmHg)`);
  }

  if (yellowReasons.length > 0) {
    return { suggestedColor: 'amarelo', triggeredReasons: yellowReasons };
  }

  // 4. Critérios VERDE (Pouco urgente - 120 min):
  // Temperatura de 37,8 °C a 38,4 °C; dor de 1 a 4.
  if (vitals.temperature >= 37.8 && vitals.temperature <= 38.4) {
    greenReasons.push(`Estado febril (${vitals.temperature}°C entre 37,8°C e 38,4°C)`);
  }
  if (vitals.pain_level >= 1 && vitals.pain_level <= 4) {
    greenReasons.push(`Dor leve (${vitals.pain_level}/10)`);
  }

  if (greenReasons.length > 0) {
    return { suggestedColor: 'verde', triggeredReasons: greenReasons };
  }

  // 5. AZUL (Não urgente - 240 min): Nenhum dos critérios acima.
  return {
    suggestedColor: 'azul',
    triggeredReasons: ['Sinais vitais dentro dos parâmetros de estabilidade'],
  };
}
