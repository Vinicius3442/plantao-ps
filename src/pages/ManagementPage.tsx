// ============================================================================
// Página 7: Painel da Gestão Hospitalar (Item 2.8 e 4)
// Indicadores calculados em tempo real a partir dos dados persistidos no banco:
// - Atendimentos por hora no dia
// - Distribuição dos atendimentos por cor
// - Tempo médio de espera por cor, comparado ao tempo máximo
// - Percentual de atendimentos fora do prazo
// - Taxa de ocupação dos leitos
// - Filtro por período (hoje, últimos 7 dias, últimos 30 dias)
// - Consulta geral (somente leitura dos dados clínicos) + Exportação CSV (Item 4)
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BedDouble,
  Clock,
  Download,
  FileText,
  Search,
  Users,
} from 'lucide-react';
import {
  getWaitTimeMinutes,
  isWaitTimeExceeded,
  RISK_METADATA,
  RiskColor,
  STATUS_LABELS,
} from '../domain';
import { RiskBadge } from '../components/RiskBadge';
import { StatCard } from '../components/StatCard';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import { fetchBeds, fetchEncounters } from '../services/api';
import { ManagementPeriodFilter, useUIStore } from '../store/uiStore';

const ALL_COLORS: RiskColor[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul'];

export const ManagementPage: React.FC = () => {
  const period = useUIStore((s) => s.managementPeriod);
  const setPeriod = useUIStore((s) => s.setManagementPeriod);
  const [searchQuery, setSearchQuery] = useState('');

  useRealtimeTable(['encounters', 'beds', 'triages', 'prescriptions'], [['encounters'], ['beds']]);

  const { data: encounters = [], isLoading: loadingEncounters } = useQuery({
    queryKey: ['encounters'],
    queryFn: fetchEncounters,
  });

  const { data: beds = [] } = useQuery({
    queryKey: ['beds'],
    queryFn: fetchBeds,
  });

  // Filtrar atendimentos pelo período selecionado (hoje, últimos 7 dias, últimos 30 dias)
  const periodEncounters = useMemo(() => {
    const now = Date.now();
    const maxAgeMs =
      period === 'hoje'
        ? 24 * 60 * 60 * 1000
        : period === '7dias'
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

    return encounters.filter((e) => {
      const arrivedMs = new Date(e.arrived_at).getTime();
      return now - arrivedMs <= maxAgeMs;
    });
  }, [encounters, period]);

  // Cálculo dos Indicadores Reais a partir dos dados persistidos (Item 2.8)
  const metrics = useMemo(() => {
    const total = periodEncounters.length;
    const triaged = periodEncounters.filter((e) => e.current_risk !== null);

    // 1. Distribuição e tempo médio de espera por cor
    const byColor: Record<
      RiskColor,
      { count: number; percentage: number; avgWaitMin: number; maxWaitMin: number }
    > = {
      vermelho: { count: 0, percentage: 0, avgWaitMin: 0, maxWaitMin: 0 },
      laranja: { count: 0, percentage: 0, avgWaitMin: 0, maxWaitMin: 10 },
      amarelo: { count: 0, percentage: 0, avgWaitMin: 0, maxWaitMin: 60 },
      verde: { count: 0, percentage: 0, avgWaitMin: 0, maxWaitMin: 120 },
      azul: { count: 0, percentage: 0, avgWaitMin: 0, maxWaitMin: 240 },
    };

    let overdueCount = 0;

    ALL_COLORS.forEach((color) => {
      const list = triaged.filter((e) => e.current_risk === color);
      const count = list.length;
      const percentage = triaged.length > 0 ? Math.round((count / triaged.length) * 100) : 0;

      const waitTimes = list.map((e) => {
        const refEnd = e.called_at ? new Date(e.called_at) : new Date();
        const waitMin = getWaitTimeMinutes(e.arrived_at, refEnd);
        if (isWaitTimeExceeded(color, e.arrived_at, refEnd)) {
          overdueCount++;
        }
        return waitMin;
      });

      const avgWaitMin =
        waitTimes.length > 0
          ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
          : 0;

      byColor[color] = {
        count,
        percentage,
        avgWaitMin,
        maxWaitMin: RISK_METADATA[color].maxWaitMinutes,
      };
    });

    const overduePercentage =
      triaged.length > 0 ? Math.round((overdueCount / triaged.length) * 100) : 0;

    // 2. Atendimentos por hora no dia
    const byHourMap = new Map<string, number>();
    periodEncounters.forEach((e) => {
      const hour = new Date(e.arrived_at).getHours();
      const label = `${String(hour).padStart(2, '0')}:00`;
      byHourMap.set(label, (byHourMap.get(label) ?? 0) + 1);
    });
    const hourlySeries = Array.from(byHourMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    // 3. Taxa de ocupação dos leitos (leitos ocupados / leitos operacionais não bloqueados)
    const operationalBeds = beds.filter((b) => b.status !== 'bloqueado');
    const occupiedBeds = beds.filter((b) => b.status === 'ocupado');
    const bedOccupancyRate =
      operationalBeds.length > 0
        ? Math.round((occupiedBeds.length / operationalBeds.length) * 100)
        : 0;

    return {
      total,
      triagedCount: triaged.length,
      overdueCount,
      overduePercentage,
      byColor,
      hourlySeries,
      bedOccupancyRate,
      occupiedBedsCount: occupiedBeds.length,
      operationalBedsCount: operationalBeds.length,
    };
  }, [periodEncounters, beds]);

  // Diferencial Criativo (Item 4): Exportação dos indicadores e atendimentos da gestão em CSV
  const handleExportCsv = () => {
    const headers = [
      'Senha',
      'Paciente',
      'Cor_Risco',
      'Situacao',
      'Chegada',
      'Espera_Minutos',
      'Fora_Do_Prazo',
      'Destino',
    ];
    const rows = periodEncounters.map((e) => {
      const refEnd = e.called_at ? new Date(e.called_at) : new Date();
      const waitMin = getWaitTimeMinutes(e.arrived_at, refEnd);
      const exceeded = isWaitTimeExceeded(e.current_risk, e.arrived_at, refEnd);
      return [
        e.ticket_number,
        `"${(e.patient?.full_name || '').replace(/"/g, '""')}"`,
        e.current_risk || 'nao_triado',
        e.status,
        e.arrived_at,
        String(waitMin),
        exceeded ? 'SIM' : 'NAO',
        e.destination || '-',
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantaops_indicadores_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredConsultList = periodEncounters.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.ticket_number.toLowerCase().includes(q) ||
      (e.patient?.full_name.toLowerCase().includes(q) ?? false) ||
      (e.chief_complaint?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      {/* Barra de Filtro por Período + Exportação CSV (Item 2.8 e 4) */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">
            Painel Executivo de Indicadores Hospitalares
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Indicadores calculados em tempo real a partir dos registros persistidos no banco
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'hoje', label: 'Hoje (24h)' },
              { id: '7dias', label: 'Últimos 7 dias' },
              { id: '30dias', label: 'Últimos 30 dias' },
            ] as Array<{ id: ManagementPeriodFilter; label: string }>
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                period === item.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <Download className="h-4 w-4" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Cards de Indicadores Principais usando o Componente Obrigatório StatCard (Item 2.8 e 3.2) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total de Atendimentos"
          value={metrics.total}
          subtitle={`${metrics.triagedCount} pacientes classificados no período`}
          icon={<Users className="h-5 w-5" />}
          variant="info"
        />

        <StatCard
          title="Atendimentos Fora do Prazo"
          value={`${metrics.overduePercentage}%`}
          subtitle={`${metrics.overdueCount} de ${metrics.triagedCount} excederam o tempo máximo da cor`}
          icon={<AlertTriangle className="h-5 w-5" />}
          variant={metrics.overduePercentage > 20 ? 'danger' : 'warning'}
        />

        <StatCard
          title="Taxa de Ocupação dos Leitos"
          value={`${metrics.bedOccupancyRate}%`}
          subtitle={`${metrics.occupiedBedsCount} ocupados de ${metrics.operationalBedsCount} leitos operacionais`}
          icon={<BedDouble className="h-5 w-5" />}
          variant={metrics.bedOccupancyRate >= 85 ? 'danger' : 'success'}
        />

        <StatCard
          title="Casos Graves (Vermelho/Laranja)"
          value={metrics.byColor.vermelho.count + metrics.byColor.laranja.count}
          subtitle="Emergência e Muito Urgente atendidos com prioridade máxima"
          icon={<Activity className="h-5 w-5" />}
          variant="default"
        />
      </div>

      {/* Gráficos de Distribuição por Cor, Tempo Médio vs. Tempo Máximo e Atendimentos por Hora (Item 2.8) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Distribuição e Tempo Médio por Cor comparado ao Tempo Máximo (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
            <Clock className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Distribuição por Cor & Tempo Médio de Espera vs. Tempo Máximo
              </h2>
              <p className="text-xs text-slate-500">
                Comparativo entre o tempo médio real de espera e a meta clínica do protocolo
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {ALL_COLORS.map((color) => {
              const info = metrics.byColor[color];
              const meta = RISK_METADATA[color];
              const isOverAvg =
                color === 'vermelho'
                  ? info.avgWaitMin > 0 && info.count > 0
                  : info.avgWaitMin > info.maxWaitMin;

              return (
                <div
                  key={color}
                  className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <RiskBadge color={color} size="sm" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {info.count} atendimentos ({info.percentage}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs">
                      <span
                        className={`rounded px-2 py-0.5 font-bold ${
                          isOverAvg
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        Média Real: {info.avgWaitMin} min
                      </span>
                      <span className="text-slate-500">
                        Meta Máx: {meta.maxWaitLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        color === 'vermelho'
                          ? 'bg-red-600'
                          : color === 'laranja'
                          ? 'bg-orange-500'
                          : color === 'amarelo'
                          ? 'bg-amber-400'
                          : color === 'verde'
                          ? 'bg-emerald-600'
                          : 'bg-sky-600'
                      }`}
                      style={{ width: `${Math.max(4, info.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Atendimentos por Hora no Dia (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Atendimentos por Hora no Dia
              </h2>
              <p className="text-xs text-slate-500">
                Volume de chegadas distribuído por faixa horária
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {metrics.hourlySeries.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Sem atendimentos no período selecionado.
              </p>
            ) : (
              metrics.hourlySeries.map(([hourLabel, count]) => {
                const maxInHour = Math.max(...metrics.hourlySeries.map(([, c]) => c), 1);
                const widthPct = Math.round((count / maxInHour) * 100);
                return (
                  <div key={hourLabel} className="space-y-1">
                    <div className="flex justify-between font-mono text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {hourLabel}
                      </span>
                      <span className="font-black text-purple-700 dark:text-purple-300">
                        {count} pac.
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-purple-600"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Consulta Geral Somente Leitura dos Dados Clínicos (Item 2.1 e 2.8) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              Consulta Geral de Atendimentos (Somente Leitura dos Dados Clínicos)
            </h2>
            <p className="text-xs text-slate-500">
              Auditoria clínica completa de triagens, prescrições, evoluções e desfechos
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por senha, paciente ou queixa..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-purple-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase dark:border-slate-800">
                <th className="py-3 px-2">Senha</th>
                <th className="py-3 px-2">Paciente</th>
                <th className="py-3 px-2">Classificação</th>
                <th className="py-3 px-2">Situação</th>
                <th className="py-3 px-2">Queixa / Evolução</th>
                <th className="py-3 px-2">Prescrições</th>
                <th className="py-3 px-2 text-right">Auditoria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loadingEncounters ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    Carregando registros...
                  </td>
                </tr>
              ) : (
                filteredConsultList.map((enc) => (
                  <tr key={enc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-2 font-mono font-black text-slate-900 dark:text-white">
                      {enc.ticket_number}
                    </td>
                    <td className="py-3 px-2 font-bold text-slate-900 dark:text-white">
                      {enc.patient ? (
                        <Link
                          to={`/pacientes/${enc.patient.id}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {enc.patient.full_name}
                        </Link>
                      ) : (
                        'Paciente'
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <RiskBadge color={enc.current_risk} size="sm" />
                    </td>
                    <td className="py-3 px-2 font-semibold text-slate-700 dark:text-slate-300">
                      {STATUS_LABELS[enc.status]}
                    </td>
                    <td className="py-3 px-2 max-w-xs truncate text-slate-600 dark:text-slate-400">
                      {enc.chief_complaint || '—'}
                    </td>
                    <td className="py-3 px-2 font-mono">
                      {enc.prescriptions?.length ?? 0} item(ns)
                    </td>
                    <td className="py-3 px-2 text-right">
                      <Link
                        to={`/atendimentos/${enc.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Prontuário</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
