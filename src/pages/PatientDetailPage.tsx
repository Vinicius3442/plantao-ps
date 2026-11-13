// ============================================================================
// Página 9: Prontuário / Histórico do Paciente (/pacientes/:id - Item 3.3)
// ============================================================================

import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  FileText,
  Phone,
  User,
} from 'lucide-react';
import { calculateAgeYears, STATUS_LABELS } from '../domain';
import { RiskBadge } from '../components/RiskBadge';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import { fetchPatientById } from '../services/api';

export const PatientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useRealtimeTable(['patients', 'encounters'], [['patient', id || '']]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => fetchPatientById(id!),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-500">
          Carregando histórico do paciente...
        </p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-8 text-center dark:border-red-900 dark:bg-slate-900">
        <p className="text-base font-bold text-red-600">
          {error instanceof Error ? error.message : 'Paciente não encontrado.'}
        </p>
      </div>
    );
  }

  const { patient, encounters } = data;
  const age = calculateAgeYears(patient.birth_date);

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar</span>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
              <User className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                {patient.full_name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Nascimento: {patient.birth_date} ({age} anos)
                </span>
                <span>Sexo: {patient.sex}</span>
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {patient.phone}
                </span>
              </div>
            </div>
          </div>

          {patient.allergies.length > 0 ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span>Alergias Conhecidas: {patient.allergies.join(', ')}</span>
            </div>
          ) : (
            <span className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Sem alergias conhecidas
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-black text-slate-900 dark:text-white">
          Histórico de Passagens pelo Pronto-Socorro ({encounters.length})
        </h2>

        <div className="mt-4 space-y-3">
          {encounters.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum atendimento registrado para este paciente.
            </p>
          ) : (
            encounters.map((enc) => (
              <div
                key={enc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-900 px-2.5 py-0.5 font-mono text-xs font-black text-white">
                      {enc.ticket_number}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {STATUS_LABELS[enc.status]}
                    </span>
                    <span className="text-xs text-slate-500">
                      • {new Date(enc.arrived_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {enc.chief_complaint && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Queixa: {enc.chief_complaint}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <RiskBadge color={enc.current_risk} size="sm" />
                  <Link
                    to={`/atendimentos/${enc.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Ver Atendimento</span>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
