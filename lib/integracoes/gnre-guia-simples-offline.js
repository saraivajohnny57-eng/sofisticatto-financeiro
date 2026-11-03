'use strict';
// Geração OFFLINE de TDadosGNRE 2.00. A aceitação pela SEFAZ exige
// validação XSD e regras tributárias estaduais adicionais.
function texto(v, nome, re) {
  const s = String(v == null ? '' : v);
  if (!re.test(s)) throw new TypeError('Campo GNRE inválido: ' + nome);
  return s;
}
function guiaSimples({ ufFavorecida, receita, valorPrincipal, dataVencimento, tipoGnre = '0', contribuinte, documentoOrigem, tipoDocumentoOrigem }) {
  const uf = texto(ufFavorecida, 'ufFavorecida', /^(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)$/);
  const tipo = texto(tipoGnre, 'tipoGnre', /^[0-2]$/);
  const cod = texto(receita, 'receita', /^[0-9]{6}$/);
  const valor = texto(valorPrincipal, 'valorPrincipal', /^(0|[1-9][0-9]{0,9})\.[0-9]{2}$/);
  const data = texto(dataVencimento, 'dataVencimento', /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  const d = new Date(data + 'T00:00:00Z');
  if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== data) {
    throw new TypeError('Data de vencimento inválida');
  }
  let xmlContribuinte = '';
  if (contribuinte != null) {
    if (typeof contribuinte !== 'object' || Array.isArray(contribuinte)) throw new TypeError('Contribuinte inválido');
    const temCnpj = contribuinte.cnpj != null;
    const temCpf = contribuinte.cpf != null;
    if (temCnpj === temCpf) throw new TypeError('Informe CPF ou CNPJ do contribuinte, não ambos');
    const id = temCnpj
      ? '<CNPJ>' + texto(contribuinte.cnpj, 'CNPJ', /^[0-9]{14}$/) + '</CNPJ>'
      : '<CPF>' + texto(contribuinte.cpf, 'CPF', /^[0-9]{11}$/) + '</CPF>';
    let razao = '';
    if (contribuinte.razaoSocial != null) {
      const nome = texto(contribuinte.razaoSocial, 'razaoSocial', /^.{1,60}$/u);
      const escapeXml = nome.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      razao = '<razaoSocial>' + escapeXml + '</razaoSocial>';
    }
    xmlContribuinte = '<contribuinteEmitente><identificacao>' + id + '</identificacao>' + razao + '</contribuinteEmitente>';
  }
  let xmlDocumento = '';
  if (documentoOrigem != null || tipoDocumentoOrigem != null) {
    const numero = texto(documentoOrigem, 'documentoOrigem', /^(?:[0-9]{1,18}|[0-9]{2}BR[0-9]{11}|[0-9]{6}[A-Z0-9]{12}[0-9]{26})$/);
    const tipoDoc = texto(tipoDocumentoOrigem, 'tipoDocumentoOrigem', /^[0-9]{2}$/);
    xmlDocumento = '<documentoOrigem tipo="' + tipoDoc + '">' + numero + '</documentoOrigem>';
  }
  return '<TDadosGNRE versao="2.00"><ufFavorecida>' + uf
    + '</ufFavorecida><tipoGnre>' + tipo
    + '</tipoGnre>' + xmlContribuinte + '<itensGNRE><item><receita>' + cod
    + '</receita>' + xmlDocumento + '<dataVencimento>' + data
    + '</dataVencimento><valor tipo="11">' + valor
    + '</valor></item></itensGNRE></TDadosGNRE>';
}
module.exports = { guiaSimples };
