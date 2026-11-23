'use strict';
// GNRE: diagnóstico somente-leitura do resultado de produção 403; não reconstrói o XML originalmente enviado.
const {textoTag,blocos}=require('./gnre-interpretar-resultado');
function presentes(xml,nome){return new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+nome+'(?:\\s|>)','i').test(String(xml||''));}
function textoSeguro(s){
 return String(s||'').replace(/<[^>]*>/g,' ').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[e-mail]')
  .replace(/\b\d{11,44}\b/g,'[identificador protegido]').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim().slice(0,240);
}
function analisarRetorno403(xml){
 if(typeof xml!=='string'||xml.length>3100000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Resposta GNRE invalida');
 const raiz=textoTag(xml,'TResultLote_GNRE');
 if(!raiz)return {ok:false,codigo:'FORMATO_RETORNO_NAO_RECONHECIDO',avaliacao_conclusiva:false};
 const lote=textoTag(textoTag(raiz,'situacaoProcess')||'','codigo');
 const guias=blocos(textoTag(raiz,'resultado')||'','guia');
 if(!guias.length)return {ok:false,codigo:'GUIA_AUSENTE',lote,avaliacao_conclusiva:false};
 const g=guias[0],item=textoTag(g,'item')||g;
 const d=textoTag(item,'documentoOrigem');
 const m=String(item).match(/<(?:[A-Za-z_][\w.-]*:)?documentoOrigem\s+[^>]*tipo=["'](\d{1,2})["']/i);
 const referencia=textoTag(item,'referencia'),dest=textoTag(item,'contribuinteDestinatario');
 const motivos=blocos(textoTag(g,'motivosRejeicao')||'','motivo')
  .map(m=>({codigo:textoTag(m,'codigo'),campo:textoSeguro(textoTag(m,'campo')),descricao:textoSeguro(textoTag(m,'descricao'))}))
  .filter(x=>/^\d{3}$/.test(String(x.codigo||'')));
 const codigoGuia=textoTag(g,'situacaoGuia');
 return {
  ok:true,lote_codigo:lote,guia_situacao:codigoGuia,
  guia_invalidada:codigoGuia==='1',guia_quantidade:guias.length,
  erros:motivos,erros_total:motivos.length,
  documento_origem_tipo_retornado:m?.[1]||null,
  documento_origem_presente_no_retorno:d!==null,
  referencia_presente_no_retorno:referencia!==null,
  referencia_campos:{periodo:referencia!==null&&presentes(referencia,'periodo'),mes:referencia!==null&&presentes(referencia,'mes'),ano:referencia!==null&&presentes(referencia,'ano')},
  destinatario_presente_no_retorno:dest!==null,
  destinatario_campos:{
   identificacao:dest!==null&&presentes(dest,'identificacao'),
   razao_social:dest!==null&&presentes(dest,'razaoSocial'),
   municipio:dest!==null&&presentes(dest,'municipio')
  },
  receita:textoTag(item,'receita'),uf:textoTag(g,'ufFavorecida'),
  pdf_retornado:presentes(raiz,'pdfGuias'),
  ressalva:'Campos identificados apenas na RESPOSTA do Portal GNRE. A ausência de um campo no retorno não prova que esteve ausente no XML transmitido. Nenhum documento ou dado pessoal é exibido.'
 };
}
module.exports={analisarRetorno403};
