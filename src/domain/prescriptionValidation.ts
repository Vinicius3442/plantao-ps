// ============================================================================
// Camada Domain: Validação Clínica de Prescrição Médica (Item 2.5 e 3.7)
// ============================================================================

import { Medication } from './types';

export interface PrescriptionValidationResult {
  valid: boolean;
  blockedByAllergy: boolean;
  blockedByMaxDose: boolean;
  matchedAllergen?: string;
  errorMessage?: string;
}

/**
 * Normaliza texto removendo acentos e convertendo para minúsculas para comparação segura.
 */
function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Valida se uma prescrição médica é segura para o paciente (Item 2.5):
 * 1) Medicamento ao qual o paciente é alérgico -> prescrição bloqueada.
 * 2) Dose acima da dose máxima cadastrada -> prescrição bloqueada.
 */
export function validatePrescription(params: {
  medication: Medication;
  doseMg: number;
  patientAllergies: string[];
}): PrescriptionValidationResult {
  const { medication, doseMg, patientAllergies } = params;

  if (doseMg <= 0 || Number.isNaN(doseMg)) {
    return {
      valid: false,
      blockedByAllergy: false,
      blockedByMaxDose: false,
      errorMessage: 'A dose prescrita deve ser um valor numérico maior que zero.',
    };
  }

  // 1. Verificar alergia conhecida do paciente (compara nome comercial e princípio ativo)
  const medNameNorm = normalizeText(medication.name);
  const activePrincipleNorm = normalizeText(medication.active_principle);

  for (const rawAllergy of patientAllergies) {
    const allergyNorm = normalizeText(rawAllergy);
    if (!allergyNorm) continue;

    if (
      medNameNorm.includes(allergyNorm) ||
      activePrincipleNorm.includes(allergyNorm) ||
      allergyNorm.includes(activePrincipleNorm)
    ) {
      return {
        valid: false,
        blockedByAllergy: true,
        blockedByMaxDose: false,
        matchedAllergen: rawAllergy,
        errorMessage: `PRESCRIÇÃO BLOQUEADA POR ALERGIA: O paciente possui alergia registrada a "${rawAllergy}" (conflito com ${medication.name} / ${medication.active_principle}).`,
      };
    }
  }

  // 2. Verificar dose máxima cadastrada
  if (doseMg > medication.max_dose_mg) {
    return {
      valid: false,
      blockedByAllergy: false,
      blockedByMaxDose: true,
      errorMessage: `PRESCRIÇÃO BLOQUEADA POR DOSE EXCEDIDA: A dose informada (${doseMg} ${medication.unit}) ultrapassa a dose máxima segura cadastrada para ${medication.name} (${medication.max_dose_mg} ${medication.unit}).`,
    };
  }

  return {
    valid: true,
    blockedByAllergy: false,
    blockedByMaxDose: false,
  };
}
