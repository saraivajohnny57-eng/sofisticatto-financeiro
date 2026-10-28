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

test('GNRE receipt query composes with SOAP 1.2 without nested XML declarations',()=>{
 const {montarEnvelopeSoap12}=require('../lib/integracoes/gnre-envelope-soap12');
 const fragment=montarConsultaRecibo('0000001234');
 assert.doesNotMatch(fragment,/<\\?xml/i);
 const envelope=montarEnvelopeSoap12({servico:'consulta',xmlDados:fragment});
 assert.equal(envelope.split('<?xml').length-1,1);
 assert.ok(envelope.includes('<numeroRecibo>0000001234</numeroRecibo>'));
});
