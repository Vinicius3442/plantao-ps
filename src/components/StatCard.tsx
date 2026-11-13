// ============================================================================
// Componente Reutilizável Obrigatório 6: StatCard (Item 2.8 e 3.2)
// Indicador numérico/visual do painel da gestão hospitalar.
// ============================================================================

import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'danger' | 'warning' | 'success' | 'info';
}

const VARIANT_CLASSES: Record<NonNullable<StatCardProps['variant']>, string> = {
  default: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
  danger: 'border-red-300 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20',
  warning: 'border-amber-300 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20',
  success: 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20',
  info: 'border-blue-300 bg-blue-50/40 dark:border-blue-900/60 dark:bg-blue-950/20',
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'default',
}) => {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm transition ${VARIANT_CLASSES[variant]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className="mt-2 font-mono text-2xl md:text-3xl font-black text-slate-900 dark:text-white">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900/5 text-slate-700 dark:bg-white/10 dark:text-slate-200">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};
