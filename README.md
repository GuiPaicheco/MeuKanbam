# MeuKanbam

Painel privado e responsivo para organizar demandas e acompanhar o trabalho em equipe: Kanban, prioridades com cores, progresso, subtarefas, dependências, agenda e ausências.

## Arquitetura

React + Vite no Vercel; PostgreSQL e autenticação no Supabase. O frontend contém apenas código público. Tarefas, ausências, comentários e histórico ficam no banco, protegidos por RLS e uma lista de usuários autorizados por UUID. Não há cadastro público na interface.

## Desenvolvimento

Requisitos: Node.js 22 ou superior.

```sh
npm ci
cp .env.example .env.local
npm run dev
npm run build
```

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com o URL e a chave publicável do projeto. Nunca coloque chaves secretas ou service_role no frontend. Sem configuração, a aplicação permanece bloqueada.

## Configuração segura do banco

1. Crie um projeto Supabase exclusivo. Execute `database/schema.sql` no SQL Editor.
2. Desabilite novos cadastros e login anônimo nas configurações de Auth. Defina Site URL como `https://meukanbam.vercel.app` e apenas esse redirecionamento para recuperação de senha.
3. Crie os dois usuários pelo painel Auth (sem senhas compartilhadas). Cadastre seus UUIDs em `public.kanbam_members` pelo SQL Editor. Somente administradores do banco podem alterar essa lista. Não use e-mails ou user_metadata como autorização.
4. Verifique `database/security-tests.sql` no SQL Editor. Os testes usam transação revertida e não mantêm dados de teste.
5. Configure as mesmas variáveis no Vercel e publique. Convide os usuários somente após testar o fluxo de recuperação e login. Configure SMTP para entrega confiável de e-mails de autenticação.

A remoção de um membro bloqueia novas consultas e alterações mesmo com um JWT ainda válido. A sessão é armazenada apenas na aba e encerrada após inatividade. O banco registra alterações e impede sobrescrita silenciosa quando outra pessoa editou a mesma tarefa.

## Planilha original

`scripts/convert_workbook.py` converte o formato original (abas Kanbam e Cronograma) em JSON para importação administrativa. Requer `pip install openpyxl`. A prioridade vem da cor da legenda; textos e dados incertos do cronograma são preservados sem inventar datas. Não publique o JSON resultante nem o XLSX no repositório.

## Integrações

Exportação JSON/CSV e eventos ICS, além de links para adicionar compromissos ao Google Agenda. A adição é manual; não implica sincronização bidirecional. E-mails de recuperação são enviados pelo Supabase. Resumos automáticos de tarefas exigem configurar um provedor de e-mail e destinatários; não há envio automático ativado.

## Operação

Nunca registre dados de pacientes. Exporte backups periodicamente e teste a restauração antes de depender deles. A recorrência é uma classificação da tarefa, não um agendamento automático. Não há sincronização offline; falhas ao salvar são exibidas para nova tentativa.
