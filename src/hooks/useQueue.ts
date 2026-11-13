// ============================================================================
// Hook Personalizado Obrigatório 3: useQueue (Item 2.4, 3.2 e 3.4)
// Gerencia a fila de atendimento em tempo real com TanStack Query,
// ordena pela prioridade clínica (Item 2.9b) e calcula contadores por cor.
// ============================================================================

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Encounter, RiskColor, sortMedicalQueue } from '../domain';
import { fetchEncounters } from '../services/api';
import { useUIStore } from '../store/uiStore';
import { useRealtimeTable } from './useRealtimeTable';

export interface UseQueueResult {
  allEncounters: Encounter[];
  waitingTriageQueue: Encounter[];
  sortedMedicalQueue: Encounter[];
  filteredMedicalQueue: Encounter[];
  activeDoctorEncounter: (doctorId?: string) => Encounter | undefined;
  countsByColor: Record<RiskColor, number>;
  totalInMedicalQueue: number;
  queueColorFilter: RiskColor | 'todas';
  setQueueColorFilter: (color: RiskColor | 'todas') => void;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useQueue(): UseQueueResult {
  const queueColorFilter = useUIStore((s) => s.queueColorFilter);
  const setQueueColorFilter = useUIStore((s) => s.setQueueColorFilter);

  // Atualização em tempo real sem recarregar a página (Item 2.4 e 3.4)
  useRealtimeTable(['encounters', 'triages', 'patients', 'prescriptions'], [['encounters']]);

  const {
    data: allEncounters = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['encounters'],
    queryFn: fetchEncounters,
    refetchInterval: 15000, // Atualiza também o cálculo de tempo de espera a cada 15s
  });

  // Pacientes aguardando triagem, por ordem de chegada (Item 2.3)
  const waitingTriageQueue = useMemo(() => {
    return allEncounters
      .filter((e) => e.status === 'aguardando_triagem')
      .sort((a, b) => new Date(a.arrived_at).getTime() - new Date(b.arrived_at).getTime());
  }, [allEncounters]);

  // Pacientes triados aguardando médico, ordenados pela prioridade clínica (Item 2.4 e 2.9b)
  const sortedMedicalQueue = useMemo(() => {
    const waiting = allEncounters.filter((e) => e.status === 'aguardando_medico');
    return sortMedicalQueue(waiting, new Date());
  }, [allEncounters]);

  // Indicador da quantidade de pacientes em cada cor (Item 2.4)
  const countsByColor = useMemo(() => {
    const counts: Record<RiskColor, number> = {
      vermelho: 0,
      laranja: 0,
      amarelo: 0,
      verde: 0,
      azul: 0,
    };
    sortedMedicalQueue.forEach((enc) => {
      if (enc.current_risk) {
        counts[enc.current_risk]++;
      }
    });
    return counts;
  }, [sortedMedicalQueue]);

  // Filtro por cor (Item 2.4)
  const filteredMedicalQueue = useMemo(() => {
    if (queueColorFilter === 'todas') {
      return sortedMedicalQueue;
    }
    return sortedMedicalQueue.filter((e) => e.current_risk === queueColorFilter);
  }, [sortedMedicalQueue, queueColorFilter]);

  const activeDoctorEncounter = (doctorId?: string) => {
    return allEncounters.find(
      (e) =>
        e.status === 'em_atendimento' &&
        (!doctorId || !e.assigned_doctor_id || e.assigned_doctor_id === doctorId)
    );
  };

  return {
    allEncounters,
    waitingTriageQueue,
    sortedMedicalQueue,
    filteredMedicalQueue,
    activeDoctorEncounter,
    countsByColor,
    totalInMedicalQueue: sortedMedicalQueue.length,
    queueColorFilter,
    setQueueColorFilter,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
