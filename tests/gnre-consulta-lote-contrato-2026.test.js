'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {montarConsultaRecibo}=require('../lib/integracoes/gnre-consulta-xml');
const {montarConsulta}=require('../lib/integracoes/gnre-consulta-lote');
const {montarPlanoConsulta}=require('../lib/integracoes/gnre-homologacao-executor');

const schema=fs.readFileSync(path.join(__dirname,'../docs/gnre-xsd/lote_gnre_consulta_v1.00.xsd'),'utf8');

test('consulta usa exatamente o nome e a ordem do XML do XSD original',()=>{
  assert.match(schema,/<xs:element name="TConsLote_GNRE">/);
  assert.ok(schema.indexOf('name="ambiente"')<schema.indexOf('name="numeroRecibo"'));
  const xml=montarConsultaRecibo('0000001234');
  assert.equal(xml,'<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>2</ambiente><numeroRecibo>0000001234</numeroRecibo></TConsLote_GNRE>');
});
test('consulta real compartilha o mesmo XML canonico, sem tags adicionais',()=>{
  for(const recibo of ['0000001234','00000000123456']){
    const x=montarConsulta(recibo);
    const fragment=montarConsultaRecibo(recibo);
    assert.ok(x.includes('<gnreDadosMsg xmlns="http://www.gnre.pe.gov.br/webservice/GnreResultadoLote">'+fragment+'</gnreDadosMsg>'));
    assert.equal((x.match(/TConsLote_GNRE/g)||[]).length,2);
    assert.doesNotMatch(x,/TconsLote_GNRE|incluirPDFGuias|<TConsLote_GNRE[^>]*versao=/);
  }
});
test('14 digitos de 2024 permanecem completos e sem perda de zeros',()=>{
  const plano=montarPlanoConsulta('00000000123456');
  assert.ok(plano.xml.includes('<numeroRecibo>00000000123456</numeroRecibo>'));
  assert.ok(plano.recibo_mascarado.endsWith('3456'));
  assert.ok(!JSON.stringify({...plano,xml:undefined}).includes('00000000123456'));
});
test('recibos malformados e tags XML injetadas sao recusados antes do transporte',()=>{
  for(const recibo of ['123','0000000012345','000000001234567','0000001234</numeroRecibo>',null]){
    assert.throws(()=>montarConsulta(recibo));
  }
});
test('XSD versionado permanece imutavel; 14 digitos seguem atualizacao do servico de 2024',()=>{
  assert.match(schema,/<xs:pattern value="\[0-9\]\{10\}"/);
  const fragmento=montarConsultaRecibo('00000000123456');
  assert.match(fragmento,/numeroRecibo>00000000123456/);
  // O XSD antigo mantido para rastreabilidade nao pode ser reescrito como "oficial 2026".
});
