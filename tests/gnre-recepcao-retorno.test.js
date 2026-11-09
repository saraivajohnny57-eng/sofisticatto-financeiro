'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {interpretarRecepcao}=require('../lib/integracoes/gnre-recepcao-retorno');
function xml(codigo='100',recibo='1234567890',ambiente='2'){
 return '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">'
  +'<soap:Body><TRetLote_GNRE xmlns="http://www.gnre.pe.gov.br">'
  +'<ambiente>'+ambiente+'</ambiente><situacaoRecepcao><codigo>'+codigo+'</codigo>'
  +'<descricao>Lote recebido com sucesso</descricao></situacaoRecepcao>'
  +(recibo?'<recibo><numero>'+recibo+'</numero>'
   +'<dataHoraRecibo>2026-11-09T13:10:00</dataHoraRecibo>'
   +'<tempoEstimadoProc>1000</tempoEstimadoProc></recibo>':'')
  +'</TRetLote_GNRE></soap:Body></soap:Envelope>';
}
test('retorno oficial: codigo 100 + numero em recibo + ambiente 2 confirma apenas recepcao',()=>{
 const r=interpretarRecepcao(xml());
 assert.equal(r.estado,'recebido');
 assert.equal(r.codigo,'100');
 assert.equal(r.recibo,'1234567890');
});
test('HTTP 200 com codigo 102 nao vira lote recebido',()=>{
 const r=interpretarRecepcao(xml('102',null));
 assert.equal(r.estado,'rejeitado');assert.equal(r.codigo,'102');assert.equal(r.recibo,null);
});
test('recepcao sem recibo, SOAP Fault ou ambiente diferente exige reconciliacao',()=>{
 for(const entrada of [xml('100',null),xml('100','1234567890','1'),
  '<soap:Envelope><soap:Fault/></soap:Envelope>',
  '<soap:Envelope><numeroRecibo>1234567890</numeroRecibo></soap:Envelope>']){
  const r=interpretarRecepcao(entrada);
  assert.equal(r.estado,'resultado_incerto');
  assert.equal(r.ok,false);
 }
});
test('parser nao confunde numeroRecibo de consulta de resultado com recibo da recepcao',()=>{
 assert.equal(interpretarRecepcao('<soap:Envelope><TResultLote_GNRE>'
  +'<numeroRecibo>1234567890</numeroRecibo></TResultLote_GNRE></soap:Envelope>').ok,false);
});
const available=spawnSync('python3',['-c','import xmlschema'],{encoding:'utf8'}).status===0;
test('fixture resposta de recepcao GNRE sintética valida no XSD oficial v1',
 {skip:available?false:'xmlschema nao instalado'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gnre-recibo-oficial-'));
 try{
  const body=xml().match(/<TRetLote_GNRE[\s\S]*?<\/TRetLote_GNRE>/)[0];
  const file=path.join(dir,'retorno.xml');fs.writeFileSync(file,body,'utf8');
  const schema=path.join(__dirname,'../docs/gnre-xsd/lote_gnre_recibo_v1.00.xsd');
  const script=path.join(__dirname,'../scripts/gnre-validar-xsd.py');
  const p=spawnSync('python3',[script,'--schema',schema,'--xml',file],{encoding:'utf8'});
  assert.equal(p.status,0,JSON.stringify({stdout:p.stdout,stderr:p.stderr}).slice(0,3000));
  assert.equal(JSON.parse(p.stdout).ok,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
