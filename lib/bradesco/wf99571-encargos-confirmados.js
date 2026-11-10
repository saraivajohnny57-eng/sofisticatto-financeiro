'use strict';
// Confirmação escrita Bradesco WF-99571 em 10/11/2026.
// Este módulo NÃO envia PUT e NÃO gera um corpo de alteração incompleto.
const CONFIG = Object.freeze({
  endpoint:'PUT /boleto/cobranca-altera/v1/alterar',
  juros_mensal_percentual:5,
  multa_percentual:2,
  codigoComissaoPermanencia:2,
  codigoMulta:2,
  valorComissaoPermanencia:'050000',
  valorMulta:'020000',
  diasComissaoPermanencia:1,
  diasMulta:1
});
function revisarWF99571(){
  return {
    fonte:'Resposta do suporte de Transações API Bradesco — WF-99571, 10/11/2026',
    ...CONFIG,
    valores_percentuais_em_seis_posicoes:true,
    campos_valor_na_requisicao:'Confirmar representação numérica com a collection antes do PUT; manter zeros à esquerda na conferência.',
    cobranca_inicia_apos_vencimento:true,
    dias_corridos:true,
    titulos_vencidos_em_aberto_alteraveis:true,
    aplicacao_retroativa_em_titulo_vencido_validada:false,
    exige_consulta_posterior:true,
    endpoint_verificacao:'Consulta de títulos do Bradesco',
    envio_real_autorizado:false
  };
}
function validarAlvo(titulo){
 const texto=x=>String(x??'').trim();
 const esperados={documento:'55994-01',nossoNumero:'62710000024',carteira:'09',vencimento:'2026-10-18'};
 for(const [k,v] of Object.entries(esperados))
  if(texto(titulo?.[k])!==v)throw new TypeError('Título de teste diverge: '+k);
 if(Number(titulo?.valorNominal)!==441.91)throw new TypeError('Valor nominal do título de teste divergente');
 return {identidade_conferida:true,alteracoes_permitidas:['encargos'],alterar_vencimento:false,
   alterar_valor_nominal:false,reemitir:false,transmitido:false};
}
module.exports={CONFIG,revisarWF99571,validarAlvo};
