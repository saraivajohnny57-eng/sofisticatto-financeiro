-- GNRE — habilita o serviço de RECEPÇÃO na trilha de idempotência.
-- Migração ADITIVA: não remove dados, não altera registros existentes.
-- Executar no Supabase somente após aprovação.

alter table public.gnre_homologacao_execucoes
  drop constraint if exists gnre_homologacao_execucoes_servico_check;

alter table public.gnre_homologacao_execucoes
  add constraint gnre_homologacao_execucoes_servico_check
  check (servico in ('consulta', 'recepcao'));

-- Coluna opcional para o recibo retornado pela recepção (mascarado).
alter table public.gnre_homologacao_execucoes
  add column if not exists recibo_retorno_mascarado text;

-- Hash do lote enviado, para auditoria e detecção de reenvio divergente.
alter table public.gnre_homologacao_execucoes
  add column if not exists lote_sha256 text;

comment on column public.gnre_homologacao_execucoes.recibo_retorno_mascarado is
  'Recibo GNRE mascarado (últimos 4 dígitos). Nunca armazenar o recibo completo.';
comment on column public.gnre_homologacao_execucoes.lote_sha256 is
  'SHA-256 do XML do lote, para auditoria. O XML não é armazenado.';
