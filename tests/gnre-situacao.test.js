const test=require('node:test');
const assert=require('node:assert/strict');
const {interpretarSituacaoProcessamento}=require('../lib/integracoes/gnre-situacao');
test('GNRE lot statuses 400-404 are classified without assuming guide authorization',()=>{
 const expected={'400':'aguardando','401':'processando','402':'processado','403':'pendencia','404':'erro_processamento'};
 for(const [code,fase] of Object.entries(expected)){
  const result=interpretarSituacaoProcessamento(code);
  assert.equal(result.fase,fase);
  assert.equal(result.guiaAutorizada,null);
  assert.equal(result.guiaPaga,null);
 }
 assert.equal(interpretarSituacaoProcessamento('401').finalizado,false);
 assert.equal(interpretarSituacaoProcessamento('403').finalizado,false);
 assert.equal(interpretarSituacaoProcessamento('402').finalizado,true);
});
test('GNRE unknown codes remain unknown and injection is rejected',()=>{
 assert.equal(interpretarSituacaoProcessamento('602').fase,'nao_mapeado');
 for(const code of ['401; DROP TABLE',null,'',NaN])assert.throws(()=>interpretarSituacaoProcessamento(code));
});
