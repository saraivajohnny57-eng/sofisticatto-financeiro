'use strict';
// Leitura conservadora do retorno do lote GNRE. Recepcao 100 e processamento
// 402 NAO comprovam por si so a existencia de uma guia individual autorizada.
// O diagnostico exposto ao administrador NAO contem recibo, XML, PDF ou chave NF-e.
const {validarRecibo}=require('./gnre-contrato');
const MAX_BYTES=6*1024*1024;
function textoTag(xml,nome){
 const re=new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+nome+'(?:\\s[^>]*)?>\\s*([\\s\\S]*?)\\s*<\\/(?:[A-Za-z_][\\w.-]*:)?'+nome+'\\s*>','i');
 const m=String(xml||'').match(re);return m?m[1].trim():null;
}
function blocos(xml,nome){
 const re=new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+nome+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?'+nome+'\\s*>','gi');
 return [...String(xml||'').matchAll(re)].map(m=>m[1]);
}
function tipoResultado(texto,guias){
 if(guias.length)return 'xml_guias';
 if(texto===null)return 'ausente';
 if(!texto.trim())return 'vazio';
 if(/&lt;(?:[A-Za-z_][\w.-]*:)?guia(?:\s|&gt;)/i.test(texto))return 'xml_escapado';
 if(/<(?:[A-Za-z_][\w.-]*:)?guia(?:\s|>)/i.test(texto))return 'xml_guia_nao_extraida';
 if(/^[A-Za-z0-9+/=\s]{256,}$/.test(texto)&&/[+/=]/.test(texto))return 'possivel_base64';
 return 'texto_ou_formato_legado';
}
function valorPrincipalGuia(xml){
 const v1=textoTag(xml,'c06_valorPrincipal');
 if(v1!==null)return v1;
 const receita=textoTag(xml,'c02_receita')||textoTag(xml,'receita');
 // FCP tem tipo 12. DIFAL usa tipo 11. Nunca atribuir ao FCP um valor de ICMS.
 const tipo=['100129','100137'].includes(receita)?'12':'11';
 const re=new RegExp('<(?:[A-Za-z_][\\w.-]*:)?valor\\b[^>]*\\btipo=["\\x27]'+tipo+
  '["\\x27][^>]*>\\s*([0-9]+(?:\\.[0-9]{2})?)\\s*<\\/(?:[A-Za-z_][\\w.-]*:)?valor>','i');
 const m=String(xml||'').match(re);
 return m?m[1]:null;
}

function interpretarRetorno(xml,reciboEsperado){
 if(typeof xml!=='string'||Buffer.byteLength(xml,'utf8')>MAX_BYTES||/<!DOCTYPE|<!ENTITY/i.test(xml))
  throw new TypeError('XML GNRE inseguro ou muito grande');
 const corpo=textoTag(xml,'TResultLote_GNRE');
 if(corpo===null)return {ok:false,estado:'retorno_nao_reconhecido',guias:[],guia_confirmada:false};
 if(textoTag(corpo,'ambiente')!=='2')
  return {ok:false,estado:'ambiente_homologacao_nao_confirmado',guias:[],guia_confirmada:false};
 const recibo=textoTag(corpo,'numeroRecibo');
 if(recibo && validarRecibo(recibo)!==validarRecibo(reciboEsperado))
  return {ok:false,estado:'recibo_divergente',guias:[],guia_confirmada:false};
 const processo=textoTag(corpo,'situacaoProcess');
 const codigo=processo?textoTag(processo,'codigo'):null;
 const descricao=processo?textoTag(processo,'descricao'):null;
 if(!/^\d{3}$/.test(String(codigo||'')))
  return {ok:false,estado:'situacao_processamento_nao_confirmada',codigo:null,guias:[],guia_confirmada:false};
 const resultado=textoTag(corpo,'resultado');
 const blocosGuia=resultado!==null?blocos(resultado,'guia'):[];
 const guias=blocosGuia.slice(0,200).map(g=>{
  const situacao=textoTag(g,'situacaoGuia');
  const pdf=textoTag(g,'pdf')||textoTag(g,'pdfGuia')||textoTag(g,'arquivoPDF');
  const valido=situacao==='0'&&typeof pdf==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(pdf)&&pdf.length<=3000000;
  const bytes=valido?Buffer.from(pdf,'base64'):null;
  return {
   situacao,
   documento_origem:textoTag(g,'documentoOrigem')||textoTag(g,'c04_docOrigem'),
   numero_controle:textoTag(g,'c38_numeroControle')||textoTag(g,'numeroControle')||textoTag(g,'nossoNumero'),
   receita:textoTag(g,'c02_receita')||textoTag(g,'receita'),
   uf:textoTag(g,'c01_UfFavorecida')||textoTag(g,'ufFavorecida'),
   valor:valorPrincipalGuia(g),
   linha_digitavel:textoTag(g,'linhaDigitavel'),
   codigo_barras:textoTag(g,'codigoBarras'),
   pdf_base64:bytes&&bytes.length>=20&&bytes.subarray(0,5).toString('ascii')==='%PDF-'?pdf:null,
   rejeicoes:blocos(g,'motivo').slice(0,10).map(m=>({
     codigo:textoTag(m,'codigo'),descricao:textoTag(m,'descricao'),campo:textoTag(m,'campo')
   }))
  };
 });
 const codigoProcessado=codigo==='402';
 const guiaConfirmada=codigoProcessado&&guias.length===1&&guias[0].situacao==='0';
 const loteCompletoConfirmado=codigoProcessado&&guias.length>0&&guias.every(g=>g.situacao==='0');
 const diagnostico={
  formato_resultado:tipoResultado(resultado,blocosGuia),
  resultado_presente:resultado!==null,
  resultado_bytes:resultado===null?0:Buffer.byteLength(resultado,'utf8'),
  guias_identificadas:guias.length,
  pdf_guias_presente:Boolean(textoTag(corpo,'pdfGuias')),
  arquivo_pagamento_presente:Boolean(textoTag(corpo,'arquivoPagamento')),
  codigo_processamento:codigo
 };
 let estado;
 if(codigo==='400'||codigo==='401')estado='lote_aguardando_processamento';
 else if(codigo==='403')estado='lote_com_pendencias';
 else if(codigoProcessado&&!guias.length)estado='lote_processado_sem_guias_identificadas';
 else if(codigoProcessado&&guiaConfirmada)estado='guia_individual_processada';
 else if(codigoProcessado&&guias.length)estado='guias_com_situacoes_a_conferir';
 else estado='consulta_rejeitada_ou_erro';
 return {
  ok:['400','401','402','403'].includes(codigo),
  estado,codigo,descricao,guias,guia_confirmada:guiaConfirmada,
  lote_completo_confirmado:loteCompletoConfirmado,
  diagnostico,
  aviso:codigoProcessado&&!guias.length?
   'O lote foi processado (402), mas nenhuma guia individual foi identificada no retorno. NAO retransmitir; verificar formato do resultado e comprovante oficial.':
   'Recepcao/processamento do lote nao comprova pagamento ou emissao em producao.'
 };
}
module.exports={interpretarRetorno,textoTag,blocos,valorPrincipalGuia,tipoResultado};
