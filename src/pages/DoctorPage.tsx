// ============================================================================
// Página 4: Atendimento Médico (Item 2.5, 3.8 e 3.10)
// - Botão "Chamar próximo" atômico (dois médicos nunca recebem o mesmo paciente)
// - Dados do paciente, alergias em destaque, triagem atual e histórico de atendimentos anteriores
// - Registro da evolução clínica (texto livre)
// - Prescrição médica (React Hook Form + Zod) bloqueando alergia e dose > dose máxima
// - Definição do destino: alta, observação, internação ou transferência
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Filter,
  History,
  Megaphone,
  Pill,
  ShieldAlert,
  Stethoscope,
  UserCheck,
} from 'lucide-react';
import {
  calculateAgeYears,
  Encounter,
  MedicalDestination,
  PrescriptionFormValues,
  prescriptionSchema,
  RISK_METADATA,
  RiskColor,
  STATUS_LABELS,
  validatePrescription,
} from '../domain';
import { QueueItem } from '../components/QueueItem';
import { RiskBadge } from '../components/RiskBadge';
import { EncounterTimeline, VitalsEvolutionChart } from '../components/WristbandModal';
import { useAuth } from '../hooks/useAuth';
import { useQueue } from '../hooks/useQueue';
import {
  fetchMedications,
  rpcCallNextPatient,
  rpcCreatePrescription,
  rpcFinishMedicalConsultation,
} from '../services/api';
import { useUIStore } from '../store/uiStore';

const ALL_COLORS: RiskColor[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul'];

export const DoctorPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const consultingRoom = useUIStore((s) => s.consultingRoom);
  const setConsultingRoom = useUIStore((s) => s.setConsultingRoom);

  const {
    allEncounters,
    filteredMedicalQueue,
    countsByColor,
    totalInMedicalQueue,
    queueColorFilter,
    setQueueColorFilter,
  } = useQueue();

  const { data: medications = [] } = useQuery({
    queryKey: ['medications'],
    queryFn: fetchMedications,
  });

  // Paciente em atendimento com o médico atual (ou selecionado dentre os em_atendimento / em_observacao)
  const inConsultationList = allEncounters.filter(
    (e) => e.status === 'em_atendimento' || e.status === 'em_observacao'
  );
  const myAssigned = inConsultationList.find((e) => e.assigned_doctor_id === user?.id);

  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const activeEncounter: Encounter | undefined =
    inConsultationList.find((e) => e.id === selectedEncounterId) ??
    myAssigned ??
    inConsultationList[0];

  const [clinicalNotes, setClinicalNotes] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [prescriptionBlockError, setPrescriptionBlockError] = useState<string | null>(null);

  useEffect(() => {
    if (activeEncounter) {
      setClinicalNotes(activeEncounter.clinical_notes ?? '');
      setPrescriptionBlockError(null);
    }
  }, [activeEncounter?.id]);

  // Histórico de atendimentos anteriores deste mesmo paciente (Item 2.5)
  const previousEncounters = activeEncounter
    ? allEncounters.filter(
        (e) => e.patient_id === activeEncounter.patient_id && e.id !== activeEncounter.id
      )
    : [];

  // React Hook Form + Zod para Prescrição Médica (Item 3.8)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset: resetPrescriptionForm,
    formState: { errors },
  } = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      medication_id: '',
      dose_mg: 500,
      route: 'EV',
      frequency: '8/8h',
      notes: '',
    },
  });

  const selectedMedId = watch('medication_id');
  const enteredDose = Number(watch('dose_mg'));
  const selectedMedication = medications.find((m) => m.id === selectedMedId);

  useEffect(() => {
    if (selectedMedication) {
      setValue('route', selectedMedication.default_route);
      if (selectedMedication.common_frequencies[0]) {
        setValue('frequency', selectedMedication.common_frequencies[0]);
      }
    }
  }, [selectedMedication, setValue]);

  // Pré-validação em tempo real de alergia e dose máxima para alerta imediato na UI
  const liveSafetyCheck =
    selectedMedication && activeEncounter?.patient
      ? validatePrescription({
          medication: selectedMedication,
          doseMg: enteredDose,
          patientAllergies: activeEncounter.patient.allergies,
        })
      : null;

  const callNextMutation = useMutation({
    mutationFn: () => rpcCallNextPatient(consultingRoom),
    onSuccess: (calledEnc) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      queryClient.invalidateQueries({ queryKey: ['panel_calls'] });
      setSelectedEncounterId(calledEnc.id);
      setFeedback({
        type: 'success',
        text: `Senha ${calledEnc.ticket_number} chamada para ${consultingRoom}! O painel da sala de espera foi atualizado em tempo real.`,
      });
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao chamar próximo paciente.',
      });
    },
  });

  const prescribeMutation = useMutation({
    mutationFn: async (values: PrescriptionFormValues) => {
      if (!activeEncounter) throw new Error('Nenhum atendimento selecionado.');
      setPrescriptionBlockError(null);
      return rpcCreatePrescription({
        encounter_id: activeEncounter.id,
        medication_id: values.medication_id,
        dose_mg: values.dose_mg,
        route: values.route,
        frequency: values.frequency,
        notes: values.notes,
      });
    },
    onSuccess: (presc) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      resetPrescriptionForm({
        medication_id: '',
        dose_mg: 500,
        route: 'EV',
        frequency: '8/8h',
        notes: '',
      });
      setFeedback({
        type: 'success',
        text: `Prescrição registrada com segurança: ${presc.medication_name} (${presc.dose_mg} mg - ${presc.route} - ${presc.frequency}).`,
      });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Prescrição bloqueada.';
      setPrescriptionBlockError(msg);
    },
  });

  const finishMutation = useMutation({
    mutationFn: (destination: MedicalDestination) => {
      if (!activeEncounter) throw new Error('Nenhum atendimento selecionado.');
      return rpcFinishMedicalConsultation({
        encounter_id: activeEncounter.id,
        clinical_notes: clinicalNotes,
        destination,
      });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      queryClient.invalidateQueries({ queryKey: ['beds'] });
      setFeedback({
        type: 'success',
        text: `Desfecho registrado para ${updated.ticket_number}: ${updated.destination?.toUpperCase()} (Nova situação: ${STATUS_LABELS[updated.status]}).`,
      });
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao finalizar atendimento.',
      });
    },
  });

  const handleConfirmDestination = (destination: MedicalDestination, label: string) => {
    if (!activeEncounter) return;
    if (
      window.confirm(
        `Confirmar desfecho médico "${label}" para o paciente ${activeEncounter.patient?.full_name} (${activeEncounter.ticket_number})?`
      )
    ) {
      finishMutation.mutate(destination);
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior do Médico: Seleção de Consultório + Botão Chamar Próximo (Item 2.5) */}
      <div className="flex flex-col gap-4 rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-sm dark:border-indigo-900/60 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
            <Stethoscope className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">
              Estação Médica • {user?.full_name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operação atômica garantida: dois médicos clicando ao mesmo tempo nunca recebem o mesmo paciente
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="consulting-room-select" className="sr-only">
              Consultório
            </label>
            <select
              id="consulting-room-select"
              value={consultingRoom}
              onChange={(e) => setConsultingRoom(e.target.value)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="Consultório 01">Consultório 01</option>
              <option value="Consultório 02">Consultório 02</option>
              <option value="Consultório 03">Consultório 03</option>
              <option value="Sala de Emergência">Sala de Emergência</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => callNextMutation.mutate()}
            disabled={callNextMutation.isPending || totalInMedicalQueue === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <Megaphone className="h-4 w-4" />
            <span>
              {callNextMutation.isPending
                ? 'Chamando...'
                : `Chamar Próximo (${totalInMedicalQueue} na fila)`}
            </span>
          </button>
        </div>
      </div>

      {/* Feedback de Ação */}
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
              <AlertTriangle className="h-5 w-5 text-red-600" />
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

      {/* Seletor de Pacientes Atualmente em Atendimento / Observação */}
      {inConsultationList.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 p-2.5 dark:border-slate-800 dark:bg-slate-900">
          <span className="px-2 text-xs font-bold uppercase text-slate-500">
            Em Atendimento / Observação ({inConsultationList.length}):
          </span>
          {inConsultationList.map((enc) => (
            <button
              key={enc.id}
              type="button"
              onClick={() => setSelectedEncounterId(enc.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeEncounter?.id === enc.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <span className="font-mono">{enc.ticket_number}</span>
              <span>{enc.patient?.full_name}</span>
              <span className="opacity-75">({STATUS_LABELS[enc.status]})</span>
            </button>
          ))}
        </div>
      )}

      {/* Painel Principal de Atendimento Médico (Item 2.5) */}
      {activeEncounter ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Coluna Esquerda (7 cols): Prontuário, Triagem Atual, Evolução e Destino */}
          <div className="lg:col-span-7 space-y-6">
            {/* Cabeçalho do Paciente + Alergias em Destaque */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="rounded-lg bg-indigo-600 px-3 py-1 font-mono text-base font-black text-white">
                      {activeEncounter.ticket_number}
                    </span>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">
                      {activeEncounter.patient?.full_name}
                    </h2>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {STATUS_LABELS[activeEncounter.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Nascimento: {activeEncounter.patient?.birth_date} (
                    {activeEncounter.patient
                      ? calculateAgeYears(activeEncounter.patient.birth_date)
                      : 0}{' '}
                    anos) • Sexo: {activeEncounter.patient?.sex} • Tel:{' '}
                    {activeEncounter.patient?.phone} • Local:{' '}
                    {activeEncounter.consulting_room || consultingRoom}
                  </p>
                </div>

                <RiskBadge color={activeEncounter.current_risk} size="lg" />
              </div>

              {/* Alerta de Alergias Conhecidas */}
              {activeEncounter.patient && activeEncounter.patient.allergies.length > 0 ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl border-2 border-red-500 bg-red-50 p-3.5 text-red-900 dark:bg-red-950/60 dark:text-red-100">
                  <AlertOctagon className="h-6 w-6 shrink-0 text-red-600" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-red-700 dark:text-red-300">
                      ALERTA CRÍTICO DE ALERGIA MEDICAMENTOSA
                    </p>
                    <p className="text-sm font-bold">
                      Paciente alérgico a: {activeEncounter.patient.allergies.join(', ')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Nenhuma alergia medicamentosa conhecida registrada no cadastro.
                </div>
              )}

              {/* Queixa e Sinais Vitais da Triagem Atual */}
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                  <span className="text-xs font-bold uppercase text-slate-500">
                    Queixa Principal na Triagem:
                  </span>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {activeEncounter.chief_complaint || 'Sem queixa detalhada.'}
                  </p>
                </div>

                {activeEncounter.triages && activeEncounter.triages.length > 0 && (
                  <VitalsEvolutionChart triages={activeEncounter.triages} />
                )}
              </div>

              {/* Evolução Médica (Texto Livre) e Definição do Destino (Item 2.5) */}
              <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
                <label
                  htmlFor="clinical_notes"
                  className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                >
                  Evolução Clínica e Anamnese (Texto Livre) *
                </label>
                <textarea
                  id="clinical_notes"
                  rows={4}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Registre o exame físico, hipóteses diagnósticas e conduta médica..."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />

                <div className="mt-4">
                  <span className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                    Definir Destino do Paciente (Item 2.5 e 2.9c):
                  </span>
                  <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <button
                      type="button"
                      disabled={finishMutation.isPending}
                      onClick={() => handleConfirmDestination('alta', 'Alta Médica')}
                      className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ✓ Dar Alta Médica
                    </button>

                    {activeEncounter.status === 'em_atendimento' && (
                      <>
                        <button
                          type="button"
                          disabled={finishMutation.isPending}
                          onClick={() =>
                            handleConfirmDestination('observacao', 'Observação (Solicitar Leito)')
                          }
                          className="rounded-xl bg-amber-500 px-3 py-2.5 text-xs font-black text-slate-950 shadow-sm hover:bg-amber-400 disabled:opacity-50"
                        >
                          Encaminhar p/ Observação
                        </button>

                        <button
                          type="button"
                          disabled={finishMutation.isPending}
                          onClick={() =>
                            handleConfirmDestination('internacao', 'Internação (Solicitar Leito)')
                          }
                          className="rounded-xl bg-purple-600 px-3 py-2.5 text-xs font-black text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                        >
                          Solicitar Internação
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      disabled={finishMutation.isPending}
                      onClick={() =>
                        handleConfirmDestination('transferencia', 'Transferência Externa')
                      }
                      className="rounded-xl bg-slate-700 px-3 py-2.5 text-xs font-black text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                    >
                      Transferir Paciente
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Histórico de Atendimentos Anteriores e Linha do Tempo (Item 2.5) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white">
                    Linha do Tempo e Histórico de Atendimentos Anteriores ({previousEncounters.length})
                  </h3>
                </div>
                {activeEncounter.patient && (
                  <Link
                    to={`/pacientes/${activeEncounter.patient.id}`}
                    className="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Abrir Prontuário Completo →
                  </Link>
                )}
              </div>

              <div className="mt-4 space-y-4">
                <EncounterTimeline events={activeEncounter.events} />

                {previousEncounters.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      Passagens Anteriores pelo Pronto-Socorro:
                    </p>
                    <ul className="mt-2 space-y-2">
                      {previousEncounters.map((prev) => (
                        <li
                          key={prev.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-800"
                        >
                          <div>
                            <span className="font-mono font-bold">{prev.ticket_number}</span> •{' '}
                            <span>{new Date(prev.arrived_at).toLocaleDateString('pt-BR')}</span> •{' '}
                            <span className="font-semibold">{prev.chief_complaint}</span>
                          </div>
                          <RiskBadge color={prev.current_risk} size="sm" />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Coluna Direita (5 cols): Prescrição Médica a partir do Catálogo (Item 2.5 e 3.8) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white">
                  <Pill className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    Prescrição Médica Segura
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Bloqueio automático de alergias e doses acima do limite
                  </p>
                </div>
              </div>

              {/* Alerta de Bloqueio de Prescrição */}
              {(prescriptionBlockError || (liveSafetyCheck && !liveSafetyCheck.valid)) && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2.5 rounded-xl border-2 border-red-600 bg-red-50 p-3.5 text-xs font-bold text-red-900 dark:bg-red-950/80 dark:text-red-100"
                >
                  <ShieldAlert className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <p className="uppercase font-black text-red-700 dark:text-red-300">
                      Prescrição Bloqueada pelo Sistema de Segurança
                    </p>
                    <p className="mt-0.5">
                      {prescriptionBlockError || liveSafetyCheck?.errorMessage}
                    </p>
                  </div>
                </div>
              )}

              <form
                onSubmit={handleSubmit((vals) => prescribeMutation.mutate(vals))}
                className="mt-4 space-y-4"
                noValidate
              >
                <div>
                  <label
                    htmlFor="medication_id"
                    className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                  >
                    Medicamento do Catálogo *
                  </label>
                  <select
                    id="medication_id"
                    {...register('medication_id')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Selecione um medicamento...</option>
                    {medications.map((med) => (
                      <option key={med.id} value={med.id}>
                        {med.name} ({med.active_principle}) — Dose máx: {med.max_dose_mg}
                        {med.unit}
                      </option>
                    ))}
                  </select>
                  {errors.medication_id && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
                      {errors.medication_id.message}
                    </p>
                  )}
                </div>

                {selectedMedication && (
                  <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Princípio ativo: <strong>{selectedMedication.active_principle}</strong> • Dose
                    máxima segura cadastrada:{' '}
                    <strong className="font-mono text-rose-600 dark:text-rose-400">
                      {selectedMedication.max_dose_mg} {selectedMedication.unit}
                    </strong>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="dose_mg"
                      className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                    >
                      Dose (mg) *
                    </label>
                    <input
                      id="dose_mg"
                      type="number"
                      step="any"
                      {...register('dose_mg')}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-bold text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    {errors.dose_mg && (
                      <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
                        {errors.dose_mg.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="route"
                      className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                    >
                      Via *
                    </label>
                    <select
                      id="route"
                      {...register('route')}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="EV">Endovenosa (EV)</option>
                      <option value="VO">Via Oral (VO)</option>
                      <option value="IM">Intramuscular (IM)</option>
                      <option value="SC">Subcutânea (SC)</option>
                      <option value="Inalatória">Inalatória</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="frequency"
                      className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                    >
                      Frequência *
                    </label>
                    <select
                      id="frequency"
                      {...register('frequency')}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="Dose única">Dose única (Agora)</option>
                      <option value="6/6h">De 6 em 6 horas</option>
                      <option value="8/8h">De 8 em 8 horas</option>
                      <option value="12/12h">De 12 em 12 horas</option>
                      <option value="ACM">Se necessário (ACM)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="notes"
                    className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                  >
                    Diluição / Observações de Administração
                  </label>
                  <input
                    id="notes"
                    type="text"
                    placeholder="Ex: Diluir em 100mL SF 0,9%, correr lento..."
                    {...register('notes')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={prescribeMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                >
                  <Pill className="h-4 w-4" />
                  <span>
                    {prescribeMutation.isPending
                      ? 'Validando e Registrando...'
                      : 'Adicionar Item à Prescrição'}
                  </span>
                </button>
              </form>

              {/* Lista de Itens Prescritos neste Atendimento */}
              <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Prescrições Registradas neste Atendimento (
                  {activeEncounter.prescriptions?.length ?? 0})
                </h3>
                <div className="mt-3 space-y-2">
                  {!activeEncounter.prescriptions ||
                  activeEncounter.prescriptions.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Nenhum medicamento prescrito ainda neste atendimento.
                    </p>
                  ) : (
                    activeEncounter.prescriptions.map((pr) => (
                      <div
                        key={pr.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {pr.medication_name}
                          </span>
                          <span className="rounded bg-indigo-100 px-2 py-0.5 font-mono text-xs font-bold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
                            {pr.dose_mg} mg • {pr.route} • {pr.frequency}
                          </span>
                        </div>
                        {pr.notes && (
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            Obs: {pr.notes}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-slate-400">
                          Prescrito por {pr.doctor_name} às{' '}
                          {new Date(pr.created_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <UserCheck className="mx-auto h-12 w-12 text-indigo-500" />
          <h2 className="mt-3 text-lg font-black text-slate-900 dark:text-white">
            Nenhum paciente em atendimento no seu consultório no momento
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Clique no botão <strong>&ldquo;Chamar Próximo&rdquo;</strong> no topo para chamar
            atomicamente o paciente mais grave da fila abaixo.
          </p>
        </div>
      )}

      {/* Fila de Espera em Tempo Real Visível na Tela do Médico (Item 2.4 e 2.5) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              Fila de Espera Triada em Tempo Real ({totalInMedicalQueue})
            </h2>
            <p className="text-xs text-slate-500">
              Ordenada pela prioridade clínica (Vermelho → Laranja → Amarelo → Verde → Azul)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-4 w-4 text-slate-400" />
            <button
              type="button"
              onClick={() => setQueueColorFilter('todas')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                queueColorFilter === 'todas'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Todas ({totalInMedicalQueue})
            </button>
            {ALL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setQueueColorFilter(c)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${
                  queueColorFilter === c
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {RISK_METADATA[c].label}: {countsByColor[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {filteredMedicalQueue.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Não há pacientes aguardando na fila para o filtro selecionado.
            </p>
          ) : (
            filteredMedicalQueue.map((enc, idx) => (
              <QueueItem key={enc.id} encounter={enc} position={idx + 1} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
