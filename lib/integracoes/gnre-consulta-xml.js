'use strict';
// Mensagem de dados para consulta GNRE em homologacao.
// Confirmar o envelope SOAP/soapAction contra WSDL vigente antes da transmissao real.
const {validarRecibo}=require('./gnre-contrato');
function montarConsultaRecibo(recibo){
 const numero=validarRecibo(recibo);
 return '<?xml version="1.0" encoding="UTF-8"?>'
  +'<TconsLote_GNRE xmlns="http://www.gnre.pe.gov.br">'
  +'<ambiente>2</ambiente><numeroRecibo>'+numero+'</numeroRecibo>'
  +'</TconsLote_GNRE>';
}
module.exports={montarConsultaRecibo};
