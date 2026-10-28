const test=require('node:test');
const assert=require('node:assert/strict');
const {SOAP_ACTIONS,validarActionOficial}=require('../lib/integracoes/gnre-soap-actions');
test('GNRE actions match official SOAP 1.2 WSDL',()=>{
 assert.equal(validarActionOficial('recepcao',SOAP_ACTIONS.recepcao),'http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcao/processar');
 assert.equal(validarActionOficial('consulta',SOAP_ACTIONS.consulta),'http://www.gnre.pe.gov.br/webservice/GnreResultadoLote/consultar');
});
test('GNRE rejects wrong SOAP action and service',()=>{
 assert.throws(()=>validarActionOficial('recepcao',SOAP_ACTIONS.consulta));
 assert.throws(()=>validarActionOficial('producao',SOAP_ACTIONS.recepcao));
});
