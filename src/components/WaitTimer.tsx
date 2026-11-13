// ============================================================================
// Componente Reutilizável Obrigatório 2: WaitTimer (Item 2.4 e 3.2)
// Contador de espera em tempo real com destaque visual de alerta quando o
// tempo máximo da cor é ultrapassado.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import {
  getWaitTimeMinutes,
  isWaitTimeExceeded,
  RISK_METADATA,
  RiskColor,
} from '../domain';

interface WaitTimerProps {
  arrivedAt: string;
  riskColor: RiskColor | null;
  compact?: boolean;
}

export const WaitTimer: React.FC<WaitTimerProps> = ({
  arrivedAt,
  riskColor,
  compact = false,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const waitMinutes = getWaitTimeMinutes(arrivedAt, now);
  const exceeded = isWaitTimeExceeded(riskColor, arrivedAt, now);
  const maxMinutes = riskColor ? RISK_METADATA[riskColor].maxWaitMinutes : null;

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}min`;
  };

  if (exceeded) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-lg border-2 border-red-500 bg-red-50 text-red-800 dark:bg-red-950/80 dark:text-red-200 dark:border-red-500 animate-pulse ${
          compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-xs md:text-sm'
        } font-bold`}
        role="alert"
        aria-label={`Alerta: tempo de espera de ${waitMinutes} minutos ultrapassou o limite máximo de ${maxMinutes} minutos`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <span>Espera: {formatDuration(waitMinutes)}</span>
        {maxMinutes !== null && (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-extrabold text-white">
            PRAZO ESTOURADO (máx {maxMinutes}m)
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${
        compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-xs md:text-sm'
      } font-medium`}
    >
      <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
      <span>
        Espera: <strong className="font-mono font-bold">{formatDuration(waitMinutes)}</strong>
      </span>
      {maxMinutes !== null && (
        <span className="text-slate-500 dark:text-slate-400 text-xs">
          / máx {maxMinutes === 0 ? 'Imediato' : `${maxMinutes} min`}
        </span>
      )}
    </div>
  );
};
