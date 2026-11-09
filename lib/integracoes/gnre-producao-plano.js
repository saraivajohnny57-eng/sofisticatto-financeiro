'use strict';
// Contrato SEPARADO de produção GNRE. NENHUMA chamada de rede neste módulo.
const crypto=require('node:crypto');
const {montarLoteGnre}=require('./gnre-lote-xml');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {prepararPreEnvio,montarGuiaPreEnvio}=require('./gnre-preenvio-mg');
const SERVICOS_PRODUCAO=Object.freeze({
 recepcao:'https://www.gnre.pe.gov.br/gnreWS/services/GnreLoteRecepcao',
 resultado:'https://www.gnre.pe.gov.br/gnreWS/services/GnreResultadoLote',
 configuracao:'https://www.gnre.pe.gov.br/gnreWS/services/GnreConfigUF'
});
function sha(s){return crypto.createHash('sha256').update(s,'utf8').digest('hex');}
function somenteProducao(fiscal,nfe){
 const p=[];
 // Esta etapa prepara o primeiro envio a partir de uma NF-e NOVA.
 if(nfe?.numero==='51109')p.push('NF-e 51109 foi utilizada no piloto de homologacao: selecione uma nova nota de producao.');
 if(!/^\d{44}$/.test(String(nfe?.chave||'')))p.push('Chave da NF-e invalida.');
 const today=new Date().toISOString().slice(0,10);
 if(fiscal?.pagamento&&fiscal.pagamento<today)
  p.push('Data de pagamento anterior a hoje; verificar novamente com o fiscal.');
 if(fiscal?.vencimento&&fiscal.vencimento<today)
  p.push('Vencimento anterior a hoje; verificar atrasos, atualizacao, juros e multa antes de emitir.');
 if(fiscal?.obrigacaoConfirmada!==true)
  p.push('Obrigacao DIFAL precisa de confirmacao fiscal para a nota selecionada.');
 return p;
}
function prepararPlanoProducao({nfe,fiscal}){
 const base=prepararPreEnvio({nfe,fiscal});
 const pendencias=[...base.pendencias,...somenteProducao(fiscal,nfe)];
 if(!base.apto_para_revisao||pendencias.length)
  return {ok:true,apto_para_revisao:false,ambiente:'producao',transmissao:false,
   resumo:base.resumo,pendencias:[...new Set(pendencias)]};
 const guia=montarGuiaPreEnvio(nfe,fiscal);
 const lote=montarLoteGnre([guia]);
 const xml=montarEnvelopeSoap12({servico:'recepcao',xmlDados:lote});
 const lote_sha256=sha(lote);
 return {ok:true,apto_para_revisao:true,ambiente:'producao',transmissao:false,
  resumo:base.resumo,pendencias:[],
  plano:{servico:'recepcao',destino:SERVICOS_PRODUCAO.recepcao,
   guias:1,soapAction:SOAP_ACTIONS.recepcao,xml_bytes:Buffer.byteLength(xml),
   lote_sha256,xml_sha256:sha(xml),
   idempotency_key:'gnre:producao:'+lote_sha256.slice(0,32)}};
}
module.exports={SERVICOS_PRODUCAO,prepararPlanoProducao,somenteProducao};
