// ============================================================================
// Hook Personalizado Obrigatório 2: useRealtimeTable (Item 3.2, 3.4 e 3.5)
// Inscreve-se em eventos do Supabase Realtime (postgres_changes) e no canal
// Realtime entre abas, atualizando o cache do TanStack Query sem recarregar a página!
// ============================================================================

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  RealtimeTableName,
  subscribeRealtimeChanges,
} from '../services/api';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient';

export function useRealtimeTable(
  tables: RealtimeTableName | RealtimeTableName[],
  queryKeysToInvalidate: string[][],
  onEventCallback?: () => void
): void {
  const queryClient = useQueryClient();
  const tableList = Array.isArray(tables) ? tables : [tables];
  const tablesKey = tableList.join(',');

  useEffect(() => {
    const invalidateAll = () => {
      queryKeysToInvalidate.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      onEventCallback?.();
    };

    // 1. Subscrição oficial no Supabase Realtime (postgres_changes)
    let supabaseChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (isSupabaseConfigured && supabase) {
      supabaseChannel = supabase.channel(`realtime_${tablesKey}_${Math.random().toString(36).slice(2, 7)}`);
      tableList.forEach((table) => {
        supabaseChannel!.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => {
            invalidateAll();
          }
        );
      });
      supabaseChannel.subscribe();
    }

    // 2. Subscrição no BroadcastChannel + Storage multi-janelas
    const unsubscribeLocal = subscribeRealtimeChanges((payload) => {
      if (tableList.includes(payload.table) || payload.table === 'encounters') {
        invalidateAll();
      }
    });

    return () => {
      unsubscribeLocal();
      if (supabaseChannel && supabase) {
        supabase.removeChannel(supabaseChannel);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, queryClient]);
}
