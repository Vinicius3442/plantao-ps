// ============================================================================
// Controle de Acesso e Rotas Protegidas por Perfil (Item 2.1 e 3.3)
// - Usuário não autenticado volta automaticamente para /login.
// - Usuário autenticado sem permissão não acessa a área de outro perfil!
// ============================================================================

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { UserRole } from '../domain';
import { ROLE_HOME_ROUTE, ROLE_LABELS, useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
  children,
}) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            Verificando credenciais e perfil de acesso...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    const correctHome = ROLE_HOME_ROUTE[user.role];
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border-2 border-red-300 bg-white p-6 text-center shadow-lg dark:border-red-900 dark:bg-slate-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-xl font-black text-slate-900 dark:text-white">
            Acesso Restrito por Perfil (RLS)
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Você está autenticado como{' '}
            <strong className="font-bold text-slate-900 dark:text-white">
              {user.full_name} ({ROLE_LABELS[user.role]})
            </strong>
            . Este perfil não possui permissão para acessar esta área ({location.pathname}).
          </p>
          <div className="mt-6">
            <a
              href={correctHome}
              className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Voltar para Minha Área ({ROLE_LABELS[user.role]})
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
