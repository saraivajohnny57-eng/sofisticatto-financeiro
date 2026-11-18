const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const frontend=fs.readFileSync(path.join(__dirname,'../../financeiro.js'),'utf8');
const backend=fs.readFileSync(path.join(__dirname,'../../api/banco-bradesco.js'),'utf8');
test('erro de API Bradesco preserva mensagem no painel de rejeição',()=>{
  assert.match(frontend,/detalhe:String\(j\?\.erro\|\|j\?\.mensagem\|\|e\?\.message/);
  assert.match(frontend,/e\.bradescoResponse=\{\.\.\.j,api_http:r\.status\}/);
});
test('diagnóstico de trava é autenticado e somente leitura',()=>{
  assert.match(backend,/if\(!exigirAdmin\(req,res\)\)return/);
  const section=backend.split("if(action==='diagnosticar-trava-emissao')")[1].split("if(action==='salvar-credenciais')")[0];
  assert.match(section,/await obter\(travaId\)/);
  assert.doesNotMatch(section,/await salvar\(|enviarRegistroCobrancaProducao\(|supabaseRest\(.+method:'(?:POST|PATCH|DELETE)'/);
});
test('bloqueio bancário original permanece ativo',()=>{
  assert.match(backend,/tentativaAnterior\.estado==='RESPOSTA_RECEBIDA' && statusAnterior===400/);
  assert.match(frontend,/As parcelas rejeitadas NÃO foram reenviadas automaticamente/);
});
