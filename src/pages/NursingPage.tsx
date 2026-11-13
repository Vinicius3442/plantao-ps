// ============================================================================
// Página 3: Triagem e Fila de Atendimento - Enfermagem (Item 2.3 e 2.4)
// - Lista de pacientes aguardando triagem por ordem de chegada
// - Formulário de sinais vitais com sugestão automática da cor e justificativa
// - Fila de atendimento em tempo real ordenada por prioridade (Item 2.9b)
// - Reclassificação de paciente já na fila mantendo histórico de todas as classificações
// ============================================================================

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Filter,
  HeartPulse,
  Users,
} from 'lucide-react';
import {
  calculateAgeYears,
  Encounter,
  RISK_METADATA,
  RiskColor,
  TriageFormValues,
} from '../domain';
import { QueueItem } from '../components/QueueItem';
import { RiskBadge } from '../components/RiskBadge';
import { VitalSignsForm } from '../components/VitalSignsForm';
import { VitalsEvolutionChart, WristbandModal } from '../components/WristbandModal';
import { useQueue } from '../hooks/useQueue';
import { rpcRecordTriage } from '../services/api';

const ALL_COLORS: RiskColor[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul'];

export const NursingPage: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    waitingTriageQueue,
    filteredMedicalQueue,
    countsByColor,
    totalInMedicalQueue,
    queueColorFilter,
    setQueueColorFilter,
    isLoading,
  } = useQueue();

  const [selectedEncounter, setSelectedEncounter] = useState<Encounter | null>(null);
  const [wristbandEncounter, setWristbandEncounter] = useState<Encounter | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const triageMutation = useMutation({
    mutationFn: (values: TriageFormValues) => {
      if (!selectedEncounter) throw new Error('Selecione um paciente para triar.');
      return rpcRecordTriage({
        encounter_id: selectedEncounter.id,
        systolic_bp: values.systolic_bp,
        diastolic_bp: values.diastolic_bp,
        heart_rate: values.heart_rate,
        temperature: values.temperature,
        oxygen_saturation: values.oxygen_saturation,
        pain_level: values.pain_level,
        consciousness: values.consciousness,
        chief_complaint: values.chief_complaint,
        final_color: values.final_color,
        justification: values.justification,
      });
    },
    onSuccess: (updatedEnc) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      setFeedback({
        type: 'success',
        text: `Triagem registrada para ${updatedEnc.ticket_number}! Classificação final: ${updatedEnc.current_risk?.toUpperCase()}. A fila foi reordenada em tempo real.`,
      });
      setSelectedEncounter(null);
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao registrar triagem.',
      });
    },
  });

  const activeTriageTarget = selectedEncounter ?? waitingTriageQueue[0] ?? null;
  const latestTriage = activeTriageTarget?.triages?.[0];
  const isReclassification = activeTriageTarget?.status === 'aguardando_medico';

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-xl border p-4 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Seção Superior: Aguardando Triagem (Ordem de Chegada) + Formulário de Sinais Vitais */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Lista de Pacientes Aguardando Triagem por Ordem de Chegada (Item 2.3) */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-teal-600" />
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    Aguardando Triagem ({waitingTriageQueue.length})
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ordenados por ordem de chegada na recepção
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {isLoading ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Carregando fila de triagem...
                </p>
              ) : waitingTriageQueue.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
                  <ClipboardCheck className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nenhum paciente aguardando triagem inicial!
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Você também pode clicar em &ldquo;Reclassificar&rdquo; em qualquer paciente abaixo na fila médica.
                  </p>
                </div>
              ) : (
                waitingTriageQueue.map((enc, idx) => {
                  const isSelected = activeTriageTarget?.id === enc.id;
                  const age = enc.patient ? calculateAgeYears(enc.patient.birth_date) : null;

                  return (
                    <button
                      key={enc.id}
                      type="button"
                      onClick={() => setSelectedEncounter(enc)}
                      className={`w-full rounded-xl border p-3.5 text-left transition ${
                        isSelected
                          ? 'border-2 border-teal-600 bg-teal-50/70 dark:border-teal-500 dark:bg-teal-950/40'
                          : 'border-slate-200 bg-white hover:border-teal-300 dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-black text-white">
                            {idx + 1}º • {enc.ticket_number}
                          </span>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {enc.patient?.full_name}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-slate-500">
                          {new Date(enc.arrived_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {age} anos • Sexo: {enc.patient?.sex}
                        </span>
                        <span className="font-bold text-teal-700 dark:text-teal-400">
                          Selecionar para Triar →
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Formulário de Sinais Vitais e Classificação de Risco (Item 2.3) */}
        <div className="lg:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {activeTriageTarget ? (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white">
                      <HeartPulse className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-blue-600 px-2.5 py-0.5 font-mono text-sm font-black text-white">
                          {activeTriageTarget.ticket_number}
                        </span>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">
                          {activeTriageTarget.patient?.full_name}
                        </h2>
                        {isReclassification && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                            RECLASSIFICAÇÃO DE PACIENTE NA FILA
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Nasc: {activeTriageTarget.patient?.birth_date} (
                        {activeTriageTarget.patient
                          ? calculateAgeYears(activeTriageTarget.patient.birth_date)
                          : 0}{' '}
                        anos) • Alergias:{' '}
                        {activeTriageTarget.patient?.allergies.length
                          ? activeTriageTarget.patient.allergies.join(', ')
                          : 'Nenhuma relatada'}
                      </p>
                    </div>
                  </div>

                  {activeTriageTarget.current_risk && (
                    <RiskBadge color={activeTriageTarget.current_risk} />
                  )}
                </div>

                <VitalSignsForm
                  key={activeTriageTarget.id}
                  isReclassification={isReclassification}
                  isSubmitting={triageMutation.isPending}
                  initialValues={
                    latestTriage
                      ? {
                          systolic_bp: latestTriage.systolic_bp,
                          diastolic_bp: latestTriage.diastolic_bp,
                          heart_rate: latestTriage.heart_rate,
                          temperature: latestTriage.temperature,
                          oxygen_saturation: latestTriage.oxygen_saturation,
                          pain_level: latestTriage.pain_level,
                          consciousness: latestTriage.consciousness,
                          chief_complaint: latestTriage.chief_complaint,
                        }
                      : undefined
                  }
                  onSubmitTriage={async (values) => {
                    if (!selectedEncounter) {
                      setSelectedEncounter(activeTriageTarget);
                    }
                    await rpcRecordTriage({
                      encounter_id: activeTriageTarget.id,
                      systolic_bp: values.systolic_bp,
                      diastolic_bp: values.diastolic_bp,
                      heart_rate: values.heart_rate,
                      temperature: values.temperature,
                      oxygen_saturation: values.oxygen_saturation,
                      pain_level: values.pain_level,
                      consciousness: values.consciousness,
                      chief_complaint: values.chief_complaint,
                      final_color: values.final_color,
                      justification: values.justification,
                    });
                    queryClient.invalidateQueries({ queryKey: ['encounters'] });
                    setFeedback({
                      type: 'success',
                      text: `Triagem registrada para ${activeTriageTarget.ticket_number}! Classificação: ${values.final_color.toUpperCase()}.`,
                    });
                    setSelectedEncounter(null);
                  }}
                  onCancel={
                    selectedEncounter ? () => setSelectedEncounter(null) : undefined
                  }
                />

                {/* Histórico de classificações anteriores caso seja reclassificação (Item 2.3 e 4) */}
                {activeTriageTarget.triages && activeTriageTarget.triages.length > 0 && (
                  <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <VitalsEvolutionChart triages={activeTriageTarget.triages} />
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center">
                <HeartPulse className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-700" />
                <h3 className="mt-3 text-base font-bold text-slate-700 dark:text-slate-300">
                  Selecione um paciente para registrar os sinais vitais
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Escolha um paciente na lista &ldquo;Aguardando Triagem&rdquo; ao lado ou clique em
                  &ldquo;Reclassificar&rdquo; em qualquer paciente na fila abaixo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seção Inferior: Fila de Atendimento em Tempo Real Ordenada por Prioridade (Item 2.4) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Fila de Atendimento Médico em Tempo Real ({totalInMedicalQueue})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ordenada automaticamente: 1º Cor (Vermelho primeiro) • 2º Maior Espera • 3º Idosos (≥60a) e Crianças (&lt;12a)
              </p>
            </div>
          </div>

          {/* Filtro por Cor e Indicador da Quantidade em Cada Cor (Item 2.4) */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <button
              type="button"
              onClick={() => setQueueColorFilter('todas')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                queueColorFilter === 'todas'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Todas ({totalInMedicalQueue})
            </button>
            {ALL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setQueueColorFilter(color)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                  queueColorFilter === color
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {RISK_METADATA[color].label}:{' '}
                <strong className="font-mono">{countsByColor[color]}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {filteredMedicalQueue.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Nenhum paciente triado aguardando médico neste filtro.
            </p>
          ) : (
            filteredMedicalQueue.map((enc, idx) => (
              <QueueItem
                key={enc.id}
                encounter={enc}
                position={idx + 1}
                onReclassify={(target) => {
                  setSelectedEncounter(target);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onPrintWristband={(target) => setWristbandEncounter(target)}
              />
            ))
          )}
        </div>
      </div>

      <WristbandModal
        encounter={wristbandEncounter}
        onClose={() => setWristbandEncounter(null)}
      />
    </div>
  );
};
