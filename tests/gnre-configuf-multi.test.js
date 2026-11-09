'use strict';
// ConfigUF multestado: leitura e validacao de perfis com XML sintético,
// sem conexoes externas, sem certificados reais e sem transmissao.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {withModuleStubs,fakeRequest,fakeResponse}=require('./helpers/module-stubs');
const {preserveEnv,resetEnv,restoreEnv,setEnv}=require('./helpers/env');
const {validarEntrada,envelope,perfilDaReceita,analisarRetorno}=require('../lib/integracoes/gnre-configuf-multi');
const utils=require('../lib/integracoes/_utils');
function resposta({uf='PA',codigo='450',receita='100102',ambiente='2',detalhe='000303'}={}){
 return '<soap12:Envelope><soap12:Body>'
  +'<ns:TConfigUf xmlns:ns="http://www.gnre.pe.gov.br">'
  +'<ns:ambiente>'+ambiente+'</ns:ambiente><ns:uf>'+uf+'</ns:uf>'
  +'<ns:situacaoConsulta><ns:codigo>'+codigo+'</ns:codigo>'
  +'<ns:descricao>Consulta efetuada com sucesso</ns:descricao></ns:situacaoConsulta>'
  +'<ns:receitas><ns:receita codigo="'+receita+'">'
  +'<ns:exigeContribuinteEmitente>S</ns:exigeContribuinteEmitente>'
  +'<ns:exigeDocumentoOrigem>S</ns:exigeDocumentoOrigem>'
  +'<ns:exigeDataVencimento>O</ns:exigeDataVencimento>'
  +'<ns:exigeDataPagamento>S</ns:exigeDataPagamento>'
  +'<ns:exigeConvenio>S</ns:exigeConvenio>'
  +'<ns:exigeDetalhamentoReceita>O</ns:exigeDetalhamentoReceita>'
  +'<ns:exigeCamposAdicionais>O</ns:exigeCamposAdicionais>'
  +'<ns:detalhamentosReceita><ns:detalhamentoReceita>'
  +'<ns:codigo>'+detalhe+'</ns:codigo><ns:descricao>DIFAL por operacao</ns:descricao>'
  +'</ns:detalhamentoReceita></ns:detalhamentosReceita>'
  +'<ns:tiposDocumentosOrigem><ns:tipoDocumentoOrigem>'
  +'<ns:codigo>10</ns:codigo><ns:descricao>Nota fiscal</ns:descricao>'
  +'</ns:tipoDocumentoOrigem></ns:tiposDocumentosOrigem>'
  +'<ns:camposAdicionais><ns:campoAdicional>'
  +'<ns:codigo>0303</ns:codigo><ns:titulo>Numero autorizado</ns:titulo>'
  +'<ns:tipo>N</ns:tipo><ns:obrigatorio>S</ns:obrigatorio>'
  +'<ns:tamanho>10</ns:tamanho></ns:campoAdicional></ns:camposAdicionais>'
  +'</ns:receita><ns:receita codigo="100129"><ns:exigeConvenio>N</ns:exigeConvenio></ns:receita>'
  +'</ns:receitas></ns:TConfigUf></soap12:Body></soap12:Envelope>';
}
test('ConfigUF aceita cada UF valida e impede injecao de URL/XML',()=>{
 for(const uf of ['PA','MG','SP','AC','TO']){
  const x=envelope(uf,'100102');
  assert.match(x,new RegExp('<uf>'+uf+'</uf><receita>100102</receita>'));
  assert.match(x,/<ambiente>2<\/ambiente>/);
  assert.doesNotMatch(x,/GnreLoteRecepcao/);
 }
 for(const entrada of [{uf:'XX',receita:'100102'},{uf:'pa',receita:'100102'},
 {uf:'PA',receita:'100102</receita><x>'},{uf:'PA',receita:'10010'}]){
  assert.throws(()=>validarEntrada(entrada.uf,entrada.receita));
 }
});
test('ConfigUF 450 isola receita 100102 e extrai codigos/detalhes/obrigatoriedade',()=>{
 const xml=resposta();
 const x=analisarRetorno({xml,http_status:200,uf:'PA',receita:'100102'});
 assert.equal(x.ok,true);
 assert.equal(x.codigo_gnre,'450');
 assert.equal(x.perfil.exigencias.convenio,'S');
 assert.equal(x.perfil.exigencias.detalhamento,'O');
 assert.equal(x.perfil.detalhamentos[0].codigo,'000303');
 assert.equal(x.perfil.documentos[0].codigo,'10');
 assert.equal(x.perfil.campos_adicionais[0].codigo,'0303');
 assert.equal(x.perfil.campos_adicionais[0].obrigatorio,'S');
 assert.equal(x.perfil.codigo_0303.identificado,true);
 assert.equal(x.perfil.emissao_liberada,false);
 assert.equal(x.transmissao,false);
});
test('UF do XML divergente, ambiente nao homologacao ou receita nao confirmada bloqueiam',()=>{
 for(const [xml,uf,receita] of [
  [resposta({uf:'PA'}),'MG','100102'],
  [resposta({ambiente:'1'}),'PA','100102'],
  [resposta({receita:'100129'}),'PA','100102'],
  [resposta({codigo:'451'}),'PA','100102']
 ]){
  const x=analisarRetorno({xml,http_status:200,uf,receita});
  assert.equal(x.ok,false);
  assert.equal(x.transmissao,false);
 }
});
test('Configuracao sem lista de detalhamento nao supoe o codigo 0303',()=>{
 const xml=resposta({detalhe:'000500'})
  .replace(/<ns:camposAdicionais>[\s\S]*?<\/ns:camposAdicionais>/,'')
  .replace(/<ns:detalhamentosReceita>[\s\S]*?<\/ns:detalhamentosReceita>/,'');
 const p=perfilDaReceita(xml,'PA','100102');
 assert.equal(p.ok,true);
 assert.equal(p.codigo_0303.identificado,false);
 assert.equal(p.campos_adicionais.length,0);
 assert.ok(p.pendencias.some(s=>s.includes('Detalhamento exigido')));
});
test('Nao interpretar atributos de outra receita como dados da solicitada',()=>{
 const x=analisarRetorno({xml:resposta(),http_status:200,uf:'PA',receita:'100129'});
 assert.equal(x.ok,true);
 assert.equal(x.perfil.exigencias.convenio,'N');
 assert.equal(x.perfil.detalhamentos.length,0);
 assert.equal(x.perfil.codigo_0303.identificado,false);
});
let sent=0;
const handler=withModuleStubs({
 './gnre-certificado':{credenciais:async()=>({key:'TESTE',cert:'TESTE'})},
 './gnre-pa-configuf':{requisitarPa:async body=>{
  sent++;
  assert.match(body,/<uf>PA<\/uf>/);
  return {http_status:200,xml:resposta()};
 }},
 './_utils':{...utils}
},()=>require('../lib/integracoes/gnre-configuf-multi-rota'));
const auth={'x-integrations-admin-key':'chave-ficticia'};
function ambiente(){
 setEnv({INTEGRATIONS_ADMIN_KEY:'chave-ficticia',VERCEL_ENV:'preview',
  GNRE_AMBIENTE:'homologacao',VERCEL_GIT_COMMIT_REF:'gnre-xml-calculos-integracao'});
}
async function call(body,headers=auth){
 const r=fakeResponse();await handler(fakeRequest({method:'POST',headers,body}),r);return r;
}
preserveEnv();test.beforeEach(()=>{resetEnv();sent=0;});test.after(()=>restoreEnv());
test('Rota so consulta UF validada com autorizacao administrativa',async()=>{
 ambiente();
 let r=await call({uf:'PA',receita:'100102'});
 assert.equal(r.statusCode,200);assert.equal(r.body.ok,true);assert.equal(r.body.transmissao,false);assert.equal(sent,1);
 r=await call({uf:'PA',receita:'100102'},{});
 assert.equal(r.statusCode,401);assert.equal(sent,1);
 r=await call({uf:'PA;DROP',receita:'100102'});
 assert.equal(r.statusCode,400);assert.equal(sent,1);
 setEnv({VERCEL_ENV:'production'});
 r=await call({uf:'PA',receita:'100102'});
 assert.equal(r.statusCode,403);assert.equal(sent,1);
});
test('UI usa UF do XML e não cria guia ou transmissao de estado novo',()=>{
 const dir=path.join(__dirname,'..');
 const js=fs.readFileSync(path.join(dir,'cotacoes.js'),'utf8');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const api=fs.readFileSync(path.join(dir,'api/integracoes.js'),'utf8');
 const handlerSource=fs.readFileSync(path.join(dir,'lib/integracoes/gnre-configuf-multi-rota.js'),'utf8');
 assert.match(html,/onclick="consultarGnreConfigufAuto\(\)"/);
 assert.match(js,/gnrePreenvioNfeLida\.ufDestino|nfe\.ufDestino/);
 assert.match(js,/action=gnre-configuf-multi/);
 assert.match(api,/"gnre-configuf-multi": gnreMultiConfiguf/);
 assert.doesNotMatch(handlerSource,/executarRecepcao|GnreLoteRecepcao|permitirTransmissao:true/);
 assert.match(handlerSource,/transmissao:false/);
});
