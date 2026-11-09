'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepararPreviaGnre: preparar } = require('../lib/integracoes/gnre-cotacao-preparar');
const base = { ufFavorecida: 'MG', receita: '100099', dataVencimento: '2026-11-06', documentoOrigem: '51114', tipoDocumentoOrigem: '10' };
test('sem GNRE nao produz guia', () => assert.deepEqual(preparar({ modo:'nao' }), {status:'nao_aplicavel',transmissao:false,valor:null}));
test('2% sobre NF mais frete com arredondamento em centavos', () => {
 const r=preparar({modo:'planilha2',valorNf:4000,valorFrete:791.5});
 assert.equal(r.valor,'95.83');assert.equal(r.xml,undefined);assert.equal(r.transmissao,false);
});
test('modo automatico reutiliza valor calculado pelo portal sem recalcular', () => {
 assert.equal(preparar({modo:'automatico',valorAutomatico:95.83}).valor,'95.83');
});
test('manual exige justificativa e guarda motivo', () => {
 assert.throws(()=>preparar({modo:'manual',valorManual:95.83}),/Justificativa/);
 assert.equal(preparar({modo:'manual',valorManual:95.83,motivoAlteracao:'Conferencia fiscal'}).justificativa,'Conferencia fiscal');
});
test('nao cria XML sem confirmacao fiscal; confirmado gera previa offline', () => {
 const r=preparar({...base,modo:'manual',valorManual:95.83,motivoAlteracao:'Conferencia fiscal',obrigacaoConfirmada:true});
 assert.match(r.xml,/<valor tipo="11">95.83<\/valor>/);assert.equal(r.transmissao,false);
});
test('rejeita valores invalidos e campos fiscais ausentes', () => {
 for(const v of [NaN,Infinity,-1,0.001,'95.83']) assert.throws(()=>preparar({modo:'manual',valorManual:v,motivoAlteracao:'Conferencia fiscal'}));
 assert.throws(()=>preparar({modo:'automatico',valorAutomatico:95.83,obrigacaoConfirmada:true}));
});

test('preparacao GNRE encaminha detalhamento de receita sem inventar o codigo', () => {
 const r=preparar({...base,receita:'100129',detalhamentoReceita:'000051',
   dataPagamento:'2026-11-09',convenio:'TESTE CONVENIO',
   contribuinte:{cnpj:'12345678000195',endereco:'Rua Teste',municipio:'5208707',uf:'GO',cep:'74550470'},
   modo:'manual',valorManual:95.83,motivoAlteracao:'Conferencia fiscal',obrigacaoConfirmada:true});
 assert.match(r.xml,/<receita>100129<\/receita><detalhamentoReceita>000051<\/detalhamentoReceita>/);
 assert.match(r.xml, /<valor tipo="12">95\.83<\/valor>/);
 assert.match(r.xml, /<convenio>TESTE CONVENIO<\/convenio>/);
});
