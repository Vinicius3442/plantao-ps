// ============================================================================
// Página 8: Detalhes do Atendimento (/atendimentos/:id - Rota com Parâmetro Item 3.3)
// Respeita as regras de segurança RLS (a recepção vê apenas dados administrativos,
// enquanto enfermagem, médico e gestão visualizam triagens, evolução e prescrições).
// ============================================================================

import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  FileText,
  Pill,
  Printer,
  ShieldCheck,
  User,
} from 'lucide-react';
import { calculateAgeYears, STATUS_LABELS } from '../domain';
import { RiskBadge } from '../components/RiskBadge';
import { WaitTimer } from '../components/WaitTimer';
import {
  EncounterTimeline,
  VitalsEvolutionChart,
  WristbandModal,
} from '../components/WristbandModal';
import { ROLE_HOME_ROUTE, useAuth } from '../hooks/useAuth';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import { fetchEncounterById } from '../services/api';

export const EncounterDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showWristband, setShowWristband] = useState(false);

  useRealtimeTable(['encounters', 'triages', 'prescriptions'], [['encounter', id || '']]);

  const {
    data: encounter,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['encounter', id],
    queryFn: () => fetchEncounterById(id!),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-500">
          Carregando detalhes do atendimento...
        </p>
      </div>
    );
  }

  if (isError || !encounter) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-8 text-center dark:border-red-900 dark:bg-slate-900">
        <p className="text-base font-bold text-red-600">
          {error instanceof Error ? error.message : 'Atendimento não encontrado.'}
        </p>
        <button
          type="button"
          onClick={() => navigate(user ? ROLE_HOME_ROUTE[user.role] : '/login')}
          className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"
        >
          Voltar
        </button>
      </div>
    );
  }

  const isReception = user?.role === 'recepcao';
  const age = encounter.patient ? calculateAgeYears(encounter.patient.birth_date) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar</span>
        </button>

        <button
          type="button"
          onClick={() => setShowWristband(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
        >
          <Printer className="h-4 w-4" />
          <span>Imprimir Pulseira QR Code</span>
        </button>
      </div>

      {/* Cabeçalho do Atendimento */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-lg bg-blue-600 px-3 py-1 font-mono text-lg font-black text-white">
                {encounter.ticket_number}
              </span>
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                {encounter.patient?.full_name || 'Paciente'}
              </h1>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {STATUS_LABELS[encounter.status]}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Nasc: {encounter.patient?.birth_date} ({age} anos) • Sexo:{' '}
                {encounter.patient?.sex}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Chegada: {new Date(encounter.arrived_at).toLocaleString('pt-BR')}
              </span>
              {encounter.patient && (
                <Link
                  to={`/pacientes/${encounter.patient.id}`}
                  className="font-bold text-blue-600 hover:underline dark:text-blue-400"
                >
                  Ver ficha cadastral do paciente →
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge color={encounter.current_risk} size="lg" showMaxWait />
            <WaitTimer
              arrivedAt={encounter.arrived_at}
              riskColor={encounter.current_risk}
            />
          </div>
        </div>
      </div>

      {/* Aviso de Restrição RLS caso o usuário seja da Recepção (Item 3.7) */}
      {isReception ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-center gap-2 font-black text-sm">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            <span>Proteção de Dados Clínicos (RLS Ativa para Recepção)</span>
          </div>
          <p className="mt-1 text-xs">
            Conforme as regras de segurança do hospital (Item 3.7), o perfil de Recepção visualiza
            apenas a situação administrativa e a linha do tempo de etapas, sem acesso a triagens,
            evoluções médicas ou prescrições.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Dados Clínicos: Triagens e Evolução (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white">
                <FileText className="h-5 w-5 text-blue-600" />
                <span>Queixa Principal, Sinais Vitais e Evolução Médica</span>
              </h2>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                  <span className="text-xs font-bold uppercase text-slate-500">
                    Queixa Principal:
                  </span>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {encounter.chief_complaint || 'Ainda não registrada.'}
                  </p>
                </div>

                {encounter.clinical_notes && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                    <span className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-300">
                      Evolução Clínica do Médico:
                    </span>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-900 dark:text-white">
                      {encounter.clinical_notes}
                    </p>
                  </div>
                )}

                <VitalsEvolutionChart triages={encounter.triages} />
              </div>
            </div>
          </div>

          {/* Prescrições Registradas (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white">
                <Pill className="h-5 w-5 text-rose-600" />
                <span>
                  Prescrições Médicas ({encounter.prescriptions?.length ?? 0})
                </span>
              </h2>

              <div className="mt-4 space-y-2.5">
                {!encounter.prescriptions || encounter.prescriptions.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nenhuma prescrição médica registrada neste atendimento.
                  </p>
                ) : (
                  encounter.prescriptions.map((pr) => (
                    <div
                      key={pr.id}
                      className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {pr.medication_name}
                        </span>
                        <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                          {pr.dose_mg} mg • {pr.route} • {pr.frequency}
                        </span>
                      </div>
                      {pr.notes && (
                        <p className="mt-1 text-xs text-slate-500">{pr.notes}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Linha do Tempo de Eventos */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-base font-black text-slate-900 dark:text-white">
          Linha do Tempo do Atendimento
        </h2>
        <EncounterTimeline events={encounter.events} />
      </div>

      <WristbandModal
        encounter={showWristband ? encounter : null}
        onClose={() => setShowWristband(false)}
      />
    </div>
  );
};
