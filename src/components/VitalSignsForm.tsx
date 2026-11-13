// ============================================================================
// Componente Reutilizável Obrigatório 4: VitalSignsForm (Item 2.3, 3.2, 3.8, 3.9)
// Formulário de sinais vitais com React Hook Form + Zod, cálculo automático da
// cor sugerida pelo protocolo em tempo real e justificativa obrigatória ao alterar.
// ============================================================================

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Thermometer,
  Wind,
} from 'lucide-react';
import {
  classifyRisk,
  RISK_METADATA,
  RiskColor,
  TriageFormValues,
  triageSchema,
} from '../domain';
import { RiskBadge } from './RiskBadge';

interface VitalSignsFormProps {
  initialValues?: Partial<TriageFormValues>;
  isReclassification?: boolean;
  isSubmitting?: boolean;
  onSubmitTriage: (values: TriageFormValues) => Promise<void> | void;
  onCancel?: () => void;
}

const ALL_COLORS: RiskColor[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul'];

export const VitalSignsForm: React.FC<VitalSignsFormProps> = ({
  initialValues,
  isReclassification = false,
  isSubmitting = false,
  onSubmitTriage,
  onCancel,
}) => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TriageFormValues>({
    resolver: zodResolver(triageSchema),
    defaultValues: {
      systolic_bp: initialValues?.systolic_bp ?? 120,
      diastolic_bp: initialValues?.diastolic_bp ?? 80,
      heart_rate: initialValues?.heart_rate ?? 80,
      temperature: initialValues?.temperature ?? 36.8,
      oxygen_saturation: initialValues?.oxygen_saturation ?? 98,
      pain_level: initialValues?.pain_level ?? 0,
      consciousness: initialValues?.consciousness ?? 'alerta',
      chief_complaint: initialValues?.chief_complaint ?? '',
      suggested_color: initialValues?.suggested_color ?? 'azul',
      final_color: initialValues?.final_color ?? 'azul',
      justification: initialValues?.justification ?? '',
    },
  });

  const systolic_bp = Number(watch('systolic_bp'));
  const diastolic_bp = Number(watch('diastolic_bp'));
  const heart_rate = Number(watch('heart_rate'));
  const temperature = Number(watch('temperature'));
  const oxygen_saturation = Number(watch('oxygen_saturation'));
  const pain_level = Number(watch('pain_level'));
  const consciousness = watch('consciousness');
  const final_color = watch('final_color');
  const suggested_color = watch('suggested_color');

  const [overrideActive, setOverrideActive] = React.useState(false);

  const calculation = classifyRisk({
    systolic_bp: Number.isNaN(systolic_bp) ? 120 : systolic_bp,
    diastolic_bp: Number.isNaN(diastolic_bp) ? 80 : diastolic_bp,
    heart_rate: Number.isNaN(heart_rate) ? 80 : heart_rate,
    temperature: Number.isNaN(temperature) ? 36.5 : temperature,
    oxygen_saturation: Number.isNaN(oxygen_saturation) ? 98 : oxygen_saturation,
    pain_level: Number.isNaN(pain_level) ? 0 : pain_level,
    consciousness: consciousness || 'alerta',
  });

  useEffect(() => {
    setValue('suggested_color', calculation.suggestedColor, { shouldValidate: true });
    if (!overrideActive) {
      setValue('final_color', calculation.suggestedColor, { shouldValidate: true });
    }
  }, [calculation.suggestedColor, overrideActive, setValue]);

  const isOverridden = final_color !== suggested_color;

  // Atalhos rápidos de preenchimento para facilitar testes/validação (Item 4 e 5)
  const applyPreset = (preset: 'vermelho' | 'laranja' | 'amarelo' | 'verde' | 'azul') => {
    setOverrideActive(false);
    if (preset === 'vermelho') {
      setValue('systolic_bp', 74);
      setValue('diastolic_bp', 48);
      setValue('heart_rate', 148);
      setValue('temperature', 36.4);
      setValue('oxygen_saturation', 87);
      setValue('pain_level', 9);
      setValue('consciousness', 'inconsciente');
      setValue('chief_complaint', 'Insuficiência respiratória aguda, cianose e hipotensão severa.');
    } else if (preset === 'laranja') {
      setValue('systolic_bp', 135);
      setValue('diastolic_bp', 88);
      setValue('heart_rate', 128);
      setValue('temperature', 40.2);
      setValue('oxygen_saturation', 92);
      setValue('pain_level', 9);
      setValue('consciousness', 'confuso');
      setValue('chief_complaint', 'Febre de 40,2°C, dor lombar 9/10 e confusão mental aguda.');
    } else if (preset === 'amarelo') {
      setValue('systolic_bp', 185);
      setValue('diastolic_bp', 110);
      setValue('heart_rate', 95);
      setValue('temperature', 39.1);
      setValue('oxygen_saturation', 96);
      setValue('pain_level', 6);
      setValue('consciousness', 'alerta');
      setValue('chief_complaint', 'Febre alta (39,1°C), cefaleia moderada e pico pressórico.');
    } else if (preset === 'verde') {
      setValue('systolic_bp', 122);
      setValue('diastolic_bp', 78);
      setValue('heart_rate', 82);
      setValue('temperature', 38.0);
      setValue('oxygen_saturation', 98);
      setValue('pain_level', 3);
      setValue('consciousness', 'alerta');
      setValue('chief_complaint', 'Dor de garganta leve e estado febril (38,0°C) há 24h.');
    } else {
      setValue('systolic_bp', 120);
      setValue('diastolic_bp', 80);
      setValue('heart_rate', 74);
      setValue('temperature', 36.5);
      setValue('oxygen_saturation', 99);
      setValue('pain_level', 0);
      setValue('consciousness', 'alerta');
      setValue('chief_complaint', 'Solicitação de avaliação clínica de rotina sem dor aguda.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        await onSubmitTriage(data);
      })}
      className="space-y-5"
      noValidate
    >
      {/* Barra de Atalhos Clínicos Rápidos (Item 4 - Diferencial Criativo) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Simulador Rápido de Sinais Vitais:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ALL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => applyPreset(c)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold capitalize text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Caso {RISK_METADATA[c].label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Sinais Vitais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Pressão Arterial Sistólica */}
        <div>
          <label
            htmlFor="systolic_bp"
            className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
          >
            <Activity className="h-3.5 w-3.5 text-blue-600" />
            PA Sistólica (mmHg)
          </label>
          <input
            id="systolic_bp"
            type="number"
            {...register('systolic_bp')}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {errors.systolic_bp && (
            <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
              {errors.systolic_bp.message}
            </p>
          )}
        </div>

        {/* Pressão Arterial Diastólica */}
        <div>
          <label
            htmlFor="diastolic_bp"
            className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
          >
            <Activity className="h-3.5 w-3.5 text-blue-600" />
            PA Diastólica (mmHg)
          </label>
          <input
            id="diastolic_bp"
            type="number"
            {...register('diastolic_bp')}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {errors.diastolic_bp && (
            <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
              {errors.diastolic_bp.message}
            </p>
          )}
        </div>

        {/* Frequência Cardíaca */}
        <div>
          <label
            htmlFor="heart_rate"
            className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
          >
            <HeartPulse className="h-3.5 w-3.5 text-rose-600" />
            Frequência Cardíaca (bpm)
          </label>
          <input
            id="heart_rate"
            type="number"
            {...register('heart_rate')}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {errors.heart_rate && (
            <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
              {errors.heart_rate.message}
            </p>
          )}
        </div>

        {/* Temperatura */}
        <div>
          <label
            htmlFor="temperature"
            className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
          >
            <Thermometer className="h-3.5 w-3.5 text-amber-600" />
            Temperatura (°C)
          </label>
          <input
            id="temperature"
            type="number"
            step="0.1"
            {...register('temperature')}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {errors.temperature && (
            <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
              {errors.temperature.message}
            </p>
          )}
        </div>

        {/* Saturação de O2 */}
        <div>
          <label
            htmlFor="oxygen_saturation"
            className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
          >
            <Wind className="h-3.5 w-3.5 text-cyan-600" />
            Saturação O₂ (0 a 100%)
          </label>
          <input
            id="oxygen_saturation"
            type="number"
            {...register('oxygen_saturation')}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {errors.oxygen_saturation && (
            <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
              {errors.oxygen_saturation.message}
            </p>
          )}
        </div>

        {/* Nível de Consciência */}
        <div>
          <label
            htmlFor="consciousness"
            className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
          >
            Nível de Consciência
          </label>
          <select
            id="consciousness"
            {...register('consciousness')}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="alerta">Alerta / Orientado</option>
            <option value="confuso">Confuso / Sonolento (Laranja)</option>
            <option value="inconsciente">Inconsciente / Coma (Vermelho)</option>
          </select>
          {errors.consciousness && (
            <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
              {errors.consciousness.message}
            </p>
          )}
        </div>
      </div>

      {/* Escala de Dor (0 a 10) */}
      <div>
        <div className="flex items-center justify-between">
          <label
            htmlFor="pain_level"
            className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
          >
            Escala Visual de Dor (0 a 10):{' '}
            <span className="ml-1 rounded bg-slate-900 px-2 py-0.5 font-mono text-sm font-black text-white dark:bg-slate-700">
              {Number.isNaN(pain_level) ? 0 : pain_level}/10
            </span>
          </label>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            0 = Sem dor | 1-4 = Leve | 5-7 = Moderada | 8-10 = Intensa
          </span>
        </div>
        <input
          id="pain_level"
          type="range"
          min={0}
          max={10}
          step={1}
          {...register('pain_level')}
          className="mt-2 h-2.5 w-full cursor-pointer appearance-none rounded-lg bg-gradient-to-r from-emerald-500 via-amber-400 to-red-600"
        />
        {errors.pain_level && (
          <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
            {errors.pain_level.message}
          </p>
        )}
      </div>

      {/* Queixa Principal */}
      <div>
        <label
          htmlFor="chief_complaint"
          className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
        >
          Queixa Principal e História Breve *
        </label>
        <textarea
          id="chief_complaint"
          rows={2}
          placeholder="Descreva os sintomas principais, tempo de início e observações da triagem..."
          {...register('chief_complaint')}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        {errors.chief_complaint && (
          <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
            {errors.chief_complaint.message}
          </p>
        )}
      </div>

      {/* Painel de Sugestão Automática do Protocolo (Item 2.3 e 2.9a) */}
      <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Classificação Sugerida Automaticamente pelo Protocolo
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RiskBadge color={calculation.suggestedColor} size="lg" showMaxWait />
            </div>
            <ul className="mt-2 list-disc pl-5 text-xs text-slate-600 dark:text-slate-300">
              {calculation.triggeredReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col items-start sm:items-end">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
              Deseja alterar a cor manualmente?
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ALL_COLORS.map((color) => {
                const isSelected = final_color === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      setOverrideActive(color !== calculation.suggestedColor);
                      setValue('final_color', color, { shouldValidate: true });
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold uppercase transition ${
                      isSelected
                        ? 'border-slate-950 bg-slate-900 text-white ring-2 ring-blue-500 dark:border-white dark:bg-white dark:text-slate-950'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {RISK_METADATA[color].label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Campo de Justificativa Obrigatória se alterar a cor sugerida (Item 2.3) */}
        {isOverridden && (
          <div className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-3 dark:border-amber-600 dark:bg-amber-950/40">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Você alterou a cor sugerida ({RISK_METADATA[suggested_color].label} →{' '}
                {RISK_METADATA[final_color].label}). A justificativa clínica é obrigatória!
              </span>
            </div>
            <label htmlFor="justification" className="sr-only">
              Justificativa da alteração de cor
            </label>
            <input
              id="justification"
              type="text"
              placeholder="Informe a justificativa clínica para alterar a classificação sugerida..."
              {...register('justification')}
              className="mt-2 w-full rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none dark:border-amber-700 dark:bg-slate-900 dark:text-white"
            />
            {errors.justification && (
              <p role="alert" className="mt-1 text-xs font-bold text-red-600 dark:text-red-400">
                {errors.justification.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>
            {isSubmitting
              ? 'Salvando...'
              : isReclassification
              ? 'Confirmar Reclassificação'
              : 'Concluir Triagem e Enviar à Fila'}
          </span>
        </button>
      </div>
    </form>
  );
};
