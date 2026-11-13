'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fonte=fs.readFileSync(path.join(__dirname,'../lib/integracoes/carta-registrada-api.js'),'utf8');
const item={codigoServico:'80799',codigoFormatoObjetoInformado:'1',pesoInformado:'20',
 destinatario:{cpfCnpj:'39963241115',nome:'Cliente Teste',endereco:{cep:'74000000',cidade:'Goiânia',uf:'GO'}},
 remetente:{cpfCnpj:'05451985000195'},listaServicoAdicional:[{codigoServicoAdicional:'025'}],
 dataPrevistaPostagem:'13/11/2026',sequencial:'1'};
function schemaValido(){
 return {openapi:'3.1.0',paths:{'/v1/prepostagens/lista/objetosregistrados':{post:{
  requestBody:{content:{'application/json':{schema:{type:'array',items:{$ref:'#/components/schemas/Registrado'}}}}},
  operationId:'registrarLista'
 }}},components:{schemas:{Registrado:{type:'object',required:['codigoServico','destinatario','remetente'],properties:{
  codigoServico:{type:'string'},destinatario:{type:'object'},remetente:{type:'object'},codigoFormatoObjetoInformado:{type:'string'}
 }}}}};
}
function setup({docs=schemaValido(),existentes=[],statusPost=200,respostaPost={idPrePostagem:'PRabcdefghij1234567890AB',codigoObjeto:'YO113228457BR'},docsStatus=200,duplicidadeInconclusiva=false}={}){
 const calls=[],mod={exports:{}};
 const servico={_teste:{
  validarCotacao:()=>({cep:'74000000',peso:20}),
  valorBR:x=>Number(String(x).replace(',','.')),
  arquivoImportacaoRegistrada:()=>[item],
  mensagensValidacaoCorreios:()=>[],
  assinaturaPiloto:()=> 'cp1.teste',
  validarAssinaturaPiloto:sign=>sign==='cp1.teste'
 }};
 const config={usuario:'usuario-teste',cartao:'007',contrato:'999',cnpj:'05451985000195',cepOrigem:'74550470',dr:'01'};
 const dependencies=n=>{
  if(n==='./_utils')return {exigirAdmin:()=>true};
  if(n==='./carta-comercial-correios')return servico;
  if(n==='./_correios')return {
   cfg:()=>config,configuracaoEfetiva:async()=>config,descobrirContrato:async()=>({todosServicos:[{codigo:'80799'}]}),
   apiComToken:async url=>{
    calls.push({method:'GET',url});
    if(url.includes('/meucontrato/'))return {codigo:url.split('/').pop()};
    if(url.includes('/preco/'))return {pcFinal:'15,60'};
    if(url.includes('/v2/prepostagens?'))return duplicidadeInconclusiva?{}:{content:existentes,hasNext:false};
    throw Error('URL GET inesperada');
   },
   gerarToken:async()=> 'token-ficticio'
  };
  throw Error('Dependência inesperada '+n);
 };
 const fetchMock=async(url,opts={})=>{
  calls.push({method:opts.method||'GET',url,body:opts.body});
  if(url.includes('/v3/api-docs'))return {
    ok:docsStatus===200,status:docsStatus,headers:{get:()=> 'application/json'},
    text:async()=>JSON.stringify(docs)
  };
  if(url.includes('/lista/objetosregistrados'))return {
    ok:statusPost===200,status:statusPost,text:async()=>JSON.stringify(respostaPost)
  };
  throw Error('Rota inesperada: '+url);
 };
 new Function('require','module','process','fetch',fonte)(dependencies,mod,{
  env:{CORREIOS_CARTAS_EMISSAO_HABILITADA:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'teste-carta-comercial-20261112'}
 },fetchMock);
 async function invoke(modo,body={}){
  const res={code:0,body:null,status(n){this.code=n;return this;},json(j){this.body=j;return this;}};
  await mod.exports({method:modo==='diagnostico'?'GET':'POST',query:{modo},body},res);
  return res;
 }
 const p={codigoServico:'80799',tipoConteudo:'DOCUMENTOS',cepDestino:'74000000',pesoGramas:20,
  dataPrevistaPostagem:'2026-11-13',destinatario:item.destinatario};
 return {invoke,p,calls,mod};
}
test('fluxo confirmado: prepara sem POST, cobra valor consultado, emite uma única carta',async()=>{
 const x=setup(),prep=await x.invoke('preparar',x.p);
 assert.equal(prep.code,200);
 assert.equal(prep.body.resumo.valorCotado,15.6);
 assert.ok(prep.body.confirmacaoPiloto);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 const em=await x.invoke('emitir',{...x.p,confirmacaoPiloto:prep.body.confirmacaoPiloto,confirmarEmissaoReal:true});
 assert.equal(em.code,200);
 assert.equal(em.body.idPrePostagem,'PRabcdefghij1234567890AB');
 const post=x.calls.filter(c=>c.method==='POST');
 assert.equal(post.length,1);
 assert.match(post[0].url,/\/lista\/objetosregistrados$/);
 assert.equal(JSON.parse(post[0].body)[0].codigoServico,'80799');
 assert.equal(post[0].body instanceof FormData,false,'requisição JSON não pode ser FormData');
});
test('sem OpenAPI oficial validado: bloqueia sem qualquer POST',async()=>{
 for(const docs of [null,{paths:{}},{paths:{'/v1/prepostagens/lista/objetosregistrados':{post:{requestBody:{content:{'application/json':{schema:{type:'object'}}}}}}}}]){
  const x=setup({docs});
  const r=await x.invoke('preparar',x.p);
  assert.equal(r.code,423);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 }
});
test('POST sem confirmação prévia é bloqueado; nenhuma carta criada',async()=>{
 const x=setup();
 const r=await x.invoke('emitir',{...x.p,confirmarEmissaoReal:true,confirmacaoPiloto:'invalido'});
 assert.equal(r.code,403);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
});
test('pré-postagem ativa ou consulta inconclusiva bloqueiam emissão',async()=>{
 for(const conf of [{existentes:[{codigoServico:'80799',destinatario:item.destinatario}]},{duplicidadeInconclusiva:true}]){
  const x=setup(conf),r=await x.invoke('preparar',x.p);
  assert.equal(r.code,409);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 }
});
test('resposta sem ID não causa reenvio e exige conferência no PPN',async()=>{
 const x=setup({respostaPost:{status:'PROCESSANDO'}});
 const r=await x.invoke('emitir',{...x.p,confirmarEmissaoReal:true,confirmacaoPiloto:'cp1.teste'});
 assert.equal(r.code,202);
 assert.equal(r.body.confirmacaoPendente,true);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
});
test('interface retém confirmação e mantém emissão bloqueada após tentativa',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../cartas-comerciais-correios.js'),'utf8');
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.ok(ui.includes('CARTA_API_TENTATIVA'));
 assert.ok(ui.includes('window.cartaApiEmitir=async()=>'));
 assert.ok(ui.includes("localStorage.setItem(CARTA_API_TENTATIVA"));
 assert.ok(index.includes('onclick="cartaApiEmitir()" disabled'));
 assert.ok(index.includes('cartaApiPreparar()'));
});

test('schema objeto com lista nomeada é reconhecido sem supor array na raiz',async()=>{
 const docs=schemaValido();
 const operacao=docs.paths['/v1/prepostagens/lista/objetosregistrados'].post;
 operacao.requestBody.content['application/json'].schema={
  type:'object',required:['objetosRegistrados'],
  properties:{objetosRegistrados:{type:'array',items:{$ref:'#/components/schemas/Registrado'}}}
 };
 const x=setup({docs});
 const diagnostico=await x.invoke('diagnostico');
 assert.equal(diagnostico.code,200);
 assert.equal(diagnostico.body.esquemaOficialConfirmado,true);
 assert.equal(diagnostico.body.formatoApiReconhecido,'objeto_lista_json');
 assert.equal(diagnostico.body.diagnosticoEsquema.campoLista,'objetosRegistrados');
 const prep=await x.invoke('preparar',x.p);
 assert.equal(prep.code,200);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 const emit=await x.invoke('emitir',{...x.p,confirmacaoPiloto:prep.body.confirmacaoPiloto,confirmarEmissaoReal:true});
 assert.equal(emit.code,200);
 const post=x.calls.filter(c=>c.method==='POST');
 assert.equal(post.length,1);
 const dados=JSON.parse(post[0].body);
 assert.equal(dados.objetosRegistrados[0].codigoServico,'80799');
});
test('multipart com campo não binário mostra diagnóstico e impede POST de emissão',async()=>{
 const docs=schemaValido();
 const operacao=docs.paths['/v1/prepostagens/lista/objetosregistrados'].post;
 operacao.requestBody.content={'multipart/form-data':{schema:{
  type:'object',required:['arquivo'],
  properties:{arquivo:{type:'string',format:'byte'}}
 }}};
 const x=setup({docs}),r=await x.invoke('preparar',x.p);
 assert.equal(r.code,423);
 assert.ok(r.body.diagnosticoEsquema);
 assert.equal(r.body.diagnosticoEsquema.tipoRaiz,'object');
 assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
});
test('objeto com campos adicionais obrigatórios não transmite carta',async()=>{
 const docs=schemaValido();
 docs.paths['/v1/prepostagens/lista/objetosregistrados'].post.requestBody.content['application/json'].schema={
  type:'object',required:['objetosRegistrados','assinaturaOperacao'],
  properties:{objetosRegistrados:{type:'array',items:{$ref:'#/components/schemas/Registrado'}},
   assinaturaOperacao:{type:'string'}}
 };
 const x=setup({docs}),r=await x.invoke('preparar',x.p);
 assert.equal(r.code,423);
 assert.ok(r.body.diagnosticoEsquema.camposObrigatoriosRaiz.includes('assinaturaOperacao'));
 assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
});
test('diagnóstico do CWS não publica dados de cliente nem faz POST',async()=>{
 const x=setup({docs:schemaValido()}),r=await x.invoke('diagnostico');
 assert.equal(r.code,200);
 assert.equal(r.body.postagensCriadas,0);
 assert.equal(r.body.diagnosticoEsquema.tipoRaiz,'array');
 assert.ok(!JSON.stringify(r.body).includes('39963241115'));
 assert.ok(!JSON.stringify(r.body).includes('token-ficticio'));
 assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
});

test('multipart real com schema explícito gera arquivo JSON, um único POST e boundary automático',async()=>{
 const docs=schemaValido(),operacao=docs.paths['/v1/prepostagens/lista/objetosregistrados'].post;
 operacao.requestBody.content={'multipart/form-data;charset=UTF-8':{schema:{
  type:'object',required:['arquivo'],
  properties:{arquivo:{type:'string',format:'binary'}}
 }}};
 const x=setup({docs});
 const diag=await x.invoke('diagnostico');
 assert.equal(diag.code,200);
 assert.equal(diag.body.formatoApiReconhecido,'multipart_json_file');
 assert.equal(diag.body.diagnosticoEsquema.multipartCampos[0].nome,'arquivo');
 assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 const prep=await x.invoke('preparar',x.p);
 assert.equal(prep.code,200);
 assert.equal(prep.body.resumo.valorCotado,15.6);
 const em=await x.invoke('emitir',{...x.p,confirmarEmissaoReal:true,confirmacaoPiloto:prep.body.confirmacaoPiloto});
 assert.equal(em.code,200);
 const posts=x.calls.filter(c=>c.method==='POST');
 assert.equal(posts.length,1);
 assert.equal(posts[0].body instanceof FormData,true);
 assert.equal(posts[0].body.get('arquivo').name,'carta-registrada-80799.json');
 const arquivo=posts[0].body.get('arquivo');
 assert.equal(arquivo.type,'application/json');
 const conteudo=JSON.parse(await arquivo.text());
 assert.equal(conteudo.length,1);
 assert.equal(conteudo[0].codigoServico,'80799');
 assert.equal(conteudo[0].codigoFormatoObjetoInformado,'1');
});
test('OpenAPI multipart sem schema de arquivo documentado bloqueia envio',async()=>{
 const docs=schemaValido();
 docs.paths['/v1/prepostagens/lista/objetosregistrados'].post.requestBody.content={
  'multipart/form-data;charset=UTF-8':{}
 };
 const x=setup({docs});
 const diag=await x.invoke('diagnostico');
 assert.equal(diag.body.esquemaOficialConfirmado,false);
 assert.equal(diag.body.diagnosticoEsquema.possuiSchemaMultipart,false);
 assert.equal(diag.body.diagnosticoEsquema.tiposConteudo[0],'multipart/form-data;charset=UTF-8');
 const prep=await x.invoke('preparar',x.p);
 assert.equal(prep.code,423);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
});
test('multipart com campo binário duplo, campo não binário ou obrigação adicional bloqueia emissão',async()=>{
 const variantes=[
  {type:'object',properties:{arquivo:{type:'string',format:'binary'},outro:{type:'string',format:'binary'}}},
  {type:'object',properties:{arquivo:{type:'string'}}},
  {type:'object',required:['arquivo','contratoExtra'],properties:{arquivo:{type:'string',format:'binary'},contratoExtra:{type:'string'}}}
 ];
 for(const schema of variantes){
  const docs=schemaValido();
  docs.paths['/v1/prepostagens/lista/objetosregistrados'].post.requestBody.content={'multipart/form-data':{schema}};
  const x=setup({docs}),ret=await x.invoke('preparar',x.p);
  assert.equal(ret.code,423);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 }
});
