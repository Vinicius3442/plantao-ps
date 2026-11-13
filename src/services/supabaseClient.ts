// ============================================================================
// Camada Services: Cliente Oficial do Supabase (@supabase/supabase-js)
// Usa sessionStorage para a sessão de Auth, permitindo abrir várias abas/janelas
// simultâneas cada uma logada com um perfil diferente (Item 5 - Cenário de Validação).
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('seu-projeto.supabase.co') &&
    supabaseAnonKey !== 'sua-chave-anon-publica-aqui'
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
        storageKey: 'plantaops_supabase_auth_token',
      },
    })
  : null;
