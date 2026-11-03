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

test('inclui contribuinte e documento de origem em ordem do contrato', () => {
  const xml = guiaSimples({
    ...dados,
    contribuinte: { cnpj: '12345678000195', razaoSocial: 'Empresa & Filhos <MG>' },
    documentoOrigem: '50371', tipoDocumentoOrigem: '10'
  });
  assert.match(xml, /<contribuinteEmitente><identificacao><CNPJ>12345678000195<\/CNPJ><\/identificacao>/);
  assert.match(xml, /Empresa &amp; Filhos &lt;MG&gt;/);
  assert.match(xml, /<receita>100099<\/receita><documentoOrigem tipo="10">50371<\/documentoOrigem><dataVencimento>/);
});

test('rejeita identificacao e documento invalidos sem inserir XML arbitrario', () => {
  const casos = [
    { contribuinte: { cnpj: '123', razaoSocial: 'Empresa' } },
    { contribuinte: { cpf: '12345678901', cnpj: '12345678000195' } },
    { contribuinte: { razaoSocial: 'Sem documento' } },
    { documentoOrigem: '<script>', tipoDocumentoOrigem: '10' },
    { documentoOrigem: '50371', tipoDocumentoOrigem: 'x' }
  ];
  for (const caso of casos) assert.throws(() => guiaSimples({ ...dados, ...caso }));
});
