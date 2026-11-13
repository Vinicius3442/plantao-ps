// ============================================================================
// Camada Domain: Ordenação da Fila e Cálculo de Tempo de Espera (Item 2.4 e 2.9b)
// ============================================================================

import { RISK_METADATA } from './riskClassification';
import { Encounter, RiskColor } from './types';

/**
 * Calcula a idade completa em anos a partir da data de nascimento (YYYY-MM-DD).
 */
export function calculateAgeYears(birthDateStr: string, referenceDate: Date = new Date()): number {
  const [year, month, day] = birthDateStr.split('-').map(Number);
  if (!year || !month || !day) return 0;

  let age = referenceDate.getFullYear() - year;
  const monthDiff = referenceDate.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < day)) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Verifica se o paciente faz parte do grupo prioritário de desempate (Item 2.9b):
 * Pacientes com 60 anos ou mais (>= 60) ou crianças com menos de 12 anos (< 12).
 */
export function isPriorityAgeGroup(birthDateStr: string, referenceDate: Date = new Date()): boolean {
  const age = calculateAgeYears(birthDateStr, referenceDate);
  return age >= 60 || age < 12;
}

/**
 * Calcula o tempo de espera em minutos desde a chegada/triagem.
 */
export function getWaitTimeMinutes(arrivedAtIso: string, now: Date = new Date()): number {
  const arrivedMs = new Date(arrivedAtIso).getTime();
  const diffMs = now.getTime() - arrivedMs;
  return Math.max(0, Math.floor(diffMs / 60000));
}

/**
 * Verifica se o tempo máximo de espera da cor foi ultrapassado (Item 2.4).
 * Para Vermelho (0 min / Imediato), qualquer espera >= 1 min (ou aguardando na fila) já requer alerta imediato.
 */
export function isWaitTimeExceeded(
  color: RiskColor | null,
  arrivedAtIso: string,
  now: Date = new Date()
): boolean {
  if (!color) return false;
  const waitMinutes = getWaitTimeMinutes(arrivedAtIso, now);
  const maxWait = RISK_METADATA[color].maxWaitMinutes;
  if (color === 'vermelho') {
    return waitMinutes > 0;
  }
  return waitMinutes > maxWait;
}

/**
 * Ordena a fila de pacientes triados conforme o Item 2.9b:
 * 1º Pela cor de risco (vermelho > laranja > amarelo > verde > azul).
 * 2º Dentro da mesma cor, pelo maior tempo de espera (quem chegou antes / espera há mais minutos).
 * 3º Em caso de empate no tempo de espera (em minutos), pacientes com 60 anos ou mais
 *    e crianças com menos de 12 anos vêm primeiro.
 */
export function sortMedicalQueue(encounters: Encounter[], now: Date = new Date()): Encounter[] {
  return [...encounters].sort((a, b) => {
    const colorA = a.current_risk ?? 'azul';
    const colorB = b.current_risk ?? 'azul';

    // 1. Prioridade da cor (1 = vermelho ... 5 = azul)
    const prioA = RISK_METADATA[colorA].numericPriority;
    const prioB = RISK_METADATA[colorB].numericPriority;
    if (prioA !== prioB) {
      return prioA - prioB;
    }

    // 2. Maior tempo de espera (em minutos)
    const waitA = getWaitTimeMinutes(a.arrived_at, now);
    const waitB = getWaitTimeMinutes(b.arrived_at, now);
    if (waitA !== waitB) {
      return waitB - waitA; // Maior espera vem primeiro
    }

    // 3. Desempate por faixa etária prioritária (idosos >= 60 ou crianças < 12)
    const isPrioAgeA = a.patient ? isPriorityAgeGroup(a.patient.birth_date, now) : false;
    const isPrioAgeB = b.patient ? isPriorityAgeGroup(b.patient.birth_date, now) : false;
    if (isPrioAgeA !== isPrioAgeB) {
      return isPrioAgeA ? -1 : 1;
    }

    // 4. Desempate final por timestamp exato de chegada
    return new Date(a.arrived_at).getTime() - new Date(b.arrived_at).getTime();
  });
}
