'use strict';
// Camada defensiva: valida apenas transporte/envelope SOAP.
// Nao interpreta autorizacao fiscal GNRE e nao substitui validacao por XSD.
const MAX_RESPONSE_BYTES=1024*1024;
function analisarRespostaSoap({status,body}){
 if(!Number.isInteger(status)||status<100||status>599)
  throw new TypeError('Status HTTP GNRE invalido');
 if(typeof body!=='string'||!body.trim()||Buffer.byteLength(body,'utf8')>MAX_RESPONSE_BYTES)
  return {ok:false,categoria:'resposta_invalida'};
 if(/<!DOCTYPE|<!ENTITY/i.test(body))
  return {ok:false,categoria:'xml_inseguro'};
 // Respostas HTML de proxies e gateways nao sao XML SOAP.
 if(/^\s*(?:<\?xml[^>]*>\s*)?<(?:html|!doctype\s+html)\b/i.test(body))
  return {ok:false,categoria:'resposta_nao_soap'};
 const envelope=/<(?:[A-Za-z_][\w.-]*:)?Envelope(?:\s|>)/i.test(body);
 if(!envelope)return {ok:false,categoria:'resposta_nao_soap'};
 if(/<(?:[A-Za-z_][\w.-]*:)?Fault(?:\s|>)/i.test(body))
  return {ok:false,categoria:'soap_fault'};
 if(status<200||status>=300)
  return {ok:false,categoria:'http_erro',status};
 return {ok:true,categoria:'soap_recebido',status,validacaoFiscal:'nao_realizada'};
}
module.exports={analisarRespostaSoap};
