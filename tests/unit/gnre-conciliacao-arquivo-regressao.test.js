'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {conferirResultadoIndividual}=require('../../lib/integracoes/gnre-conferencia-individual');
function fixture(situacao,extra={}){
 const ref={chave_nfe:'5'.repeat(44),numero_nfe:'51109',receita:'100102',uf_favorecida:'MG',
  valor_principal:'19.01',ambiente:'homologacao',situacao,...extra};
 const retorno={ok:true,codigo:'402',guia_confirmada:true,guias:[{situacao:'0',
  documento_origem:'51109',receita:'100102',uf:'MG',valor:'19.01',numero_controle:'0000009635208871'}]};
 return {ref,retorno};
}
test('homologacao emitida arquivada com controle coincidente concilia',()=>{
 const {ref,retorno}=fixture('emitida',{pdf_arquivado:true,numero_guia:'0000009635208871'});
 const result=conferirResultadoIndividual(retorno,ref);
 assert.equal(result.confirmado,true);
 assert.equal(result.documento_valido_para_pagamento,false);
});
test('emitida sem PDF arquivado nao concilia',()=>{
 const {ref,retorno}=fixture('emitida',{pdf_arquivado:false,numero_guia:'0000009635208871'});
 assert.equal(conferirResultadoIndividual(retorno,ref).confirmado,false);
});
test('emitida com controle divergente nao concilia',()=>{
 const {ref,retorno}=fixture('emitida',{pdf_arquivado:true,numero_guia:'0000009635208872'});
 assert.equal(conferirResultadoIndividual(retorno,ref).confirmado,false);
});
test('recebida e validada continuam conciliaveis',()=>{
 for(const status of ['recebida','validada']){
  const {ref,retorno}=fixture(status);
  assert.equal(conferirResultadoIndividual(retorno,ref).confirmado,true);
 }
});
test('PDF jamais torna resultado de homologacao pagavel',()=>{
 const {ref,retorno}=fixture('emitida',{pdf_arquivado:true,numero_guia:'0000009635208871'});
 const result=conferirResultadoIndividual(retorno,ref);
 assert.equal(result.ambiente,'homologacao');
 assert.equal(result.documento_valido_para_pagamento,false);
});
