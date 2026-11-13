// ============================================================================
// Página 10: Erro 404 - Página Não Encontrada (Item 3.3)
// ============================================================================

import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Home } from 'lucide-react';
import { ROLE_HOME_ROUTE, useAuth } from '../hooks/useAuth';

export const NotFoundPage: React.FC = () => {
  const { user } = useAuth();
  const homePath = user ? ROLE_HOME_ROUTE[user.role] : '/login';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <p className="mt-4 font-mono text-4xl font-black text-slate-900 dark:text-white">
          404
        </p>
        <h1 className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">
          Página Não Encontrada no PlantãoPS
        </h1>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          O endereço solicitado não existe ou foi movido. Retorne imediatamente para a sua estação de trabalho.
        </p>
        <div className="mt-6">
          <Link
            to={homePath}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
          >
            <Home className="h-4 w-4" />
            <span>Voltar para o Início</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
