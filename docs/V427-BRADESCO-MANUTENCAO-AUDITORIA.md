# V427 — auditoria para manutenção de juros e multa Bradesco (carteira 09)

## Estado verificado
- `api/banco-bradesco.js` implementa `consultar-status-titulo`, `sincronizar-status`, `listar-pendencias-carteira`, emissão e baixa.
- **Não há ação implementada para manutenção de juros/multa.** Não reaproveitar a rota de baixa ou de registro para este fim.
- `consultar-status-titulo` faz consulta autenticada e atualiza o histórico; antes de qualquer manutenção real, exigir confirmação bancária recente e inequívoca.
- A lista de candidatos é apenas uma fotografia do cadastro. Título ausente da lista de pendências não significa necessariamente pago.
- Exemplo 56347 / nosso número 62880000002: portal mostra pago em 23/10/2026. Excluir de qualquer manutenção.

## Fontes pesquisadas (05/11/2026)
- Manual oficial Bradesco CNAB 240: https://assets.bradesco/content/dam/portal-bradesco/assets/pessoajuridica/pdf/jun-19-layout-multipag.pdf — códigos de movimento 12 (juros), 14 (multa), 13/15 (dispensa). **São códigos do layout 240, não usar automaticamente no CNAB 400 ou API.**
- Manual Bradesco OBB Plus: https://assets.bradesco/content/dam/portal-bradesco/assets/pessoajuridica/pdf/manual_OBB_Plus_Coranca_V3.pdf — manutenção e transmissão de remessa, sujeito à modalidade.
- API Bradesco: https://api.bradesco/openapis — catálogo, sem comprovação do endpoint específico de alteração habilitado para este convênio.
- Manual de API de cobrança de terceiro (não é especificação Bradesco): https://www.tgameajuda.com/tgamanuais/uploads/Financeiro/PDF/user_guide_api_de_cobranca_pt_br_v2_2_08_08_23_0.pdf — não usar seus comandos como se fossem do Bradesco.

## Bloqueios para transmissão
1. Obter especificação oficial vigente e contratada da API de manutenção OU layout CNAB 240/400 autorizado no convênio 09, incluindo campos, códigos e retornos.
2. Confirmar se o convênio aceita alteração após vencimento, datas retroativas e incidência desde o vencimento original.
3. Confirmar por escrito a periodicidade e base de cálculo dos juros de 5% (ao mês? outra?) e multa de 2%, inclusive datas de início.
4. Consulta autenticada por nosso número imediatamente antes do envio, com status inequivocamente em aberto, sem pagamento, baixa, protesto ou solicitação pendente.
5. Validar idempotência persistente e retorno final aceito/rejeitado antes de avançar para o próximo título.
6. Testar em homologação e depois em **um título individual previamente aprovado**, sem transmissão em massa automática.

## Critérios de implementação
- Preservar valor nominal, carteira, agência/conta, nosso número, número de parcela e vencimento.
- Nunca alterar registros pagos, mesmo que apareçam em CSV antigo.
- Não classificar ausência de resposta parcial como quitação.
- Não enviar código de ocorrência sem identificação do layout correspondente.
- Gravar auditoria com antes/depois, identificador de operação, resultado e resposta bancária sem segredos.
- Um status HTTP 200 não é prova isolada de manutenção efetivada.
- A integração atual de emissão e Correios não deve ser modificada.

## Próximo desenvolvimento
Criar adaptador de manutenção somente após receber o contrato técnico oficial. A API de consulta já existente pode servir de pré-verificação; não inventar endpoint de alteração.
