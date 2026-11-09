'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {SOAP_ACTION,montarDadosConfigUf,montarEnvelopeConfigUf,analisarConfigUf,validarWsdlConfigUf}=require('../lib/integracoes/gnre-configuf-xml');

const SOAP12='http://schemas.xmlsoap.org/wsdl/soap12/';
const WSDL='<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap12="'+SOAP12+'">'
  +'<wsdl:operation name="consultar"><soap12:operation soapAction="'+SOAP_ACTION+'"/></wsdl:operation>'
  +'<wsdl:service><wsdl:port><soap12:address location="https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreConfigUF"/></wsdl:port></wsdl:service>'
  +'</wsdl:definitions>';
test('ConfigUF monta XML estruturado com o namespace exigido e somente homologacao',()=>{
  const xml=montarEnvelopeConfigUf();
  assert.match(xml,/<gnreDadosMsg xmlns="http:\/\/www.gnre.pe.gov.br\/webservice\/GnreConfigUF"><TConsultaConfigUf xmlns="http:\/\/www.gnre.pe.gov.br">/);
  assert.match(xml,/<ambiente>2<\/ambiente><uf>MG<\/uf><receita>100129<\/receita>/);
  assert.doesNotMatch(xml,/&lt;|&gt;|<ambiente>1<\/ambiente>/);
  assert.match(xml,/versaoDados>1\.00<\/versaoDados>/);
  assert.equal((xml.match(/<soap12:Envelope/g)||[]).length,1);
});
test('Fallback de configuracao da UF omite receita e preserva mesmo envelope',()=>{
  const uf=montarEnvelopeConfigUf({uf:'MG',receita:null});
  assert.match(uf,/<ambiente>2<\/ambiente><uf>MG<\/uf><\/TConsultaConfigUf>/);
  assert.doesNotMatch(uf,/<receita>/);
  assert.ok(uf.includes('<gnreDadosMsg xmlns="http://www.gnre.pe.gov.br/webservice/GnreConfigUF">'));
});
test('Somente consulta MG 100129 ou MG sem receita e valores arbitrarios sao recusados',()=>{
  assert.throws(()=>montarDadosConfigUf({uf:'GO',receita:'100129'}));
  assert.throws(()=>montarDadosConfigUf({uf:'MG',receita:'100099'}));
  assert.throws(()=>montarDadosConfigUf({uf:'MG',receita:'</receita>'}));
});
test('XSD versionado confirma TConsultaConfigUf e ordem ambiente uf receita',()=>{
  const schema=fs.readFileSync(path.join(__dirname,'../docs/gnre-xsd/consulta_config_uf_v1.00.xsd'),'utf8');
  assert.match(schema,/<element name="TConsultaConfigUf">/);
  assert.ok(schema.indexOf('name="ambiente"')<schema.indexOf('name="uf"'));
  assert.ok(schema.indexOf('name="uf"')<schema.indexOf('name="receita"'));
  assert.match(montarDadosConfigUf(),/^<TConsultaConfigUf xmlns=/);
});
test('Retorno SOAP Fault HTTP 500 nao pode virar consulta aprovada',()=>{
  const xml='<soapenv:Envelope><soapenv:Body><soapenv:Fault>'
    +'<soapenv:Reason><soapenv:Text xml:lang="en">java.rmi.RemoteException: Erro ao gerar XML de resposta</soapenv:Text></soapenv:Reason>'
    +'</soapenv:Fault></soapenv:Body></soapenv:Envelope>';
  const r=analisarConfigUf({http_status:500,xml});
  assert.equal(r.ok,false);
  assert.equal(r.falha_soap,true);
  assert.match(r.fault,/Erro ao gerar XML de resposta/);
  assert.equal(r.codigo_situacao,null);
});
test('Retorno SOAP 200 sem retorno fiscal 450 e sem TConfigUf nao confirma receita',()=>{
  assert.equal(analisarConfigUf({http_status:200,xml:'<soapenv:Envelope><resultado/></soapenv:Envelope>'}).ok,false);
});
test('Retorno valido HTTP 200 exige codigo fiscal e TConfigUf',()=>{
  const xml='<soap:Envelope><soap:Body><TConfigUf xmlns="http://www.gnre.pe.gov.br">'
    +'<situacaoConsulta><codigo>450</codigo><descricao>Consulta realizada</descricao></situacaoConsulta>'
    +'<receitas><receita codigo="100129"><exigeDocumentoOrigem>S</exigeDocumentoOrigem></receita></receitas>'
    +'</TConfigUf></soap:Body></soap:Envelope>';
  const r=analisarConfigUf({http_status:200,xml});
  assert.equal(r.ok,true);
  assert.deepEqual(r.receitas_encontradas,['100129']);
  assert.ok(r.campos_identificados.includes('exigeDocumentoOrigem'));
});
test('WSDL valida binding SOAP12 acao e HTTPS oficial porta 444',()=>{
  assert.equal(validarWsdlConfigUf(WSDL).href,'https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreConfigUF');
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace(SOAP12,'http://schemas.xmlsoap.org/wsdl/soap/')));
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace(SOAP_ACTION,'https://example.com/action')));
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace('www.testegnre.pe.gov.br:444','localhost:444')));
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace('www.testegnre.pe.gov.br:444','www.testegnre.pe.gov.br:443')));
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace('https://www.testegnre.pe.gov.br:444','http://www.testegnre.pe.gov.br:444')));
});
