// ============================================================================
// Camada Domain: Schemas de Validação com Zod (Item 3.8)
// Limites coerentes para sinais vitais e mensagens de erro claras ao lado de cada campo.
// ============================================================================

import { z } from 'zod';

export const patientSchema = z.object({
  full_name: z
    .string()
    .min(3, 'O nome completo deve ter pelo menos 3 caracteres.')
    .max(120, 'Nome muito longo (máx. 120 caracteres).'),
  birth_date: z
    .string()
    .min(1, 'A data de nascimento é obrigatória.')
    .refine((val) => {
      const date = new Date(val);
      return !Number.isNaN(date.getTime()) && date <= new Date();
    }, 'Informe uma data de nascimento válida (não pode ser no futuro).'),
  sex: z.enum(['M', 'F', 'Outro'], {
    errorMap: () => ({ message: 'Selecione o sexo biológico/identidade.' }),
  }),
  phone: z
    .string()
    .min(8, 'Informe um telefone válido com DDD (mín. 8 dígitos).')
    .max(25, 'Telefone inválido.'),
  allergies_text: z.string().optional(),
});

export type PatientFormValues = z.infer<typeof patientSchema>;

export const triageSchema = z
  .object({
    systolic_bp: z.coerce
      .number({ invalid_type_error: 'Informe a PA sistólica (mmHg).' })
      .int('Use número inteiro.')
      .min(30, 'PA sistólica mínima coerente: 30 mmHg.')
      .max(300, 'PA sistólica máxima coerente: 300 mmHg.'),
    diastolic_bp: z.coerce
      .number({ invalid_type_error: 'Informe a PA diastólica (mmHg).' })
      .int('Use número inteiro.')
      .min(20, 'PA diastólica mínima coerente: 20 mmHg.')
      .max(200, 'PA diastólica máxima coerente: 200 mmHg.'),
    heart_rate: z.coerce
      .number({ invalid_type_error: 'Informe a frequência cardíaca (bpm).' })
      .int('Use número inteiro.')
      .min(20, 'Frequência cardíaca mínima coerente: 20 bpm.')
      .max(250, 'Frequência cardíaca máxima coerente: 250 bpm.'),
    temperature: z.coerce
      .number({ invalid_type_error: 'Informe a temperatura (°C).' })
      .min(30, 'Temperatura mínima coerente: 30,0 °C.')
      .max(45, 'Temperatura máxima coerente: 45,0 °C.'),
    oxygen_saturation: z.coerce
      .number({ invalid_type_error: 'Informe a saturação de O₂ (%).' })
      .int('Use número inteiro.')
      .min(0, 'A saturação não pode ser menor que 0%.')
      .max(100, 'A saturação não pode ultrapassar 100%.'),
    pain_level: z.coerce
      .number({ invalid_type_error: 'Informe a escala de dor (0 a 10).' })
      .int('Use número inteiro de 0 a 10.')
      .min(0, 'A dor mínima é 0 (sem dor).')
      .max(10, 'A dor máxima na escala é 10.'),
    consciousness: z.enum(['alerta', 'confuso', 'inconsciente'], {
      errorMap: () => ({ message: 'Selecione o nível de consciência.' }),
    }),
    chief_complaint: z
      .string()
      .min(3, 'Descreva a queixa principal (mínimo 3 caracteres).')
      .max(500, 'Queixa muito longa (máximo 500 caracteres).'),
    final_color: z.enum(['vermelho', 'laranja', 'amarelo', 'verde', 'azul']),
    suggested_color: z.enum(['vermelho', 'laranja', 'amarelo', 'verde', 'azul']),
    justification: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.final_color !== data.suggested_color) {
      if (!data.justification || data.justification.trim().length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['justification'],
          message:
            'Justificativa clínica obrigatória (mín. 5 caracteres) ao alterar a cor sugerida pelo protocolo.',
        });
      }
    }
  });

export type TriageFormValues = z.infer<typeof triageSchema>;

export const prescriptionSchema = z.object({
  medication_id: z.string().min(1, 'Selecione um medicamento do catálogo.'),
  dose_mg: z.coerce
    .number({ invalid_type_error: 'Informe a dose em números.' })
    .positive('A dose deve ser maior que zero.'),
  route: z.string().min(1, 'Selecione a via de administração.'),
  frequency: z.string().min(1, 'Selecione a frequência/posologia.'),
  notes: z.string().optional(),
});

export type PrescriptionFormValues = z.infer<typeof prescriptionSchema>;
