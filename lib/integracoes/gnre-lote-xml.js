'use strict';

// Construtor do lote GNRE 2.00 para validação OFFLINE.
// Não envia requisições, não gera recibos e não substitui validação XSD.
const VERSAO = '2.00';
const MAX_GUIAS = 50;
const MAX_BYTES = 300 * 1024;

function montarLoteGnre(guias) {
  if (!Array.isArray(guias) || guias.length < 1 || guias.length > MAX_GUIAS) {
    throw new TypeError('Lote GNRE exige de 1 a 50 guias.');
  }
  const fragmentos = guias.map((guia, indice) => {
    if (typeof guia !== 'string' || !guia.trim()) {
      throw new TypeError(`Guia GNRE ${indice + 1} inválida.`);
    }
    const xml = guia.trim();
    if (/<!DOCTYPE|<!ENTITY|<\?xml|<\?[^>]*\?>/i.test(xml)) {
      throw new TypeError('Declarações XML, DTD e entidades são proibidas.');
    }
    if (!/^<TDadosGNRE\s+versao="2\.00">[\s\S]*<\/TDadosGNRE>$/.test(xml)) {
      throw new TypeError('Guia deve ser fragmento TDadosGNRE versão 2.00.');
    }
    return xml;
  });
  const xml = '<TLote_GNRE xmlns="http://www.gnre.pe.gov.br" versao="2.00"><guias>'
    + fragmentos.join('') + '</guias></TLote_GNRE>';
  if (Buffer.byteLength(xml, 'utf8') > MAX_BYTES) {
    throw new TypeError('Lote GNRE excede 300 KB.');
  }
  return xml;
}

module.exports = { montarLoteGnre, VERSAO, MAX_GUIAS, MAX_BYTES };
