// ============================================================================
// Gerenciamento de Estado da Interface com Zustand (Item 3.4 e 4)
// Controla filtros, preferências (tema escuro para plantão noturno, som da TV),
// consultório selecionado pelo médico e modais (pulseira QR Code / reclassificação).
// ============================================================================

import { create } from 'zustand';
import { RiskColor } from '../domain';

export type ManagementPeriodFilter = 'hoje' | '7dias' | '30dias';

interface UIState {
  // Filtro de cor na fila de atendimento (Item 2.4)
  queueColorFilter: RiskColor | 'todas';
  setQueueColorFilter: (color: RiskColor | 'todas') => void;

  // Filtro de período no painel da gestão (Item 2.8)
  managementPeriod: ManagementPeriodFilter;
  setManagementPeriod: (period: ManagementPeriodFilter) => void;

  // Consultório ativo selecionado pelo médico (Item 2.5)
  consultingRoom: string;
  setConsultingRoom: (room: string) => void;

  // Diferencial Criativo: Tema escuro para o plantão noturno (Item 4)
  darkMode: boolean;
  toggleDarkMode: () => void;

  // Diferencial Criativo: Aviso sonoro no painel da sala de espera (Item 4)
  soundEnabled: boolean;
  toggleSoundEnabled: () => void;

  // Modal de impressão da pulseira do paciente com QR Code (Item 4)
  wristbandEncounterId: string | null;
  openWristbandModal: (encounterId: string) => void;
  closeWristbandModal: () => void;
}

const initialDark =
  typeof window !== 'undefined' &&
  window.localStorage.getItem('plantaops_dark_mode') === 'true';

if (typeof document !== 'undefined' && initialDark) {
  document.documentElement.classList.add('dark');
}

export const useUIStore = create<UIState>((set) => ({
  queueColorFilter: 'todas',
  setQueueColorFilter: (queueColorFilter) => set({ queueColorFilter }),

  managementPeriod: 'hoje',
  setManagementPeriod: (managementPeriod) => set({ managementPeriod }),

  consultingRoom: 'Consultório 01',
  setConsultingRoom: (consultingRoom) => set({ consultingRoom }),

  darkMode: initialDark,
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('plantaops_dark_mode', String(next));
      }
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', next);
      }
      return { darkMode: next };
    }),

  soundEnabled: true,
  toggleSoundEnabled: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  wristbandEncounterId: null,
  openWristbandModal: (encounterId) => set({ wristbandEncounterId: encounterId }),
  closeWristbandModal: () => set({ wristbandEncounterId: null }),
}));
