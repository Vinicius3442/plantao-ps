// ============================================================================
// Hook Personalizado Obrigatório 1: useAuth (Item 2.1 e 3.2)
// Gerencia sessão do usuário, login, logout e redirecionamento automático por perfil.
// ============================================================================

import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, UserRole } from '../domain';
import {
  getCurrentSessionProfile,
  signInWithEmail,
  signOutUser,
} from '../services/api';
import { useUIStore } from '../store/uiStore';

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const ROLE_HOME_ROUTE: Record<UserRole, string> = {
  recepcao: '/recepcao',
  enfermagem: '/enfermagem',
  medico: '/medico',
  gestao: '/gestao',
  painel: '/painel',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  recepcao: 'Recepção',
  enfermagem: 'Enfermagem',
  medico: 'Médico Plantonista',
  gestao: 'Gestão Hospitalar',
  painel: 'Painel de Chamadas (Quiosque TV)',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const setConsultingRoom = useUIStore((s) => s.setConsultingRoom);

  useEffect(() => {
    let mounted = true;
    getCurrentSessionProfile()
      .then((profile) => {
        if (!mounted) return;
        setUser(profile);
        if (profile?.default_room && profile.role === 'medico') {
          setConsultingRoom(profile.default_room);
        }
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [setConsultingRoom]);

  const login = async (email: string, password: string): Promise<UserProfile> => {
    setError(null);
    setIsLoading(true);
    try {
      const profile = await signInWithEmail(email, password);
      setUser(profile);
      if (profile.default_room && profile.role === 'medico') {
        setConsultingRoom(profile.default_room);
      }
      return profile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao autenticar usuário.';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await signOutUser();
      setUser(null);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        login,
        logout,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de um <AuthProvider>.');
  }
  return ctx;
}
