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

const casoFcpMg={
  ...dados,
  receita:'100129',detalhamentoReceita:'000051',
  documentoOrigem:'51109',tipoDocumentoOrigem:'10',
  dataPagamento:'2026-11-09',convenio:'TESTE CONVENIO',
  contribuinte:{
    cnpj:'12345678000195',razaoSocial:'Empresa de Teste',
    endereco:'Rua de Teste, 100',municipio:'08707',uf:'GO',cep:'74550470'
  }
};

// O exemplo usa os codigos oficiais de detalhamento; o municipio GNRE tem 5 digitos.
test('inclui detalhamentoReceita opcional para receita 100129 na ordem correta do XSD', () => {
  const xml = guiaSimples(casoFcpMg);
  assert.match(xml, /<receita>100129<\/receita><detalhamentoReceita>000051<\/detalhamentoReceita><documentoOrigem tipo="10">/);
  assert.doesNotMatch(guiaSimples(dados), /<detalhamentoReceita>/);
  for(const invalido of ['1','00001','abcdef','1234567','<xml/>'])
    assert.throws(()=>guiaSimples({...casoFcpMg,detalhamentoReceita:invalido}),/detalhamentoReceita/);
});

test('MG 100129 preenche convenio apos valor e dataPagamento ao final (tipo 12 FCP)', () => {
 const xml=guiaSimples(casoFcpMg);
 assert.match(xml, /<valor tipo="12">79\.17<\/valor><convenio>TESTE CONVENIO<\/convenio><\/item>/);
 assert.match(xml, /<\/itensGNRE><valorGNRE>79\.17<\/valorGNRE><dataPagamento>2026-11-09<\/dataPagamento>/);
 assert.match(xml, /<endereco>Rua de Teste, 100<\/endereco><municipio>08707<\/municipio><uf>GO<\/uf><cep>74550470<\/cep>/);
 assert.match(guiaSimples({...casoFcpMg,detalhamentoReceita:'000052'}), /<detalhamentoReceita>000052<\/detalhamentoReceita>/);
});
test('MG 100129 rejeita campos obrigatorios faltantes e tipo valor incorreto',()=>{
 for(const patch of [
  {detalhamentoReceita:'123456'}, {dataPagamento:null}, {dataPagamento:'2026-02-30'},
  {convenio:null}, {convenio:''}, {tipoDocumentoOrigem:'09'}, {tipoValor:'11'},
  {contribuinte:null},
  {contribuinte:{...casoFcpMg.contribuinte,cep:null}},
 ]){
  assert.throws(()=>guiaSimples({...casoFcpMg,...patch}),/MG\/100129|Data GNRE invalida|convenio/);
 }
});
