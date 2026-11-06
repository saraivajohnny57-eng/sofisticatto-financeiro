'use strict';
// Leitura conservadora do resultado GNRE: nao confunde SOAP 200 com autorizacao.
const {validarRecibo}=require('./gnre-contrato');
function textoTag(xml,nome){
 const re=new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+nome+'(?:\\s[^>]*)?>\\s*([\\s\\S]*?)\\s*<\\/(?:[A-Za-z_][\\w.-]*:)?'+nome+'\\s*>','i');
 const m=String(xml||'').match(re);return m?m[1].trim():null;
}
function blocos(xml,nome){
 const re=new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+nome+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?'+nome+'\\s*>','gi');
 return [...String(xml||'').matchAll(re)].map(m=>m[1]);
}
function interpretarRetorno(xml,reciboEsperado){
 if(typeof xml!=='string'||Buffer.byteLength(xml,'utf8')>6*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))
  throw new TypeError('XML GNRE inseguro ou muito grande');
 const corpo=textoTag(xml,'TResultLote_GNRE')||textoTag(xml,'TresultLote_GNRE');
 if(!corpo) return {ok:false,estado:'retorno_nao_reconhecido',guias:[]};
 const recibo=textoTag(corpo,'numeroRecibo');
 if(recibo && validarRecibo(recibo)!==validarRecibo(reciboEsperado))
  return {ok:false,estado:'recibo_divergente',guias:[]};
 const processo=textoTag(corpo,'situacaoProcess');
 const codigo=processo?textoTag(processo,'codigo'):null;
 const descricao=processo?textoTag(processo,'descricao'):null;
 const guias=blocos(corpo,'guia').map(g=>{
  const situacao=textoTag(g,'situacaoGuia');
  const pdf=textoTag(g,'pdf')||textoTag(g,'pdfGuia')||textoTag(g,'arquivoPDF');
  const valido= situacao==='0' && typeof pdf==='string' && /^[A-Za-z0-9+/]+={0,2}$/.test(pdf) && pdf.length<=3000000;
  const bytes=valido?Buffer.from(pdf,'base64'):null;
  return {
   situacao,numero_controle:textoTag(g,'c38_numeroControle')||textoTag(g,'numeroControle'),
   receita:textoTag(g,'c02_receita'),uf:textoTag(g,'c01_UfFavorecida'),
   valor:textoTag(g,'c06_valorPrincipal'),linha_digitavel:textoTag(g,'linhaDigitavel'),
   codigo_barras:textoTag(g,'codigoBarras'),
   pdf_base64:bytes&&bytes.length>=20&&bytes.subarray(0,5).toString('ascii')==='%PDF-'?pdf:null,
   rejeicoes:blocos(g,'motivo').slice(0,10).map(m=>({codigo:textoTag(m,'codigo'),descricao:textoTag(m,'descricao')}))
  };
 });
 return {ok:true,estado:'retorno_fiscal_lido',codigo,descricao,guias};
}
module.exports={interpretarRetorno,textoTag,blocos};
