'use strict';
// Envelope SOAP 1.2 conforme Manual de Integracao GNRE 2.01 (2019).
// Revalidar com WSDL publicado atualmente antes de transmitir dados reais.
const SERVICOS=Object.freeze({
 recepcao:{namespace:'http://www.gnre.pe.gov.br/wsdl/GnreLoteRecepcao',operacao:'gnreLoteRecepcao',versao:'2.00'},
 consulta:{namespace:'http://www.gnre.pe.gov.br/wsdl/GnreResultadoLote',operacao:'gnreResultadoLote',versao:'1.00'}
});
function montarEnvelopeSoap12({servico,xmlDados}){
 const s=SERVICOS[servico];
 if(!s)throw new TypeError('Servico GNRE invalido');
 if(typeof xmlDados!=='string'||!xmlDados.trim()||Buffer.byteLength(xmlDados,'utf8')>300*1024)
  throw new TypeError('Dados GNRE invalidos ou excedem 300 KB');
 if(/<!DOCTYPE|<!ENTITY|<\?xml/i.test(xmlDados))throw new TypeError('Dados XML devem ser fragmento sem DTD ou declaracao');
 if(!/^<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>[\s\S]*<\/\1\s*>$/.test(xmlDados))
  throw new TypeError('Fragmento XML GNRE invalido');
 return '<?xml version="1.0" encoding="UTF-8"?>'
 +'<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
 +'<soap12:Header><gnreCabecMsg xmlns="'+s.namespace+'"><versaoDados>'+s.versao+'</versaoDados></gnreCabecMsg></soap12:Header>'
 +'<soap12:Body><gnreDadosMsg xmlns="'+s.namespace+'">'+xmlDados+'</gnreDadosMsg></soap12:Body>'
 +'</soap12:Envelope>';
}
module.exports={montarEnvelopeSoap12};
