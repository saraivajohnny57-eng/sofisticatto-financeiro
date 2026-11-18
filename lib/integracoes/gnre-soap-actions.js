'use strict';
// Valores confirmados nos WSDLs oficiais SVRS, inspecionados no GitHub Actions.
// Enderecos de transporte sao configurados separadamente e limitados a homologacao HTTPS.
const SOAP_ACTIONS=Object.freeze({
 recepcao:'http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcao/processar',
 consulta:'http://www.gnre.pe.gov.br/webservice/GnreResultadoLote/consultar'
});
function validarActionOficial(servico,action){
 if(!Object.prototype.hasOwnProperty.call(SOAP_ACTIONS,servico)||action!==SOAP_ACTIONS[servico])
  throw new TypeError('SOAPAction nao corresponde ao WSDL oficial GNRE');
 return action;
}
module.exports={SOAP_ACTIONS,validarActionOficial};
