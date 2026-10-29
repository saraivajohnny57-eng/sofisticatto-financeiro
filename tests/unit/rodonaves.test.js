'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv } = require('../helpers/env');
const tracking = require('../../lib/integracoes/_rodonaves-tracking');
const fixture = require('../fixtures/rodonaves-tracking.json');

preserveEnv();
test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('mapearStatusRastreio traduz os rótulos da Rodonaves', () => {
  assert.equal(tracking.mapearStatusRastreio('Entregue ao destinatário'), 'entregue');
  assert.equal(tracking.mapearStatusRastreio('Saiu para entrega'), 'saiu_entrega');
  assert.equal(tracking.mapearStatusRastreio('Em rota de entrega'), 'saiu_entrega');
  assert.equal(tracking.mapearStatusRastreio('Avaria na carga'), 'ocorrencia');
  assert.equal(tracking.mapearStatusRastreio('Entrega atrasada'), 'atrasado');
  assert.equal(tracking.mapearStatusRastreio('Cancelado pelo cliente'), 'cancelado');
  assert.equal(tracking.mapearStatusRastreio('Na filial de destino'), 'na_filial');
  assert.equal(tracking.mapearStatusRastreio('Em trânsito'), 'em_transito');
  assert.equal(tracking.mapearStatusRastreio('Aguardando coleta'), 'aguardando_coleta');
  assert.equal(tracking.mapearStatusRastreio(''), 'em_transito');
});

test('extrairEventosRastreio lê a lista de ocorrências', () => {
  const eventos = tracking.extrairEventosRastreio(fixture);
  assert.equal(eventos.length, 2);
  assert.equal(eventos[0].titulo, 'EM TRANSITO');
  assert.equal(eventos[1].titulo, 'SAIU PARA ENTREGA');
  assert.equal(eventos[1].local, 'Sao Paulo / SP');
  assert.equal(eventos[1].codigo, '20');
});

test('interpretarRastreio usa a última ocorrência e extrai identificadores', () => {
  const r = tracking.interpretarRastreio(fixture);
  assert.equal(r.status, 'saiu_entrega');
  assert.match(r.statusBruto, /Saiu para entrega/);
  assert.equal(r.eventos.length, 2);
  assert.equal(r.numeroCte, 'CTE-0001');
  assert.equal(r.protocolo, 'PROT-0001');
  assert.equal(r.numeroNfe, '12345');
  assert.equal(r.chaveNfe, '11223344556677889900112233445566778899001122');
  assert.match(r.ultimaOcorrencia, /Saiu para entrega/);
});

test('interpretarRastreio assume trânsito quando não há ocorrências', () => {
  const r = tracking.interpretarRastreio({});
  assert.equal(r.status, 'em_transito');
  assert.equal(r.statusBruto, 'Mercadoria em trânsito');
  assert.deepEqual(r.eventos, []);
});

test('erroPermiteProximaTentativa só continua em erros recuperáveis', () => {
  assert.equal(tracking.erroPermiteProximaTentativa({ httpStatus: 404 }), true);
  assert.equal(tracking.erroPermiteProximaTentativa({ httpStatus: 204 }), true);
  assert.equal(tracking.erroPermiteProximaTentativa({ message: 'registro_nao_localizado' }), true);
  assert.equal(tracking.erroPermiteProximaTentativa({ httpStatus: 500 }), false);
  assert.equal(tracking.erroPermiteProximaTentativa({ httpStatus: 401 }), false);
});
