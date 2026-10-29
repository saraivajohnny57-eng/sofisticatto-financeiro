const test=require('node:test');
const assert=require('node:assert/strict');
const {validarRecibo,SERVICOS}=require('../lib/integracoes/gnre-contrato');
test('GNRE accepts legacy 10-digit and current 14-digit receipts preserving zeros',()=>{
 assert.equal(validarRecibo('0000123456'),'0000123456');
 assert.equal(validarRecibo('00000000123456'),'00000000123456');
});
test('GNRE refuses invalid receipt formats before SOAP consultation',()=>{
 for(const x of ['123456789','12345678901','1234567890123','123456789012345','0000000000 OR 1=1','1e13','',null,undefined]){
  assert.throws(()=>validarRecibo(x));
 }
});
test('GNRE homologation uses distinct official reception and result services',()=>{
 assert.match(SERVICOS.recepcao,/^https:\/\/www\.testegnre\.pe\.gov\.br:444\/gnreWS\/services\/GnreLoteRecepcao$/);
 assert.match(SERVICOS.resultado,/^https:\/\/www\.testegnre\.pe\.gov\.br:444\/gnreWS\/services\/GnreResultadoLote$/);
 assert.notEqual(SERVICOS.recepcao,SERVICOS.resultado);
 assert.equal(Object.isFrozen(SERVICOS),true);
});
