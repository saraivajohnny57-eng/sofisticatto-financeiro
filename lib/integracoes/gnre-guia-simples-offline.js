'use strict';
// Geração OFFLINE de TDadosGNRE 2.00. A aceitação pela SEFAZ exige
// validação XSD e regras tributárias estaduais adicionais.
function texto(v, nome, re) {
  const s = String(v == null ? '' : v);
  if (!re.test(s)) throw new TypeError('Campo GNRE inválido: ' + nome);
  return s;
}
function guiaSimples({ ufFavorecida, receita, valorPrincipal, dataVencimento, tipoGnre = '0' }) {
  const uf = texto(ufFavorecida, 'ufFavorecida', /^[A-Z]{2}$/);
  const tipo = texto(tipoGnre, 'tipoGnre', /^[0-2]$/);
  const cod = texto(receita, 'receita', /^[0-9]{6}$/);
  const valor = texto(valorPrincipal, 'valorPrincipal', /^(0|[1-9][0-9]{0,12})\.[0-9]{2}$/);
  const data = texto(dataVencimento, 'dataVencimento', /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  const d = new Date(data + 'T00:00:00Z');
  if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== data) {
    throw new TypeError('Data de vencimento inválida');
  }
  return '<TDadosGNRE versao="2.00"><ufFavorecida>' + uf
    + '</ufFavorecida><tipoGnre>' + tipo
    + '</tipoGnre><itensGNRE><item><receita>' + cod
    + '</receita><dataVencimento>' + data
    + '</dataVencimento><valor tipo="11">' + valor
    + '</valor></item></itensGNRE></TDadosGNRE>';
}
module.exports = { guiaSimples };
