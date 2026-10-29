'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv } = require('../helpers/env');
const { loadScript } = require('../helpers/sandbox');

preserveEnv();
const { context: alfa } = loadScript('lib/integracoes/_alfa-tracking.js');

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('soNumeros remove qualquer caractere não numérico', () => {
  assert.equal(alfa.soNumeros('12.345.678/0001-99'), '12345678000199');
  assert.equal(alfa.soNumeros(null), '');
});

test('dataIso converte datas brasileiras e ISO', () => {
  assert.equal(alfa.dataIso('05/01/2024'), '2024-01-05');
  assert.equal(alfa.dataIso('05/01/2024 14:30'), '2024-01-05T14:30:00');
  assert.equal(alfa.dataIso('2024-01-05'), '2024-01-05');
  assert.equal(alfa.dataIso('2024-01-05T14:30:00'), '2024-01-05T14:30:00');
  assert.equal(alfa.dataIso('inexistente'), null);
  assert.equal(alfa.dataIso(''), null);
});

test('ultimaOcorrencia prioriza ocorrências extras e depois embarque', () => {
  const extras = alfa.ultimaOcorrencia({
    ocorrenciasExtras: [
      { descricaoOcorrencia: 'Primeira', dataOcorrencia: '01/01/2024' },
      { descricaoOcorrencia: 'Última', dataOcorrencia: '02/01/2024' }
    ]
  });
  assert.equal(extras.texto, 'Última');
  assert.equal(extras.data, '2024-01-02');

  const embarque = alfa.ultimaOcorrencia({
    dadosEmbarque: [{ cidadeOrigem: 'Goiânia', cidadeDestino: 'São Paulo', horaChegada: '02/01/2024 10:00' }]
  });
  assert.match(embarque.texto, /Goiânia/);
  assert.match(embarque.texto, /São Paulo/);

  assert.equal(alfa.ultimaOcorrencia({}).texto, 'Mercadoria localizada na Alfa Transportes');
});

test('normalizarStatus prioriza data de entrega e interpreta ocorrências', () => {
  assert.equal(alfa.normalizarStatus({ dadosEntrega: { dataEntrega: '02/01/2024' } }), 'entregue');
  assert.equal(alfa.normalizarStatus({ ocorrenciasExtras: [{ descricaoOcorrencia: 'SAIU PARA ENTREGA' }] }), 'saiu_entrega');
  assert.equal(alfa.normalizarStatus({ ocorrenciasExtras: [{ descricaoOcorrencia: 'ENTREGUE' }] }), 'entregue');
  assert.equal(alfa.normalizarStatus({ ocorrenciasExtras: [{ descricaoOcorrencia: 'AVARIA' }] }), 'ocorrencia');
  assert.equal(alfa.normalizarStatus({ ocorrenciasExtras: [{ descricaoOcorrencia: 'NA FILIAL' }] }), 'na_filial');
  assert.equal(alfa.normalizarStatus({ ocorrenciasExtras: [{ descricaoOcorrencia: 'EM TRANSITO' }] }), 'em_transito');
});
