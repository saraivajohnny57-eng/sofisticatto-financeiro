'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {interpretarRetorno}=require('../lib/integracoes/gnre-interpretar-resultado');
const {conciliarDuasGuias}=require('../lib/integracoes/gnre-conferencia-dupla');
const CHAVE='1'.repeat(44),RECIBO='1234567890';
function guia(receita,valor,tipo){
 return '<guia><situacaoGuia>0</situacaoGuia><receita>'+receita+'</receita>'
  +'<ufFavorecida>PA</ufFavorecida><documentoOrigem>'+CHAVE+'</documentoOrigem>'
  +'<valor tipo="'+tipo+'">'+valor+'</valor><numeroControle>000000123456</numeroControle></guia>';
}
function xml(g1=guia('100102','28.73','11'),g2=guia('100129','8.21','12')){
 return '<TResultLote_GNRE><ambiente>2</ambiente><numeroRecibo>'+RECIBO
  +'</numeroRecibo><situacaoProcess><codigo>402</codigo></situacaoProcess><resultado>'
  +g1+g2+'</resultado></TResultLote_GNRE>';
}
function refs(){
 return [{chave_nfe:CHAVE,uf_favorecida:'PA',receita:'100102',valor_principal:'28.73',ambiente:'homologacao',situacao:'recebida'},
  {chave_nfe:CHAVE,uf_favorecida:'PA',receita:'100129',valor_principal:'8.21',ambiente:'homologacao',situacao:'recebida'}];
}
test('parser retorna DIFAL tipo 11 e FCP tipo 12 individualmente',()=>{
 const r=interpretarRetorno(xml(),RECIBO);
 assert.deepEqual(r.guias.map(g=>g.valor),['28.73','8.21']);
 assert.equal(r.lote_completo_confirmado,true);
});
test('lote 402 com duas guias individualmente aceitas concilia sem autorizar pagamento',()=>{
 const c=conciliarDuasGuias(interpretarRetorno(xml(),RECIBO),refs());
 assert.equal(c.confirmado,true);
 assert.equal(c.duas_guias.length,2);
 assert.equal(c.documentos_validos_para_pagamento,false);
});
test('nao conciliar FCP com receita errada',()=>{
 const bad=xml(undefined,guia('100102','8.21','12'));
 assert.equal(conciliarDuasGuias(interpretarRetorno(bad,RECIBO),refs()).confirmado,false);
});
test('nao conciliar com valor FCP divergente',()=>{
 const bad=xml(undefined,guia('100129','8.22','12'));
 assert.equal(conciliarDuasGuias(interpretarRetorno(bad,RECIBO),refs()).confirmado,false);
});
test('nao conciliar com chave da NF-e divergente',()=>{
 const rr=refs();rr[1].chave_nfe='2'.repeat(44);
 assert.equal(conciliarDuasGuias(interpretarRetorno(xml(),RECIBO),rr).confirmado,false);
});
test('nao conciliar com uma so referencia',()=>{
 assert.equal(conciliarDuasGuias(interpretarRetorno(xml(),RECIBO),refs().slice(0,1)).confirmado,false);
});
