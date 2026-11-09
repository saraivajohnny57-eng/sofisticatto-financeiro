'use strict';
// Validacao da resposta de RECEPCAO: codigo 100, ambiente 2 e recibo oficial.
// HTTP 200/SOAP válido SEM situacaoRecepcao codigo 100 NAO e recebimento aceito.
const {textoTag}=require('./gnre-interpretar-resultado');
function tag(x,n){return textoTag(String(x||''),n);}
function interpretarRecepcao(xml){
 const body=String(xml||'');
 const incerto=(motivo)=>({estado:'resultado_incerto',ok:false,codigo:null,recibo:null,motivo});
 if(!body.trim()||/<!DOCTYPE|<!ENTITY/i.test(body)||!/<(?:[\w.-]+:)?Envelope(?:\s|>)/.test(body))
  return incerto('xml_retorno_nao_soap');
 if(/<(?:[\w.-]+:)?Fault(?:\s|>)/.test(body))
  return incerto('soap_fault');
 const raiz=tag(body,'TRetLote_GNRE');
 if(!raiz)return incerto('retorno_recepcao_nao_identificado');
 const ambiente=tag(raiz,'ambiente');
 if(ambiente!=='2')return incerto('ambiente_homologacao_nao_confirmado');
 const situacao=tag(raiz,'situacaoRecepcao');
 if(!situacao)return incerto('situacao_recepcao_ausente');
 const codigo=tag(situacao,'codigo');
 const descricao=tag(situacao,'descricao');
 if(!/^\d{3}$/.test(String(codigo||'')))return incerto('codigo_recepcao_invalido');
 const reciboNode=tag(raiz,'recibo');
 const recibo=reciboNode?tag(reciboNode,'numero'):null;
 if(codigo!=='100')
  return {estado:'rejeitado',ok:false,codigo,recibo:null,
   motivo:'codigo_aplicacao_'+codigo,descricao:descricao?descricao.replace(/<[^>]*>/g,'').slice(0,160):null};
 if(!/^(?:\d{10}|\d{14})$/.test(String(recibo||'')))
  return {...incerto('codigo_100_sem_recibo_valido'),codigo};
 return {estado:'recebido',ok:true,codigo:'100',recibo,motivo:null,descricao:null};
}
module.exports={interpretarRecepcao};
