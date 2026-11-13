// ============================================================================
// Layout Próprio para Cada Perfil (Item 3.3 e 4)
// Personaliza identidade visual, cabeçalho, navegação, atalhos e indicadores
// de conexão Realtime conforme o perfil logado (Recepção, Enfermagem, Médico, Gestão).
// Nota: O perfil Painel utiliza KioskLayout (modo quiosque em tela cheia, sem menus).
// ============================================================================

import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BedDouble,
  ClipboardList,
  Database,
  ExternalLink,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Moon,
  RotateCcw,
  Stethoscope,
  Sun,
  Tv,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { UserRole } from '../domain';
import { ROLE_HOME_ROUTE, ROLE_LABELS, useAuth } from '../hooks/useAuth';
import { resetLocalDbToSeed, simulateBusyShiftBatch } from '../services/api';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { useUIStore } from '../store/uiStore';

interface RoleLayoutProps {
  children: React.ReactNode;
}

const ROLE_THEME: Record<
  UserRole,
  {
    accentBg: string;
    badgeBg: string;
    subtitle: string;
    navItems: Array<{ to: string; label: string; icon: React.ReactNode }>;
  }
> = {
  recepcao: {
    accentBg: 'from-sky-700 to-blue-800',
    badgeBg: 'bg-sky-500/20 text-sky-100 border-sky-400/30',
    subtitle: 'Guichê de Recepção • Cadastro e Abertura de Senhas',
    navItems: [
      {
        to: '/recepcao',
        label: 'Recepção & Senhas do Dia',
        icon: <UserPlus className="h-4 w-4" />,
      },
    ],
  },
  enfermagem: {
    accentBg: 'from-teal-700 to-emerald-800',
    badgeBg: 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30',
    subtitle: 'Posto de Enfermagem • Classificação de Risco, Fila e Mapa de Leitos',
    navItems: [
      {
        to: '/enfermagem',
        label: 'Triagem & Fila em Tempo Real',
        icon: <HeartPulse className="h-4 w-4" />,
      },
      {
        to: '/leitos',
        label: 'Mapa de Leitos & Limpeza',
        icon: <BedDouble className="h-4 w-4" />,
      },
    ],
  },
  medico: {
    accentBg: 'from-indigo-800 to-blue-900',
    badgeBg: 'bg-indigo-500/20 text-indigo-100 border-indigo-400/30',
    subtitle: 'Consultório Médico • Chamada Atômica, Evolução, Prescrição e Desfecho',
    navItems: [
      {
        to: '/medico',
        label: 'Fila & Atendimento Médico',
        icon: <Stethoscope className="h-4 w-4" />,
      },
      {
        to: '/leitos',
        label: 'Mapa de Leitos (Observação)',
        icon: <BedDouble className="h-4 w-4" />,
      },
    ],
  },
  gestao: {
    accentBg: 'from-slate-800 to-slate-900',
    badgeBg: 'bg-purple-500/20 text-purple-100 border-purple-400/30',
    subtitle: 'Diretoria Clínica • Indicadores em Tempo Real e Auditoria (Somente Leitura)',
    navItems: [
      {
        to: '/gestao',
        label: 'Painel de Indicadores & Consulta Geral',
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
      {
        to: '/leitos',
        label: 'Ocupação de Leitos',
        icon: <BedDouble className="h-4 w-4" />,
      },
    ],
  },
  painel: {
    accentBg: 'from-slate-900 to-black',
    badgeBg: 'bg-blue-500/20 text-blue-100 border-blue-400/30',
    subtitle: 'Painel de Chamadas da Sala de Espera',
    navItems: [
      {
        to: '/painel',
        label: 'Modo Quiosque TV',
        icon: <Tv className="h-4 w-4" />,
      },
    ],
  },
};

export const RoleLayout: React.FC<RoleLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const darkMode = useUIStore((s) => s.darkMode);
  const toggleDarkMode = useUIStore((s) => s.toggleDarkMode);
  const [simulating, setSimulating] = React.useState(false);

  if (!user) return null;

  const theme = ROLE_THEME[user.role];

  const handleSimulateShift = async () => {
    setSimulating(true);
    try {
      await simulateBusyShiftBatch();
      queryClient.invalidateQueries();
    } finally {
      setSimulating(false);
    }
  };

  const handleResetDemo = () => {
    if (
      window.confirm(
        'Deseja restaurar os dados de demonstração do plantão para o estado inicial?'
      )
    ) {
      resetLocalDbToSeed();
      queryClient.invalidateQueries();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Header Personalizado por Perfil */}
      <header className={`bg-gradient-to-r ${theme.accentBg} text-white shadow-md`}>
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Marca e Perfil */}
            <div className="flex items-center gap-3">
              <Link
                to={ROLE_HOME_ROUTE[user.role]}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/30"
              >
                <Activity className="h-6 w-6 text-white" />
              </Link>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={ROLE_HOME_ROUTE[user.role]}
                    className="text-lg font-black tracking-tight text-white"
                  >
                    PlantãoPS
                  </Link>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-extrabold uppercase ${theme.badgeBg}`}
                  >
                    {ROLE_LABELS[user.role]}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 border border-emerald-400/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Realtime Ativo (
                    {isSupabaseConfigured ? 'Supabase Cloud' : 'Multi-Abas Sync'})
                  </span>
                </div>
                <p className="text-xs text-white/80">{theme.subtitle}</p>
              </div>
            </div>

            {/* Controles Superiores e Perfil Logado */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Gerador de Pacientes Fictícios (Diferencial Item 4) */}
              <button
                type="button"
                onClick={handleSimulateShift}
                disabled={simulating}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-50"
                title="Diferencial Criativo: Gerar lote de pacientes fictícios para simular plantão lotado"
              >
                <Zap className="h-3.5 w-3.5 text-amber-300" />
                <span className="hidden sm:inline">
                  {simulating ? 'Gerando...' : '+ Simular Plantão'}
                </span>
              </button>

              {!isSupabaseConfigured && (
                <button
                  type="button"
                  onClick={handleResetDemo}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/15"
                  title="Restaurar dados iniciais do banco de demonstração"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Resetar Dados</span>
                </button>
              )}

              {/* Alternar Tema Noturno (Diferencial Item 4) */}
              <button
                type="button"
                onClick={toggleDarkMode}
                className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 p-1.5 text-xs font-semibold text-white hover:bg-white/20"
                aria-label="Alternar tema escuro para plantão noturno"
                title="Alternar Tema Escuro (Plantão Noturno)"
              >
                {darkMode ? (
                  <Sun className="h-4 w-4 text-amber-300" />
                ) : (
                  <Moon className="h-4 w-4 text-sky-200" />
                )}
              </button>

              {/* Informações do Profissional */}
              <div className="hidden lg:flex flex-col items-end border-l border-white/20 pl-3 text-right">
                <span className="text-xs font-bold text-white">{user.full_name}</span>
                <span className="text-[11px] text-white/75">{user.email}</span>
              </div>

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sair</span>
              </button>
            </div>
          </div>

          {/* Barra de Navegação do Perfil */}
          <nav
            aria-label="Navegação do perfil"
            className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              {theme.navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-white/85 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-white/80">
              <Users className="h-3.5 w-3.5" />
              <span>
                Dica Multi-Janelas: Abra outra aba em{' '}
                <a
                  href="/login"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-bold text-white underline hover:text-amber-200"
                >
                  nova janela <ExternalLink className="h-3 w-3" />
                </a>{' '}
                para logar com outro perfil simultaneamente!
              </span>
            </div>
          </nav>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* Rodapé Técnico */}
      <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
          <span className="font-semibold">
            PlantãoPS — Cada minuto conta! • Sistema de Classificação de Risco e Fluxo Hospitalar
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
            <Database className="h-3.5 w-3.5 text-blue-600" />
            RLS & RPCs Atômicas Ativas • Perfil atual: {user.role.toUpperCase()}
          </span>
        </div>
      </footer>
    </div>
  );
};
