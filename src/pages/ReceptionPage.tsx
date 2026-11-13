// ============================================================================
// Página 2: Recepção (Item 2.2, 3.8 e 5.9)
// - Buscar paciente cadastrado por nome ou data de nascimento
// - Cadastrar novo paciente (React Hook Form + Zod)
// - Abrir atendimento com senha sequencial do dia (ex: A007)
// - Impedir dois atendimentos ativos ao mesmo tempo para o mesmo paciente
// - Exibir lista dos atendimentos abertos no dia e a situação de cada um
// - Verificador prático do bloqueio RLS (Item 5.9)
// ============================================================================

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  PlusCircle,
  Printer,
  Search,
  ShieldAlert,
  Ticket,
  UserPlus,
  XCircle,
} from 'lucide-react';
import {
  calculateAgeYears,
  EncounterStatus,
   isTerminalStatus,
  PatientFormValues,
  patientSchema,
  STATUS_LABELS,
} from '../domain';
import { RiskBadge } from '../components/RiskBadge';
import { WristbandModal } from '../components/WristbandModal';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import {
  createPatient,
  fetchEncounters,
  fetchPatients,
  queryDirectPrescriptionsTable,
  rpcCancelEncounter,
  rpcOpenEncounter,
} from '../services/api';

export const ReceptionPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [rlsAuditResult, setRlsAuditResult] = useState<string | null>(null);
  const [wristbandEncounterId, setWristbandEncounterId] = useState<string | null>(null);

  useRealtimeTable(['patients', 'encounters'], [['patients'], ['encounters']]);

  const { data: patients = [], isLoading: loadingPatients } = useQuery({
    queryKey: ['patients', searchTerm],
    queryFn: () => fetchPatients(searchTerm),
  });

  const { data: encounters = [], isLoading: loadingEncounters } = useQuery({
    queryKey: ['encounters'],
    queryFn: fetchEncounters,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      full_name: '',
      birth_date: '',
      sex: 'F',
      phone: '',
      allergies_text: '',
    },
  });

  const openEncounterMutation = useMutation({
    mutationFn: (patientId: string) => rpcOpenEncounter(patientId),
    onSuccess: (enc) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      setFeedback({
        type: 'success',
        text: `Atendimento aberto com sucesso! Senha gerada: ${enc.ticket_number} (Situação: Aguardando Triagem).`,
      });
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao abrir atendimento.',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (encounterId: string) =>
      rpcCancelEncounter(encounterId, 'Desistência registrada na recepção'),
    onSuccess: (enc) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      setFeedback({
        type: 'success',
        text: `Atendimento ${enc.ticket_number} cancelado por desistência.`,
      });
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao cancelar atendimento.',
      });
    },
  });

  const onSubmitNewPatient = async (values: PatientFormValues) => {
    setFeedback(null);
    try {
      const allergies = values.allergies_text
        ? values.allergies_text
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const created = await createPatient({
        full_name: values.full_name,
        birth_date: values.birth_date,
        sex: values.sex,
        phone: values.phone,
        allergies,
      });

      // Já oferece ou abre o atendimento imediatamente
      const enc = await rpcOpenEncounter(created.id);
      reset();
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['encounters'] });

      setFeedback({
        type: 'success',
        text: `Paciente "${created.full_name}" cadastrado e atendimento aberto com a senha ${enc.ticket_number}!`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao cadastrar paciente.',
      });
    }
  };

  // Mapa de atendimentos ativos por paciente para bloquear duplicidade também na UI
  const activeEncounterByPatient = new Map<string, typeof encounters[0]>();
  encounters.forEach((enc) => {
    if (!isTerminalStatus(enc.status)) {
      activeEncounterByPatient.set(enc.patient_id, enc);
    }
  });

  const handleTestRlsPrescriptions = async () => {
    const res = await queryDirectPrescriptionsTable();
    setRlsAuditResult(
      `Resultado da consulta direta a public.prescriptions: ${res.rows.length} registros retornados. Motivo: ${res.securityMessage}`
    );
  };

  const selectedWristbandEnc =
    encounters.find((e) => e.id === wristbandEncounterId) ?? null;

  return (
    <div className="space-y-6">
      {/* Banner de Feedback */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-xl border p-4 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline opacity-75 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Coluna Esquerda: Cadastro de Novo Paciente (React Hook Form + Zod) */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Cadastrar Novo Paciente
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cadastra e já gera a senha sequencial do dia automaticamente
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSubmit(onSubmitNewPatient)}
              className="mt-4 space-y-4"
              noValidate
            >
              <div>
                <label
                  htmlFor="full_name"
                  className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                >
                  Nome Completo *
                </label>
                <input
                  id="full_name"
                  type="text"
                  placeholder="Ex: Maria Aparecida dos Santos"
                  {...register('full_name')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                {errors.full_name && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
                    {errors.full_name.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="birth_date"
                    className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                  >
                    Data de Nascimento *
                  </label>
                  <input
                    id="birth_date"
                    type="date"
                    {...register('birth_date')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  {errors.birth_date && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
                      {errors.birth_date.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="sex"
                    className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                  >
                    Sexo *
                  </label>
                  <select
                    id="sex"
                    {...register('sex')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="F">Feminino (F)</option>
                    <option value="M">Masculino (M)</option>
                    <option value="Outro">Outro</option>
                  </select>
                  {errors.sex && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
                      {errors.sex.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                >
                  Telefone de Contato *
                </label>
                <input
                  id="phone"
                  type="tel"
                  placeholder="(11) 99999-8888"
                  {...register('phone')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                {errors.phone && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
                    {errors.phone.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="allergies_text"
                  className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300"
                >
                  Alergias Conhecidas (separadas por vírgula)
                </label>
                <input
                  id="allergies_text"
                  type="text"
                  placeholder="Ex: Dipirona, Penicilina, Ibuprofeno (deixe vazio se negar)"
                  {...register('allergies_text')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  As alergias cadastradas bloquearão automaticamente prescrições conflitantes.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
              >
                <PlusCircle className="h-4 w-4" />
                <span>
                  {isSubmitting
                    ? 'Cadastrando e Gerando Senha...'
                    : 'Cadastrar Paciente e Abrir Atendimento'}
                </span>
              </button>
            </form>
          </div>

          {/* Card de Validação de Segurança RLS (Item 3.7 e 5.9) */}
          <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase text-amber-900 dark:text-amber-200">
                  Verificação de Segurança RLS (Cenário de Validação Item 5.9)
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Pela regra de segurança, a Recepção não pode ler triagens, evoluções nem prescrições.
                </p>
                <button
                  type="button"
                  onClick={handleTestRlsPrescriptions}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                >
                  Testar Consulta Direta à Tabela de Prescrições (API)
                </button>
                {rlsAuditResult && (
                  <p className="rounded-lg border border-amber-400 bg-white p-2 font-mono text-[11px] font-bold text-slate-800 dark:bg-slate-900 dark:text-slate-200">
                    {rlsAuditResult}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Busca de Pacientes + Lista de Atendimentos Abertos no Dia */}
        <div className="lg:col-span-7 space-y-6">
          {/* Busca de Paciente Cadastrado (Item 2.2) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Buscar Paciente Cadastrado
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pesquise por nome ou data de nascimento (AAAA-MM-DD) para abrir novo atendimento
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nome ou 1980-01-30..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-4 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {loadingPatients ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Carregando pacientes...
                </p>
              ) : patients.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Nenhum paciente encontrado para &ldquo;{searchTerm}&rdquo;.
                </p>
              ) : (
                patients.map((p) => {
                  const activeEnc = activeEncounterByPatient.get(p.id);
                  const age = calculateAgeYears(p.birth_date);

                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/pacientes/${p.id}`}
                            className="text-sm font-bold text-slate-900 hover:text-sky-600 dark:text-white"
                          >
                            {p.full_name}
                          </Link>
                          <span className="text-xs text-slate-500">
                            Nasc: {p.birth_date} ({age} anos)
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>Tel: {p.phone}</span>
                          {p.allergies.length > 0 && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Alergias: {p.allergies.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        {activeEnc ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            title="Um mesmo paciente não pode ter dois atendimentos ativos ao mesmo tempo"
                          >
                            <Ticket className="h-3.5 w-3.5" />
                            Ativo: {activeEnc.ticket_number} ({STATUS_LABELS[activeEnc.status]})
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openEncounterMutation.mutate(p.id)}
                            disabled={openEncounterMutation.isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            <Ticket className="h-3.5 w-3.5" />
                            <span>Abrir Atendimento</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Lista de Atendimentos Abertos no Dia e Situação de Cada Um (Item 2.2) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Atendimentos do Dia ({encounters.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Acompanhamento em tempo real das senhas geradas e situação de cada paciente
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {loadingEncounters ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Carregando atendimentos...
                </p>
              ) : encounters.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Nenhum atendimento registrado hoje.
                </p>
              ) : (
                encounters.map((enc) => {
                  const canCancel =
                    enc.status === 'aguardando_triagem' ||
                    enc.status === 'aguardando_medico';

                  const statusBadgeColor: Record<EncounterStatus, string> = {
                    aguardando_triagem:
                      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
                    aguardando_medico:
                      'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300',
                    em_atendimento:
                      'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-300',
                    aguardando_leito:
                      'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300',
                    em_observacao:
                      'bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-300',
                    alta: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
                    transferido:
                      'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
                    cancelado:
                      'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300',
                  };

                  return (
                    <div
                      key={enc.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-sm font-black text-white dark:bg-slate-800">
                          {enc.ticket_number}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {enc.patient?.full_name || 'Paciente'}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                statusBadgeColor[enc.status]
                              }`}
                            >
                              {STATUS_LABELS[enc.status]}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Chegada:{' '}
                            {new Date(enc.arrived_at).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <RiskBadge color={enc.current_risk} size="sm" />

                        <button
                          type="button"
                          onClick={() => setWristbandEncounterId(enc.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>Pulseira</span>
                        </button>

                        <Link
                          to={`/atendimentos/${enc.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Ver</span>
                        </Link>

                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Confirmar cancelamento por desistência do atendimento ${enc.ticket_number}?`
                                )
                              ) {
                                cancelMutation.mutate(enc.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Desistência</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <WristbandModal
        encounter={selectedWristbandEnc}
        onClose={() => setWristbandEncounterId(null)}
      />
    </div>
  );
};
