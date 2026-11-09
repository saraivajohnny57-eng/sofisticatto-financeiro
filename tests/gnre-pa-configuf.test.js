'use strict';
// GNRE PA ConfigUF: apenas leitura, certificado e XMLs totalmente simulados.
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),path=require('node:path');
const {withModuleStubs,fakeRequest,fakeResponse}=require('./helpers/module-stubs');
const {preserveEnv,resetEnv,restoreEnv,setEnv}=require('./helpers/env');
const utils=require('../lib/integracoes/_utils');
const {montarConsultaPa,analisarCamposPa,requisitarPa}=require('../lib/integracoes/gnre-pa-configuf');
function sucesso(codigo='100102'){
 return '<soap:Envelope><soap:Body><TConfigUf><situacaoConsulta><codigo>450</codigo>'
  +'<descricao>Consulta realizada com sucesso</descricao></situacaoConsulta>'
  +'<receitas><receita codigo="'+codigo+'"><exigeConvenio>S</exigeConvenio>'
  +'<exigeDocumentoOrigem>O</exigeDocumentoOrigem><exigeDataPagamento>O</exigeDataPagamento>'
  +'</receita></receitas></TConfigUf></soap:Body></soap:Envelope>';
}
test('XML da ConfigUF do Para usa receita 100102, ambiente 2 e nunca recepcao',()=>{
 const xml=montarConsultaPa();
 assert.match(xml,/<ambiente>2<\/ambiente><uf>PA<\/uf><receita>100102<\/receita>/);
 assert.match(xml,/GnreConfigUF/);
 assert.doesNotMatch(xml,/<uf>MG<\/uf>|GnreLoteRecepcao|<ambiente>1<\/ambiente>/);
});
test('Campos da ConfigUF PA sao confirmados SOMENTE pela receita solicitada',()=>{
 const x=analisarCamposPa(sucesso());
 assert.equal(x.exige_convenio,'S');
 assert.equal(x.exige_documento_origem,'O');
 assert.equal(x.exige_data_pagamento,'O');
 assert.equal(x.exige_contribuinte_emitente,'nao_confirmado');
 assert.equal(x.codigo_estadual_0303,'pendente_de_identificar_campo_oficial');
 assert.equal(analisarCamposPa(sucesso('100129')).exige_convenio,'nao_confirmado');
});
test('Transporte PA faz apenas POST de ConfigUF 443 com TLS e sem redirecionamento',async()=>{
 const sent=[];
 const transport={request(url,opts,callback){
  const request=new EventEmitter();
  request.end=data=>{
   sent.push({url:String(url),opts,data});
   const response=new EventEmitter();response.statusCode=200;
   callback(response);
   response.emit('data',Buffer.from(sucesso()));
   response.emit('end');
  };
  request.destroy=e=>request.emit('error',e);
  return request;
 }};
 const r=await requisitarPa(montarConsultaPa(),{cert:'CERT_FICTICIO',key:'KEY_FICTICIA'},transport);
 assert.equal(r.http_status,200);
 assert.ok(r.xml.includes('100102'));
 assert.equal(sent.length,1);
 assert.equal(sent[0].opts.method,'POST');
 assert.equal(sent[0].opts.rejectUnauthorized,true);
 assert.equal(sent[0].url,'https://www.testegnre.pe.gov.br/gnreWS/services/GnreConfigUF');
 assert.doesNotMatch(sent[0].data,/GnreLoteRecepcao/);
});
let credCalls=0;
const handler=withModuleStubs({
 './gnre-certificado':{credenciais:async()=>{credCalls++;return {key:'KEY_FICTICIA',cert:'CERT_FICTICIO'}}},
 './_utils':{...utils}
},()=>require('../lib/integracoes/gnre-pa-configuf'));
const key={'x-integrations-admin-key':'autorizacao-ficticia'};
function prepararEnv(){setEnv({
 INTEGRATIONS_ADMIN_KEY:'autorizacao-ficticia',VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_REF:'gnre-xml-calculos-integracao',GNRE_AMBIENTE:'homologacao'
});}
async function call(headers=key){
 const res=fakeResponse();
 await handler(fakeRequest({method:'POST',headers,body:{}}),res);return res;
}
preserveEnv();test.beforeEach(()=>{resetEnv();credCalls=0;});test.after(()=>restoreEnv());
test('rota protegida nao chama certificado sem administrador',async()=>{
 prepararEnv();const r=await call({});
 assert.equal(r.statusCode,401);
 assert.equal(credCalls,0);
});
test('rota NAO funciona em producao nem em branch nao autorizada',async()=>{
 prepararEnv();setEnv({VERCEL_ENV:'production'});
 const a=await call();
 assert.equal(a.statusCode,403);
 assert.equal(credCalls,0);
 prepararEnv();setEnv({VERCEL_GIT_COMMIT_REF:'main'});
 const b=await call();assert.equal(b.statusCode,403);
 assert.equal(credCalls,0);
});
test('API PA e UI estao ligados apenas a diagnostico ConfigUF; nenhuma emissao de guia',()=>{
 const root=path.join(__dirname,'..');
 const a=fs.readFileSync(path.join(root,'api/integracoes.js'),'utf8');
 const i=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const c=fs.readFileSync(path.join(root,'cotacoes.js'),'utf8');
 const module=fs.readFileSync(path.join(root,'lib/integracoes/gnre-pa-configuf.js'),'utf8');
 assert.match(a,/"gnre-pa-configuf": gnrePaConfiguf/);
 assert.match(i,/onclick="consultarGnreConfigufAuto\(\)"/);
 assert.match(c,/async function consultarConfigUfPa100102\(\)/);
 assert.doesNotMatch(module,/executarRecepcao|GnreLoteRecepcao|permitirTransmissao:true/);
 assert.match(module,/transmissao:false/);
});
