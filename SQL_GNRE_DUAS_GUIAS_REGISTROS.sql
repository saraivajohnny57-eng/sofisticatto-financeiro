-- GNRE duas guias: arquivo por (NF-e, receita, ambiente), sem alterar tabelas historicas.
-- Executar apenas apos revisao do ambiente e backup; RLS sem acesso anonimo.
CREATE TABLE IF NOT EXISTS public.gnre_duas_guias_registros (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 chave_nfe char(44) NOT NULL CHECK (chave_nfe ~ '^[0-9]{44}$'),
 numero_nfe varchar(18) NOT NULL,
 uf_favorecida char(2) NOT NULL,
 receita char(6) NOT NULL CHECK (receita IN ('100102','100129')),
 valor_principal numeric(15,2) NOT NULL CHECK (valor_principal > 0),
 vencimento date NOT NULL,
 chave_idempotencia text NOT NULL CHECK (chave_idempotencia ~ '^gnre:recepcao:[a-f0-9]{32}$'),
 ambiente text NOT NULL CHECK (ambiente IN ('homologacao','producao')),
 situacao text NOT NULL DEFAULT 'preparada' CHECK (
   situacao IN ('preparada','reservada','recebida','resultado_incerto','validada','emitida','rejeitada')
 ),
 numero_guia text NULL,
 pdf_storage_path text NULL,
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE (chave_nfe, receita, ambiente),
 UNIQUE (chave_idempotencia, receita)
);
CREATE INDEX IF NOT EXISTS gnre_duas_guias_lote_idx
 ON public.gnre_duas_guias_registros (chave_idempotencia);
ALTER TABLE public.gnre_duas_guias_registros ENABLE ROW LEVEL SECURITY;
-- Nao criar policy de leitura publica: usar exclusivamente service role em backend autenticado.
-- Registros sao preparados/recebidos separadamente. Nao marcar "emitida" apenas por HTTP 200.
