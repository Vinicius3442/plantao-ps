// ============================================================================
// Camada Domain: Situações do Atendimento e Transições Permitidas (Item 2.9c)
// ============================================================================

import { EncounterStatus } from './types';

export const STATUS_LABELS: Record<EncounterStatus, string> = {
  aguardando_triagem: 'Aguardando triagem',
  aguardando_medico: 'Aguardando médico',
  em_atendimento: 'Em atendimento',
  aguardando_leito: 'Aguardando leito',
  em_observacao: 'Em observação',
  alta: 'Alta',
  transferido: 'Transferido',
  cancelado: 'Cancelado (desistência)',
};

/**
 * Mapa estrito das transições permitidas conforme tabela do Item 2.9c:
 * - Aguardando triagem -> Aguardando médico; Cancelado (desistência)
 * - Aguardando médico -> Em atendimento; Aguardando médico (reclassificação); Cancelado (desistência)
 * - Em atendimento -> Alta; Aguardando leito; Transferido
 * - Aguardando leito -> Em observação (ao receber um leito)
 * - Em observação -> Alta; Transferido
 * - Alta, Transferido ou Cancelado -> Nenhuma (situação final)
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<EncounterStatus, EncounterStatus[]> = {
  aguardando_triagem: ['aguardando_medico', 'cancelado'],
  aguardando_medico: ['em_atendimento', 'aguardando_medico', 'cancelado'],
  em_atendimento: ['alta', 'aguardando_leito', 'transferido'],
  aguardando_leito: ['em_observacao'],
  em_observacao: ['alta', 'transferido'],
  alta: [],
  transferido: [],
  cancelado: [],
};

export function canTransitionStatus(from: EncounterStatus, to: EncounterStatus): boolean {
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertValidStatusTransition(from: EncounterStatus, to: EncounterStatus): void {
  if (!canTransitionStatus(from, to)) {
    throw new Error(
      `Transição de situação não permitida pelo protocolo: "${STATUS_LABELS[from]}" → "${STATUS_LABELS[to]}".`
    );
  }
}

export function isTerminalStatus(status: EncounterStatus): boolean {
  return status === 'alta' || status === 'transferido' || status === 'cancelado';
}
