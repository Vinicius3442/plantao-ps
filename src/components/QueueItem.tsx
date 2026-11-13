// ============================================================================
// Componente Reutilizável Obrigatório 3: QueueItem (Item 2.4 e 3.2)
// Exibe senha, nome, idade, cor, queixa, tempo de espera, tempo máximo da cor
// e destaque visual de alerta quando o tempo máximo é ultrapassado.
// ============================================================================

import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Baby,
  FileText,
  Printer,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import {
  calculateAgeYears,
  Encounter,
  isPriorityAgeGroup,
  isWaitTimeExceeded,
} from '../domain';
import { RiskBadge } from './RiskBadge';
import { WaitTimer } from './WaitTimer';

interface QueueItemProps {
  encounter: Encounter;
  position?: number;
  onReclassify?: (encounter: Encounter) => void;
  onPrintWristband?: (encounter: Encounter) => void;
  actionButton?: React.ReactNode;
}

export const QueueItem: React.FC<QueueItemProps> = ({
  encounter,
  position,
  onReclassify,
  onPrintWristband,
  actionButton,
}) => {
  const patient = encounter.patient;
  const age = patient ? calculateAgeYears(patient.birth_date) : null;
  const isPriorityAge = patient ? isPriorityAgeGroup(patient.birth_date) : false;
  const exceeded = isWaitTimeExceeded(encounter.current_risk, encounter.arrived_at);

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 p-4 ${
        exceeded
          ? 'border-2 border-red-500 bg-red-50/60 dark:bg-red-950/25 shadow-md shadow-red-500/10'
          : encounter.current_risk === 'vermelho'
          ? 'border-red-300 bg-white dark:border-red-800/70 dark:bg-slate-900 shadow-sm'
          : 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Identificação Principal */}
        <div className="flex flex-wrap items-start gap-3">
          {position !== undefined && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white dark:bg-slate-800">
              {position}º
            </div>
          )}

          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-blue-600 px-2.5 py-0.5 font-mono text-sm font-black text-white">
                {encounter.ticket_number}
              </span>

              {patient ? (
                <Link
                  to={`/pacientes/${patient.id}`}
                  className="text-base font-bold text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400 underline-offset-2 hover:underline"
                >
                  {patient.full_name}
                </Link>
              ) : (
                <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Paciente #{encounter.patient_id.slice(0, 6)}
                </span>
              )}

              {age !== null && (
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  ({age} anos • {patient?.sex})
                </span>
              )}

              {isPriorityAge && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                  title="Critério legal de desempate: Idoso (≥ 60 anos) ou Criança (< 12 anos)"
                >
                  {age !== null && age < 12 ? (
                    <Baby className="h-3 w-3" />
                  ) : (
                    <UserCheck className="h-3 w-3" />
                  )}
                  {age !== null && age < 12 ? 'Pediátrico (<12a)' : 'Idoso (≥60a)'}
                </span>
              )}

              {patient && patient.allergies.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Alergia: {patient.allergies.join(', ')}
                </span>
              )}
            </div>

            {encounter.chief_complaint && (
              <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
                <strong className="font-semibold text-slate-900 dark:text-slate-100">
                  Queixa:
                </strong>{' '}
                {encounter.chief_complaint}
              </p>
            )}
          </div>
        </div>

        {/* Classificação, Tempo de Espera e Ações */}
        <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
          <RiskBadge color={encounter.current_risk} showMaxWait />
          <WaitTimer
            arrivedAt={encounter.arrived_at}
            riskColor={encounter.current_risk}
          />

          <div className="flex items-center gap-1.5">
            {onReclassify && (
              <button
                type="button"
                onClick={() => onReclassify(encounter)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                title="Reclassificar risco do paciente mantendo histórico"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reclassificar</span>
              </button>
            )}

            {onPrintWristband && (
              <button
                type="button"
                onClick={() => onPrintWristband(encounter)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                title="Imprimir pulseira com QR Code"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="sr-only md:not-sr-only">Pulseira</span>
              </button>
            )}

            <Link
              to={`/atendimentos/${encounter.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Detalhes</span>
            </Link>

            {actionButton}
          </div>
        </div>
      </div>
    </div>
  );
};
