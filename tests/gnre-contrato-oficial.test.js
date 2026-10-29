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

function atributo(xml, regex) {
  const m = String(xml).match(regex);
  if (!m) throw new Error('Atributo não encontrado no WSDL oficial');
  return m[1];
}

test('GNRE actions e namespaces conferem com os WSDLs oficiais SVRS', () => {
  const recepcao = ler('docs/gnre-oficial/GnreLoteRecepcao.wsdl');
  const consulta = ler('docs/gnre-oficial/GnreResultadoLote.wsdl');

  const nsRecepcao = atributo(recepcao, /targetNamespace="([^"]+)"/);
  const nsConsulta = atributo(consulta, /targetNamespace="([^"]+)"/);
  const actionRecepcao = atributo(recepcao, /soap12:operation\s+soapAction="([^"]+)"/);
  const actionConsulta = atributo(consulta, /soap12:operation\s+soapAction="([^"]+)"/);

  assert.equal(SOAP_ACTIONS.recepcao, actionRecepcao);
  assert.equal(SOAP_ACTIONS.consulta, actionConsulta);

  const envelopeRecepcao = montarEnvelopeSoap12({
    servico: 'recepcao',
    xmlDados: '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"></TConsLote_GNRE>'
  });
  assert.ok(envelopeRecepcao.includes(`xmlns="${nsRecepcao}"`), 'namespace de recepção diverge do WSDL');

  const envelopeConsulta = montarEnvelopeSoap12({
    servico: 'consulta',
    xmlDados: '<TconsLote_GNRE xmlns="http://www.gnre.pe.gov.br"></TconsLote_GNRE>'
  });
  assert.ok(envelopeConsulta.includes(`xmlns="${nsConsulta}"`), 'namespace de consulta diverge do WSDL');
});

test('GNRE homologação usa host, porta 444 e caminho do portal oficial', () => {
  assert.equal(
    SERVICOS.recepcao,
    'https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreLoteRecepcao'
  );
  assert.equal(
    SERVICOS.resultado,
    'https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreResultadoLote'
  );
  assert.equal(
    SERVICOS.configuracao,
    'https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreConfigUF'
  );
});

test('GNRE WSDL oficial confirma binding SOAP 1.2 e endereço de produção', () => {
  const recepcao = ler('docs/gnre-oficial/GnreLoteRecepcao.wsdl');
  const consulta = ler('docs/gnre-oficial/GnreResultadoLote.wsdl');

  assert.match(recepcao, /<soap12:binding\s+transport="http:\/\/schemas\.xmlsoap\.org\/soap\/http"/);
  assert.match(consulta, /<soap12:binding\s+transport="http:\/\/schemas\.xmlsoap\.org\/soap\/http"/);
  assert.match(recepcao, /soap12:address\s+location="http:\/\/www\.gnre\.pe\.gov\.br\/gnreWS\/services\/GnreLoteRecepcao"/);
  assert.match(consulta, /soap12:address\s+location="http:\/\/www\.gnre\.pe\.gov\.br\/gnreWS\/services\/GnreResultadoLote"/);
  assert.equal(SOAP_ACTIONS.recepcao, 'http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcao/processar');
  assert.equal(SOAP_ACTIONS.consulta, 'http://www.gnre.pe.gov.br/webservice/GnreResultadoLote/consultar');
});
