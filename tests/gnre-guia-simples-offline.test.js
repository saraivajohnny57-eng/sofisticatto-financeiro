'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { guiaSimples } = require('../lib/integracoes/gnre-guia-simples-offline');
const { montarLoteGnre } = require('../lib/integracoes/gnre-lote-xml');

const dados = {
  ufFavorecida: 'MG', receita: '100099',
  valorPrincipal: '79.17', dataVencimento: '2026-07-08'
};

test('monta guia simples offline dentro de lote 2.00', () => {
  const xml = montarLoteGnre([guiaSimples(dados)]);
  assert.match(xml, /<TLote_GNRE/);
  assert.match(xml, /<tipoGnre>0<\/tipoGnre>/);
  assert.match(xml, /<valor tipo="11">79\.17<\/valor>/);
});

test('rejeita UF, receita, valores e datas fora do formato XSD', () => {
  const invalidos = [
    { ufFavorecida: 'XX' },
    { receita: '10009' },
    { valorPrincipal: '-1.00' },
    { valorPrincipal: '12345678901.00' },
    { dataVencimento: '2026-02-30' }
  ];
  for (const campo of invalidos) {
    assert.throws(() => guiaSimples({ ...dados, ...campo }));
  }
});
