'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.join(__dirname,'..');
process.env.PORTAL_SESSION_SECRET='teste-unico-permissao-cobranca-509-000000000000000';
const auth=require('../lib/portal/secure');
const {podeOperarEmissaoCobranca:permitir}=require('../lib/portal/permitir-emissao-cobranca');
const req=(role,action,opts={})=>({
 method:opts.method||'POST',
 headers:{host:'sofisticatto-financeiro.vercel.app',origin:opts.origin||'https://sofisticatto-financeiro.vercel.app',
  'sec-fetch-site':'same-origin',
  cookie:opts.anonymous?'':'sf02_session='+auth.issue({id:'abc',login:'teste',tipo:role})},
 query:{action,ambiente:opts.ambiente||'producao'},
 body:{ambiente:opts.ambiente||'producao',...opts.body}
});
test('Cobranca pode emitir e verificar boleto individual no BB',()=>{
 for(const action of ['emitir-boleto','verificar-titulo','consultar-boleto'])
  assert.equal(permitir(req('cobranca',action),'bb',action,'producao'),true);
});
test('Cobranca pode preparar e emitir no Bradesco',()=>{
 for(const action of ['preparar-emissao-producao-v248','emitir-cobranca-producao-v248','verificar-preparacao-sem-envio-v495'])
  assert.equal(permitir(req('cobranca',action),'bradesco',action,'producao'),true);
});
test('Cobranca não pode configurar credenciais ou emitir em massa via API',()=>{
 for(const banco of ['bb','bradesco'])for(const action of ['salvar-credenciais','status','emitir-piloto','salvar-mtls','baixar-titulo-producao-v353'])
  assert.equal(permitir(req('cobranca',action),banco,action,'producao'),false);
});
test('Sessão, origem, método, ambiente e perfil são obrigatórios',()=>{
 for(const role of ['banco','financeiro','entregador'])
  assert.equal(permitir(req(role,'emitir-boleto'),'bb','emitir-boleto','producao'),false);
 assert.equal(permitir(req('cobranca','emitir-boleto',{anonymous:true}),'bb','emitir-boleto','producao'),false);
 assert.equal(permitir(req('cobranca','emitir-boleto',{origin:'https://site-externo.com'}),'bb','emitir-boleto','producao'),false);
 assert.equal(permitir(req('cobranca','emitir-boleto',{method:'GET'}),'bb','emitir-boleto','producao'),false);
 assert.equal(permitir(req('cobranca','emitir-boleto',{ambiente:'teste'}),'bb','emitir-boleto','teste'),false);
});
test('Cobrança sincroniza status individual e lotes de ambos os bancos, nunca mudanças bancárias',()=>{
 const id='aba4444f-1111-4444-aaaa-111111111111';
 for(const banco of ['bb','bradesco']){
  for(const body of [{id},{modo:'planejar'},{modo:'lote',ids:[id]}])
   assert.equal(permitir(req('cobranca','sincronizar-status',{body}),banco,'sincronizar-status','producao'),true);
  for(const body of [{},{modo:'lote',ids:[]},{modo:'lote',ids:['invalido']},
    {modo:'lote',ids:Array(21).fill(id)},{modo:'lote',ids:[id,id]},
    {modo:'outro'},{limite:80,rotativo:true}])
   assert.equal(permitir(req('cobranca','sincronizar-status',{body}),banco,'sincronizar-status','producao'),false);
  assert.equal(permitir(req('cobranca','sincronizar-status',{body:{modo:'planejar'},method:'GET'}),banco,'sincronizar-status','producao'),false);
  assert.equal(permitir(req('cobranca','sincronizar-status',{body:{modo:'planejar'},anonymous:true}),banco,'sincronizar-status','producao'),false);
  assert.equal(permitir(req('cobranca','sincronizar-status',{body:{modo:'planejar'},origin:'https://malicioso.com'}),banco,'sincronizar-status','producao'),false);
  assert.equal(permitir(req('cobranca','sincronizar-status',{body:{modo:'planejar'},ambiente:'teste'}),banco,'sincronizar-status','teste'),false);
 }
});
test('Interface libera Emissão e preserva restrição de massa, configurações e cancelamento',()=>{
 const src=fs.readFileSync(path.join(repo,'financeiro.js'),'utf8');
 assert.match(src,/abaEmissao\.style\.display='inline-flex'/);
 assert.match(src,/\['cobTabMassa','cobTabCredenciais'\]/);
 assert.match(src,/\['historico','emissao','remessas'\]/);
 assert.match(src,/if\(negarOperacaoCobrancaV293\(\)\) return;/);
 assert.match(src,/const ret=await emitirParcelaBbReal\(registroParcela\)/);
});

test('Perfil Cobrança consulta pendências reais BB e Bradesco sem chave mestre',()=>{
 for(const banco of ['bb','bradesco']){
  assert.equal(permitir(req('cobranca','listar-pendencias-carteira'),banco,'listar-pendencias-carteira','producao'),true);
  assert.equal(permitir(req('financeiro','listar-pendencias-carteira'),banco,'listar-pendencias-carteira','producao'),false);
  assert.equal(permitir(req('cobranca','listar-pendencias-carteira',{anonymous:true}),banco,'listar-pendencias-carteira','producao'),false);
  assert.equal(permitir(req('cobranca','listar-pendencias-carteira',{method:'GET'}),banco,'listar-pendencias-carteira','producao'),false);
  assert.equal(permitir(req('cobranca','listar-pendencias-carteira',{origin:'https://outro-site.test'}),banco,'listar-pendencias-carteira','producao'),false);
  assert.equal(permitir(req('cobranca','listar-pendencias-carteira',{ambiente:'teste'}),banco,'listar-pendencias-carteira','teste'),false);
 }
});
test('Consulta de pendências não concede manutenção, baixa nem emissão em massa',()=>{
 for(const banco of ['bb','bradesco'])for(const acao of ['salvar-credenciais','salvar-mtls','baixar-titulo-producao-v353','sincronizar-todos','excluir','alterar','emitir-piloto'])
  assert.equal(permitir(req('cobranca',acao),banco,acao,'producao'),false);
 assert.equal(permitir(req('cobranca','confirmar-put-60584-v515'),'bradesco','confirmar-put-60584-v515','producao'),false);
 assert.equal(permitir(req('cobranca','preparar-put-60584-v515'),'bradesco','preparar-put-60584-v515','producao'),false);
});
test('Interface Cobrança libera segunda via e atualização em lotes; mantém restrições de manutenção',()=>{
 const src=fs.readFileSync(path.join(repo,'financeiro.js'),'utf8');
 assert.match(src,/['"]consultar-status-titulo['"],['"]listar-pendencias-carteira['"]/);
 assert.match(src,/['"]sincronizar-status['"],['"]listar-pendencias-carteira['"]/);
 assert.match(src,/['"]consultar-segunda-via-v389['"],['"]sincronizar-status['"]/);
 assert.match(src,/\['planejar','lote'\]/);
});

test('Cobrança permite as consultas individuais e segunda via que a interface realmente chama',()=>{
 for(const action of ['consultar-status-titulo','consultar-segunda-via-v389','listar-pendencias-carteira'])
  assert.equal(permitir(req('cobranca',action),'bradesco',action,'producao'),true);
 for(const action of ['consultar-boleto','verificar-titulo','listar-pendencias-carteira','diagnosticar-titulo-externo'])
  assert.equal(permitir(req('cobranca',action),'bb',action,'producao'),true);
 const segunda=fs.readFileSync(path.join(repo,'segunda-via-v388.js'),'utf8');
 assert.match(segunda,/bradescoReqProducao\('consultar-segunda-via-v389'/);
 assert.match(segunda,/bbReq\('consultar-boleto'/);
});
