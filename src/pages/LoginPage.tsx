// ============================================================================
// Página 1: Login e Seleção de Perfil (Item 2.1)
// Implementa autenticação com Supabase Auth (e-mail e senha), redirecionamento
// automático para a área do perfil e botões rápidos de credenciais de exemplo.
// ============================================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { ROLE_HOME_ROUTE, ROLE_LABELS, useAuth } from '../hooks/useAuth';
import { SEED_PROFILES } from '../services/localRealtimeEngine';
import { isSupabaseConfigured } from '../services/supabaseClient';

export const LoginPage: React.FC = () => {
  const { login, error, clearError } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('recepcao@plantaops.gov.br');
  const [password, setPassword] = useState('123456');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      const profile = await login(email, password);
      navigate(ROLE_HOME_ROUTE[profile.role], { replace: true });
    } catch {
      // Erro já tratado no estado do hook useAuth
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    clearError();
    setSubmitting(true);
    try {
      const profile = await login(presetEmail, presetPass);
      navigate(ROLE_HOME_ROUTE[profile.role], { replace: true });
    } catch {
      // Erro exibido na tela
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-center">
          {/* Coluna Esquerda: Apresentação e Contas de Exemplo */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3.5 py-1.5 text-xs font-bold text-blue-300">
              <Activity className="h-4 w-4 text-blue-400" />
              <span>Secretaria Municipal de Saúde • Pronto-Socorro 24h</span>
            </div>

            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                PlantãoPS.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                  Cada minuto conta!
                </span>
              </h1>
              <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
                Sistema integrado em tempo real para classificação de risco, fila de prioridade clínica,
                prescrição segura, mapa de leitos e painel de chamadas.
              </p>
            </div>

            {/* Lista de Perfis para Login com 1 Clique (Cenário de Validação em Múltiplas Janelas) */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-blue-300">
                  <Sparkles className="h-4 w-4" />
                  Acesso Rápido por Perfil (Senha padrão: 123456)
                </span>
                <span className="text-[11px] text-slate-400">
                  Clique para entrar direto
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SEED_PROFILES.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleQuickLogin(acc.email, acc.password)}
                    className="group flex flex-col justify-between rounded-xl border border-white/10 bg-slate-900/70 p-3 text-left transition hover:border-blue-400 hover:bg-blue-950/60 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-blue-300 border border-blue-400/20">
                        {ROLE_LABELS[acc.role]}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-300" />
                    </div>
                    <p className="mt-2 text-xs font-bold text-white">{acc.full_name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{acc.email}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                RLS por Perfil Ativo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-blue-400" />
                Modo de Conexão:{' '}
                <strong className="text-white">
                  {isSupabaseConfigured
                    ? 'Supabase Cloud (PostgreSQL + Auth + Realtime)'
                    : 'Supabase Ready + Sincronização Multi-Abas em Tempo Real'}
                </strong>
              </span>
            </div>
          </div>

          {/* Coluna Direita: Formulário de Login */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/15 bg-white p-6 sm:p-8 text-slate-900 shadow-2xl">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    Autenticação do Profissional
                  </h2>
                  <p className="text-xs text-slate-500">
                    Entre com seu e-mail institucional e senha
                  </p>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs font-semibold text-red-800"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-bold uppercase text-slate-700"
                  >
                    E-mail Profissional
                  </label>
                  <div className="relative mt-1">
                    <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm font-medium text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="seu.email@plantaops.gov.br"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-bold uppercase text-slate-700"
                  >
                    Senha
                  </label>
                  <div className="relative mt-1">
                    <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm font-medium text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <span>{submitting ? 'Autenticando...' : 'Entrar no PlantãoPS'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-5 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 border border-slate-200">
                <p className="font-bold text-slate-800">Regra de Segurança (Item 2.1):</p>
                <p className="mt-0.5">
                  O perfil do funcionário fica salvo no banco de dados e não pode ser alterado pelo
                  próprio usuário. Após o login, você será redirecionado automaticamente para sua área.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
