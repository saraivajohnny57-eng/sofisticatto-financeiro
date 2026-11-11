-- Execução bancária controlada WF-99571 para uma única parcela.
-- Aplicado inicialmente no Supabase em 11/11/2026.
-- Restringir service_role e manter RLS habilitada; não expor aos clientes.
CREATE TABLE IF NOT EXISTS public.bradesco_manutencao_controlada (
 referencia text PRIMARY KEY CHECK (referencia = 'BRADESCO-56078-02'),
 nosso_numero text NOT NULL CHECK (nosso_numero = '62710000058'),
 valor_nominal numeric(15,2) NOT NULL CHECK (valor_nominal = 527.96),
 status text NOT NULL DEFAULT 'reservado' CHECK (
  status IN ('reservado','em_transmissao','aceito_pendente_conciliacao','confirmado','rejeitado','resultado_incerto')
 ),
 hash_payload text NOT NULL CHECK (hash_payload ~ '^[0-9a-f]{64}$'),
 http_status integer,
 codigo_retorno text,
 detalhes text,
 antes jsonb,
 depois jsonb,
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bradesco_manutencao_controlada ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bradesco_manutencao_controlada FROM anon, authenticated;
-- Sem políticas abertas: a leitura/gravação ocorre exclusivamente no backend via service_role.
