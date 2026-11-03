'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { montarLoteGnre } = require('../lib/integracoes/gnre-lote-xml');

const guia = '<TDadosGNRE versao="2.00"><ufFavorecida>MG</ufFavorecida></TDadosGNRE>';

test('monta TLote_GNRE 2.00 para validação XSD posterior, sem transmitir', () => {
  const xml = montarLoteGnre([guia]);
  assert.match(xml, /^<TLote_GNRE xmlns="http:\/\/www\.gnre\.pe\.gov\.br" versao="2\.00"><guias>/);
  assert.match(xml, /<TDadosGNRE versao="2\.00">/);
  assert.match(xml, /<\/guias><\/TLote_GNRE>$/);
});
test('exige pelo menos uma guia e limita tamanho do lote', () => {
  assert.throws(() => montarLoteGnre([]), /1 a 50/);
  assert.throws(() => montarLoteGnre(Array(51).fill(guia)), /1 a 50/);
  assert.throws(() => montarLoteGnre([guia.replace('</TDadosGNRE>', 'x'.repeat(310000)+'</TDadosGNRE>')]), /300 KB/);
});
test('rejeita versão incorreta, XML externo e entidades', () => {
  assert.throws(() => montarLoteGnre([guia.replace('2.00','1.00')]), /versão 2.00/);
  assert.throws(() => montarLoteGnre(['<?xml version="1.0"?>'+guia]), /proibidas/);
  assert.throws(() => montarLoteGnre(['<!DOCTYPE x>'+guia]), /proibidas/);
  assert.throws(() => montarLoteGnre(['<TDadosGNRE versao="2.00"><!ENTITY x "y"></TDadosGNRE>']), /proibidas/);
});
