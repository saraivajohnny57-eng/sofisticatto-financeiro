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
test('Sincronização Cobrança só por ID individual',()=>{
 assert.equal(permitir(req('cobranca','sincronizar-status'),'bb','sincronizar-status','producao'),false);
 assert.equal(permitir(req('cobranca','sincronizar-status',{body:{id:'aba4444f-1111-4444-aaaa-111111111111'}}),'bb','sincronizar-status','producao'),true);
});
test('Interface libera Emissão e preserva restrição de massa, configurações e cancelamento',()=>{
 const src=fs.readFileSync(path.join(repo,'financeiro.js'),'utf8');
 assert.match(src,/abaEmissao\.style\.display='inline-flex'/);
 assert.match(src,/\['cobTabMassa','cobTabCredenciais'\]/);
 assert.match(src,/\['historico','emissao','remessas'\]/);
 assert.match(src,/if\(negarOperacaoCobrancaV293\(\)\) return;/);
 assert.match(src,/const ret=await emitirParcelaBbReal\(registroParcela\)/);
});
