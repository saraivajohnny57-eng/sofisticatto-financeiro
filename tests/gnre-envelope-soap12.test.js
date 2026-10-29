const test=require('node:test');
const assert=require('node:assert/strict');
const {montarEnvelopeSoap12}=require('../lib/integracoes/gnre-envelope-soap12');
test('GNRE SOAP 1.2 consulta envelope has header and payload',()=>{
 const xml=montarEnvelopeSoap12({servico:'consulta',xmlDados:'<TconsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>2</ambiente><numeroRecibo>0000001234</numeroRecibo></TconsLote_GNRE>'});
 assert.match(xml,/http:\/\/www.w3.org\/2003\/05\/soap-envelope/);
 assert.match(xml,/<versaoDados>1.00<\/versaoDados>/);
 assert.match(xml,/<numeroRecibo>0000001234<\/numeroRecibo>/);
});
test('GNRE SOAP 1.2 blocks oversized, declaration, DTD and unknown service',()=>{
 const base={servico:'consulta',xmlDados:'<TconsLote_GNRE></TconsLote_GNRE>'};
 for(const patch of [{servico:'producao'},{xmlDados:'<?xml version="1.0"?><a></a>'},{xmlDados:'<!DOCTYPE a><a></a>'},{xmlDados:'<a>'+('a'.repeat(310*1024))+'</a>'}])
  assert.throws(()=>montarEnvelopeSoap12({...base,...patch}));
});
