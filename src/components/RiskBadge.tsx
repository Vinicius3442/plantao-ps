// ============================================================================
// Componente Reutilizável Obrigatório 1: RiskBadge (Item 3.2 e 3.10)
// Exibe cor, ícone de apoio e SEMPRE texto explícito da cor + prioridade
// (acessibilidade para daltonismo conforme Item 3.10).
// ============================================================================

import React from 'react';
import { RISK_METADATA, RiskColor } from '../domain';

interface RiskBadgeProps {
  color: RiskColor | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showMaxWait?: boolean;
}

const COLOR_STYLES: Record<RiskColor, string> = {
  vermelho:
    'bg-red-600 text-white border-red-700 shadow-sm shadow-red-600/30 ring-2 ring-red-500/20',
  laranja:
    'bg-orange-500 text-white border-orange-600 shadow-sm shadow-orange-500/25',
  amarelo:
    'bg-amber-400 text-slate-950 border-amber-500 font-extrabold',
  verde:
    'bg-emerald-600 text-white border-emerald-700',
  azul:
    'bg-sky-600 text-white border-sky-700',
};

const DOT_SYMBOLS: Record<RiskColor, string> = {
  vermelho: '▲',
  laranja: '◆',
  amarelo: '●',
  verde: '■',
  azul: '○',
};

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  color,
  size = 'md',
  showMaxWait = false,
}) => {
  if (!color) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        aria-label="Classificação de risco: Não triado"
      >
        <span>◌</span>
        <span>Aguardando Triagem</span>
      </span>
    );
  }

  const meta = RISK_METADATA[color];
  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-0.5 text-xs'
      : size === 'lg'
      ? 'px-4 py-1.5 text-sm md:text-base'
      : 'px-3 py-1 text-xs md:text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold tracking-tight ${COLOR_STYLES[color]} ${sizeClasses}`}
      role="status"
      aria-label={`Risco ${meta.label} - ${meta.priorityLevel}`}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">
        {DOT_SYMBOLS[color]}
      </span>
      <span className="uppercase">{meta.label}</span>
      <span className="opacity-85 font-semibold">• {meta.priorityLevel}</span>
      {showMaxWait && (
        <span className="ml-1 rounded bg-black/15 px-1.5 py-0.5 text-[11px] font-mono">
          máx: {meta.maxWaitLabel}
        </span>
      )}
    </span>
  );
};
