'use strict';
// Homologacao MG 100102: somente validacao OFFLINE contra XSD 2.00.
// Valores, CNPJ e convenio aqui sao FICTICIOS e nao autorizam transmissao.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {guiaSimples}=require('../lib/integracoes/gnre-guia-simples-offline');
const {montarLoteGnre}=require('../lib/integracoes/gnre-lote-xml');
const raiz=path.join(__dirname,'..');
const script=path.join(raiz,'scripts/gnre-validar-xsd.py');
const schema=path.join(raiz,'docs/gnre-xsd/lote_gnre_v2.00.xsd');
const disp=spawnSync('python3',['-c','import xmlschema'],{encoding:'utf8'}).status===0;
const dados={
 ufFavorecida:'MG',receita:'100102',
 valorPrincipal:'19.01',
 dataVencimento:'2026-11-09',dataPagamento:'2026-11-09',
 convenio:'CONVENIO SINTETICO',
 documentoOrigem:'12345',tipoDocumentoOrigem:'10',
 contribuinte:{cnpj:'12345678000195',razaoSocial:'Empresa Ficticia',
 endereco:'Rua Exemplo, 100',municipio:'08707',uf:'GO',cep:'74550470'}
};
test('GNRE DIFAL MG 100102: tipo 11, sem detalhe, com todos os campos exigidos',()=>{
 const xml=guiaSimples(dados);
 assert.match(xml,/<receita>100102<\/receita><documentoOrigem tipo="10">12345<\/documentoOrigem>/);
 assert.match(xml,/<valor tipo="11">19\.01<\/valor><convenio>CONVENIO SINTETICO<\/convenio>/);
 assert.match(xml,/<valorGNRE>19\.01<\/valorGNRE><dataPagamento>2026-11-09<\/dataPagamento>/);
 assert.doesNotMatch(xml,/<detalhamentoReceita>|<valor tipo="12">/);
});
test('GNRE DIFAL MG 100102 rejeita guias sem os campos obrigatorios do ConfigUF',()=>{
 for(const patch of [
  {dataVencimento:null},{dataPagamento:null},{dataPagamento:'2026-02-30'},
  {convenio:'a'.repeat(31)},{documentoOrigem:null},
  {tipoDocumentoOrigem:'09'},{tipoValor:'12'},{contribuinte:null},
  {detalhamentoReceita:'000051'},
  {contribuinte:{...dados.contribuinte,municipio:'5208707'}},
 ]){
  assert.throws(()=>guiaSimples({...dados,...patch}),/MG\/100102|Campo GNRE|Data GNRE invalida/);
 }
});
test('lote GNRE DIFAL MG 100102 sintetico valido no XSD oficial v2.00',
 {skip:disp?false:'xmlschema indisponivel'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gnre-mg-100102-'));
 try{
  const file=path.join(dir,'lote.xml');
  fs.writeFileSync(file,montarLoteGnre([guiaSimples(dados)]),'utf8');
  const r=spawnSync('python3',[script,'--schema',schema,'--xml',file],{encoding:'utf8'});
  assert.equal(r.status,0,JSON.stringify({stdout:r.stdout,stderr:r.stderr}).slice(0,2500));
  assert.equal(JSON.parse(r.stdout).ok,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('MG 100102 exigeConvenio=S permite omitir convenio sem alterar DIFAL',()=>{
 for(const convenio of [null,'', '   ']){
  const xml=guiaSimples({...dados,convenio});
  assert.doesNotMatch(xml,/<convenio>/);
  assert.match(xml,/<valor tipo="11">19\.01<\/valor><\/item>/);
 }
});
