'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SERVICOS } = require('../lib/integracoes/gnre-contrato');
const { SOAP_ACTIONS } = require('../lib/integracoes/gnre-soap-actions');
const { montarEnvelopeSoap12 } = require('../lib/integracoes/gnre-envelope-soap12');

function ler(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

test('WSDL de homologação publicado pelo serviço confirma porta 444, actions e namespaces', () => {
  const recepcao = ler('docs/gnre-oficial/homologacao-GnreLoteRecepcao.wsdl');
  const consulta = ler('docs/gnre-oficial/homologacao-GnreResultadoLote.wsdl');

  assert.ok(recepcao.includes(`<soap12:address location="${SERVICOS.recepcao}"/>`));
  assert.ok(consulta.includes(`<soap12:address location="${SERVICOS.resultado}"/>`));
  assert.ok(recepcao.includes(`soapAction="${SOAP_ACTIONS.recepcao}"`));
  assert.ok(consulta.includes(`soapAction="${SOAP_ACTIONS.consulta}"`));
  assert.ok(recepcao.includes('targetNamespace="http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcao"'));
  assert.ok(consulta.includes('targetNamespace="http://www.gnre.pe.gov.br/webservice/GnreResultadoLote"'));
  assert.ok(consulta.includes('<s:element name="gnreRespostaMsg">'));
  assert.ok(recepcao.includes('<s:element name="gnreDadosMsg">'));
});

test('envelope SOAP 1.2 usa header gnreCabecMsg e body gnreDadosMsg', () => {
  const xml = montarEnvelopeSoap12({
    servico: 'consulta',
    xmlDados: '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>2</ambiente><numeroRecibo>0000001234</numeroRecibo></TConsLote_GNRE>'
  });
  assert.match(xml, /<soap12:Header><gnreCabecMsg xmlns="http:\/\/www\.gnre\.pe\.gov\.br\/webservice\/GnreResultadoLote"><versaoDados>1\.00<\/versaoDados><\/gnreCabecMsg><\/soap12:Header>/);
  assert.match(xml, /<soap12:Body><gnreDadosMsg xmlns="http:\/\/www\.gnre\.pe\.gov\.br\/webservice\/GnreResultadoLote">/);
});
