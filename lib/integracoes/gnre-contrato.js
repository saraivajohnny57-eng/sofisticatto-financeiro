'use strict';
// GNRE: validacao isolada de recibos para consulta de lotes.
// Desde 2024 a recepcao pode retornar 14 digitos; recibos anteriores tem 10.
function validarRecibo(valor) {
  if (typeof valor !== 'string' && typeof valor !== 'number') throw new TypeError('Recibo GNRE invalido.');
  const texto = String(valor).trim();
  if (!/^(?:[0-9]{10}|[0-9]{14})$/.test(texto)) throw new TypeError('Recibo GNRE deve conter 10 ou 14 digitos.');
  return texto;
}
const BASE_HOMOLOGACAO='https://www.testegnre.pe.gov.br/gnreWS/services';
const SERVICOS=Object.freeze({
  recepcao:BASE_HOMOLOGACAO+'/GnreLoteRecepcao',
  resultado:BASE_HOMOLOGACAO+'/GnreResultadoLote',
  configuracao:BASE_HOMOLOGACAO+'/GnreConfigUF'
});
module.exports={validarRecibo,SERVICOS};
