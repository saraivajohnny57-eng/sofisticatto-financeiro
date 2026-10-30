'use strict';
// Mensagem de dados para consulta GNRE em homologacao.
// Confirmar o envelope SOAP/soapAction contra WSDL vigente antes da transmissao real.
const {validarRecibo}=require('./gnre-contrato');
function montarConsultaRecibo(recibo){
 const numero=validarRecibo(recibo);
 if(!/^\d{10}$/.test(numero))throw new TypeError('Consulta GNRE exige recibo de 10 digitos conforme manual 2.01');
 return '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br">'
  +'<ambiente>2</ambiente><numeroRecibo>'+numero+'</numeroRecibo>'
  +'</TConsLote_GNRE>';
}
module.exports={montarConsultaRecibo};
