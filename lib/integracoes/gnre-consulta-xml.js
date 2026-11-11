'use strict';
// Mensagem de dados para consulta GNRE em homologacao.
// Confirmar o envelope SOAP/soapAction contra WSDL vigente antes da transmissao real.
const {validarRecibo}=require('./gnre-contrato');
function montarConsultaRecibo(recibo){
 const numero=validarRecibo(recibo);
 // Manual GNRE 2.11: consulta aceita recibos de 10 e 14 digitos.\n // Atualizar XSD local antes de homologar transmissao real.
 return '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br">'
  +'<ambiente>2</ambiente><numeroRecibo>'+numero+'</numeroRecibo>'
  +'</TConsLote_GNRE>';
}
module.exports={montarConsultaRecibo};
