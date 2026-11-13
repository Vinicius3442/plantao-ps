// ============================================================================
// Página 5: Mapa de Leitos em Tempo Real (Item 2.6)
// - Exibe a planta das alas (Sala Vermelha, Observação Clínica, Isolamento)
// - Status de cada leito: livre, ocupado, em limpeza ou bloqueado
// - Lista ao lado os pacientes que aguardam leito (destino observação ou internação)
// - Permite arrastar o paciente para um leito livre (Drag & Drop + Alocação Atômica)
// - Quando o paciente recebe alta ou é transferido, o leito passa automaticamente
//   para "em limpeza"; a enfermagem marca o leito como "livre" após a limpeza.
// ============================================================================

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BedDouble,
  CheckCircle2,
  GripVertical,
  LogOut,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { calculateAgeYears, Encounter } from '../domain';
import { BedTile } from '../components/BedTile';
import { RiskBadge } from '../components/RiskBadge';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import {
  fetchBeds,
  fetchEncounters,
  rpcAssignBed,
  rpcFinishMedicalConsultation,
  rpcReleaseBedCleaning,
} from '../services/api';

export const BedsMapPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useRealtimeTable(['beds', 'encounters'], [['beds'], ['encounters']]);

  const { data: beds = [], isLoading: loadingBeds } = useQuery({
    queryKey: ['beds'],
    queryFn: fetchBeds,
  });

  const { data: encounters = [] } = useQuery({
    queryKey: ['encounters'],
    queryFn: fetchEncounters,
  });

  // Pacientes que aguardam leito (destino observação ou internação -> status aguardando_leito)
  const waitingForBedList = encounters.filter((e) => e.status === 'aguardando_leito');

  const assignBedMutation = useMutation({
    mutationFn: ({ encounterId, bedId }: { encounterId: string; bedId: string }) =>
      rpcAssignBed(encounterId, bedId),
    onSuccess: (updatedBed) => {
      queryClient.invalidateQueries({ queryKey: ['beds'] });
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      setSelectedEncounterId(null);
      setFeedback({
        type: 'success',
        text: `Paciente alocado com sucesso no leito ${updatedBed.code} (${updatedBed.ward})! Situação atualizada para "Em observação".`,
      });
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Conflito ao tentar ocupar leito.',
      });
    },
  });

  const releaseCleaningMutation = useMutation({
    mutationFn: (bedId: string) => rpcReleaseBedCleaning(bedId),
    onSuccess: (updatedBed) => {
      queryClient.invalidateQueries({ queryKey: ['beds'] });
      setFeedback({
        type: 'success',
        text: `Higienização concluída! O leito ${updatedBed.code} agora está LIVRE para receber novos pacientes.`,
      });
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao liberar leito.',
      });
    },
  });

  const dischargeFromBedMutation = useMutation({
    mutationFn: ({
      encounter,
      destination,
    }: {
      encounter: Encounter;
      destination: 'alta' | 'transferencia';
    }) =>
      rpcFinishMedicalConsultation({
        encounter_id: encounter.id,
        clinical_notes:
          encounter.clinical_notes ||
          `Desfecho em leito de observação: ${destination.toUpperCase()}`,
        destination,
      }),
    onSuccess: (enc) => {
      queryClient.invalidateQueries({ queryKey: ['beds'] });
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      setFeedback({
        type: 'success',
        text: `Paciente ${enc.ticket_number} recebeu ${enc.destination?.toUpperCase()}! O leito passou automaticamente para "EM LIMPEZA".`,
      });
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao registrar alta do leito.',
      });
    },
  });

  // Agrupar leitos por Ala (ex: Sala Vermelha, Observação Clínica, Isolamento)
  const wards = Array.from(new Set(beds.map((b) => b.ward)));

  const stats = {
    total: beds.length,
    livre: beds.filter((b) => b.status === 'livre').length,
    ocupado: beds.filter((b) => b.status === 'ocupado').length,
    em_limpeza: beds.filter((b) => b.status === 'em_limpeza').length,
    bloqueado: beds.filter((b) => b.status === 'bloqueado').length,
  };

  return (
    <div className="space-y-6">
      {/* Resumo de Status dos Leitos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold uppercase text-slate-500">Total de Leitos</span>
          <p className="mt-1 font-mono text-2xl font-black text-slate-900 dark:text-white">
            {stats.total}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <span className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400">
            Livres
          </span>
          <p className="mt-1 font-mono text-2xl font-black text-emerald-800 dark:text-emerald-300">
            {stats.livre}
          </p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
          <span className="text-xs font-bold uppercase text-blue-700 dark:text-blue-400">
            Ocupados
          </span>
          <p className="mt-1 font-mono text-2xl font-black text-blue-800 dark:text-blue-300">
            {stats.ocupado}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <span className="text-xs font-bold uppercase text-amber-700 dark:text-amber-400">
            Em Limpeza
          </span>
          <p className="mt-1 font-mono text-2xl font-black text-amber-800 dark:text-amber-300">
            {stats.em_limpeza}
          </p>
        </div>
        <div className="rounded-xl border border-slate-300 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
            Bloqueados
          </span>
          <p className="mt-1 font-mono text-2xl font-black text-slate-700 dark:text-slate-300">
            {stats.bloqueado}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-xl border p-4 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Coluna Lateral: Pacientes Aguardando Leito (Arrastáveis - Item 2.6) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
              <BedDouble className="h-5 w-5 text-purple-600" />
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Aguardando Leito ({waitingForBedList.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Arraste o paciente até um leito LIVRE ao lado (ou clique para selecionar)
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {waitingForBedList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
                  <UserCheck className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nenhum paciente aguardando leito no momento.
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Quando o médico encaminha um paciente para Observação ou Internação, ele aparece aqui.
                  </p>
                </div>
              ) : (
                waitingForBedList.map((enc) => {
                  const isSelected = selectedEncounterId === enc.id;
                  const age = enc.patient ? calculateAgeYears(enc.patient.birth_date) : null;

                  return (
                    <div
                      key={enc.id}
                      draggable={user?.role === 'enfermagem' || user?.role === 'medico'}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', enc.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setSelectedEncounterId(enc.id);
                      }}
                      onClick={() =>
                        setSelectedEncounterId(isSelected ? null : enc.id)
                      }
                      className={`cursor-grab active:cursor-grabbing rounded-xl border-2 p-3.5 transition ${
                        isSelected
                          ? 'border-purple-600 bg-purple-50/70 dark:border-purple-500 dark:bg-purple-950/40'
                          : 'border-slate-200 bg-white hover:border-purple-300 dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-slate-400" />
                          <span className="rounded bg-purple-600 px-2 py-0.5 font-mono text-xs font-black text-white">
                            {enc.ticket_number}
                          </span>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {enc.patient?.full_name}
                          </span>
                        </div>
                        <RiskBadge color={enc.current_risk} size="sm" />
                      </div>

                      <div className="mt-2 pl-6 text-xs text-slate-600 dark:text-slate-400">
                        <p>
                          Destino médico:{' '}
                          <strong className="uppercase text-purple-700 dark:text-purple-300">
                            {enc.destination || 'Observação'}
                          </strong>{' '}
                          • {age} anos
                        </p>
                        {enc.chief_complaint && (
                          <p className="mt-0.5 line-clamp-1 text-slate-500">
                            {enc.chief_complaint}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Ações Rápidas de Alta em Leito (Para Médicos demonstrarem a passagem automática p/ Em Limpeza) */}
          {user?.role === 'medico' && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <h3 className="text-xs font-black uppercase text-indigo-900 dark:text-indigo-200">
                Desfecho Médico de Pacientes em Observação
              </h3>
              <p className="mt-1 text-xs text-indigo-800 dark:text-indigo-300">
                Ao dar alta ou transferir um paciente ocupado num leito, o leito muda automaticamente para &ldquo;EM LIMPEZA&rdquo;.
              </p>

              <div className="mt-3 space-y-2">
                {beds
                  .filter((b) => b.status === 'ocupado' && b.current_encounter)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-white p-3 dark:border-indigo-800 dark:bg-slate-900"
                    >
                      <div className="text-xs">
                        <span className="font-mono font-black text-indigo-600">
                          {b.code}
                        </span>{' '}
                        •{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {b.current_encounter?.patient?.full_name}
                        </strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            b.current_encounter &&
                            window.confirm(
                              `Confirmar ALTA MÉDICA para ${b.current_encounter.patient?.full_name} no leito ${b.code}? O leito irá automaticamente para EM LIMPEZA.`
                            )
                          ) {
                            dischargeFromBedMutation.mutate({
                              encounter: b.current_encounter,
                              destination: 'alta',
                            });
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <LogOut className="h-3 w-3" />
                        <span>Dar Alta</span>
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Coluna Principal: Planta das Alas e Leitos (Item 2.6) */}
        <div className="lg:col-span-8 space-y-6">
          {loadingBeds ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm text-slate-500">Carregando planta das alas...</p>
            </div>
          ) : (
            wards.map((wardName) => {
              const wardBeds = beds.filter((b) => b.ward === wardName);
              return (
                <div
                  key={wardName}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Ala: {wardName}
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">
                      {wardBeds.filter((b) => b.status === 'livre').length} livres de{' '}
                      {wardBeds.length} leitos
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {wardBeds.map((bed) => (
                      <BedTile
                        key={bed.id}
                        bed={bed}
                        canReleaseCleaning={user?.role === 'enfermagem'}
                        selectedEncounterIdForAssign={
                          user?.role === 'enfermagem' || user?.role === 'medico'
                            ? selectedEncounterId
                            : null
                        }
                        onDropPatientOnBed={(encounterId, bedId) => {
                          assignBedMutation.mutate({ encounterId, bedId });
                        }}
                        onClickAssignSelected={(encounterId, bedId) => {
                          assignBedMutation.mutate({ encounterId, bedId });
                        }}
                        onReleaseCleaning={(bedId) => {
                          releaseCleaningMutation.mutate(bedId);
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
