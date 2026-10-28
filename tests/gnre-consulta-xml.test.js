const test=require('node:test');
const assert=require('node:assert/strict');
const {montarConsultaRecibo}=require('../lib/integracoes/gnre-consulta-xml');
test('GNRE query XML always uses homologation and preserves receipt leading zeros',()=>{
 const xml=montarConsultaRecibo('0000001234');
 assert.match(xml,/<ambiente>2<\/ambiente>/);
 assert.match(xml,/<numeroRecibo>0000001234<\/numeroRecibo>/);
 assert.match(xml,/<TconsLote_GNRE xmlns="http:\/\/www.gnre.pe.gov.br">/);
 assert.doesNotMatch(xml,/<ambiente>1<\/ambiente>/);
});
test('GNRE query XML refuses malformed receipt and cannot inject XML',()=>{
 for(const x of ['123','00000000000001','0000000000</numeroRecibo><ambiente>1</ambiente>',null,undefined])
  assert.throws(()=>montarConsultaRecibo(x));
});
