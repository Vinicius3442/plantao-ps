// ============================================================================
// Configuração de Rotas com React Router (Item 3.3)
// - Layout próprio para cada perfil (RoleLayout)
// - Rotas protegidas por perfil (ProtectedRoute)
// - Rotas com parâmetros: /atendimentos/:id e /pacientes/:id
// - Rota do painel em modo quiosque, sem menus: /painel
// - Página de erro 404: *
// ============================================================================

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, ROLE_HOME_ROUTE, useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './layouts/ProtectedRoute';
import { RoleLayout } from './layouts/RoleLayout';
import { BedsMapPage } from './pages/BedsMapPage';
import { DoctorPage } from './pages/DoctorPage';
import { EncounterDetailPage } from './pages/EncounterDetailPage';
import { LoginPage } from './pages/LoginPage';
import { ManagementPage } from './pages/ManagementPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NursingPage } from './pages/NursingPage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { ReceptionPage } from './pages/ReceptionPage';
import { WaitingRoomPanelPage } from './pages/WaitingRoomPanelPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

const RootRedirect: React.FC = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME_ROUTE[user.role]} replace />;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Rota inicial redireciona para a área do perfil autenticado ou /login */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />

            {/* 1. Perfil Recepção */}
            <Route
              path="/recepcao"
              element={
                <ProtectedRoute allowedRoles={['recepcao']}>
                  <RoleLayout>
                    <ReceptionPage />
                  </RoleLayout>
                </ProtectedRoute>
              }
            />

            {/* 2. Perfil Enfermagem */}
            <Route
              path="/enfermagem"
              element={
                <ProtectedRoute allowedRoles={['enfermagem']}>
                  <RoleLayout>
                    <NursingPage />
                  </RoleLayout>
                </ProtectedRoute>
              }
            />

            {/* 3. Perfil Médico */}
            <Route
              path="/medico"
              element={
                <ProtectedRoute allowedRoles={['medico']}>
                  <RoleLayout>
                    <DoctorPage />
                  </RoleLayout>
                </ProtectedRoute>
              }
            />

            {/* 4. Mapa de Leitos (Acessível a Enfermagem, Médico e Gestão) */}
            <Route
              path="/leitos"
              element={
                <ProtectedRoute allowedRoles={['enfermagem', 'medico', 'gestao']}>
                  <RoleLayout>
                    <BedsMapPage />
                  </RoleLayout>
                </ProtectedRoute>
              }
            />

            {/* 5. Perfil Gestão */}
            <Route
              path="/gestao"
              element={
                <ProtectedRoute allowedRoles={['gestao']}>
                  <RoleLayout>
                    <ManagementPage />
                  </RoleLayout>
                </ProtectedRoute>
              }
            />

            {/* 6. Rota do Painel da Sala de Espera em Modo Quiosque (Sem Menus - Item 2.7 e 3.3) */}
            <Route
              path="/painel"
              element={
                <ProtectedRoute allowedRoles={['painel', 'gestao', 'recepcao', 'enfermagem', 'medico']}>
                  <WaitingRoomPanelPage />
                </ProtectedRoute>
              }
            />

            {/* 7. Rotas com Parâmetros (/atendimentos/:id e /pacientes/:id - Item 3.3) */}
            <Route
              path="/atendimentos/:id"
              element={
                <ProtectedRoute allowedRoles={['recepcao', 'enfermagem', 'medico', 'gestao']}>
                  <RoleLayout>
                    <EncounterDetailPage />
                  </RoleLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/pacientes/:id"
              element={
                <ProtectedRoute allowedRoles={['recepcao', 'enfermagem', 'medico', 'gestao']}>
                  <RoleLayout>
                    <PatientDetailPage />
                  </RoleLayout>
                </ProtectedRoute>
              }
            />

            {/* 8. Página de Erro 404 (Item 3.3) */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
