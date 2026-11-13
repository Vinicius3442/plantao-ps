// ============================================================================
// Página 6: Painel de Chamadas da Sala de Espera - Modo Quiosque TV (Item 2.7, 3.3 e 4)
// - Tela cheia, letras gigantes, sem menus (modo quiosque para TV)
// - Exibe a chamada atual (senha e consultório) em destaque e as últimas 5 chamadas
// - Por privacidade (LGPD / Item 2.7), NUNCA exibe o nome do paciente!
// - Exibe o tempo médio de espera atual por cor
// - Atualização em tempo real a cada nova chamada + Aviso Sonoro Hospitalar (Item 4)
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BellRing,
  Clock,
  LogOut,
  Maximize2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { RISK_METADATA, RiskColor } from '../domain';
import { RiskBadge } from '../components/RiskBadge';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import { fetchWaitingRoomPanelData } from '../services/api';
import { useUIStore } from '../store/uiStore';

const ALL_COLORS: RiskColor[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul'];

/**
 * Emite um sinal sonoro hospitalar (Ding-Dong em Web Audio API) a cada nova chamada (Item 4).
 */
function playHospitalChime() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playNote(659.25, now, 0.45); // E5
    playNote(523.25, now + 0.35, 0.7); // C5
  } catch {
    // Ignorar caso autoplay de áudio ainda não tenha sido desbloqueado pelo navegador
  }
}

export const WaitingRoomPanelPage: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const soundEnabled = useUIStore((s) => s.soundEnabled);
  const toggleSoundEnabled = useUIStore((s) => s.toggleSoundEnabled);

  const [currentTime, setCurrentTime] = useState(() => new Date());
  const lastCallIdRef = useRef<string | null>(null);
  const [highlightPulse, setHighlightPulse] = useState(false);

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useRealtimeTable(['calls', 'encounters'], [['panel_calls']]);

  const { data } = useQuery({
    queryKey: ['panel_calls'],
    queryFn: fetchWaitingRoomPanelData,
    refetchInterval: 5000,
  });

  const currentCall = data?.currentCall ?? null;
  const recentCalls = data?.recentCalls ?? [];

  // Disparar aviso sonoro e animação visual a cada nova chamada (Item 2.7 e 4)
  useEffect(() => {
    if (currentCall && currentCall.id !== lastCallIdRef.current) {
      if (lastCallIdRef.current !== null && soundEnabled) {
        playHospitalChime();
      }
      lastCallIdRef.current = currentCall.id;
      setHighlightPulse(true);
      const t = setTimeout(() => setHighlightPulse(false), 4000);
      return () => clearTimeout(t);
    }
  }, [currentCall, soundEnabled]);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 lg:p-10 select-none">
      {/* Topo Quiosque */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
            <Activity className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-white">
              PRONTO-SOCORRO MUNICIPAL • PAINEL DE CHAMADAS
            </h1>
            <p className="text-sm font-medium text-slate-400">
              Atenção ao número da sua senha e ao consultório indicado • Privacidade protegida (LGPD)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right font-mono">
            <p className="text-2xl lg:text-3xl font-black text-emerald-400">
              {currentTime.toLocaleTimeString('pt-BR')}
            </p>
            <p className="text-xs text-slate-400">
              {currentTime.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              })}
            </p>
          </div>

          <div className="flex items-center gap-2 border-l border-white/10 pl-4">
            <button
              type="button"
              onClick={() => {
                toggleSoundEnabled();
                if (!soundEnabled) playHospitalChime();
              }}
              className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-slate-300 hover:bg-white/10 hover:text-white"
              title={soundEnabled ? 'Aviso sonoro ativado' : 'Aviso sonoro silenciado'}
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <VolumeX className="h-5 w-5 text-rose-400" />
              )}
            </button>

            <button
              type="button"
              onClick={handleFullscreen}
              className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-slate-300 hover:bg-white/10 hover:text-white"
              title="Alternar Tela Cheia (Modo TV)"
            >
              <Maximize2 className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-slate-400 hover:bg-red-600/20 hover:text-red-300"
              title="Sair do Modo Quiosque"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Área Central: Chamada Atual em Destaque Gigante + Últimas 5 Chamadas (Item 2.7) */}
      <main className="my-6 grid flex-1 grid-cols-1 gap-8 lg:grid-cols-12 items-stretch">
        {/* Chamada Atual (7 colunas) */}
        <div
          className={`lg:col-span-7 flex flex-col justify-between rounded-3xl border-4 p-8 lg:p-12 transition-all duration-500 ${
            highlightPulse
              ? 'border-amber-400 bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 shadow-2xl shadow-amber-500/20 scale-[1.01]'
              : 'border-blue-500/40 bg-gradient-to-br from-slate-900 via-blue-950/60 to-slate-900 shadow-2xl'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 border border-amber-400/40 px-4 py-1.5 text-sm lg:text-base font-black uppercase tracking-widest text-amber-300">
              <BellRing className="h-5 w-5 animate-bounce" />
              CHAMADA ATUAL
            </span>
            {currentCall && <RiskBadge color={currentCall.risk_color} size="lg" />}
          </div>

          {currentCall ? (
            <div className="my-8 text-center">
              <p className="text-sm lg:text-lg font-bold uppercase tracking-widest text-slate-400">
                SENHA DE ATENDIMENTO
              </p>
              <div className="mt-2 font-mono text-7xl sm:text-8xl lg:text-9xl font-black tracking-tight text-white drop-shadow">
                {currentCall.ticket_number}
              </div>

              <div className="mt-8 inline-block rounded-2xl border-2 border-emerald-400/40 bg-emerald-500/15 px-8 py-4">
                <p className="text-xs lg:text-sm font-bold uppercase tracking-widest text-emerald-300">
                  DIRIJA-SE IMEDIATAMENTE AO
                </p>
                <p className="mt-1 text-3xl sm:text-4xl lg:text-5xl font-black uppercase text-white">
                  {currentCall.consulting_room}
                </p>
              </div>
            </div>
          ) : (
            <div className="my-auto text-center">
              <p className="text-2xl font-bold text-slate-400">
                Aguardando próxima chamada médica...
              </p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs lg:text-sm text-slate-400">
            <span>
              Por proteção à privacidade (LGPD), este painel exibe exclusivamente a senha e o consultório.
            </span>
            {currentCall && (
              <span className="font-mono font-bold text-slate-300">
                Horário:{' '}
                {new Date(currentCall.called_at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>

        {/* Últimas Cinco Chamadas (5 colunas) */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-3xl border border-white/10 bg-slate-900/80 p-6 lg:p-8">
          <div>
            <h2 className="text-lg lg:text-xl font-black uppercase tracking-wider text-slate-300 border-b border-white/10 pb-4">
              Últimas 5 Chamadas Realizadas
            </h2>

            <div className="mt-4 space-y-3">
              {recentCalls.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  Nenhuma chamada anterior registrada.
                </p>
              ) : (
                recentCalls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-4"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-2xl lg:text-3xl font-black text-white">
                        {call.ticket_number}
                      </span>
                      <RiskBadge color={call.risk_color} size="sm" />
                    </div>

                    <div className="text-right">
                      <p className="text-base lg:text-lg font-extrabold text-emerald-400">
                        {call.consulting_room}
                      </p>
                      <p className="font-mono text-xs text-slate-400">
                        {new Date(call.called_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white/5 p-3 text-center text-xs text-slate-400">
            A ordem de chamada respeita rigorosamente a gravidade clínica (Classificação de Risco),
            e não a ordem de chegada.
          </div>
        </div>
      </main>

      {/* Rodapé: Tempo Médio de Espera Atual por Cor (Item 2.7) */}
      <footer className="rounded-2xl border border-white/10 bg-slate-900/90 p-5">
        <div className="flex items-center gap-2 mb-3 text-xs font-black uppercase tracking-wider text-slate-400">
          <Clock className="h-4 w-4 text-blue-400" />
          <span>Tempo Médio de Espera Atual por Classificação de Risco</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {ALL_COLORS.map((color) => {
            const meta = RISK_METADATA[color];
            const avgMin = data?.averageWaitByColor[color] ?? 0;
            const waitingCount = data?.waitingCountByColor[color] ?? 0;

            return (
              <div
                key={color}
                className="flex flex-col justify-between rounded-xl border border-white/10 bg-slate-950 p-3.5"
              >
                <div className="flex items-center justify-between">
                  <RiskBadge color={color} size="sm" />
                  <span className="font-mono text-xs text-slate-400">
                    {waitingCount} na fila
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="font-mono text-xl lg:text-2xl font-black text-white">
                    {avgMin} min
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Meta: {meta.maxWaitLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </footer>
    </div>
  );
};
