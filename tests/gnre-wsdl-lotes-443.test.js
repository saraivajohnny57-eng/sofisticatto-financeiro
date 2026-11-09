'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {analisarWsdl}=require('../lib/integracoes/gnre-wsdl-lotes-443');
const {SOAP_ACTIONS}=require('../lib/integracoes/gnre-soap-actions');
function wsdl(nome,acao,porta=''){
 const operacao=nome==='GnreLoteRecepcao'?'processar':'consultar';
 return '<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/">'
  +'<wsdl:operation name="'+operacao+'"><soap12:operation soapAction="'+acao+'"/></wsdl:operation>'
  +'<wsdl:service><wsdl:port><soap12:address location="https://www.testegnre.pe.gov.br'+porta+'/gnreWS/services/'+nome+'"/></wsdl:port></wsdl:service>'
  +'</wsdl:definitions>';
}
test('GNRE confirma WSDL de recepcao e retorno em 443, sem emitir',()=>{
 for(const [nome,acao] of [['GnreLoteRecepcao',SOAP_ACTIONS.recepcao],['GnreResultadoLote',SOAP_ACTIONS.consulta]]){
  const r=analisarWsdl(nome,wsdl(nome,acao));
  assert.equal(r.contrato_aprovado,true);
  assert.equal(r.endereco_valido,true);
  assert.equal(analisarWsdl(nome,wsdl(nome,acao,':444')).contrato_aprovado,false);
  assert.equal(analisarWsdl(nome,wsdl(nome,'https://falso.invalid')).contrato_aprovado,false);
 }
});
test('GNRE WSDL rejeita SOAP 1.1, host desconhecido e servico desconhecido',()=>{
 const xml=wsdl('GnreLoteRecepcao',SOAP_ACTIONS.recepcao);
 assert.equal(analisarWsdl('GnreLoteRecepcao',xml.replace('soap12/','soap/')).contrato_aprovado,false);
 assert.equal(analisarWsdl('GnreLoteRecepcao',xml.replace('www.testegnre.pe.gov.br','example.com')).contrato_aprovado,false);
 assert.throws(()=>analisarWsdl('GnreConfigUF',xml));
});
test('Rota exige admin, homologacao e nao tem transmissao de guia',()=>{
 const mod=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-wsdl-lotes-443.js'),'utf8');
 const api=fs.readFileSync(path.join(__dirname,'../api/integracoes.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(mod,/exigirAdmin\(req,res\)/);
 assert.match(mod,/GNRE_AMBIENTE/);
 assert.match(mod,/transmissao_fiscal:false/);
 assert.doesNotMatch(mod,/https\.request\(|GnreLoteRecepcao\/processar|TRANSMITIR_HOMOLOGACAO/);
 assert.match(api,/"gnre-lotes-wsdl443": gnreLotesWsdl443/);
 assert.match(ui,/verificarGnreLotesWsdl443\(\)/);
});
