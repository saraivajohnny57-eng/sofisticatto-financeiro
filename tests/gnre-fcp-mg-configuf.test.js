'use strict';
// Regras MG/100129 observadas em consulta ConfigUF de homologacao em 09/11/2026.
// Dados deste teste sao sinteticos; NUNCA transmite guia fiscal.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {guiaSimples}=require('../lib/integracoes/gnre-guia-simples-offline');
const {montarLoteGnre}=require('../lib/integracoes/gnre-lote-xml');
const root=path.join(__dirname,'..');
const schema=path.join(root,'docs/gnre-xsd/lote_gnre_v2.00.xsd');
const validator=path.join(root,'scripts/gnre-validar-xsd.py');
const available=spawnSync('python3',['-c','import xmlschema'],{encoding:'utf8'}).status===0;
function guiaFcp(){
 return guiaSimples({
  ufFavorecida:'MG',receita:'100129',detalhamentoReceita:'000051',
  valorPrincipal:'79.17',dataVencimento:'2026-11-09',dataPagamento:'2026-11-09',
  convenio:'CONVENIO DE TESTE',
  documentoOrigem:'51109',tipoDocumentoOrigem:'10',
  contribuinte:{cnpj:'12345678000195',razaoSocial:'Empresa de Teste',
   endereco:'Rua Exemplo, 100',municipio:'08707',uf:'GO',cep:'74550470'}
 });
}
test('FCP MG/100129 gera lote com tipo 12 e campos exigidos pelo ConfigUF',()=>{
 const xml=montarLoteGnre([guiaFcp()]);
 assert.match(xml,/<detalhamentoReceita>000051<\/detalhamentoReceita>/);
 assert.match(xml,/<valor tipo="12">79\.17<\/valor><convenio>CONVENIO DE TESTE<\/convenio>/);
 assert.match(xml,/<dataPagamento>2026-11-09<\/dataPagamento>/);
 assert.doesNotMatch(xml, /<valor tipo="11">/);
});
test('lote MG/100129 completo sintético passa no XSD oficial v2.00',
 {skip:available?false:'Python xmlschema indisponivel'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gnre-fcp-schema-'));
 try{
  const file=path.join(dir,'lote.xml');
  fs.writeFileSync(file,montarLoteGnre([guiaFcp()]),'utf8');
  const r=spawnSync('python3',[validator,'--schema',schema,'--xml',file],{encoding:'utf8'});
  assert.equal(r.status,0,JSON.stringify({stdout:r.stdout,stderr:r.stderr}).slice(0,3500));
  const out=JSON.parse(r.stdout||'{}');
  assert.equal(out.ok,true,JSON.stringify(out));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
