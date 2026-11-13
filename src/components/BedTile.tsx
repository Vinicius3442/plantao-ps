// ============================================================================
// Componente Reutilizável Obrigatório 5: BedTile (Item 2.6 e 3.2)
// Exibe um leito na planta das alas com seu status (livre, ocupado, em limpeza
// ou bloqueado), aceita arrastar paciente (Drag & Drop) e permite liberar limpeza.
// ============================================================================

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BedDouble,
  CheckCircle,
  Lock,
  Sparkles,
  User,
} from 'lucide-react';
import { Bed, BedStatus } from '../domain';
import { RiskBadge } from './RiskBadge';

interface BedTileProps {
  bed: Bed;
  canReleaseCleaning?: boolean;
  onDropPatientOnBed?: (encounterId: string, bedId: string) => void;
  onReleaseCleaning?: (bedId: string) => void;
  selectedEncounterIdForAssign?: string | null;
  onClickAssignSelected?: (encounterId: string, bedId: string) => void;
}

const BED_STATUS_CONFIG: Record<
  BedStatus,
  {
    label: string;
    badgeClass: string;
    cardClass: string;
  }
> = {
  livre: {
    label: 'LIVRE',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300',
    cardClass:
      'border-emerald-300 bg-emerald-50/40 hover:border-emerald-500 dark:border-emerald-800/60 dark:bg-emerald-950/20',
  },
  ocupado: {
    label: 'OCUPADO',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300',
    cardClass:
      'border-blue-300 bg-white dark:border-blue-800/70 dark:bg-slate-900',
  },
  em_limpeza: {
    label: 'EM LIMPEZA',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950 dark:text-amber-300',
    cardClass:
      'border-amber-300 bg-amber-50/50 dark:border-amber-800/70 dark:bg-amber-950/20',
  },
  bloqueado: {
    label: 'BLOQUEADO',
    badgeClass: 'bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-800 dark:text-slate-300',
    cardClass:
      'border-slate-300 bg-slate-100 opacity-75 dark:border-slate-800 dark:bg-slate-900/50',
  },
};

export const BedTile: React.FC<BedTileProps> = ({
  bed,
  canReleaseCleaning = false,
  onDropPatientOnBed,
  onReleaseCleaning,
  selectedEncounterIdForAssign,
  onClickAssignSelected,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const cfg = BED_STATUS_CONFIG[bed.status];
  const occupant = bed.current_encounter;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (bed.status !== 'livre') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (bed.status !== 'livre') return;
    const encounterId = e.dataTransfer.getData('text/plain');
    if (encounterId && onDropPatientOnBed) {
      onDropPatientOnBed(encounterId, bed.id);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex flex-col justify-between rounded-xl border-2 p-4 transition-all ${
        cfg.cardClass
      } ${
        isDragOver
          ? 'scale-[1.02] border-dashed border-blue-600 bg-blue-50/80 ring-4 ring-blue-500/20 dark:bg-blue-950/50'
          : ''
      }`}
    >
      {/* Topo do Leito */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-black text-white dark:bg-slate-800">
            <BedDouble className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-mono text-base font-black text-slate-900 dark:text-white">
              {bed.code}
            </h4>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {bed.ward}
            </p>
          </div>
        </div>

        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${cfg.badgeClass}`}
        >
          {cfg.label}
        </span>
      </div>

      {/* Corpo do Leito conforme status */}
      <div className="my-3 min-h-[76px] flex flex-col justify-center">
        {bed.status === 'livre' && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-emerald-300 bg-white/70 p-3 text-center dark:border-emerald-800 dark:bg-slate-900/50">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Arraste um paciente aguardando leito para cá
            </p>
            {selectedEncounterIdForAssign && onClickAssignSelected && (
              <button
                type="button"
                onClick={() => onClickAssignSelected(selectedEncounterIdForAssign, bed.id)}
                className="mt-2 rounded-md bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Alocar Paciente Selecionado Aqui
              </button>
            )}
          </div>
        )}

        {bed.status === 'ocupado' && occupant && (
          <div className="space-y-1.5 rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 dark:border-blue-900/60 dark:bg-slate-800/80">
            <div className="flex items-center justify-between gap-1">
              <span className="rounded bg-blue-600 px-1.5 py-0.5 font-mono text-xs font-bold text-white">
                {occupant.ticket_number}
              </span>
              <RiskBadge color={occupant.current_risk} size="sm" />
            </div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
              <User className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <span className="truncate">
                {occupant.patient?.full_name || 'Paciente em observação'}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Em observação
              </span>
              <Link
                to={`/atendimentos/${occupant.id}`}
                className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                Abrir Atendimento →
              </Link>
            </div>
          </div>
        )}

        {bed.status === 'em_limpeza' && (
          <div className="flex flex-col items-center justify-center space-y-2 rounded-lg border border-amber-300 bg-white/80 p-3 text-center dark:border-amber-800 dark:bg-slate-900/70">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <span>Aguardando Higienização</span>
            </div>
            {canReleaseCleaning && onReleaseCleaning ? (
              <button
                type="button"
                onClick={() => onReleaseCleaning(bed.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Concluir Limpeza (Liberar Leito)</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                A enfermagem libera após a limpeza
              </span>
            )}
          </div>
        )}

        {bed.status === 'bloqueado' && (
          <div className="flex items-center justify-center gap-2 rounded-lg p-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Lock className="h-4 w-4" />
            <span>Manutenção / Bloqueado</span>
          </div>
        )}
      </div>
    </div>
  );
};
