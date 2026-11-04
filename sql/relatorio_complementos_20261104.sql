-- Executar uma vez no SQL Editor do Supabase do Sofisticatto Financeiro.
-- Mantém todos os registros existentes e adiciona apenas o campo de complementos.
ALTER TABLE public.email_relatorios_clientes
ADD COLUMN IF NOT EXISTS complementos jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.email_relatorios_clientes.complementos IS 'Lista de complementos do pedido: [{"descricao":"...","valor":0.00}]';
