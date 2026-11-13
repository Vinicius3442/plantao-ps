// ============================================================================
// Diferencial Criativo (Item 4): Impressão da Pulseira do Paciente com QR Code
// e Cor da Classificação de Risco + Linha do Tempo e Evolução de Sinais Vitais
// ============================================================================

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Clock, Printer, TrendingUp, X } from 'lucide-react';
import {
  calculateAgeYears,
  Encounter,
  EncounterEvent,
  RISK_METADATA,
  STATUS_LABELS,
  TriageRecord,
} from '../domain';
import { RiskBadge } from './RiskBadge';

interface WristbandModalProps {
  encounter: Encounter | null;
  onClose: () => void;
}

export const WristbandModal: React.FC<WristbandModalProps> = ({
  encounter,
  onClose,
}) => {
  if (!encounter) return null;

  const patient = encounter.patient;
  const age = patient ? calculateAgeYears(patient.birth_date) : null;
  const qrUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/atendimentos/${encounter.id}`
      : `plantaops://atendimentos/${encounter.id}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wristband-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <h3
            id="wristband-title"
            className="text-lg font-black text-slate-900 dark:text-white"
          >
            Pulseira de Identificação Hospitalar
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Layout da Pulseira para Impressão */}
        <div className="my-5 rounded-xl border-2 border-dashed border-slate-400 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="space-y-1.5 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="rounded bg-slate-900 px-2.5 py-0.5 font-mono text-sm font-black text-white">
                  {encounter.ticket_number}
                </span>
                <RiskBadge color={encounter.current_risk} size="md" />
              </div>

              <p className="text-lg font-black text-slate-900 dark:text-white">
                {patient?.full_name || 'Paciente'}
              </p>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Nasc: {patient?.birth_date} ({age} anos) • Sexo: {patient?.sex}
              </p>

              {patient && patient.allergies.length > 0 ? (
                <p className="inline-block rounded bg-red-600 px-2 py-0.5 text-xs font-black uppercase text-white">
                  ALERGIA: {patient.allergies.join(', ')}
                </p>
              ) : (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Sem alergias medicamentosas relatadas
                </p>
              )}

              <p className="text-[11px] font-mono text-slate-500">
                Entrada: {new Date(encounter.arrived_at).toLocaleString('pt-BR')}
              </p>
            </div>

            <div className="flex flex-col items-center rounded-xl bg-white p-3 shadow-sm">
              <QRCodeSVG value={qrUrl} size={96} level="M" />
              <span className="mt-1 font-mono text-[10px] font-bold text-slate-600">
                {encounter.ticket_number}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
          >
            <Printer className="h-4 w-4" />
            <span>Imprimir Pulseira</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Diferencial Criativo (Item 4): Linha do Tempo Completa do Atendimento
// ============================================================================
export const EncounterTimeline: React.FC<{ events?: EncounterEvent[] }> = ({
  events = [],
}) => {
  if (events.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Nenhum evento registrado na linha do tempo.
      </p>
    );
  }

  return (
    <ol className="relative border-l-2 border-blue-200 dark:border-blue-900 ml-3 space-y-4">
      {events.map((ev) => (
        <li key={ev.id} className="ml-4">
          <div className="absolute -left-2 mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 dark:border-slate-900" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900 dark:bg-blue-950 dark:text-blue-200">
              {STATUS_LABELS[ev.to_status]}
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-500 dark:text-slate-400">
              <Clock className="h-3 w-3" />
              {new Date(ev.created_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              • {ev.actor_name}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
            {ev.details}
          </p>
        </li>
      ))}
    </ol>
  );
};

// ============================================================================
// Diferencial Criativo (Item 4): Gráfico de Evolução dos Sinais Vitais nas Reclassificações
// ============================================================================
export const VitalsEvolutionChart: React.FC<{ triages?: TriageRecord[] }> = ({
  triages = [],
}) => {
  if (triages.length === 0) return null;

  const chronological = [...triages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
        <TrendingUp className="h-4 w-4 text-blue-600" />
        <span>Evolução Seriada dos Sinais Vitais ({chronological.length} aferições)</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {chronological.map((t, index) => (
          <div
            key={t.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                #{index + 1} • {t.is_reclassification ? 'Reclassificação' : 'Triagem Inicial'} (
                {new Date(t.created_at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                )
              </span>
              <RiskBadge color={t.final_color} size="sm" />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-center font-mono text-xs">
              <div className="rounded bg-white p-1.5 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500">PA (mmHg)</span>
                <strong className="text-slate-900 dark:text-white">
                  {t.systolic_bp}/{t.diastolic_bp}
                </strong>
              </div>
              <div className="rounded bg-white p-1.5 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500">FC (bpm)</span>
                <strong className="text-slate-900 dark:text-white">{t.heart_rate}</strong>
              </div>
              <div className="rounded bg-white p-1.5 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500">SatO₂ (%)</span>
                <strong className="text-slate-900 dark:text-white">
                  {t.oxygen_saturation}%
                </strong>
              </div>
              <div className="rounded bg-white p-1.5 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500">Temp (°C)</span>
                <strong className="text-slate-900 dark:text-white">
                  {t.temperature}°C
                </strong>
              </div>
              <div className="rounded bg-white p-1.5 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500">Dor (0-10)</span>
                <strong className="text-slate-900 dark:text-white">{t.pain_level}/10</strong>
              </div>
              <div className="rounded bg-white p-1.5 dark:bg-slate-900">
                <span className="block text-[10px] text-slate-500">Consciência</span>
                <strong className="capitalize text-slate-900 dark:text-white">
                  {t.consciousness}
                </strong>
              </div>
            </div>

            {t.justification && (
              <p className="mt-2 rounded bg-amber-100/80 px-2 py-1 text-[11px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                <strong>Justificativa de alteração ({RISK_METADATA[t.suggested_color].label} → {RISK_METADATA[t.final_color].label}):</strong>{' '}
                {t.justification}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
