# Auditoria crítica de autenticação e RLS — 2026-10-30

## Evidências confirmadas (Supabase produção + código)
- Tabelas públicas sem RLS e com SELECT concedido a anon/authenticated: bancos, boletos, cobranca_lotes_emissao, corridas, corridas_entregadores, corridas_fechamentos, corridas_feriados, notificacoes, usuarios.
- `financeiro.js`: `entrar()` faz `banco.from("usuarios").select("*").eq("login", login).eq("senha", senha).single()`, comparando credenciais diretamente no browser.
- `financeiro.js`: objeto `usuarioLogado` é persistido em localStorage e reutilizado para iniciar sessão sem verificação de identidade no servidor.
- `email_clientes`, `email_vendedoras`, `logistica_rastreamentos` têm políticas ALL para anon/authenticated com USING/WITH CHECK true.
- Security Advisor também aponta funções SECURITY DEFINER executáveis por anon e funções sem search_path fixo.

## Bloqueadores de ativação imediata de RLS
Ativar RLS em `usuarios` antes de substituir a autenticação derruba o login; ativar nas demais sem mapear permissões pode interromper cobranças, corridas e notificações. NÃO executar `CREATE POLICY ... USING (true)` como correção.

## Plano de correção em etapas
1. Mapear usuários, perfis e fluxo de criação/redefinição de senhas, sem exportar senhas. Definir migração segura para Supabase Auth e perfis associados a `auth.uid()`, incluindo usuários legados e recuperação de acesso.
2. Migrar autenticação do frontend; retirar consultas a `usuarios.senha` e confiança em `localStorage.usuarioLogado`; criar verificação de perfil/ativo do lado servidor. Não expor service_role no cliente.
3. Criar políticas de menor privilégio por tabela, operação e perfil, com SELECT+UPDATE e WITH CHECK apropriados; considerar Edge Functions autenticadas para operações financeiras sensíveis. Aplicar primeiro em ambiente de teste.
4. Auditar e restringir EXECUTE de funções SECURITY DEFINER públicas; verificar funções usadas como triggers antes de revogar.
5. Executar testes de acesso com perfis admin, financeiro, banco, vendedora e sem login, inclusive isolamento entre clientes, emissão de boletos, notificações e corridas.
6. Aplicar migração de produção com backup, janela de reversão e smoke tests; reexecutar Security Advisor e testes de regressão.

## Consultas de verificação (somente leitura)
```sql
select c.relname, c.relrowsecurity,
       has_table_privilege('anon',c.oid,'SELECT') as anon_select,
       has_table_privilege('authenticated',c.oid,'SELECT') as auth_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
order by c.relname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
order by tablename, policyname;
```

## Estado
Diagnóstico crítico confirmado. Nenhuma política ou autenticação alterada na produção. Migração de segurança e testes por perfil ainda pendentes.
