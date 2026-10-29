const test=require('node:test');
const assert=require('node:assert/strict');
const {analisarRespostaSoap}=require('../lib/integracoes/gnre-resposta-soap');
const check=(status,body)=>analisarRespostaSoap({status,body});
test('GNRE SOAP transport success never claims fiscal authorization',()=>{
 const x=check(200,'<?xml version="1.0"?><soap:Envelope><soap:Body><recebido/></soap:Body></soap:Envelope>');
 assert.equal(x.ok,true);
 assert.equal(x.validacaoFiscal,'nao_realizada');
 assert.equal(x.categoria,'soap_recebido');
});
test('GNRE SOAP Fault is rejected even on HTTP 200',()=>{
 assert.deepEqual(check(200,'<soap:Envelope><soap:Body><soap:Fault><faultstring>erro</faultstring></soap:Fault></soap:Body></soap:Envelope>'),{ok:false,categoria:'soap_fault'});
});
test('GNRE HTTP errors, proxy HTML, malformed response and DTD are not success',()=>{
 assert.equal(check(503,'<Envelope><Body/></Envelope>').categoria,'http_erro');
 assert.equal(check(200,'<html>Gateway</html>').categoria,'resposta_nao_soap');
 assert.equal(check(200,'<?xml version="1.0"?><erro/>').categoria,'resposta_nao_soap');
 assert.equal(check(200,'<!DOCTYPE a><Envelope/>').categoria,'xml_inseguro');
 assert.equal(check(200,'').categoria,'resposta_invalida');
});
