# PlantãoPS — Cada minuto conta! 🏥

Sistema web integrado em tempo real para gestão de fluxo de atendimento de Pronto-Socorro Municipal (da chegada à alta), desenvolvido com **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, **TanStack Query (React Query)**, **Zustand**, **React Hook Form + Zod** e **Supabase** (Auth, PostgreSQL, RLS, Funções RPC em PL/pgSQL e Realtime).

---

## 📋 1. Arquitetura do Projeto (Separação em Camadas)

O código-fonte está organizado em camadas desacopladas (`src/`):

- **`src/domain/`**: Regras de negócio em **funções puras** (sem dependência de React ou Supabase):
  - `riskClassification.ts`: Classificação de risco pelo critério mais grave (`vermelho`, `laranja`, `amarelo`, `verde`, `azul`).
  - `queueSorting.ts`: Ordenação da fila por prioridade de cor, maior tempo de espera e desempate legal (idosos $\ge 60$ anos e crianças $< 12$ anos).
  - `statusTransitions.ts`: Máquina de estados estrita com todas as transições permitidas e proibidas.
  - `prescriptionValidation.ts`: Bloqueio de prescrição por alergia medicamentosa e por dose acima da dose máxima cadastrada.
  - `schemas.ts`: Schemas de validação **Zod** para os formulários (limites coerentes de sinais vitais e mensagens claras).
- **`src/services/`**: Camada de dados e integração com o **Supabase** (`supabaseClient.ts`, `api.ts` e `localRealtimeEngine.ts` para sincronização multi-abas). Os componentes de tela nunca chamam o Supabase diretamente.
- **`src/hooks/`**: Hooks personalizados reutilizáveis:
  - `useAuth`: Autenticação, sessão por aba e redirecionamento automático por perfil.
  - `useQueue`: Fila de atendimento em tempo real com cache no TanStack Query, filtros e contadores por cor.
  - `useRealtimeTable`: Subscrição em canais do Supabase Realtime (`postgres_changes`) e BroadcastChannel para atualizar o cache do React Query sem recarregar a página.
- **`src/components/`**: Componentes reutilizáveis que recebem dados por propriedades:
  - `RiskBadge`: Cor, símbolo e texto explícito da classificação (acessibilidade para daltonismo).
  - `WaitTimer`: Contador de espera em tempo real com alerta visual ao estourar o prazo máximo da cor.
  - `QueueItem`: Card do paciente na fila com indicadores clínicos, alergias, idade prioritária e ações.
  - `VitalSignsForm`: Formulário de sinais vitais com sugestão automática da cor em tempo real e justificativa obrigatória ao alterar.
  - `BedTile`: Leito no mapa das alas com suporte a Drag & Drop e liberação de limpeza.
  - `StatCard`: Indicador executivo do painel da gestão.
  - `WristbandModal`: Pulseira hospitalar para impressão com QR Code, Linha do Tempo (`EncounterTimeline`) e Gráfico Seriado de Sinais Vitais (`VitalsEvolutionChart`).
- **`src/layouts/` e `src/pages/`**: Layouts dedicados por perfil, rotas protegidas (`ProtectedRoute`), modo quiosque sem menus para a TV da sala de espera (`/painel`), rotas parametrizadas (`/atendimentos/:id` e `/pacientes/:id`) e página 404.

---

## 🗄️ 2. Como Criar e Recriar o Banco no Supabase

Todos os scripts SQL estão na pasta [`supabase/`](./supabase/) para recriar o banco de dados do zero:

1. Crie um novo projeto no [Supabase](https://supabase.com/).
2. No menu lateral do Supabase, abra o **SQL Editor** e execute os 4 arquivos na ordem numérica:
   1. `supabase/01_schema.sql` — Cria os tipos enumerados (`user_role`, `risk_color`, `encounter_status`, `bed_status`), as 11 tabelas (`profiles`, `patients`, `patient_allergies`, `encounters`, `triages`, `encounter_events`, `medications`, `prescriptions`, `beds`, `bed_assignments`, `calls`), índices únicos parciais anti-conflito e publica as tabelas no `supabase_realtime`.
   2. `supabase/02_rls_policies.sql` — Ativa **Row Level Security (RLS)** em todas as tabelas com policies por perfil, bloqueando leitura de dados clínicos pela recepção e dados pessoais pelo painel, além de triggers que validam alergia/dose máxima no banco.
   3. `supabase/03_rpc_functions.sql` — Cria as funções RPC atômicas em PL/pgSQL (`rpc_open_encounter`, `rpc_record_triage`, `rpc_call_next_patient` com `FOR UPDATE SKIP LOCKED`, `rpc_finish_medical_consultation`, `rpc_assign_bed`, `rpc_release_bed_cleaning`, `rpc_cancel_encounter`).
   4. `supabase/04_seed.sql` — Popula o catálogo de medicamentos, os leitos iniciais e cria automaticamente as contas de exemplo no `auth.users` e `public.profiles`.

---

## ⚙️ 3. Configuração das Variáveis de Ambiente

1. Copie o arquivo `.env.example` para `.env` na raiz do projeto:
   ```bash
   cp .env.example .env
   ```
2. Preencha com a URL e a chave `anon` (pública) do seu projeto Supabase (**Settings > API**):
   ```env
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica-aqui
   ```
   > **Segurança:** A chave `service_role` **jamais** é utilizada no código da aplicação nem versionada no repositório.
   > **Modo Multi-Janelas Instantâneo:** Caso execute o projeto antes de configurar um projeto remoto no `.env`, o sistema ativa automaticamente o motor persistente local com sincronização **Realtime entre abas** (`BroadcastChannel` + `Web Locks API`), permitindo testar imediatamente todos os cenários multi-janelas!

---

## 👥 4. Usuários de Exemplo para Cada Perfil

Todas as contas abaixo são criadas pelo script `supabase/04_seed.sql` (e também estão disponíveis para login com 1 clique na tela `/login`):

| Perfil | E-mail | Senha | Área / Permissões |
| :--- | :--- | :--- | :--- |
| **Recepção** | `recepcao@plantaops.gov.br` | `123456` | `/recepcao` — Cadastro de pacientes, abertura de senhas e lista do dia (sem acesso a dados clínicos). |
| **Enfermagem** | `enfermagem@plantaops.gov.br` | `123456` | `/enfermagem` e `/leitos` — Triagem, reclassificação, fila em tempo real, mapa e limpeza de leitos. |
| **Médico (Cons. 01)** | `medico1@plantaops.gov.br` | `123456` | `/medico` e `/leitos` — Chamada atômica da fila, evolução, prescrição segura e destino do paciente. |
| **Médico (Cons. 02)** | `medico2@plantaops.gov.br` | `123456` | `/medico` e `/leitos` — Segunda conta médica para testar cliques simultâneos em "Chamar próximo". |
| **Gestão** | `gestao@plantaops.gov.br` | `123456` | `/gestao` — Painel executivo de indicadores, exportação CSV e auditoria (somente leitura). |
| **Painel (TV)** | `painel@plantaops.gov.br` | `123456` | `/painel` — Tela cheia em modo quiosque para a sala de espera (exibe apenas senhas e consultórios). |

---

## 🚀 5. Como Executar o Projeto e Rodar os Testes

### Instalar dependências
```bash
npm install
```

### Executar servidor de desenvolvimento
```bash
npm run dev
```

### Executar a suíte de testes automatizados (Vitest + Testing Library)
```bash
npm test
```

### Gerar build de produção
```bash
npm run build
```
