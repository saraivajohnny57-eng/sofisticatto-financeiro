'use strict';
// Consulta por recibo conforme o contrato XSD lote_gnre_consulta_v1.00:
// TConsLote_GNRE com ambiente e numeroRecibo, nessa ordem, sem atributos extras.
// Atualizacao oficial de 2024: recibos novos podem conter 14 digitos;
// recibos legados podem conter 10. Nao alterar XSD oficial arquivado.
const { validarRecibo } = require('./gnre-contrato');
function montarConsultaRecibo(recibo) {
  const numero = validarRecibo(recibo);
  return '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br">'
    + '<ambiente>2</ambiente><numeroRecibo>' + numero + '</numeroRecibo>'
    + '</TConsLote_GNRE>';
}
module.exports = { montarConsultaRecibo };
